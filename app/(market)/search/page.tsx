import { Chip } from "@heroui/react/chip";

import { EventBrowseGrid } from "@/components/marketplace/EventBrowseGrid";
import { StoreBrowseGrid } from "@/components/marketplace/StoreBrowseGrid";
import {
  BrowseSection,
  pickParam,
  type RawSearchParams,
} from "@/components/marketplace/BrowseSection";
import { PageHeader, SectionHeader } from "@/components/ui/atoms";
import { EmptyState } from "@/components/ui/feedback";
import { countStores } from "@/lib/server/discovery";
import { countEvents } from "@/lib/server/events";
import { recordAnalyticsEvent } from "@/lib/server/insights";

export const metadata = { title: "Search" };

export const dynamic = "force-dynamic";

/**
 * Global search: one query is run across listings, events and storefronts so a
 * shopper never has to guess which section a seller used.
 */
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = await searchParams;
  const term = pickParam(params, "q")?.trim() ?? "";

  if (!term) {
    return (
      <div className="mx-auto w-full max-w-7xl space-y-8 px-4 py-10 sm:px-6">
        <PageHeader title="Search Link Store" description="Find products, services, food, events, digital files and stores by name."
        />
        <EmptyState icon="search" title="Start typing to search" description="Use the search box in the navigation bar. Results cover every published listing, storefront and event on the platform."
        />
      </div>
    );
  }

  // Recorded platform-wide (no store attached) so search demand is measurable.
  await recordAnalyticsEvent({
    eventType: "search",
    metadata: { term: term.toLowerCase() },
    path: "/search",
  });

  const [eventCount, storeCount] = await Promise.all([
    countEvents({ status: "published", search: term, onlyPublishedStores: true }),
    countStores({ search: term, onlyWithListings: true }),
  ]);

  return (
    <div>
      <div className="mx-auto w-full max-w-7xl px-4 pt-8 sm:px-6">
        <PageHeader
          title={`Results for “${term}”`} description="Searched across listings, events and storefronts."
          actions={
            <div className="flex flex-wrap gap-2">
              <Chip size="sm" variant="primary">
                {storeCount} {storeCount === 1 ? "store" : "stores"}
              </Chip>
              <Chip size="sm" variant="secondary">
                {eventCount} {eventCount === 1 ? "event" : "events"}
              </Chip>
            </div>
          }
        />
      </div>

      <BrowseSection searchParams={params} basePath="/search" label="Listings" />

      {eventCount > 0 ? (
        <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 sm:px-6">
          <SectionHeader title="Events" description={`${eventCount} matching events`} />
          <EventBrowseGrid searchParams={params} basePath="/search" embedded />
        </div>
      ) : null}

      {storeCount > 0 ? (
        <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 sm:px-6">
          <SectionHeader title="Storefronts" description={`${storeCount} matching stores`} />
          <StoreBrowseGrid searchParams={params} embedded />
        </div>
      ) : null}
    </div>
  );
}
