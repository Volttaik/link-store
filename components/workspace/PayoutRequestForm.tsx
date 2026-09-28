"use client";

import { Button } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { requestPayoutAction } from "@/app/actions/finance";
import { Field, TextAreaField } from "@/components/ui/field";
import { InfoNote } from "@/components/ui/feedback";
import { formatMoney, minorToInput, parseMoneyToMinor } from "@/lib/money";

/**
 * Request a payout of the store's available balance.
 *
 * This records a real payout request against the ledger; it does not move money
 * by itself. The balance check happens server-side, so a stale page cannot
 * withdraw more than exists.
 */
export function PayoutRequestForm({
  currency,
  available,
  hasBankDetails,
}: {
  currency: string;
  available: number;
  hasBankDetails: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [amount, setAmount] = useState(available > 0 ? minorToInput(available, currency) : "");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setDone(null);

    const minor = parseMoneyToMinor(amount, currency);
    if (minor === null || minor <= 0) {
      setError("Enter a valid amount.");
      return;
    }

    startTransition(async () => {
      const result = await requestPayoutAction({ amount: minor, notes: notes.trim() || null });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDone("Payout requested. It will be reviewed and marked as paid once transferred.");
      setAmount("");
      setNotes("");
      router.refresh();
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-muted">Available to withdraw</span>
        <span className="font-semibold">{formatMoney(available, currency)}</span>
      </div>

      <Field
        description="You can withdraw up to your available balance."
        inputProps={{ inputMode: "decimal" }}
        isDisabled={available <= 0 || !hasBankDetails}
        label={`Amount (${currency})`}
        name="amount"
        onChange={setAmount}
        prefix={<span className="text-muted">{currency}</span>}
        value={amount}
      />

      <TextAreaField
        isDisabled={!hasBankDetails}
        label="Note"
        name="note"
        onChange={setNotes}
        placeholder="Anything the operator should know"
        rows={2}
        value={notes}
      />

      {!hasBankDetails ? (
        <InfoNote title="Add your bank details first" tone="warning">
          Payouts can only be sent to a saved account. Add it under Settings → Payment settings.
        </InfoNote>
      ) : available <= 0 ? (
        <InfoNote title="Nothing available yet">
          Your available balance becomes positive as paid orders settle, after platform fees.
        </InfoNote>
      ) : null}

      {error ? <InfoNote tone="danger">{error}</InfoNote> : null}
      {done ? <InfoNote tone="success">{done}</InfoNote> : null}

      <Button
        fullWidth
        isDisabled={!hasBankDetails || available <= 0}
        isPending={pending}
        type="submit"
        variant="primary"
      >
        Request payout
      </Button>
    </form>
  );
}
