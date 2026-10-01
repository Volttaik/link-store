"use client";

import { Button } from "@heroui/react";
import { Link } from "@heroui/react/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { addToCartAction } from "@/app/actions/commerce";
import { ButtonLink } from "@/components/ui/controls";
import { Icon } from "@/components/ui/Icon";
import { listingActionMeta } from "@/lib/catalog";

/**
 * The action on a product card — the one that matches what the listing *is*.
 *
 * A button must say what actually happens, so the label and the behaviour both
 * come from the listing's type, the same source the checkout reads:
 *
 * - a normal product is **added to the cart** (the same server action the
 *   product page runs, so a card is a real way to buy);
 * - food is **ordered** — the same order basket underneath, food wording on
 *   top;
 * - a ticket is **bought** — straight to the ticket purchase, where each
 *   admission becomes its own ticket. Tickets never enter the cart;
 * - a rental is **opened** — the listing is reviewed and the deal is agreed
 *   with the seller in the conversation. There is no purchase on the card;
 * - a service is **booked** — opening the listing, where the booking happens.
 *
 * A listing with options cannot be added from a card, because the card has no
 * way to know which option the customer wants — it sends them to the product
 * instead of quietly charging the base price.
 *
 * Failures (sold out, store closed, an unavailable digital asset) show the
 * server's own explanation under the row rather than silently doing nothing.
 */
export function CardBuyButton({
  listingId,
  type,
  soldOut,
  variantCount,
}: {
  listingId: string;
  /** The listing's own type — never inferred from text. */
  type: string;
  soldOut: boolean;
  variantCount: number;
  /** For a ticket listing: the event its admissions are sold for. */
  eventId?: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);

  const action = listingActionMeta(type);

  if (variantCount > 0) {
    return (
      <ButtonLink fullWidth href={`/listing/${listingId}`} size="sm" variant="secondary">
        <Icon name="settings" size={14} />
        Choose options
      </ButtonLink>
    );
  }

  const buy = () => {
    setError(null);

    startTransition(async () => {
      const result = await addToCartAction({ listingId, quantity: 1 });

      if (!result.ok) {
        setAdded(false);
        setError(result.error);
        return;
      }

      setAdded(true);
      router.refresh();
    });
  };

  return (
    // `w-full` on both: the card's content column does not stretch its children,
    // and the pair is the card's action bar rather than two loose buttons.
    <div className="flex w-full flex-col gap-1">
      <div className="product-card-actions flex w-full min-w-0 flex-wrap items-center gap-2">
        <Button
          className="min-h-11 min-w-0 flex-1 basis-36"
          isDisabled={soldOut}
          isPending={pending}
          size="sm"
          variant={added ? "secondary" : "primary"}
          onPress={buy}
        >
          <Icon name={added ? "check" : action.icon} size={14} />
          {soldOut ? "Sold out" : added ? "Added" : action.label}
        </Button>

        <ButtonLink href={`/listing/${listingId}`} size="sm" variant="ghost" className="min-h-11 flex-1 basis-14">View</ButtonLink>
      </div>

      {error ? (
        <p role="alert" className="break-words text-[11px] leading-snug text-danger">{error}</p>
      ) : added ? (
        <Link
          className="text-[11px] text-muted no-underline hover:text-foreground"
          href="/cart"
        >
          View cart
        </Link>
      ) : null}
    </div>
  );
}
