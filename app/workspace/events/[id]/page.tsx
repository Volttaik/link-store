import { notFound } from "next/navigation";
import { EventForm } from "@/components/workspace/EventForm";
import { PageHeader } from "@/components/ui/atoms";
import { ActionButton, ButtonLink } from "@/components/ui/controls";
import { deleteEventAction } from "@/app/actions/listings";
import { requireStore } from "@/lib/auth";
import { getEventDetail, getOwnedEvent } from "@/lib/server/events";
import { listProductsForEvent } from "@/lib/server/listings";
export const dynamic = "force-dynamic";
export default async function ManageEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const { store } = await requireStore();
  if (!await getOwnedEvent(id, store.id)) notFound();
  const [event, products] = await Promise.all([getEventDetail(id), listProductsForEvent(store.id)]);
  if (!event) notFound();
  return <div className="space-y-6"><PageHeader title={event.title} description="Edit your collection without recreating any products." actions={<ButtonLink href={`/events/${id}`} variant="secondary">View Event</ButtonLink>} /><EventForm key={event.id} event={event} products={products} /><ActionButton variant="danger-soft" confirm="Delete this Event? Your products will stay in your store." action={async () => { "use server"; return deleteEventAction(id); }}>Delete Event</ActionButton></div>;
}
