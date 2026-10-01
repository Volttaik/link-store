/**
 * Paystack webhook.
 *
 * This is the authoritative path for marking an order paid: it works even if
 * the customer closes the browser before returning from Paystack.
 *
 * Security: the HMAC-SHA512 signature is verified against the *raw* request body
 * before any payload field is read. An unsigned or mis-signed request is
 * rejected with 401 and changes nothing.
 */

import { NextResponse } from "next/server";

import { getPaymentByReference, notifyPaymentFailed } from "@/lib/server/commerce";
import {
  syncPaymentRequestForPayment,
  verifyAndSettlePaymentRequest,
} from "@/lib/server/payment-requests";
import { verifyWebhookSignature } from "@/lib/paystack";
import { execute } from "@/lib/db";
import { nowIso } from "@/lib/format";

export const runtime = "nodejs";

type PaystackWebhookEvent = {
  event?: string;
  data?: {
    reference?: string;
    status?: string;
    amount?: number;
    currency?: string;
  };
};

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-paystack-signature");

  if (!verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: PaystackWebhookEvent;
  try {
    payload = JSON.parse(rawBody) as PaystackWebhookEvent;
  } catch {
    return NextResponse.json({ error: "Malformed payload" }, { status: 400 });
  }

  const reference = payload.data?.reference;
  if (!reference) {
    return NextResponse.json({ received: true });
  }

  // Only successful charges are fulfilled here. `charge.success` is the event
  // Paystack emits for a completed payment.
  if (payload.event !== "charge.success") {
    const payment = await getPaymentByReference(reference);
    if (payment && payment.status !== "success" && payload.event === "charge.failed") {
      await execute(
        "UPDATE payments SET status = 'failed', failure_reason = ?, updated_at = ? WHERE id = ? AND status != 'success'",
        [payload.event, nowIso(), payment.id],
      );
      // A chat payment card must tell the same story as the ledger.
      await syncPaymentRequestForPayment(reference);
      // And the buyer hears it — once per payment, however many failure paths
      // (this webhook, the return page's verification) see it.
      await notifyPaymentFailed(payment.id);
    }
    return NextResponse.json({ received: true });
  }

  // Server-to-server verification claims the payment row atomically and brings
  // any chat payment card in step — so a webhook and the return page cannot
  // double-fulfil an order, and no card can claim a state the ledger lacks.
  await verifyAndSettlePaymentRequest(reference);
  const payment = await getPaymentByReference(reference);

  return NextResponse.json({
    received: true,
    status: payment?.status === "success" ? "success" : payment?.status ?? "unknown",
  });
}

/** Convenience for operators checking that the endpoint is reachable. */
export async function GET() {
  const { paymentsConfigured } = await import("@/lib/paystack");
  return NextResponse.json({
    endpoint: "paystack-webhook",
    configured: paymentsConfigured(),
  });
}
