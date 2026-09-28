/**
 * The event card — a miniature event poster.
 *
 * An event is a happening, not a product, so the card is cut as a poster: the
 * event's own artwork fills the frame and carries the title the way a printed
 * poster does, the date is stamped on the artwork like an invitation's date
 * block, and the details a guest needs — when, where, what kind of event, what
 * is left — sit beneath it in the caption. The event itself is the hero; the
 * ticket price and the way in are the closing line.
 *
 * The hierarchy is deliberately not the product message's: where a product is
 * *presented to* the shopper, an event is *announced* to them.
 */

import { Link } from "@heroui/react/link";

import { Icon } from "@/components/ui/Icon";
import { ButtonLink } from "@/components/ui/controls";
import { MediaPlaceholder, PriceTag } from "@/components/ui/atoms";
import { truncate } from "@/lib/format";
import type { EventCardData } from "@/lib/types";

export function EventCard({ event, compact = false }: { event: EventCardData; compact?: boolean }) {
  const startsAt = new Date(event.startsAt);
  const isPast = startsAt.getTime() < Date.now();
  const soldOut = event.ticketsAvailable <= 0;
  const place = event.isOnline ? "Online event" : (event.venueName ?? event.city ?? "Venue to be announced");

  return (
    <article className="ls-lift flex h-full flex-col overflow-hidden rounded-3xl bg-surface shadow-elev-2">
      {/* The poster itself: the artwork, the date stamp and the title on the
          caption scrim. */}
      <Link
        aria-label={event.title}
        className={`relative block overflow-hidden bg-surface-secondary no-underline ${
          compact ? "aspect-16/10" : "aspect-4/5"
        }`}
        href={`/events/${event.id}`}
      >
        {event.coverImageUrl ? (
          <img
            alt={event.title}
            className="h-full w-full object-cover transition-transform duration-500 ease-out motion-safe:hover:scale-[1.04]"
            loading="lazy"
            src={event.coverImageUrl}
          />
        ) : (
          <MediaPlaceholder label="Event" />
        )}

        {/* The date block — the first thing an event card must say. */}
        <span className="absolute top-3 left-3 z-10 flex min-w-11 flex-col items-center rounded-xl bg-surface px-2.5 py-1.5 shadow-elev-2">
          <span className="text-[15px] leading-none font-semibold tabular-nums text-foreground">
            {startsAt.toLocaleDateString(undefined, { day: "numeric" })}
          </span>
          <span className="mt-1 text-[10px] font-semibold tracking-wide text-muted uppercase">
            {startsAt.toLocaleDateString(undefined, { month: "short" })}
          </span>
        </span>

        {/* State stamps, mirrored to the other corner. */}
        {isPast ? (
          <span className="absolute top-3 right-3 z-10 rounded-full bg-surface px-2.5 py-1 text-[11px] font-semibold text-muted shadow-elev-2">
            Ended
          </span>
        ) : soldOut ? (
          <span className="absolute top-3 right-3 z-10 rounded-full bg-surface px-2.5 py-1 text-[11px] font-semibold text-warning shadow-elev-2">
            Sold out
          </span>
        ) : null}

        {/* The caption: the event's name, on its own artwork. Only when there
            is artwork — on the placeholder plate the title goes in the body
            below, where ink on surface is actually legible. */}
        {event.coverImageUrl ? (
          <>
            <span className="ls-poster__scrim" aria-hidden="true" />
            <span className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-1 p-4">
              <span className="truncate text-[10.5px] font-semibold tracking-[0.18em] text-snow/80 uppercase">
                {event.storeName}
              </span>
              <span className="line-clamp-2 text-[17px] leading-snug font-semibold text-snow">
                {truncate(event.title, 72)}
              </span>
            </span>
          </>
        ) : null}
      </Link>

      {/* The invitation's caption block: the details a guest acts on. */}
      <div className={`flex flex-1 flex-col gap-2.5 ${compact ? "p-3.5" : "p-4"}`}>
        <div className="flex min-w-0 flex-col gap-1.5">
          {event.coverImageUrl ? null : (
            <>
              <span className="truncate text-[10.5px] font-semibold tracking-[0.18em] text-muted uppercase">
                {event.storeName}
              </span>
              <Link
                className="line-clamp-2 text-[17px] leading-snug font-semibold text-foreground no-underline"
                href={`/events/${event.id}`}
              >
                {truncate(event.title, 72)}
              </Link>
            </>
          )}

          <span className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-muted">
            <Icon name="events" size={12} className="shrink-0" />
            <span className="truncate">
              {startsAt.toLocaleDateString(undefined, { weekday: "short" })} ·{" "}
              {startsAt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
            </span>
          </span>

          <span className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-muted">
            <Icon name="mapPin" size={12} className="shrink-0" />
            <span className="truncate">{place}</span>
          </span>

          {event.description && !compact ? (
            <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-relaxed text-muted">
              {event.description}
            </p>
          ) : null}
        </div>

        <div className="mt-auto flex flex-col gap-3 pt-1">
          <span className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
            {event.minPrice === null ? (
              <span className="text-[12.5px] text-muted">No ticket types yet</span>
            ) : (
              <span className="flex items-baseline gap-1.5">
                <span className="text-[11px] font-medium text-muted">from</span>
                <PriceTag amount={event.minPrice} currency={event.currency} size="card" />
              </span>
            )}

            {!isPast && !soldOut ? (
              <span className="rounded-full bg-accent/15 px-2.5 py-1 text-[11px] font-semibold text-accent">
                {event.ticketsAvailable} left
              </span>
            ) : null}
          </span>

          <ButtonLink fullWidth href={`/events/${event.id}`} size="sm" variant="secondary">
            {isPast ? "View event" : "Get tickets"}
            <Icon name="arrowRight" size={14} />
          </ButtonLink>

          <Link
            className="min-w-0 truncate text-[12px] text-muted no-underline transition-colors hover:text-foreground"
            href={`/@${event.storeSlug}`}
          >
            by {event.storeName}
          </Link>
        </div>
      </div>
    </article>
  );
}
