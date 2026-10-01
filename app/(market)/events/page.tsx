import { EventBrowseGrid } from "@/components/marketplace/EventBrowseGrid";
import type { RawSearchParams } from "@/components/marketplace/BrowseSection";

export const metadata = {
  title: "Events",
  description: "Explore curated product collections on Rush Cart.",
};

export const dynamic = "force-dynamic";

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  return <EventBrowseGrid searchParams={await searchParams} />;
}
