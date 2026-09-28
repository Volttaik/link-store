"use client";

import { Button, Card } from "@heroui/react";
import { useState, useTransition } from "react";

import { startTicketCheckoutAction } from "@/app/actions/commerce";
import { Field, TextAreaField } from "@/components/ui/field";
import { InfoNote } from "@/components/ui/feedback";
import { formatMoney } from "@/lib/money";

/**
 * Collects the buyer and starts the ticket payment.
 *
 * The browser sends who is buying and which tickets were chosen — never a price
 * and never a total. The server re-reads every ticket type, computes the amount
 * itself, creates the order and only then asks Paystack for a checkout URL.
 */
export function TicketCheckoutForm({
  defaultEmail,
  defaultName,
  eventId,
  items,
  paymentsReady,
  currency,
  total,
}: {
  defaultEmail: string;
  defaultName: string;
  eventId: string;
  items: Array<{ ticketTypeId: string; quantity: number }>;
  paymentsReady: boolean;
  currency: string;
  total: number;
}) {
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({
    email: defaultEmail,
    name: defaultName,
    phone: "",
    note: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((previous) => ({ ...previous, [key]: value }));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) {
      setError("Enter a valid email address — this is where the tickets are sent.");
      return;
    }

    setStarting(true);

    startTransition(async () => {
      try {
        const result = await startTicketCheckoutAction({
          eventId,
          items,
          email: form.email.trim(),
          name: form.name.trim() || null,
          phone: form.phone.trim() || null,
          note: form.note.trim() || null,
        });

        if (!result.ok) {
          setError(result.error);
          setStarting(false);
          return;
        }

        window.location.href = result.authorizationUrl;
      } catch {
        setError("We could not start the payment. Please try again.");
        setStarting(false);
      }
    });
  };

  const busy = pending || starting;

  return (
    <Card className="ls-elev-2">
      <Card.Header className="flex-col items-start gap-1">
        <p className="text-sm font-semibold">Your details</p>
        <p className="text-xs text-muted">
          Your tickets are emailed to this address, and each one carries its own QR.
        </p>
      </Card.Header>

      <Card.Content>
        <form className="space-y-4" onSubmit={submit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              isRequired
              isDisabled={busy}
              label="Email"
              name="email"
              onChange={set("email")}
              placeholder="you@example.com"
              type="email"
              value={form.email}
            />
            <Field
              isDisabled={busy}
              label="Full name"
              name="name"
              onChange={set("name")}
              placeholder="Ada Obi"
              value={form.name}
            />
          </div>

          <Field
            description="Only used by the organiser if something changes about the event."
            isDisabled={busy}
            label="Phone"
            name="phone"
            onChange={set("phone")}
            placeholder="+234 800 000 0000"
            type="tel"
            value={form.phone}
          />

          <TextAreaField
            isDisabled={busy}
            label="Note for the organiser"
            name="note"
            onChange={set("note")}
            placeholder="Accessibility needs, group arrival, anything else…"
            rows={2}
            value={form.note}
          />

          {error ? (
            <InfoNote tone="danger" title={error}>
              This ticket purchase could not be completed.
            </InfoNote>
          ) : null}

          <Button
            fullWidth
            isDisabled={!paymentsReady}
            isPending={busy}
            size="lg"
            type="submit"
            variant="primary"
          >
            {paymentsReady
              ? `Pay ${formatMoney(total, currency)} with Paystack`
              : "Payments unavailable"}
          </Button>

          <p className="text-xs text-muted">
            You will be taken to Paystack to pay. Link Store never sees your card details, and your
            tickets are issued only after our server verifies the payment — never from the browser.
          </p>
        </form>
      </Card.Content>
    </Card>
  );
}
