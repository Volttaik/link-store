"use client";

import { Button, Card, Chip, Link } from "@heroui/react";

import { OrbLoader } from "@/components/visual/OrbLoader";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { removeCartItemAction, updateCartItemAction } from "@/app/actions/commerce";
import { SelectField } from "@/components/ui/field";
import { formatMoney } from "@/lib/money";
import type { CartItemView } from "@/lib/types";

export function CartLine({ item }: { item: CartItemView }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // The stored snapshot can differ from the live price if the seller changed it.
  const priceChanged = item.currentPrice !== item.unitPrice;

  const setQuantity = (quantity: number) => {
    setError(null);
    startTransition(async () => {
      const result = await updateCartItemAction(item.id, quantity);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  const remove = () => {
    setError(null);
    startTransition(async () => {
      const result = await removeCartItemAction(item.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  const maxSelectable = item.availableStock === null ? 20 : Math.max(1, Math.min(item.availableStock, 20));

  return (
    <Card className="ls-elev-2">
      <Card.Content className="gap-3">
        <div className="flex gap-4">
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-default">
            {item.imageUrl ? (
              <img alt={item.title} className="h-20 w-20 object-cover" src={item.imageUrl} />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs text-muted">
                No photo
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <Link
                  href={item.eventId ? `/events/${item.eventId}` : `/listing/${item.listingId}`} className="line-clamp-2 text-sm font-semibold text-foreground"
                >
                  {item.title}
                </Link>
                {item.variantName ? (
                  <p className="text-xs text-muted">Option: {item.variantName}</p>
                ) : null}
              </div>

              <div className="text-right">
                <p className="text-sm font-semibold">
                  {formatMoney(item.currentPrice * item.quantity, item.currency)}
                </p>
                <p className="text-xs text-muted">
                  {formatMoney(item.currentPrice, item.currency)} each
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {item.status !== "active" ? (
                <Chip color="danger" size="sm" variant="soft">
                  No longer available
                </Chip>
              ) : null}

              {item.availableStock !== null && item.trackInventory && item.availableStock <= 0 ? (
                <Chip color="danger" size="sm" variant="soft">
                  Sold out
                </Chip>
              ) : null}

              {priceChanged ? (
                <Chip color="warning" size="sm" variant="soft">
                  Price updated by the seller
                </Chip>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <SelectField
              aria-label={`Quantity for ${item.title}`}
              className="w-32"
              isDisabled={pending || item.status !== "active"}
              options={Array.from({ length: maxSelectable + 1 }, (_, index) => ({
                value: String(index),
                label: index === 0 ? "Remove" : String(index),
              }))}
              value={String(Math.min(item.quantity, maxSelectable))}
              onChange={(value) => setQuantity(Number(value ?? 0))}
            />

            {/* The quantity change is a write, so it says so while it lands. */}
            {pending ? (
              <span className="flex items-center gap-1.5 text-xs text-muted" role="status">
                <OrbLoader className="h-3.5 w-[2.6rem]" />
                Updating
              </span>
            ) : null}
          </div>

          <Button isPending={pending} size="sm" variant="danger-soft" onPress={remove}>
            Remove
          </Button>
        </div>

        {error ? <p className="text-xs text-danger">{error}</p> : null}
      </Card.Content>
    </Card>
  );
}
