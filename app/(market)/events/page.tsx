import { EventBrowseGrid } from "@/components/marketplace/EventBrowseGrid";
import type { RawSearchParams } from "@/components/marketplace/BrowseSection";

export const metadata = {
  title: "Events & tickets",
  description: "Concerts, conferences, workshops and meetups. Buy tickets on Link Store.",
};

export const dynamic = "force-dynamic";

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  return <EventBrowseGrid searchParams={await searchParams} />;
}
