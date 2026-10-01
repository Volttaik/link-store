"use client";

/**
 * The payment card.
 *
 * A payment request is not words with a number in them — it is a thing that can
 * be paid, so it is drawn as its own object inside the conversation: the
 * amount, what it is for, whose it is, where it stands, and the one button that
 * moves the money. It wears the same quiet surface language as everything else
 * in the thread — one soft elevation, a hairline ring, the platform's own
 * status colours — and never grows into anything that competes with the
 * conversation around it.
 *
 * Every state on it is the backend's own: the card re-reads nothing and claims
 * nothing, it simply shows the request's stored status. The Pay button is the
 * only way out from here, and it hands the buyer to real Paystack checkout at
 * the amount the seller agreed — never an amount this browser has touched.
 */

import Link from "next/link";
import { useState, useTransition } from "react";

import { Icon } from "@/components/ui/Icon";
import {
  paymentRequestStatusLabel,
  paymentRequestStatusTone,
  type StatusTone,
} from "@/lib/catalog";
import { formatRelative } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import type { ChatPaymentRequestDto } from "@/lib/chat/types";

/** The platform's status colours, in the card's own compact pill. */
const TONE_CLASSES: Record<StatusTone, string> = {
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning",
  danger: "bg-danger/15 text-danger",
  primary: "bg-accent/15 text-accent",
  secondary: "bg-accent/10 text-accent",
  default: "bg-surface-secondary text-muted",
};

function StatusPill({ status }: { status: ChatPaymentRequestDto["status"] }) {
  const tone = paymentRequestStatusTone(status);
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${TONE_CLASSES[tone]}`}
    >
      {paymentRequestStatusLabel(status)}
    </span>
  );
}

export function PaymentRequestCard({
  payment,
  /** The viewer is the one who sent the request — the seller's side of the thread. */
  mine,
}: {
  payment: ChatPaymentRequestDto;
  mine: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [cancelled, setCancelled] = useState(false);

  const status = cancelled && payment.status === "awaiting_payment" ? "cancelled" : payment.status;
  const paid = status === "paid";
  const settled = status === "cancelled" || status === "expired";

  /** Only the person the request was sent to can pay it — and only while it lives. */
  const canPay = !mine && (status === "awaiting_payment" || status === "failed" || status === "processing");
  const canCancel = mine && (status === "awaiting_payment" || status === "failed");

  const pay = () => {
    setError(null);
    startTransition(async () => {
      try {
        const response = await fetch("/api/messages/payment-requests", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "pay", paymentRequestId: payment.id }),
        });
        const result = (await response.json()) as {
          authorizationUrl?: string;
          error?: string;
        };

        if (!response.ok || !result.authorizationUrl) {
          setError(result.error ?? "That payment could not be started.");
          return;
        }

        // Off to real Paystack checkout. The conversation keeps the card, and
        // verification updates it — wherever the buyer comes back to.
        window.location.assign(result.authorizationUrl);
      } catch {
        setError("The payment could not be started. Try again.");
      }
    });
  };

  const cancel = () => {
    setError(null);
    startTransition(async () => {
      try {
        const response = await fetch("/api/messages/payment-requests", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "cancel", paymentRequestId: payment.id }),
        });
        if (!response.ok) {
          const result = (await response.json().catch(() => null)) as { error?: string } | null;
          setError(result?.error ?? "That request could not be cancelled.");
          return;
        }
        setCancelled(true);
      } catch {
        setError("That request could not be cancelled.");
      }
    });
  };

  const negotiated =
    payment.originalAmount !== null && Number(payment.originalAmount) !== payment.amount;

  return (
    <div className="motion-safe:animate-chat-in w-[min(70vw,18.5rem)] overflow-hidden rounded-[1.35rem] bg-surface text-foreground shadow-elev-1 ring-1 ring-foreground/10">
      {/* What this object is — and where it stands — known before a number is read. */}
      <div className="flex items-start gap-2.5 px-3.5 pt-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent/12">
          <Icon className="text-accent" name="creditCard" size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[9.5px] font-semibold tracking-[0.11em] text-accent uppercase">
            Payment request
          </p>
          <p className="truncate text-[11.5px] text-muted">
            {paid
              ? `Paid ${payment.paidAt ? formatRelative(payment.paidAt) : ""}`.trim()
              : payment.description ?? "Agreed in this conversation"}
          </p>
        </div>
        <StatusPill status={status} />
      </div>

      {/* The money itself. */}
      <div className="px-3.5 pt-2.5">
        <p className="text-[9.5px] font-semibold tracking-[0.11em] text-muted uppercase">
          {negotiated ? "Negotiated amount" : "Amount"}
        </p>
        <div className="flex flex-wrap items-baseline gap-x-2">
          <p className="text-[18px] leading-tight font-bold tracking-tight">
            {formatMoney(payment.amount, payment.currency)}
          </p>
          {negotiated ? (
            <p className="text-[11.5px] text-muted line-through">
              {formatMoney(payment.originalAmount, payment.currency)}
            </p>
          ) : null}
        </div>
        {payment.description ? (
          <p className="pt-1 text-[12px] leading-snug text-muted">{payment.description}</p>
        ) : null}
      </div>

      {/* What it is for — the listing, kept as it was agreed. */}
      {payment.contextTitle ? (
        <div className="px-3.5 pt-2.5">
          {payment.listingId ? (
            <Link
              className="group flex items-center gap-2.5 rounded-2xl bg-surface-secondary/60 px-2.5 py-2 no-underline transition-colors hover:bg-surface-secondary"
              href={`/listing/${payment.listingId}`}
            >
              {payment.contextImageUrl ? (
                <img
                  alt=""
                  className="size-9 shrink-0 rounded-xl object-cover"
                  loading="lazy"
                  src={payment.contextImageUrl}
                />
              ) : (
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface-secondary">
                  <Icon className="text-muted" name="receipt" size={14} />
                </span>
              )}
              <span className="min-w-0">
                <span className="block truncate text-[12px] font-medium text-foreground">
                  {payment.contextTitle}
                </span>
                <span className="block truncate text-[10.5px] text-muted">
                  Seller: {payment.sellerName ?? "this shop"}
                </span>
              </span>
              <Icon className="shrink-0 text-muted" name="chevronRight" size={13} />
            </Link>
          ) : (
            <div className="rounded-2xl bg-surface-secondary/60 px-2.5 py-2">
              <p className="truncate text-[12px] font-medium">{payment.contextTitle}</p>
              <p className="truncate text-[10.5px] text-muted">
                Seller: {payment.sellerName ?? "this shop"}
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="px-3.5 pt-2.5">
          <p className="text-[10.5px] text-muted">Seller: {payment.sellerName ?? "this shop"}</p>
        </div>
      )}

      {/* The one action — or the quiet truth once there is nothing to do. */}
      <div className="flex flex-col gap-1.5 p-3">
        {canPay ? (
          <button
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-3 py-2.5 text-[13px] font-semibold text-accent-foreground transition-opacity hover:opacity-90 motion-safe:active:scale-[0.98]"
            disabled={pending}
            onClick={pay}
            type="button"
          >
            <Icon name="wallet" size={15} />
            {pending
              ? "One moment…"
              : status === "failed"
                ? "Try again"
                : `Pay ${formatMoney(payment.amount, payment.currency)}`}
          </button>
        ) : paid ? (
          <div className="flex items-center gap-2 rounded-xl bg-success/10 px-3 py-2.5 text-[12.5px] font-medium text-success">
            <Icon name="check" size={15} />
            Paid — the seller has been notified.
          </div>
        ) : settled ? (
          <p className="px-1 text-[11.5px] text-muted">
            {status === "expired"
              ? "This request expired before it was paid."
              : "This request was cancelled by the seller."}
          </p>
        ) : null}

        {canCancel ? (
          <button
            className="rounded-xl px-3 py-1.5 text-[11.5px] font-medium text-muted transition-colors hover:text-foreground"
            disabled={pending}
            onClick={cancel}
            type="button"
          >
            Cancel request
          </button>
        ) : null}

        {error ? <p className="px-1 text-[11px] text-danger">{error}</p> : null}
      </div>
    </div>
  );
}
