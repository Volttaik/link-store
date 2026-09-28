import { Link } from "@heroui/react/link";

import { ActionButton, ButtonLink } from "@/components/ui/controls";
import { PageHeader, StatusChip } from "@/components/ui/atoms";
import { EmptyState } from "@/components/ui/feedback";
import { Icon } from "@/components/ui/Icon";
import { WorkspaceFilterBar } from "@/components/workspace/WorkspaceFilterBar";
import { deleteEventAction, setEventStatusAction } from "@/app/actions/listings";
import { requireStore } from "@/lib/auth";
import { countEvents, listEventStatusCounts, listEvents } from "@/lib/server/events";
import { eventStatusTone } from "@/lib/catalog";
import { formatNumber, formatTime } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import type { EventCardData } from "@/lib/types";

export const metadata = { title: "Events" };

export const dynamic = "force-dynamic";

/**
 * An event is a date, a place and a poster — and, for a seller, one number:
 * how many tickets have gone.
 *
 * So each event is a poster card with its date stamped on the cover and its
 * ticket sales drawn as a bar underneath, because "40 of 100 sold" is a shape
 * long before it is a sentence. What has already happened is dimmed and marked
 * Past, so the page reads as a calendar of what is still live.
 */
export default async function WorkspaceEventsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { store } = await requireStore();
  const { status = "all" } = await searchParams;

  const [events, counts, total] = await Promise.all([
    listEvents({ storeId: store.id, status, limit: 60 }),
    listEventStatusCounts(store.id),
    countEvents({ storeId: store.id, status }),
  ]);

  const now = new Date().toISOString();

  // Still to come first, then what has been and gone.
  const upcoming = events.filter((event) => event.startsAt >= now);
  const past = events
    .filter((event) => event.startsAt < now)
    .sort((a, b) => (a.startsAt < b.startsAt ? 1 : -1));

  const soldAcrossAll = events.reduce((sum, event) => sum + event.ticketsSold, 0);
  const checkedIn = events.reduce((sum, event) => sum + event.checkedIn, 0);

  return (
    <div className="space-y-7">
      <PageHeader
        title="Events"
        description={`${formatNumber(total)} ${
          total === 1 ? "event" : "events"
        }. Tickets run through the same checkout, orders and payments as everything else.`}
        actions={
          <ButtonLink href="/workspace/events/new" variant="primary">
            Create an event
          </ButtonLink>
        }
      />

      {/* One control, not a row of five states printed across the page. */}
      <WorkspaceFilterBar
        basePath="/workspace/events"
        facets={[
          {
            kind: "select",
            key: "status",
            label: "Event state",
            description: "Only published events can be bought from.",
            value: status,
            options: [
              { value: "all", label: `Everything · ${formatNumber(counts.all)}` },
              { value: "published", label: `Published · ${formatNumber(counts.published)}` },
              { value: "draft", label: `Drafts · ${formatNumber(counts.draft)}` },
              { value: "completed", label: `Completed · ${formatNumber(counts.completed)}` },
              { value: "cancelled", label: `Cancelled · ${formatNumber(counts.cancelled)}` },
            ],
          },
        ]}
      />

      {/* Two numbers worth knowing before anything else: what has sold, and who
          has actually turned up. */}
      {events.length > 0 ? (
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3 rounded-2xl ls-elev-2 bg-surface px-5 py-4">
          <span className="flex items-baseline gap-2">
            <span className="text-[24px] leading-none font-semibold tabular-nums text-foreground">
              {formatNumber(soldAcrossAll)}
            </span>
            <span className="text-[13px] text-muted">tickets sold</span>
          </span>
          <span className="hidden h-8 w-px bg-border sm:block" />
          <span className="flex items-baseline gap-2">
            <span className="text-[24px] leading-none font-semibold tabular-nums text-foreground">
              {formatNumber(checkedIn)}
            </span>
            <span className="text-[13px] text-muted">checked in</span>
          </span>
          <span className="hidden h-8 w-px bg-border sm:block" />
          <span className="flex items-baseline gap-2">
            <span className="text-[24px] leading-none font-semibold tabular-nums text-foreground">
              {formatNumber(upcoming.length)}
            </span>
            <span className="text-[13px] text-muted">still to come</span>
          </span>
        </div>
      ) : null}

      {events.length === 0 ? (
        <EmptyState
          icon="ticket"
          title={status === "all" ? "No events yet" : `No ${status} events`}
          description="Create an event with ticket types and it appears on your storefront, in the marketplace and in search, with tickets fulfilled automatically after payment."
          action={
            <ButtonLink href="/workspace/events/new" variant="primary">
              Create your first event
            </ButtonLink>
          }
        />
      ) : (
        <div className="space-y-8">
          {upcoming.length > 0 ? (
            <section className="space-y-4">
              <h2 className="text-[13px] font-semibold tracking-[0.08em] text-muted uppercase">
                Coming up
              </h2>
              <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">
                {upcoming.map((event) => (
                  <EventPoster event={event} key={event.id} />
                ))}
              </div>
            </section>
          ) : null}

          {past.length > 0 ? (
            <section className="space-y-4">
              <h2 className="text-[13px] font-semibold tracking-[0.08em] text-muted uppercase">
                Already happened
              </h2>
              <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">
                {past.map((event) => (
                  <EventPoster event={event} key={event.id} past />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}

/**
 * One event, as a poster.
 *
 * The date is stamped on the cover the way it would be on a flyer, because that
 * is the first thing anyone looks for. The ticket bar underneath is the only
 * place on the card that shows progress, and it carries the numbers with it.
 */
function EventPoster({ event, past = false }: { event: EventCardData; past?: boolean }) {
  const date = new Date(event.startsAt);
  const sold = event.ticketsSold;
  const total = event.ticketsTotal;
  const soldPercent = total > 0 ? Math.min(100, (sold / total) * 100) : 0;
  const soldOut = total > 0 && event.ticketsAvailable <= 0;

  return (
    <article className={`ls-card ls-lift ${past ? "opacity-70" : ""}`}>
      <Link
        className="ls-card__media ls-card__cover relative aspect-[16/9] no-underline"
        href={`/workspace/events/${event.id}`}
      >
        {event.coverImageUrl ? (
          <img alt="" className="size-full object-cover" loading="lazy" src={event.coverImageUrl} />
        ) : (
          <span className="flex size-full items-center justify-center text-muted">
            <Icon name="events" size={24} />
          </span>
        )}

        {/* The date, stamped like a flyer. */}
        <span className="absolute top-3 left-3 flex flex-col items-center rounded-xl bg-surface px-3 py-2 shadow-elev-2">
          <span className="text-[10px] font-semibold tracking-[0.14em] text-muted uppercase">
            {date.toLocaleDateString(undefined, { month: "short" })}
          </span>
          <span className="text-[22px] leading-none font-semibold tabular-nums text-foreground">
            {date.getDate()}
          </span>
        </span>

        <span className="absolute top-3 right-3 flex flex-wrap justify-end gap-1.5">
          <StatusChip label={event.status} tone={eventStatusTone(event.status)} />
          {soldOut && !past ? <StatusChip label="Sold out" tone="danger" /> : null}
        </span>

        {past ? (
          <span className="absolute right-3 bottom-3 rounded-full bg-surface px-2.5 py-1 text-[11.5px] font-semibold text-muted shadow-elev-2">
            Past
          </span>
        ) : null}
      </Link>

      <div className="flex flex-1 flex-col gap-3.5 p-5">
        <div className="min-w-0">
          <Link
            className="line-clamp-2 text-[16px] leading-snug font-semibold text-foreground no-underline"
            href={`/workspace/events/${event.id}`}
          >
            {event.title}
          </Link>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-muted">
            <span className="flex items-center gap-1.5">
              <Icon name="events" size={12} />
              {date.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "long" })}
              {" · "}
              {formatTime(event.startsAt)}
            </span>
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-[12.5px] text-muted">
            <Icon name={event.isOnline ? "globe" : "mapPin"} size={12} />
            {event.isOnline
              ? "Online event"
              : (event.venueName ?? event.city ?? "No venue set")}
          </p>
        </div>

        {/* Tickets: how many have gone, out of how many existed. */}
        <div className="mt-auto space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[13px] text-muted">
              <span className="text-[15px] font-semibold tabular-nums text-foreground">
                {formatNumber(sold)}
              </span>{" "}
              {sold === 1 ? "ticket" : "tickets"} sold
            </span>
            <span className="text-[12.5px] text-muted">
              {total > 0 ? `${formatNumber(total)} released` : "no tickets set"}
            </span>
          </div>

          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-secondary">
            <span
              className={`block h-full rounded-full ${
                soldOut ? "bg-danger" : soldPercent >= 60 ? "bg-success" : "bg-foreground/70"
              }`}
              style={{ width: `${soldPercent}%` }}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-muted">
            <span>
              {event.minPrice !== null
                ? `From ${formatMoney(event.minPrice, event.currency)}`
                : "No priced tickets"}
            </span>
            <span>
              {event.checkedIn > 0
                ? `${formatNumber(event.checkedIn)} checked in`
                : `${formatNumber(event.ticketsAvailable)} still available`}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-3.5">
          <ButtonLink
            className="flex-1"
            href={`/workspace/events/${event.id}`} size="sm" variant="secondary"
          >
            Manage
          </ButtonLink>

          {event.status === "published" ? (
            <ActionButton
              action={setEventStatusAction.bind(null, event.id, "draft")} size="sm"
              variant="ghost"
            >
              Unpublish
            </ActionButton>
          ) : (
            <ActionButton
              action={setEventStatusAction.bind(null, event.id, "published")} size="sm"
              variant="ghost"
            >
              Publish
            </ActionButton>
          )}

          <ActionButton
            action={deleteEventAction.bind(null, event.id)}
            confirm={`Delete “${event.title}”? Events with sold tickets cannot be deleted.`}
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
