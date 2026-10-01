import { EventCard } from "@/components/cards/EventCard";
import { PageHeader } from "@/components/ui/atoms";
import { EmptyState } from "@/components/ui/feedback";
import { PaginationBar } from "@/components/marketplace/BrowseFilters";
import { pickParam, type RawSearchParams } from "@/components/marketplace/BrowseSection";
import { countEvents, listEvents } from "@/lib/server/events";
export async function EventBrowseGrid({ searchParams, basePath = "/events", storeId, description, embedded = false }: { searchParams: RawSearchParams; basePath?: string; storeId?: string; description?: string; embedded?: boolean }) {
  const page = Math.max(1, Number.parseInt(pickParam(searchParams, "page") ?? "1", 10) || 1);
  const query = { storeId, status: "published", search: pickParam(searchParams, "q"), onlyPublishedStores: true, limit: 24, offset: (page - 1) * 24 };
  const [events, total] = await Promise.all([listEvents(query), countEvents(query)]);
  return <div className={embedded ? "space-y-6" : "mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6"}>
    {!embedded ? <PageHeader title="Events" description={description ?? "Discover curated drops, seasonal edits and collections from stores you love."} /> : null}
    {events.length ? <><div className="grid gap-10 2xl:grid-cols-2">{events.map(event => <EventCard key={event.id} event={event} />)}</div><PaginationBar total={total} page={page} perPage={24} basePath={basePath} /></> : <EmptyState icon="events" title="No collections found" description="New product drops and curated collections will appear here." />}
  </div>;
}
