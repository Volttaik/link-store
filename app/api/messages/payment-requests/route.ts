/**
 * Payment requests in a conversation.
 *
 * The same entry-point style as the messages route itself: one small surface,
 * every authority decided server-side from database rows. The seller sends a
 * request (POST), the buyer starts paying it or the seller withdraws it (PATCH).
 *
 * Nothing here trusts the client — not who is speaking, not who will pay, not
 * the amount once agreed, not the state of the request. See
 * `lib/server/payment-requests` for the rules themselves.
 */

import { getCurrentUser } from "@/lib/auth";
import {
  cancelPaymentRequest,
  createPaymentRequest,
  startPaymentRequestCheckout,
} from "@/lib/server/payment-requests";

export const dynamic = "force-dynamic";

/** POST — the seller sends a payment request into a thread they own. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in to send a payment request." }, { status: 401 });

  let payload: {
    conversationId?: string;
    amountMinor?: number;
    description?: string | null;
    listingId?: string | null;
  };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return Response.json({ error: "Unreadable request." }, { status: 400 });
  }

  if (!payload.conversationId) {
    return Response.json({ error: "No conversation given." }, { status: 400 });
  }

  const result = await createPaymentRequest({
    actorId: user.id,
    conversationId: payload.conversationId,
    amountMinor: Number(payload.amountMinor),
    description: payload.description ?? null,
    listingId: payload.listingId ?? null,
  });

  if (!result.ok) return Response.json({ error: result.error }, { status: 400 });
  return Response.json({ message: result.message });
}

/**
 * PATCH — `action: "pay"` begins the buyer's payment (responding with Paystack's
 * checkout URL); `action: "cancel"` withdraws an unpaid request (the seller's).
 */
export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });

  let payload: { action?: string; paymentRequestId?: string };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return Response.json({ error: "Unreadable request." }, { status: 400 });
  }

  const paymentRequestId = payload.paymentRequestId;
  if (!paymentRequestId) {
    return Response.json({ error: "No payment request given." }, { status: 400 });
  }

  if (payload.action === "pay") {
    const result = await startPaymentRequestCheckout({ actorId: user.id, paymentRequestId });
    if (!result.ok) return Response.json({ error: result.error }, { status: 400 });
    return Response.json({ authorizationUrl: result.authorizationUrl });
  }

  if (payload.action === "cancel") {
    const result = await cancelPaymentRequest({ actorId: user.id, paymentRequestId });
    if (!result.ok) return Response.json({ error: result.error }, { status: 400 });
    return Response.json({ ok: true });
  }

  return Response.json({ error: "Unknown action." }, { status: 400 });
}
