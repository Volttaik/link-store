import { EventForm } from "@/components/workspace/EventForm";
import { PageHeader } from "@/components/ui/atoms";
import { requireStore } from "@/lib/auth";
import { listProductsForEvent } from "@/lib/server/listings";
export const metadata = { title: "New Event" };
export const dynamic = "force-dynamic";
export default async function NewEventPage() {
  const { store } = await requireStore();
  const products = await listProductsForEvent(store.id);
  return <div className="space-y-6"><PageHeader title="Create an Event" description="Bring existing products together for a collection, campaign or new drop." /><EventForm products={products} /></div>;
}
