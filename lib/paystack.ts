/**
 * Paystack integration.
 *
 * Payment truth is established server-side only, in two independent ways:
 *   1. The webhook (`/api/payments/paystack/webhook`), whose HMAC-SHA512
 *      signature is verified against the secret key before anything is trusted.
 *   2. An explicit server-to-server verification call on the callback route,
 *      so a customer is never left waiting on webhook delivery.
 *
 * A client telling us "payment succeeded" is never sufficient.
 */

import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { isPaystackConfigured, paystackConfig } from "./env";

const API_BASE = "https://api.paystack.co";

export type PaystackInitializeResult =
  | { ok: true; authorizationUrl: string; accessCode: string; reference: string }
  | { ok: false; error: string };

export type PaystackVerification = {
  reference: string;
  /** Paystack's own status string. */
  status: "success" | "failed" | "abandoned" | "ongoing" | "pending" | "reversed" | string;
  amountMinor: number;
  currency: string;
  channel: string | null;
  paidAt: string | null;
  gatewayResponse: string | null;
  providerReference: string | null;
  raw: unknown;
};

export type PaystackVerifyResult =
  | { ok: true; data: PaystackVerification }
  | { ok: false; error: string };

export function paymentsConfigured(): boolean {
  return isPaystackConfigured;
}

async function call<T>(
  path: string,
  init: { method: "GET" | "POST"; body?: unknown },
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  if (!isPaystackConfigured) {
    return {
      ok: false,
      error: "Paystack is not configured. Set PAYSTACK_SECRET_KEY to accept payments.",
    };
  }

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${paystackConfig.secretKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });

    const payload = (await response.json().catch(() => null)) as
      | { status?: boolean; message?: string; data?: T }
      | null;

    if (!response.ok || !payload?.status || payload.data === undefined) {
      return {
        ok: false,
        error: payload?.message || `Paystack request failed (HTTP ${response.status}).`,
      };
    }

    return { ok: true, data: payload.data };
  } catch (error) {
    return {
      ok: false,
      error: `Could not reach Paystack: ${error instanceof Error ? error.message : "network error"}`,
    };
  }
}

/**
 * Begin a transaction and receive the hosted checkout URL.
 * `amountMinor` is in the currency's minor unit (kobo for NGN) — exactly how
 * Link Store stores money, so no conversion or rounding is involved.
 */
export async function initializeTransaction(input: {
  email: string;
  amountMinor: number;
  currency: string;
  reference: string;
  callbackUrl: string;
  metadata?: Record<string, unknown>;
}): Promise<PaystackInitializeResult> {
  const result = await call<{ authorization_url: string; access_code: string; reference: string }>(
    "/transaction/initialize",
    {
      method: "POST",
      body: {
        email: input.email,
        amount: input.amountMinor,
        currency: input.currency,
        reference: input.reference,
        callback_url: input.callbackUrl,
        metadata: input.metadata ?? {},
      },
    },
  );

  if (!result.ok) return { ok: false, error: result.error };

  return {
    ok: true,
    authorizationUrl: result.data.authorization_url,
    accessCode: result.data.access_code,
    reference: result.data.reference,
  };
}

/** Server-to-server verification. This is the authority on payment status. */
export async function verifyTransaction(reference: string): Promise<PaystackVerifyResult> {
  const result = await call<{
    reference: string;
    status: string;
    amount: number;
    currency: string;
    channel?: string;
    paid_at?: string;
    gateway_response?: string;
    id?: number;
  }>(`/transaction/verify/${encodeURIComponent(reference)}`, { method: "GET" });

  if (!result.ok) return { ok: false, error: result.error };

  return {
    ok: true,
    data: {
      reference: result.data.reference,
      status: result.data.status,
      amountMinor: Number(result.data.amount ?? 0),
      currency: (result.data.currency ?? "NGN").toUpperCase(),
      channel: result.data.channel ?? null,
      paidAt: result.data.paid_at ?? null,
      gatewayResponse: result.data.gateway_response ?? null,
      providerReference: result.data.id ? String(result.data.id) : null,
      raw: result.data,
    },
  };
}

export type PaystackBank = { name: string; code: string; currency: string | null; type: string | null };

export type PaystackBanksResult =
  | { ok: true; banks: PaystackBank[] }
  | { ok: false; error: string };

/**
 * The banks Paystack can actually settle to, for one currency.
 *
 * Read live from Paystack rather than kept here as a list: a hardcoded bank list
 * is a list that goes stale, and a seller choosing a bank the provider no longer
 * supports would only find out when their payout failed. An empty result is
 * reported as empty, and a failure as a failure — never as a plausible-looking
 * fallback.
 */
export async function listBanks(currency = "NGN"): Promise<PaystackBanksResult> {
  const query = new URLSearchParams({ country: "nigeria", currency: currency.toUpperCase() });
  const result = await call<Array<{ name?: string; code?: string; currency?: string; type?: string }>>(
    `/bank?${query.toString()}`,
    { method: "GET" },
  );

  if (!result.ok) return { ok: false, error: result.error };

  const banks = (Array.isArray(result.data) ? result.data : [])
    .filter((bank) => bank?.name && bank?.code)
    .map((bank) => ({
      name: String(bank.name),
      code: String(bank.code),
      currency: bank.currency ? String(bank.currency) : null,
      type: bank.type ? String(bank.type) : null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { ok: true, banks };
}

export type PaystackAccountResolution =
  | { ok: true; accountName: string; accountNumber: string }
  | { ok: false; error: string };

/**
 * Ask Paystack who owns an account number at a bank.
 *
 * This is the only source of an account name on this platform. Nothing is
 * guessed from the digits and nothing is invented when the lookup fails: a
 * seller either gets the name the provider returned for their own input, or the
 * reason the provider gave. A payout is later sent to an account the provider
 * itself confirmed.
 */
export async function resolveAccountNumber(input: {
  accountNumber: string;
  bankCode: string;
}): Promise<PaystackAccountResolution> {
  const accountNumber = input.accountNumber.replace(/\D/g, "");
  if (accountNumber.length < 6 || accountNumber.length > 20) {
    return { ok: false, error: "Enter a valid account number." };
  }
  if (!input.bankCode.trim()) {
    return { ok: false, error: "Choose the bank this account is with." };
  }

  const query = new URLSearchParams({
    account_number: accountNumber,
    bank_code: input.bankCode.trim(),
  });

  const result = await call<{ account_name?: string; account_number?: string }>(
    `/bank/resolve?${query.toString()}`,
    { method: "GET" },
  );

  if (!result.ok) return { ok: false, error: result.error };

  const accountName = result.data?.account_name?.trim();
  if (!accountName) {
    return { ok: false, error: "Paystack did not return a name for that account." };
  }

  return {
    ok: true,
    accountName,
    accountNumber: result.data?.account_number?.trim() || accountNumber,
  };
}

export type PaystackRefundResult =
  | { ok: true; status: string }
  | { ok: false; error: string };

/**
 * Ask Paystack to return a transaction's money to its buyer.
 *
 * This is the platform's only claim to a refund: if this call does not succeed,
 * nothing on the order is marked refunded. Paystack processes refunds
 * asynchronously, so the returned status is its acceptance state, and the
 * caller says "submitted", never "money arrived".
 */
export async function refundTransaction(
  reference: string,
  amountMinor?: number,
): Promise<PaystackRefundResult> {
  const result = await call<{ status?: string }>("/refund", {
    method: "POST",
    body: {
      transaction: reference,
      ...(amountMinor && amountMinor > 0 ? { amount: amountMinor } : {}),
    },
  });

  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, status: result.data.status ?? "processing" };
}

/**
 * Verify a webhook came from Paystack: HMAC-SHA512 of the *raw* body keyed with
 * the secret key, compared in constant time.
 */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  if (!signature || !isPaystackConfigured) return false;

  const expected = createHmac("sha512", paystackConfig.secretKey)
    .update(rawBody, "utf8")
    .digest("hex");

  const providedBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");

  if (providedBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(providedBuffer, expectedBuffer);
}
