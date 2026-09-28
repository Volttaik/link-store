"use client";

import { Button, Card } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { startCheckoutAction, type CheckoutPayload } from "@/app/actions/commerce";
import { Field, TextAreaField } from "@/components/ui/field";
import { InfoNote } from "@/components/ui/feedback";
import { formatMoney } from "@/lib/money";

/**
 * Collects buyer details and starts the payment.
 *
 * The browser never sends a price or a total: it sends who is buying. The server
 * recomputes the amount, creates the order and only then asks Paystack for a
 * checkout URL — which is where we hand the customer over.
 */
export function CheckoutForm({
  defaultEmail,
  defaultName,
  hasShipping,
  discountCode,
  paymentsReady,
  issues,
  currency,
  total,
  storeId,
}: {
  defaultEmail: string;
  defaultName: string;
  hasShipping: boolean;
  discountCode: string;
  paymentsReady: boolean;
  issues: string[];
  currency: string;
  total: number;
  /** The shop this payment belongs to — a basket can span several. */
  storeId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [form, setForm] = useState({
    email: defaultEmail,
    name: defaultName,
    phone: "",
    note: "",
    line1: "",
    line2: "",
    city: "",
    state: "",
    country: "Nigeria",
    postalCode: "",
    code: discountCode,
  });

  const [error, setError] = useState<string | null>(null);
  const [orderIssues, setOrderIssues] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((previous) => ({ ...previous, [key]: value }));

  const applyCode = () => {
    const trimmed = form.code.trim();
    const query = new URLSearchParams({ store: storeId });
    if (trimmed) query.set("code", trimmed);
    router.push(`/checkout?${query.toString()}`);
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setOrderIssues([]);

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) {
      setError("Enter a valid email address so we can send your receipt.");
      return;
    }

    if (hasShipping && !form.line1.trim()) {
      setError("Enter a delivery address.");
      return;
    }

    const payload: CheckoutPayload = {
      storeId,
      email: form.email.trim(),
      name: form.name.trim() || null,
      phone: form.phone.trim() || null,
      note: form.note.trim() || null,
      discountCode: form.code.trim() || null,
      address: hasShipping
        ? {
            line1: form.line1.trim(),
            line2: form.line2.trim(),
            city: form.city.trim(),
            state: form.state.trim(),
            country: form.country.trim(),
            postalCode: form.postalCode.trim(),
          }
        : null,
    };

    setCreating(true);

    startTransition(async () => {
      try {
        const result = await startCheckoutAction(payload);

        if (!result.ok) {
          setError(result.error);
          setOrderIssues(result.issues ?? []);
          setCreating(false);
          return;
        }

        // Hand over to Paystack's hosted checkout.
        window.location.href = result.authorizationUrl;
      } catch {
        setError("We could not start the payment. Please try again.");
        setCreating(false);
      }
    });
  };

  const blocked = issues.length > 0;

  return (
    <Card className="ls-elev-2">
      <Card.Header className="flex-col items-start gap-1">
        <p className="text-sm font-semibold">Your details</p>
        <p className="text-xs text-muted">
          We use these to send your receipt and to reach you about this order.
        </p>
      </Card.Header>

      <Card.Content>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              isRequired
              isDisabled={creating}
              label="Email"
              name="email"
              onChange={set("email")}
              placeholder="you@example.com"
              type="email"
              value={form.email}
            />
            <Field
              isDisabled={creating}
              label="Full name"
              name="name"
              onChange={set("name")}
              placeholder="Ada Obi"
              value={form.name}
            />
          </div>

          <Field
            description="Sellers use this to arrange delivery or booking."
            isDisabled={creating}
            label="Phone"
            name="phone"
            onChange={set("phone")}
            placeholder="+234 800 000 0000"
            type="tel"
            value={form.phone}
          />

          {hasShipping ? (
            <>
              
              <p className="text-sm font-semibold">Delivery address</p>

              <Field
                isRequired
                isDisabled={creating}
                label="Address line 1"
                name="line1"
                onChange={set("line1")}
                value={form.line1}
              />
              <Field
                isDisabled={creating}
                label="Address line 2"
                name="line2"
                onChange={set("line2")}
                value={form.line2}
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  isDisabled={creating}
                  label="City"
                  name="city"
                  onChange={set("city")}
                  value={form.city}
                />
                <Field
                  isDisabled={creating}
                  label="State / region"
                  name="state"
                  onChange={set("state")}
                  value={form.state}
                />
                <Field
                  isDisabled={creating}
                  label="Country"
                  name="country"
                  onChange={set("country")}
                  value={form.country}
                />
                <Field
                  isDisabled={creating}
                  label="Postal code"
                  name="postalCode"
                  onChange={set("postalCode")}
                  value={form.postalCode}
                />
              </div>
            </>
          ) : null}

          

          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Field
                isDisabled={creating}
                label="Discount code"
                name="code"
                onChange={set("code")}
                placeholder="Optional"
                value={form.code}
              />
            </div>
            <Button isDisabled={creating} isPending={creating} variant="secondary" onPress={applyCode}>
              Apply
            </Button>
          </div>

          <TextAreaField
            isDisabled={creating}
            label="Note for the seller"
            name="note"
            onChange={set("note")}
            placeholder="Delivery instructions, event questions, anything else…"
            rows={2}
            value={form.note}
          />

          {error ? (
            <InfoNote tone="danger" title={error}>
              {orderIssues.length > 0 ? (
                <ul className="mt-1 list-inside list-disc space-y-0.5 text-sm">
                  {orderIssues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              ) : (
                "This order could not be completed."
              )}
            </InfoNote>
          ) : null}

          <Button type="submit" variant="primary" size="lg"
            fullWidth isPending={pending || creating}
            isDisabled={blocked || !paymentsReady}
          >
            {paymentsReady
              ? `Pay ${formatMoney(total, currency)} with Paystack`
              : "Payments unavailable"}
          </Button>

          <p className="text-xs text-muted">
            You will be taken to Paystack to complete payment. Link Store never sees or stores your
            card details. Your order is confirmed only after our server verifies the payment.
          </p>
        </form>
      </Card.Content>
    </Card>
  );
}
