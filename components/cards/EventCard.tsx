import Link from "next/link";
import { EventProductDisplay } from "@/components/cards/EventProductDisplay";
import type { EventCardData } from "@/lib/types";

export function EventCard({ event }: { event: EventCardData; showProductCount?: boolean }) {
  return <article className="group/event min-w-0">
    <div className="mb-4 text-xs text-muted"><Link href={`/@${event.storeSlug}`} className="hover:text-foreground">{event.storeName}</Link></div>
    <div className="mb-5"><EventProductDisplay key={event.id} products={event.products} title={event.title} /></div>
    <Link href={`/events/${event.id}`} className="block text-xl font-semibold tracking-tight hover:underline">{event.title}</Link>
    {event.description ? <p className="mt-2 line-clamp-2 max-w-lg text-sm leading-relaxed text-muted">{event.description}</p> : null}
    <Link href={`/events/${event.id}`} className="mt-4 inline-flex items-center gap-2 text-sm font-medium">Open Event <span aria-hidden="true">↗</span></Link>
  </article>;
}
