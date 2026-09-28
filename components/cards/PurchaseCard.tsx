/**
 * The purchase card — a compact transaction.
 *
 * A purchase is not a product and not a receipt page: it is a transaction with
 * a *state*, and the card's job is to make that state immediately
 * understandable. So the card is cut as a transaction record: who was paid and
 * the reference up top, the state as both a status chip and a plain sentence
 * written for the person who paid, a small progress line (paid → preparing →
 * delivered) that shows where in the transaction things stand, and the figures
 * in a ledger at the foot with the way into the full receipt.
 *
 * The sentence is the point: a buyer opening this page wants to know “where is
 * my thing?”, and everything else on the card supports that answer.
 */

import { Link } from "@heroui/react/link";

import { Icon } from "@/components/ui/Icon";
import { ButtonLink } from "@/components/ui/controls";
import { StatusChip } from "@/components/ui/atoms";
import {
  orderStatusLabel,
  orderStatusTone,
  paymentStatusLabel,
  paymentStatusTone,
} from "@/lib/catalog";
import { formatDateTime, formatNumber } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import type { OrderRow } from "@/lib/types";

export type PurchaseSummary = OrderRow & { store_name: string; item_count: number };

/**
 * What the transaction state means to the person who paid — one plain sentence,
 * not a status code.
 */
function buyerStatus(
  paymentStatus: string,
  status: string,
): {
  label: string;
  caption: string;
  tone: "default" | "primary" | "success" | "warning" | "danger";
  icon: "check" | "inventory" | "alert";
} {
  if (status === "cancelled") {
    return {
      label: "Cancelled",
      caption: "This order was cancelled. If you were charged, the seller refunds it.",
      tone: "danger",
      icon: "alert",
    };
  }

  if (paymentStatus !== "paid") {
    return {
      label: "Awaiting payment",
      caption: "This order is not paid yet, so nothing has been sent.",
      tone: "warning",
      icon: "alert",
    };
  }

  switch (status) {
    case "fulfilled":
      return {
        label: "Complete",
        caption:
          "Everything in this order has been delivered. Tickets and download links are in the order.",
        tone: "success",
        icon: "check",
      };
    case "processing":
      return {
        label: "Being prepared",
        caption: "The seller has been paid and is preparing your order.",
        tone: "primary",
        icon: "inventory",
      };
    default:
      return {
        label: "Paid",
        caption: "The seller has your payment and will start on it next.",
        tone: "success",
        icon: "check",
      };
  }
}

/**
 * The transaction's progress along its normal path: paid, preparing,
 * delivered. Cancelled and refunded orders are not on this path and get no
 * stepper — their state is the sentence above.
 */
function TransactionSteps({ step }: { step: 1 | 2 | 3 }) {
  const steps = ["Paid", "Preparing", "Delivered"];

  return (
    <ol className="flex items-center gap-2" aria-label={`Transaction progress: step ${step} of 3`}>
      {steps.map((label, index) => {
        const position = index + 1;
        const done = position <= step;
        const current = position === step;

        return (
          <li key={label} className="flex min-w-0 flex-1 items-center gap-2">
            <span
              aria-hidden="true"
              className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold ${
                done ? "bg-accent text-accent-foreground" : "bg-surface-secondary text-muted"
              } ${current ? "ring-2 ring-accent/35 ring-offset-2 ring-offset-surface" : ""}`}
            >
              {done ? <Icon name="check" size={11} /> : position}
            </span>
            <span
              className={`truncate text-[11px] font-medium ${
                done ? "text-foreground" : "text-muted"
              }`}
            >
              {label}
            </span>
            {index < steps.length - 1 ? (
              <span
                aria-hidden="true"
                className={`h-[2px] min-w-3 flex-1 rounded-full ${
                  position < step ? "bg-accent" : "bg-surface-secondary"
                }`}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

export function PurchaseCard({ order }: { order: PurchaseSummary }) {
  const state = buyerStatus(order.payment_status, order.status);
  const paid = order.payment_status === "paid";
  const step: 1 | 2 | 3 =
    order.status === "fulfilled" ? 3 : order.status === "processing" ? 2 : 1;
  const onNormalPath = paid && order.status !== "cancelled" && order.status !== "refunded";

  return (
    <article className="flex flex-col overflow-hidden rounded-3xl bg-surface shadow-elev-2">
      {/* The transaction header: who was paid, the reference and when. */}
      <div className="flex flex-wrap items-start justify-between gap-3 p-5 pb-4">
        <div className="min-w-0">
          <p className="truncate text-[16px] leading-tight font-semibold text-foreground">
            {order.store_name}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-muted">
            <span className="flex items-center gap-1.5 font-mono">
              <Icon name="receipt" size={11} className="shrink-0" />
              {order.order_number}
            </span>
            <span aria-hidden="true">·</span>
            <span>{formatDateTime(order.created_at)}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <StatusChip
            label={paymentStatusLabel(order.payment_status)}
            tone={paymentStatusTone(order.payment_status)}
          />
          {order.status !== "paid" && order.status !== "pending" ? (
            <StatusChip label={orderStatusLabel(order.status)} tone={orderStatusTone(order.status)} />
          ) : null}
        </div>
      </div>

      {/* Where in the transaction things stand. */}
      {onNormalPath ? (
        <div className="px-5 pb-3">
          <TransactionSteps step={step} />
        </div>
      ) : null}

      {/* The sentence. Everything else on this card supports it. */}
      <div className="flex items-start gap-3 bg-surface-secondary/40 px-5 py-3.5">
        <span
          className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full ${
            state.tone === "success"
              ? "bg-success/15 text-success"
              : state.tone === "danger"
                ? "bg-danger/15 text-danger"
                : state.tone === "warning"
                  ? "bg-warning/15 text-warning"
                  : "bg-accent/15 text-accent"
          }`}
        >
          <Icon name={state.icon} size={13} />
        </span>
        <p className="min-w-0 text-[13px] leading-relaxed text-foreground">
          <span className="font-semibold">{state.label}.</span>{" "}
          <span className="text-muted">{state.caption}</span>
        </p>
      </div>

      {/* The ledger and the way into the full receipt. */}
      <div className="mt-auto flex flex-wrap items-end justify-between gap-4 p-5 pt-4">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <span>
            <span className="block text-[11px] font-medium tracking-wide text-muted uppercase">
              Items
            </span>
            <span className="text-[15px] font-semibold tabular-nums text-foreground">
              {formatNumber(Number(order.item_count))}
            </span>
          </span>
          <span>
            <span className="block text-[11px] font-medium tracking-wide text-muted uppercase">
              Total {paid ? "paid" : "due"}
            </span>
            <span className="text-[19px] leading-none font-semibold tracking-tight tabular-nums text-foreground">
              {formatMoney(Number(order.total), order.currency)}
            </span>
          </span>
        </div>

        <ButtonLink href={`/orders/${order.access_token}`} size="sm" variant="primary">
          View order
          <Icon name="arrowRight" size={14} />
        </ButtonLink>
      </div>

      {/* Separated by tone and spacing, never by a drawn rule. */}
      <Link
        className="bg-surface-secondary/40 px-5 py-3 text-[12px] text-muted no-underline transition-colors hover:text-foreground"
        href={`/orders/${order.access_token}`}
      >
        Open the full receipt →
      </Link>
    </article>
  );
}
