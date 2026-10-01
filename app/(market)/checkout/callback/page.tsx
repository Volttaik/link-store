import { ButtonLink } from "@/components/ui/controls";
import { cookies } from "next/headers";

import { SuccessCard } from "@/components/cards/SuccessCard";
import { EmptyState, InfoNote } from "@/components/ui/feedback";
import { Icon } from "@/components/ui/Icon";
import {
  ORDER_ACCESS_COOKIE,
  getPaymentByReference,
  verifyAndFulfilPayment,
} from "@/lib/server/commerce";
import { getOrderByAccessToken } from "@/lib/server/commerce";
import {
  paymentRequestForOrder,
  syncPaymentRequestForPayment,
} from "@/lib/server/payment-requests";
import { paymentsConfigured } from "@/lib/paystack";
import { formatMoney } from "@/lib/money";

export const metadata = { title: "Payment result" };

export const dynamic = "force-dynamic";

/**
 * Where Paystack returns the customer.
 *
 * This page never trusts the URL: it takes the reference and re-verifies with
 * Paystack from the server. A webhook may have already fulfilled the order, in
 * which case verification is a no-op and we simply show the result.
 */
export default async function CheckoutCallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ reference?: string; trxref?: string }>;
}) {
  const params = await searchParams;
  const reference = params.reference ?? params.trxref ?? "";

  if (!reference) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6">
        <EmptyState icon="search" title="No payment reference found" description="This page is reached after a Paystack payment. Without a reference there is nothing to verify."
          action={
            <ButtonLink href="/orders" variant="primary">
              Find my orders
            </ButtonLink>
          }
        />
      </div>
    );
  }

  const payment = await getPaymentByReference(reference);

  if (!payment) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-16 sm:px-6">
        <EmptyState icon="alert" title="We do not recognise that payment reference" description="No payment on record matches this reference. If you were charged, contact the seller with the reference below and they can reconcile it."
          action={
            <ButtonLink href="/orders" variant="primary">
              Find my orders
            </ButtonLink>
          }
        />
        <InfoNote title="Reference">{reference}</InfoNote>
      </div>
    );
  }

  const result = await verifyAndFulfilPayment(reference);
  // A chat payment card must reflect the same verified state as the ledger.
  await syncPaymentRequestForPayment(reference);

  // A payment made from a conversation returns to that conversation — the
  // negotiation and its payment belong to the same thread.
  const chatRequest = payment.order_id ? await paymentRequestForOrder(payment.order_id) : null;

  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ORDER_ACCESS_COOKIE)?.value ?? null;
  const order = accessToken ? await getOrderByAccessToken(accessToken) : null;

  const orderForThisPayment = result.orderId === order?.id ? order : null;

  const succeeded = result.ok && (result.status === "success" || result.status === "already");

  /** The transaction this confirms, as the receipt strip of the confirmation. */
  const receiptRows = [
    {
      label: "Reference",
      value: <span className="font-mono text-[12px]">{payment.reference}</span>,
    },
    {
      label: "Amount",
      value: formatMoney(Number(payment.amount), payment.currency),
    },
    {
      label: "Provider status",
      value: <span className="capitalize">{payment.status}</span>,
    },
    ...(orderForThisPayment
      ? [{ label: "Order", value: orderForThisPayment.order_number }]
      : []),
  ];

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
      {/* The confirmation itself: the mark, the plain words, the receipt and
          the way forward — one dedicated experience, not a labelled box. */}
      <SuccessCard
        title={succeeded ? "Payment confirmed" : "Payment not completed"}
        message={
          succeeded
            ? chatRequest
              ? "Your payment is confirmed and the seller has been notified in your conversation."
              : "Your order is confirmed and ready for the seller."
            : "The payment was not verified as successful, so nothing has been charged or delivered."
        }
        rows={receiptRows}
        tone={succeeded ? "success" : "warning"}
        primaryAction={
          chatRequest ? (
            <ButtonLink href={`/messages/${chatRequest.conversation_id}`} variant="primary">
              Back to conversation
              <Icon name="arrowRight" size={14} />
            </ButtonLink>
          ) : orderForThisPayment ? (
            <ButtonLink href={`/orders/${orderForThisPayment.access_token}`} variant="primary">
              View your order
              <Icon name="arrowRight" size={14} />
            </ButtonLink>
          ) : (
            <ButtonLink href="/orders" variant="primary">
              Find my orders
            </ButtonLink>
          )
        }
        secondaryAction={
          chatRequest ? (
            <ButtonLink href="/messages" variant="secondary">
              Your messages
            </ButtonLink>
          ) : (
            <ButtonLink href="/products" variant="secondary">
              Continue shopping
            </ButtonLink>
          )
        }
      >
        {orderForThisPayment || chatRequest ? null : (
          <InfoNote title="Finding your order">
            We could not match this payment to an order in this browser. Look it up with your email
            and order number on the orders page.
          </InfoNote>
        )}

        {!succeeded && result.error ? (
          <InfoNote tone="warning" title="What happened">
            {result.error}
            {!paymentsConfigured()
              ? " Payments are currently unavailable. Contact the seller for help."
              : ""}
          </InfoNote>
        ) : null}
      </SuccessCard>
    </div>
  );
}
