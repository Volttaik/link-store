import Link from "next/link";
import { notFound } from "next/navigation";
import { ChatAvatar } from "@/components/chat/ChatAvatar";
import { ProductCard } from "@/components/cards/ProductCard";
import { ButtonLink } from "@/components/ui/controls";
import { getCurrentUser } from "@/lib/auth";
import { getStoreById } from "@/lib/server/stores";
import { getEventDetail } from "@/lib/server/events";
import { formatDate } from "@/lib/format";
export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) { const event = await getEventDetail((await params).id); return { title: event?.title ?? "Event", description: event?.description?.slice(0, 150) }; }
export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const event = await getEventDetail((await params).id); if (!event) notFound();
  const [user, store] = await Promise.all([getCurrentUser(), getStoreById(event.storeId)]);
  const owner = Boolean(user && store?.user_id === user.id);
  if (!owner && (event.status !== "published" || !store?.is_published)) notFound();
  return <main className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6">
    <div className="flex flex-wrap items-center justify-between gap-4"><Link href={`/@${event.storeSlug}`} className="flex items-center gap-3"><ChatAvatar name={event.storeName} src={event.storeLogoUrl} /><span className="font-medium">{event.storeName}</span></Link>{owner ? <ButtonLink href={`/workspace/events/${event.id}`} variant="secondary">Edit Event</ButtonLink> : null}</div>
    {event.coverImageUrl ? <img src={event.coverImageUrl} alt={event.title} className="h-auto w-full rounded-3xl" /> : null}
    <div className="max-w-3xl"><h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">{event.title}</h1>{event.description ? <p className="mt-5 whitespace-pre-line text-base leading-relaxed text-muted">{event.description}</p> : null}<p className="mt-4 text-sm text-muted">{formatDate(event.startsAt)}{event.endsAt ? ` — ${formatDate(event.endsAt)}` : ""}</p></div>
    <section className="space-y-5"><h2 className="text-xl font-semibold tracking-tight">Shop the collection</h2><div className="grid grid-cols-1 gap-4 min-[540px]:grid-cols-2 lg:grid-cols-4">{event.products.map(product => <ProductCard key={product.id} listing={product} showBuy showStore />)}</div>{!event.products.length ? <p className="text-sm text-muted">Products in this collection are not available right now.</p> : null}</section>
  </main>;
}
