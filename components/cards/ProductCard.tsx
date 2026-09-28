/**
 * The product card — a product presented like a rich message.
 *
 * A product is something a shop is *saying* to the shopper, so the card is cut
 * as a message bubble: the shop speaks first (the sender line), the product
 * arrives inside one large-cornered bubble with a trailing corner, and the way
 * to buy it sits at the foot of that bubble. Nothing about the silhouette is a
 * generic ecommerce tile — glance at it and it reads as a product someone
 * brought to you.
 *
 * Everything it shares with the rest of the platform is language, not shape:
 * the type scale, the elevation scale, the accent discipline, the media radius.
 * The composition itself is this card's alone.
 */

import { Avatar } from "@heroui/react/avatar";
import { Link } from "@heroui/react/link";

import { CardBuyButton } from "@/components/marketplace/CardBuyButton";
import { Icon } from "@/components/ui/Icon";
import { ButtonLink } from "@/components/ui/controls";
import { MediaPlaceholder, PriceTag } from "@/components/ui/atoms";
import { listingFacts, listingTypeIcon, listingTypeMeta, type ListingFact } from "@/lib/catalog";
import { formatRelative, truncate } from "@/lib/format";
import type { ListingCardData } from "@/lib/types";

/**
 * The facts this product's kind of thing cares about, one quiet line each.
 *
 * A shopper should tell a ticket from a rental from a service at a glance — not
 * read every column the database holds. A fact that is bad news is the only one
 * allowed any colour.
 */
function FactList({ facts, limit }: { facts: ListingFact[]; limit: number }) {
  const shown = facts.slice(0, limit);
  if (shown.length === 0) return null;

  return (
    <ul className="flex flex-col gap-1.5">
      {shown.map((fact) => (
        <li
          key={fact.key}
          className={`flex items-center gap-2 text-[12.5px] ${
            fact.tone === "danger" ? "font-medium text-danger" : "text-muted"
          }`}
        >
          <Icon name={fact.icon} size={12} className="shrink-0" />
          <span className="truncate">{fact.label}</span>
        </li>
      ))}
    </ul>
  );
}

export function ProductCard({
  listing,
  showStore = true,
  compact = false,
  showBuy = true,
}: {
  listing: ListingCardData;
  showStore?: boolean;
  /** Tighter media and a shorter fact list, for a dense rail. */
  compact?: boolean;
  /**
   * Show the action row. On by default everywhere: the card's action is
   * derived from the listing's type (Add to Cart, Order, Buy Ticket, Open
   * Listing, Book Service), so the same card behaves the same way on the home
   * page, the marketplace, search, category and shop surfaces alike.
   */
  showBuy?: boolean;
}) {
  const meta = listingTypeMeta(listing.type);
  const soldOut = listing.trackInventory && listing.stock <= 0;
  const facts = listingFacts(listing);

  return (
    <article className="flex h-full flex-col gap-2.5 motion-safe:animate-bubble">
      {/* The sender line: the shop this product message comes from. */}
      {showStore ? (
        <Link
          className="flex min-w-0 items-center gap-2 text-[12.5px] text-muted no-underline transition-colors hover:text-foreground"
          href={`/@${listing.storeSlug}`}
        >
          <Avatar className="size-6 shrink-0 rounded-lg">
            {listing.storeLogoUrl ? (
              <Avatar.Image
                alt={listing.storeName}
                className="object-contain"
                src={listing.storeLogoUrl}
              />
            ) : null}
            <Avatar.Fallback className="rounded-lg">
              {listing.storeName.slice(0, 1).toUpperCase()}
            </Avatar.Fallback>
          </Avatar>
          <span className="truncate font-medium text-foreground">{listing.storeName}</span>
          <span aria-hidden="true">·</span>
          <span className="truncate">{formatRelative(listing.createdAt)}</span>
        </Link>
      ) : null}

      {/* The bubble itself. */}
      <div className="ls-bubble ls-lift flex h-full flex-col">
        <Link
          aria-label={listing.title}
          className={`media-frame mx-2.5 mt-2.5 block overflow-hidden bg-surface-secondary no-underline ${
            compact ? "aspect-16/10" : "aspect-4/3"
          }`}
          href={`/listing/${listing.id}`}
        >
          {listing.imageUrl ? (
            <img
              alt={listing.title}
              className="h-full w-full object-cover transition-transform duration-500 ease-out motion-safe:hover:scale-[1.04]"
              loading="lazy"
              src={listing.imageUrl}
            />
          ) : (
            <MediaPlaceholder label={meta.label} />
          )}
        </Link>

        {/* State rides at the top of the message body, so it is known before a
            word of the product is read. */}
        {soldOut || listing.isFeatured ? (
          <div className="flex flex-wrap items-center gap-1.5 px-4 pt-3">
            {soldOut ? (
              <span className="rounded-full bg-warning/15 px-2.5 py-1 text-[11px] font-semibold text-warning">
                Sold out
              </span>
            ) : null}
            {listing.isFeatured && !soldOut ? (
              <span className="rounded-full bg-accent/15 px-2.5 py-1 text-[11px] font-semibold text-accent">
                Featured
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-1 flex-col gap-3 p-4">
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-medium tracking-wide text-muted uppercase">
              <Icon name={listingTypeIcon(listing.type)} size={11} className="shrink-0" />
              <span className="truncate">{listing.categoryName ?? meta.label}</span>
            </span>

            <Link
              className="line-clamp-2 text-[15.5px] leading-snug font-semibold text-foreground no-underline"
              href={`/listing/${listing.id}`}
            >
              {truncate(listing.title, 72)}
            </Link>

            <FactList facts={facts} limit={compact ? 2 : 3} />
          </div>

          <div className="mt-auto flex flex-col gap-3 pt-1">
            <PriceTag
              amount={listing.price}
              compareAt={listing.compareAtPrice}
              currency={listing.currency}
              size="card"
            />

            {showBuy ? (
              <CardBuyButton
                eventId={listing.eventId}
                listingId={listing.id}
                soldOut={soldOut}
                type={listing.type}
                variantCount={listing.variantCount}
              />
            ) : (
              <ButtonLink fullWidth href={`/listing/${listing.id}`} size="sm" variant="secondary">
                View details
                <Icon name="arrowRight" size={14} />
              </ButtonLink>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
