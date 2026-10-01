import { EventCard } from "@/components/cards/EventCard";
import { PageHeader } from "@/components/ui/atoms";
import { ButtonLink } from "@/components/ui/controls";
import { EmptyState } from "@/components/ui/feedback";
import { requireStore } from "@/lib/auth";
import { listEvents } from "@/lib/server/events";
export const dynamic = "force-dynamic";
export const metadata = { title: "Events" };
export default async function EventsPage() {
  const { store } = await requireStore(); const events = await listEvents({ storeId: store.id, limit: 100 });
  return <div className="space-y-6"><PageHeader title="Events" description="Your products, curated into drops and collections." actions={<ButtonLink href="/workspace/events/new" variant="primary">Create Event</ButtonLink>} />
    {events.length ? <div className="grid gap-6 xl:grid-cols-2">{events.map(event => <div key={event.id} className="space-y-2"><EventCard event={event} /><ButtonLink href={`/workspace/events/${event.id}`} size="sm" variant="secondary">Edit Event · {event.status}</ButtonLink></div>)}</div> : <EmptyState title="Your next drop starts here" description="Group your existing products into an Event. No products are duplicated." />}
  </div>;
}
