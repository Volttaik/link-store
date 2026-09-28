"use client";

import { Button, Chip, Description, Label, Radio, RadioGroup } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { addToCartAction } from "@/app/actions/commerce";
import { SelectField } from "@/components/ui/field";
import { InfoNote } from "@/components/ui/feedback";
import { listingActionMeta } from "@/lib/catalog";
import { formatMoney } from "@/lib/money";
import type { ListingVariantRow } from "@/lib/types";

/**
 * Variant selection, quantity and the listing's own purchase action.
 *
 * The button says what actually happens for this kind of listing — a product
 * is added to the cart, food is ordered, a service is booked — while the flow
 * underneath is the same order basket and checkout. Prices shown here come from
 * the database snapshot; the server re-reads and re-validates everything on add
 * and again at checkout, so this UI can never become the source of truth for
 * what a customer pays.
 */
export function PurchasePanel({
  listingId,
  type,
  currency,
  basePrice,
  variants,
  trackInventory,
  stock,
  fulfilment,
  isSignedIn,
}: {
  listingId: string;
  /** The listing's own type — what decides the wording of the action. */
  type: string;
  currency: string;
  basePrice: number;
  variants: ListingVariantRow[];
  trackInventory: boolean;
  stock: number;
  fulfilment: string;
  isSignedIn: boolean;
}) {
  const router = useRouter();
  const action = listingActionMeta(type);
  const [pending, startTransition] = useTransition();
  const [variantId, setVariantId] = useState<string | null>(variants[0]?.id ?? null);
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);

  const selectedVariant = variants.find((variant) => variant.id === variantId) ?? null;
  const unitPrice =
    selectedVariant?.price !== null && selectedVariant?.price !== undefined
      ? Number(selectedVariant.price)
      : basePrice;

  const available = selectedVariant
    ? Number(selectedVariant.stock)
    : trackInventory
      ? stock
      : null;

  const soldOut = available !== null && available <= 0;
  const maxQuantity = available === null ? 20 : Math.max(1, Math.min(available, 20));

  const addToCart = () => {
    setError(null);
    setAdded(false);

    startTransition(async () => {
      const result = await addToCartAction({
        listingId,
        variantId,
        quantity,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setAdded(true);
      router.refresh();
    });
  };

  const actionLabels =
    action.kind === "order"
      ? { label: "Order", added: "Added to your order", review: "Review order" }
      : action.kind === "book"
        ? { label: "Book Service", added: "Ready to book", review: "Review booking" }
        : { label: "Add to Cart", added: "Added to cart", review: "View cart" };

  const deliveryNote =
    fulfilment === "digital"
      ? "Delivered instantly. A download link appears on your order as soon as payment is verified."
      : fulfilment === "ticket"
        ? "Your ticket is issued as soon as payment is verified."
        : fulfilment === "booking"
          ? "The seller will confirm your booking after payment."
          : action.kind === "order"
            ? "Your food order is prepared after payment. The seller confirms how it reaches you."
            : fulfilment === "pickup" || fulfilment === "onsite"
              ? "Collection or on-site delivery. The seller will confirm the details."
              : "Shipped by the seller after payment.";

  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-3">
        <span className="text-3xl font-bold tracking-tight">
          {formatMoney(unitPrice, currency)}
        </span>
        {selectedVariant ? (
          <Chip size="sm" variant="soft">
            {selectedVariant.name}
          </Chip>
        ) : null}
      </div>

      {variants.length > 0 ? (
        <RadioGroup
          orientation="horizontal"
          value={variantId ?? undefined}
          onChange={setVariantId}
        >
          <Label>Choose an option</Label>
          {variants.map((variant) => {
            const variantPrice =
              variant.price !== null && variant.price !== undefined
                ? Number(variant.price)
                : basePrice;
            const variantSoldOut = trackInventory && Number(variant.stock) <= 0;
            const note = variantSoldOut
              ? "Sold out"
              : variantPrice !== basePrice
                ? formatMoney(variantPrice, currency)
                : null;

            return (
              <Radio key={variant.id} isDisabled={variantSoldOut} value={variant.id}>
                <Radio.Content>
                  <Radio.Control>
                    <Radio.Indicator />
                  </Radio.Control>
                  {variant.name}
                </Radio.Content>
                {note ? <Description>{note}</Description> : null}
              </Radio>
            );
          })}
        </RadioGroup>
      ) : null}

      <div className="flex flex-wrap items-end gap-3">
        <SelectField
          aria-label="Quantity"
          className="w-28"
          isDisabled={soldOut}
          options={Array.from({ length: maxQuantity }, (_, index) => ({
            value: String(index + 1),
            label: String(index + 1),
          }))}
          value={String(quantity)}
          onChange={(value) => setQuantity(Number(value ?? 1))}
        />

        <Button
          className="min-w-40 flex-1"
          isDisabled={soldOut}
          isPending={pending}
          size="lg"
          variant="primary"
          onPress={addToCart}
        >
          {soldOut ? "Sold out" : actionLabels.label}
        </Button>
      </div>

      {available !== null && !soldOut && available <= 5 ? (
        <p className="text-xs text-warning">Only {available} left in stock.</p>
      ) : null}

      {error ? (
        <InfoNote tone="danger">{error}</InfoNote>
      ) : added ? (
        <InfoNote title={actionLabels.added} tone="success">
          <div className="mt-1 flex gap-2">
            <Button size="sm" variant="secondary" onPress={() => router.push("/cart")}>
              {actionLabels.review}
            </Button>
            <Button size="sm" variant="ghost" onPress={() => setAdded(false)}>
              Keep shopping
            </Button>
          </div>
        </InfoNote>
      ) : null}

      

      <ul className="space-y-1.5 text-xs text-muted">
        <li>· {deliveryNote}</li>
        <li>· Payment is confirmed securely before your order is placed.</li>
        {!isSignedIn ? (
          <li>· No account needed. You can track the order with the link we give you.</li>
        ) : null}
      </ul>
    </div>
  );
}

/**
 * The ticket picker for an event.
 *
 * Tickets never go through the cart, so this does not add anything to a basket:
 * it collects the quantities and hands the buyer to the ticket purchase, where
 * every choice is re-checked against the database and paid for on its own. The
 * tickets themselves are issued one by one after the payment is verified.
 */
export function TicketPurchasePanel({
  eventId,
  ticketTypes,
  currency,
  defaultExpanded = false,
}: {
  eventId: string;
  ticketTypes: Array<{
    id: string;
    name: string;
    description: string | null;
    price: number;
    quantity_total: number;
    quantity_sold: number;
    is_active: number;
    sales_start: string | null;
    sales_end: string | null;
  }>;
  currency: string;
  defaultExpanded?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(defaultExpanded);

  const now = new Date().toISOString();

  const availableTypes = ticketTypes.map((ticket) => {
    const remaining =
      Number(ticket.quantity_total) === 0
        ? null
        : Math.max(0, Number(ticket.quantity_total) - Number(ticket.quantity_sold));

    const onSale =
      ticket.is_active === 1 &&
      (!ticket.sales_start || now >= ticket.sales_start) &&
      (!ticket.sales_end || now <= ticket.sales_end);

    return { ...ticket, remaining, onSale };
  });

  const total = availableTypes.reduce(
    (sum, ticket) => sum + ticket.price * (quantities[ticket.id] ?? 0),
    0,
  );
  const anySelected = Object.values(quantities).some((value) => value > 0);

  /** Straight to the ticket purchase — the choice travels, the prices do not. */
  const buyTickets = () => {
    setError(null);

    const selected = availableTypes.filter((ticket) => (quantities[ticket.id] ?? 0) > 0);
    if (selected.length === 0) {
      setError("Choose at least one ticket.");
      return;
    }

    const search = new URLSearchParams({ event: eventId });
    for (const ticket of selected) {
      search.append("line", `${ticket.id}:${quantities[ticket.id] ?? 0}`);
    }

    startTransition(() => router.push(`/tickets/checkout?${search.toString()}`));
  };

  if (!expanded) {
    return (
      <Button variant="primary" size="lg" fullWidth onPress={() => setExpanded(true)}>
        Choose tickets
      </Button>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {availableTypes.map((ticket) => (
          <div
            key={ticket.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-secondary/50 p-3"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold">{ticket.name}</p>
                {!ticket.onSale ? (
                  <Chip color="default" size="sm" variant="soft">
                    Not on sale
                  </Chip>
                ) : ticket.remaining !== null && ticket.remaining <= 0 ? (
                  <Chip color="danger" size="sm" variant="soft">
                    Sold out
                  </Chip>
                ) : ticket.remaining !== null && ticket.remaining <= 10 ? (
                  <Chip color="warning" size="sm" variant="soft">
                    <span className="tabular-nums">{ticket.remaining}</span> left
                  </Chip>
                ) : null}
              </div>
              <p className="text-xs text-muted">
                {formatMoney(ticket.price, currency)}
                {ticket.description ? ` · ${ticket.description}` : ""}
              </p>
            </div>

            <SelectField
              aria-label={`Quantity for ${ticket.name}`}
              className="w-28"
              isDisabled={!ticket.onSale || (ticket.remaining !== null && ticket.remaining <= 0)}
              options={Array.from(
                { length: Math.min(10, Math.max(1, ticket.remaining ?? 10)) + 1 },
                (_, index) => ({ value: String(index), label: String(index) }),
              )}
              value={String(quantities[ticket.id] ?? 0)}
              onChange={(value) =>
                setQuantities((previous) => ({
                  ...previous,
                  [ticket.id]: Number(value ?? 0),
                }))
              }
            />
          </div>
        ))}
      </div>

      

      <div className="flex items-center justify-between">
        <span className="text-sm text-muted">
          {anySelected ? "Selected total" : "No tickets selected"}
        </span>
        <span className="text-lg font-semibold">{formatMoney(total, currency)}</span>
      </div>

      <Button variant="primary" size="lg"
        fullWidth isPending={pending}
        isDisabled={!anySelected}
        onPress={buyTickets}
      >
        Buy tickets
      </Button>

      <p className="text-xs text-muted">
        Each ticket is issued on its own, with its own QR code. Tickets are bought directly and
        never go in the cart.
      </p>

      {error ? <InfoNote tone="danger">{error}</InfoNote> : null}
    </div>
  );
}
