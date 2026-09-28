"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser, getStoreForUser } from "@/lib/auth";
import { paymentsConfigured, listBanks, resolveAccountNumber, type PaystackBank } from "@/lib/paystack";
import { requestPayout } from "@/lib/server/insights";
import { fail, ok, type ActionResult } from "@/lib/types";

/**
 * The banks a payout can actually be sent to.
 *
 * Read from Paystack's own API at the moment a seller is choosing, so the list
 * is what the provider supports today — never a list kept in this codebase.
 * Without credentials there is no list to show, and that is said plainly rather
 * than filled in with plausible names.
 */
export async function listPayoutBanksAction(): Promise<ActionResult<{ banks: PaystackBank[] }>> {
  const user = await getCurrentUser();
  if (!user) return fail("Your session expired. Sign in again.");

  const store = await getStoreForUser(user.id);
  if (!store) return fail("Create your store first.");

  if (!paymentsConfigured()) {
    return fail(
      "Paystack is not configured, so the bank list and account lookup are unavailable. Type your bank and account details instead.",
    );
  }

  const result = await listBanks("NGN");
  if (!result.ok) return fail(result.error);
  return ok({ banks: result.banks });
}

/**
 * Resolve an account name for the seller's own payout account.
 *
 * The lookup is Paystack's, the input is the seller's, and the result is stored
 * nowhere here — the seller saves it through the ordinary settings form, so what
 * is persisted is what they confirmed. A failure is reported as the provider's
 * own words; nothing is ever resolved locally or faked.
 */
export async function resolvePayoutAccountAction(input: {
  bankCode: string;
  accountNumber: string;
}): Promise<ActionResult<{ accountName: string; accountNumber: string }>> {
  const user = await getCurrentUser();
  if (!user) return fail("Your session expired. Sign in again.");

  const store = await getStoreForUser(user.id);
  if (!store) return fail("Create your store first.");

  if (!paymentsConfigured()) {
    return fail("Paystack is not configured, so an account cannot be verified. Nothing was saved.");
  }

  const result = await resolveAccountNumber({
    bankCode: input.bankCode,
    accountNumber: input.accountNumber,
  });

  if (!result.ok) return fail(result.error);

  return ok({ accountName: result.accountName, accountNumber: result.accountNumber });
}

/**
 * Request a payout.
 *
 * Amount validation happens inside `requestPayout`, which reads the ledger:
 * the client's number is a request, never an authority.
 */
export async function requestPayoutAction(payload: {
  amount: number;
  notes?: string | null;
}): Promise<ActionResult<{ payoutId: string }>> {
  const user = await getCurrentUser();
  if (!user) return fail("Your session expired.");

  const store = await getStoreForUser(user.id);
  if (!store) return fail("Create your store first.");

  const result = await requestPayout({
    storeId: store.id,
    amount: Math.round(payload.amount),
    notes: payload.notes ?? null,
  });

  if (!result.ok) return fail(result.error);

  revalidatePath("/workspace/finance");
  revalidatePath("/workspace/payouts");
  return ok({ payoutId: result.payoutId });
}
