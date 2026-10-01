/**
 * The success card — a confirmation experience.
 *
 * A completed payment is the one moment in a marketplace that deserves a
 * little ceremony, so this card is not “✓ Success” in a rectangle: it is a
 * dedicated confirmation — the mark draws itself, the message says what
 * happened in plain words, the transaction it confirms is laid out as a small
 * receipt, and the way forward is one clear action.
 *
 * It also carries the *not* confirmed case, because a payment result page must
 * say the truth either way — there the mark is a warning, the message says
 * nothing was charged, and the next action is finding out what happened.
 */

import type { ReactNode } from "react";

import { Icon } from "@/components/ui/Icon";

export type SuccessRow = {
  label: string;
  value: ReactNode;
};

export function SuccessCard({
  tone = "success",
  title,
  message,
  rows,
  children,
  primaryAction,
  secondaryAction,
}: {
  tone?: "success" | "warning" | "danger";
  title: string;
  message: ReactNode;
  /** The transaction this confirms, as label/value rows on a receipt strip. */
  rows?: SuccessRow[];
  /** Anything that belongs with the confirmation: notes, follow-up detail. */
  children?: ReactNode;
  primaryAction?: ReactNode;
  secondaryAction?: ReactNode;
}) {
  const mark = tone === "success" ? "check" : tone === "danger" ? "xCircle" : "alert";
  const markTone =
    tone === "success"
      ? "bg-success/15 text-success"
      : tone === "danger"
        ? "bg-danger/15 text-danger"
        : "bg-warning/15 text-warning";

  return (
    <article className="flex flex-col items-center gap-5 overflow-hidden rounded-3xl bg-surface p-7 text-center shadow-elev-2 motion-safe:animate-settle sm:p-9">
      {/* The mark: a ring pops open and the check draws itself, once. */}
      <div className={`ls-confirm-ring flex size-18 items-center justify-center rounded-full ${markTone}`}>
        {tone === "success" ? (
          <svg
            aria-hidden="true"
            className="ls-confirm-check size-9"
            fill="none"
            viewBox="0 0 24 24"
          >
            <path
              d="M5 12.5 10 17.5 19 7.5"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.5"
            />
          </svg>
        ) : (
          <Icon name={mark} size={30} />
        )}
      </div>

      <div className="flex max-w-xl flex-col items-center gap-2">
        <h2 className="text-[20px] leading-tight font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        <p className="text-[14px] leading-relaxed text-muted">{message}</p>
      </div>

      {/* What is being confirmed — one receipt strip, label and value. */}
      {rows && rows.length > 0 ? (
        <div className="flex w-full max-w-md flex-col gap-2.5 rounded-2xl bg-surface-secondary/50 px-5 py-4 text-left">
          {rows.map((row) => (
            <div key={row.label} className="flex items-baseline justify-between gap-4 text-[13px]">
              <span className="shrink-0 text-muted">{row.label}</span>
              <span className="min-w-0 truncate text-right font-semibold tabular-nums text-foreground">
                {row.value}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {children ? <div className="w-full max-w-md text-left">{children}</div> : null}

      {(primaryAction || secondaryAction) && (
        <div className="flex flex-wrap items-center justify-center gap-3">
          {primaryAction}
          {secondaryAction}
        </div>
      )}
    </article>
  );
}
