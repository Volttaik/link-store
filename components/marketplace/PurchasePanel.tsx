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

  const actionLabels = { label: "Add to Cart", added: "Added to cart", review: "View cart" };
  const deliveryNote = fulfilment === "pickup" ? "Collected from the seller after payment." : "Shipped by the seller after payment.";

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

