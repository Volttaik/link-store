"use client";

/**
 * Sending a payment request — the small sheet behind the composer's action.
 *
 * Two fields and one button: the amount that was agreed, and what it is for.
 * It is a quiet overlay in the conversation's own language — the same rounded
 * surface, the same type, the same one soft elevation — and it leaves the
 * moment the card is sent. Nothing about it is a payment dashboard: the
 * negotiation already happened above, in the words.
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { Icon } from "@/components/ui/Icon";
import { currencyMeta, parseMoneyToMinor } from "@/lib/money";

export type PaymentRequestDraft = {
  amountMinor: number;
  description: string | null;
};

export function PaymentRequestSheet({
  counterpartName,
  currency,
  contextTitle,
  onSubmit,
  onClose,
}: {
  /** Who will receive the request — the words name them. */
  counterpartName: string;
  currency: string;
  /** The listing this conversation is about, when there is one. */
  contextTitle: string | null;
  /** Sends the request. Resolves to an error message, or null on success. */
  onSubmit: (draft: PaymentRequestDraft) => Promise<string | null>;
  onClose: () => void;
}) {
  const meta = currencyMeta(currency);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Escape closes — the keyboard's own "back", as everywhere else in chat.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const send = async () => {
    setError(null);

    const amountMinor = parseMoneyToMinor(amount, currency);
    if (amountMinor === null || amountMinor <= 0) {
      setError("Enter the amount you agreed on.");
      return;
    }

    setBusy(true);
    const failure = await onSubmit({
      amountMinor,
      description: description.trim() ? description.trim().slice(0, 200) : null,
    });
    setBusy(false);

    if (failure) setError(failure);
  };

  return createPortal(
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-4 sm:items-center"
      onClick={onClose}
      role="dialog"
    >
      <div
        className="motion-safe:animate-chat-pop w-[min(92vw,22rem)] rounded-[1.45rem] bg-surface p-5 shadow-elev-float"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent/12">
            <Icon className="text-accent" name="wallet" size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold text-foreground">Send payment request</p>
            <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted">
              {counterpartName} will see it right here in the conversation and can pay it
              directly.
              {contextTitle ? ` It will point at “${contextTitle}”.` : ""}
            </p>
          </div>
          <button
            aria-label="Close"
            className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-secondary hover:text-foreground motion-safe:active:scale-95"
            onClick={onClose}
            type="button"
          >
            <Icon name="x" size={13} />
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-semibold tracking-[0.11em] text-muted uppercase">
              Amount
            </span>
            <span className="flex items-center gap-2 rounded-2xl bg-surface-secondary/70 px-3.5 py-2.5 focus-within:ring-2 focus-within:ring-accent/40">
              <span className="text-[15px] font-semibold text-muted">{meta.symbol}</span>
              <input
                aria-label="Amount"
                autoFocus
                className="w-full bg-transparent text-[15px] font-semibold text-foreground outline-none placeholder:font-normal placeholder:text-muted"
                inputMode="decimal"
                onChange={(event) => setAmount(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void send();
                }}
                placeholder="0.00"
                value={amount}
              />
            </span>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-semibold tracking-[0.11em] text-muted uppercase">
              What is it for? <span className="font-normal normal-case tracking-normal">(optional)</span>
            </span>
            <textarea
              aria-label="Description"
              className="max-h-24 min-h-[3.25rem] w-full resize-none rounded-2xl bg-surface-secondary/70 px-3.5 py-2.5 text-[13.5px] leading-relaxed text-foreground outline-none placeholder:text-muted focus:ring-2 focus:ring-accent/40"
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Two months' rent, agreed over chat…"
              value={description}
            />
          </label>
        </div>

        {error ? (
          <p className="mt-2.5 px-1 text-[11.5px] font-medium text-danger" role="status">
            {error}
          </p>
        ) : null}

        <div className="mt-4 flex flex-col gap-2">
          <button
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-accent px-4 py-3 text-[13.5px] font-semibold text-accent-foreground transition-opacity hover:opacity-90 motion-safe:active:scale-[0.98]"
            disabled={busy}
            onClick={() => void send()}
            type="button"
          >
            <Icon name="send" size={15} />
            {busy ? "Sending…" : "Send request"}
          </button>
          <button
            className="w-full rounded-2xl px-4 py-2.5 text-[12.5px] font-medium text-muted transition-colors hover:text-foreground"
            onClick={onClose}
            type="button"
          >
            Not now
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
