import { Link } from "@heroui/react/link";

import { ActionButton, ButtonLink } from "@/components/ui/controls";
import { StatusChip } from "@/components/ui/atoms";
import { Icon } from "@/components/ui/Icon";
import { CardOrbs } from "@/components/visual/Atmosphere";
import { deleteListingAction, setListingStatusAction } from "@/app/actions/listings";
import { listingTypeMeta, listingStatusTone } from "@/lib/catalog";
import { formatNumber, formatRelative } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import type { ListingCardData } from "@/lib/types";
import type { WorkspaceModule } from "@/lib/workspace-modules";

/**
 * One thing for sale, on a module's shelf.
 *
 * The same card on every module — Listing, Services, Food, Rentals, Digital —
 * because a seller should not have to learn four layouts to manage one
 * catalogue. What changes per module is what the card is *for*: the module it
 * belongs to labels the row, and the actions that make sense for that module are
 * the actions it offers.
 *
 * The photograph takes the top half because that is what sells it. The price is
 * the loudest text on the card, the stock line is the only coloured one, and the
 * listing's state rides on the image so it is visible before the title is read.
 */
export function ShelfCard({
  listing,
  module,
  threshold,
}: {
  listing: ListingCardData;
  module: WorkspaceModule;
  /** The store's own low-stock threshold, so "running low" means one thing. */
  threshold: number;
}) {
  const soldOut = listing.trackInventory && listing.stock <= 0;
  const low = listing.trackInventory && !soldOut && listing.stock <= threshold;
  const editHref = `/workspace/listings/${listing.id}`;

  return (
    <article className="ls-card ls-edge-card ls-lift relative isolate">
      <CardOrbs className="absolute -right-3 -bottom-3 -z-10 h-20 w-20" />
      <Link className="ls-card__media relative aspect-4/3 no-underline" href={editHref}>
        {listing.imageUrl ? (
          <img alt="" className="size-full object-cover" loading="lazy" src={listing.imageUrl} />
        ) : (
          <span className="flex size-full flex-col items-center justify-center gap-2 text-muted">
            <Icon name={module.icon} size={22} />
            <span className="text-[12px]">No photo yet</span>
          </span>
        )}

        {/* State rides on the image: you should know what is live before you
            read a word of the listing. */}
        <span className="absolute top-3 left-3 flex flex-wrap gap-1.5">
          <StatusChip
            label={listing.status === "active" ? "Live" : listing.status}
            tone={listingStatusTone(listing.status)}
          />
          {listing.isFeatured ? <StatusChip icon="star" label="Featured" tone="primary" /> : null}
        </span>

        {soldOut ? (
          <span className="absolute right-3 bottom-3 rounded-full bg-danger px-2.5 py-1 text-[11.5px] font-semibold text-danger-foreground">
            Sold out
          </span>
        ) : null}
      </Link>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="min-w-0">
          <Link
            className="line-clamp-2 text-[15.5px] leading-snug font-semibold text-foreground no-underline"
            href={editHref}
          >
            {listing.title}
          </Link>
          <p className="mt-1 truncate text-[12.5px] text-muted">
            {listingTypeMeta(listing.type).plural}
            {listing.categoryName ? ` · ${listing.categoryName}` : ""}
            {listing.variantCount > 0
              ? ` · ${formatNumber(listing.variantCount)} option${listing.variantCount === 1 ? "" : "s"}`
              : ""}
          </p>
        </div>

        <div className="mt-auto flex items-end justify-between gap-3">
          <span className="text-[19px] leading-none font-semibold tabular-nums text-foreground">
            {formatMoney(listing.price, listing.currency)}
          </span>
          <span className="text-right text-[12px] text-muted">
            {formatNumber(listing.viewsCount)} views
            <br />
            added {formatRelative(listing.createdAt)}
          </span>
        </div>

        {/* The one coloured line on the card, and it means something. */}
        <p
          className={`flex items-center gap-2 text-[12.5px] font-medium ${
            !listing.trackInventory
              ? "text-muted"
              : soldOut
                ? "text-danger"
                : low
                  ? "text-warning"
                  : "text-success"
          }`}
        >
          <span
            aria-hidden="true"
            className={`size-1.5 rounded-full ${
              !listing.trackInventory
                ? "bg-muted"
                : soldOut
                  ? "bg-danger"
                  : low
                    ? "bg-warning"
                    : "bg-success"
            }`}
          />
          {listing.trackInventory
            ? soldOut
              ? "Sold out, restock to keep selling"
              : low
                ? `${formatNumber(listing.stock)} left, running low`
                : `${formatNumber(listing.stock)} in stock`
            : "Stock not tracked"}
        </p>

        <div className="flex items-center gap-2 pt-3">
          <ButtonLink className="flex-1" href={editHref} size="sm" variant="secondary">
            <Icon name="edit" size={14} />
            Edit
          </ButtonLink>

          {listing.status === "active" ? (
            <ActionButton
              action={setListingStatusAction.bind(null, listing.id, "draft")}
              size="sm"
              variant="ghost"
            >
              Unpublish
            </ActionButton>
          ) : (
            <ActionButton
              action={setListingStatusAction.bind(null, listing.id, "active")}
              size="sm"
              variant="ghost"
            >
              Publish
            </ActionButton>
          )}

          <ActionButton
            action={deleteListingAction.bind(null, listing.id)}
            confirm={`Delete “${listing.title}”? Its images and files go too. This cannot be undone.`}
            size="sm"
            variant="danger-soft"
          >
            Delete
          </ActionButton>
        </div>
      </div>
    </article>
  );
}
