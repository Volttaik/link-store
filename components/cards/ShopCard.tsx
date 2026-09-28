/**
 * The shop card — a miniature storefront.
 *
 * A shop is not a product with a name attached, so this card is cut as a small
 * storefront interface: the shop sign (banner and logo) over the door, the
 * name and what kind of shop it is, what the seller says about it, then the
 * display window — a sideways shelf of the shop's *own* goods, real listings
 * with real photography, browsable without leaving the card — and finally the
 * door itself: Open Shop, the way in.
 *
 * Sections are established with tone, spacing and grouping — never with drawn
 * separator lines. The shelf is real listings and nothing else: a shop with no
 * published photography gets no shelf rather than a row of empty boxes.
 */

import { Avatar } from "@heroui/react/avatar";
import { Chip } from "@heroui/react/chip";
import { Link } from "@heroui/react/link";

import { Icon } from "@/components/ui/Icon";
import { ButtonLink } from "@/components/ui/controls";
import { RatingStars } from "@/components/ui/atoms";
import { formatRelative, truncate } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import type { StoreCard as StoreCardData } from "@/lib/server/discovery";

export function ShopCard({
  store,
  rating,
  ratingCount,
  gallerySize = 4,
}: {
  store: StoreCardData;
  rating?: number | null;
  ratingCount?: number;
  /** How many goods to show on the shelf. Cards in a narrow rail can afford fewer. */
  gallerySize?: number;
}) {
  const location = [store.city, store.country].filter(Boolean).join(", ");
  const shelf = store.gallery.slice(0, gallerySize);

  return (
    <article className="ls-lift flex h-full flex-col overflow-hidden rounded-3xl bg-surface shadow-elev-2">
      {/* The shop sign: the seller's own banner, with the logo plate hung over
          its edge like a sign over a door. */}
      <div className="relative h-24 w-full overflow-hidden bg-surface-secondary">
        {store.bannerUrl ? (
          <img alt="" className="h-full w-full object-cover" loading="lazy" src={store.bannerUrl} />
        ) : (
          <div className="ls-tone h-full w-full" aria-hidden="true" />
        )}
      </div>

      <div className="flex flex-col gap-3 px-4 pt-0 pb-4">
        {/* Identity — the sign, the name and the window card. */}
        <div className="-mt-8 flex items-end gap-3">
          <Avatar className="size-16 shrink-0 rounded-2xl ring-4 ring-surface">
            {/* Logos keep their own proportions — contained, never stretched
                or cropped into the plate. */}
            {store.logoUrl ? (
              <Avatar.Image alt={store.name} className="object-contain" src={store.logoUrl} />
            ) : null}
            <Avatar.Fallback className="rounded-2xl text-base">
              {store.name.slice(0, 2).toUpperCase()}
            </Avatar.Fallback>
          </Avatar>

          <div className="min-w-0 flex-1 pb-0.5">
            <Link
              className="block truncate text-[16px] leading-tight font-semibold text-foreground no-underline"
              href={`/@${store.slug}`}
            >
              {store.name}
            </Link>
            <p className="truncate text-[12px] text-muted">
              @{store.slug}
              {location ? ` · ${location}` : ""}
            </p>
          </div>

          {store.primaryCategory ? (
            <Chip className="mb-0.5 shrink-0" size="sm" variant="soft">
              {store.primaryCategory}
            </Chip>
          ) : null}
        </div>

        {typeof rating === "number" ? <RatingStars rating={rating} count={ratingCount} /> : null}

        <p className="line-clamp-2 text-[13px] leading-relaxed text-muted">
          {store.tagline ?? "A shop on LINK STORE."}
        </p>
      </div>

      {/* The display window: the shop's own goods, browsable inside the card. */}
      {shelf.length > 0 ? (
        <div className="bg-surface-secondary/45 px-4 py-3">
          <div className="ls-shelf">
            {shelf.map((item) => (
              <Link
                key={item.id}
                aria-label={`${item.title} from ${store.name}`}
                className="group/goods flex w-32 shrink-0 snap-start flex-col gap-1.5 no-underline"
                href={`/listing/${item.id}`}
              >
                <span className="media-frame block aspect-square w-full overflow-hidden bg-surface-secondary">
                  <img
                    alt={item.title}
                    className="h-full w-full object-cover transition-transform duration-500 ease-out motion-safe:group-hover/goods:scale-[1.05]"
                    loading="lazy"
                    src={item.imageUrl}
                  />
                </span>
                <span className="truncate text-[11.5px] leading-tight text-muted transition-colors group-hover/goods:text-foreground">
                  {truncate(item.title, 32)}
                </span>
                <span className="text-[12px] font-semibold tabular-nums text-foreground">
                  {formatMoney(item.price, item.currency)}
                </span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {/* The door: what the shop has, and the way in. */}
      <div className="mt-auto flex flex-col gap-3 px-4 pt-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted">
          <span className="flex items-center gap-1.5 tabular-nums">
            <Icon name="products" size={12} className="shrink-0" />
            {store.publishedListingCount}{" "}
            {store.publishedListingCount === 1 ? "listing" : "listings"}
          </span>
          <span className="flex items-center gap-1.5">
            <Icon name="clock" size={12} className="shrink-0" />
            Joined {formatRelative(store.createdAt)}
          </span>
        </div>

        <ButtonLink fullWidth href={`/@${store.slug}`} size="sm" variant="primary">
          <Icon name="storefront" size={14} />
          Open Shop
          <Icon name="arrowRight" size={14} />
        </ButtonLink>
      </div>
    </article>
  );
}
