import { ButtonLink } from "@/components/ui/controls";

import { EventCard } from "@/components/cards/EventCard";
import { PageHeader } from "@/components/ui/atoms";
import { EmptyState } from "@/components/ui/feedback";
import { PaginationBar } from "@/components/marketplace/BrowseFilters";
import { pickParam, type RawSearchParams } from "@/components/marketplace/BrowseSection";
import { countEvents, listEvents } from "@/lib/server/events";

const PER_PAGE = 24;

export async function EventBrowseGrid({
  searchParams,
  basePath = "/events",
  storeId,
  description,
  embedded = false,
}: {
  searchParams: RawSearchParams;
  basePath?: string;
  storeId?: string;
  description?: string;
  /** Render only the results, for use inside a page that supplies its own shell. */
  embedded?: boolean;
}) {
  const page = Math.max(1, Number.parseInt(pickParam(searchParams, "page") ?? "1", 10) || 1);
  const search = pickParam(searchParams, "q");
  const showPast = pickParam(searchParams, "past") === "1";

  const query = {
    storeId,
    status: "published",
    search,
    upcomingOnly: !showPast,
    onlyPublishedStores: !storeId,
    limit: PER_PAGE,
    offset: (page - 1) * PER_PAGE,
  };

  const [events, total] = await Promise.all([listEvents(query), countEvents(query)]);

  const results =
    events.length === 0 ? (
      <EmptyState icon="ticket"
        title={search ? `No events matching “${search}”` : "No events on sale yet"}
        description={
          showPast
            ? "No organiser has published an event yet. When they do, tickets will be available here and fulfilled through the same checkout as everything else."
            : "There are no upcoming events with tickets on sale. Past events are still available to browse."
        }
        action={
          <ButtonLink href="/sign-up" variant="primary">
            Host an event
          </ButtonLink>
        }
        secondaryAction={
          showPast ? null : (
            <ButtonLink href={`${basePath}?past=1`} variant="outline">
              Browse past events
            </ButtonLink>
          )
        }
      />
    ) : (
        <>
          <div className="ls-deal-grid grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {events.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
          <PaginationBar total={total} page={page} perPage={PER_PAGE} basePath={basePath} />
        </>
      );

  if (embedded) {
    return <div className="space-y-6">{results}</div>;
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 sm:px-6">
      <PageHeader
        title={search ? `Events matching “${search}”` : showPast ? "All events" : "Upcoming events"}
        description={
          description ??
          (total > 0
            ? `${total} ${total === 1 ? "event" : "events"} with tickets on sale`
            : "No events are on sale right now")
        }
        actions={
          <ButtonLink
            href={showPast ? basePath : `${basePath}?past=1`}
            size="sm"
            variant="secondary"
          >
            {showPast ? "Show upcoming only" : "Include past events"}
          </ButtonLink>
        }
      />
      {results}
    </div>
  );
}
