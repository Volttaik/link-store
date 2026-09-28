import { Avatar } from "@heroui/react/avatar";
import { Button } from "@heroui/react/button";
import { Card } from "@heroui/react/card";
import { Chip } from "@heroui/react/chip";
import { Link } from "@heroui/react/link";
import { ButtonLink } from "@/components/ui/controls";
import { MessageSellerButton } from "@/components/marketplace/MessageSellerButton";
import { notFound } from "next/navigation";

import { TicketPurchasePanel } from "@/components/marketplace/PurchasePanel";
import { AdaptiveTint } from "@/components/visual/AdaptiveTint";
import { BackgroundPattern } from "@/components/visual/BackgroundPattern";
import { KeyValue } from "@/components/ui/atoms";
import { EmptyState } from "@/components/ui/feedback";
import { getCurrentUser } from "@/lib/auth";
import { getStoreById } from "@/lib/server/stores";
import { getEventDetail } from "@/lib/server/events";
import { recordAnalyticsEvent } from "@/lib/server/insights";
import { formatDate, formatTime } from "@/lib/format";
import { formatMoney } from "@/lib/money";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await getEventDetail(id);
  return {
    title: event ? event.title : "Event",
    description: event?.description?.slice(0, 150) ?? undefined,
  };
}

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await getEventDetail(id);

  if (!event) notFound();

  const [user, store] = await Promise.all([getCurrentUser(), getStoreById(event.storeId)]);
  const isOwner = Boolean(user && store && store.user_id === user.id);

  if (event.status !== "published" && !isOwner) notFound();

  const startsAt = new Date(event.startsAt);
  const endsAt = event.endsAt ? new Date(event.endsAt) : null;
  const isPast = startsAt.getTime() < Date.now();

  if (!isOwner) {
    await recordAnalyticsEvent({
      storeId: event.storeId,
      eventType: "listing_view",
      userId: user?.id ?? null,
      metadata: { eventId: event.id },
    });
  }

  const activeTypes = event.ticketTypes.filter((ticket) => ticket.is_active === 1);
  const allSoldOut =
    activeTypes.length > 0 &&
    activeTypes.every(
      (ticket) =>
        Number(ticket.quantity_total) > 0 &&
        Number(ticket.quantity_sold) >= Number(ticket.quantity_total),
    );

  const soldCount = event.ticketTypes.reduce(
    (total, ticket) => total + Number(ticket.quantity_sold),
    0,
  );

  return (
    <div className="relative overflow-hidden">
      {/* The cover's own dominant hue becomes the page's atmosphere. */}
      <AdaptiveTint src={event.coverImageUrl} strength={0.65} className="h-[34rem]" />

      {/*
        Cover. A page-wide square banner was the one image on this platform with
        no corner, and next to every other surface it read as a different site —
        so the cover is now a surface like any other: inside the page's own
        container, at the same radius as everything else, with the tint behind it
        giving the page its atmosphere.
      */}
      <div className="relative mx-auto w-full max-w-7xl px-4 pt-6 sm:px-6 sm:pt-8">
        <div className="relative h-56 w-full overflow-hidden media-frame-lg ls-elev-2 bg-default sm:h-72">
          {event.coverImageUrl ? (
            <img alt="" className="z-0 h-full w-full object-cover"
              src={event.coverImageUrl}
            />
          ) : (
            <div className="absolute inset-0 text-muted">
              <BackgroundPattern id="event-cover" />
            </div>
          )}
        </div>
      </div>

      <div className="relative mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-muted">
          <Link href="/events" className="text-muted">
            Events
          </Link>
          <span aria-hidden="true">/</span>
          <Link href={`/@${event.storeSlug}`} className="text-muted">
            {event.storeName}
          </Link>
        </div>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <div className="space-y-6">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                {isPast ? (
                  <Chip size="sm" variant="secondary">
                    This event has passed
                  </Chip>
                ) : allSoldOut ? (
                  <Chip size="sm" variant="secondary">
                    Sold out
                  </Chip>
                ) : (
                  <Chip size="sm" color="success" variant="secondary">
                    Tickets on sale
                  </Chip>
                )}
                {event.isOnline ? (
                  <Chip size="sm" variant="primary">
                    Online event
                  </Chip>
                ) : null}
                {event.status !== "published" ? (
                  <Chip size="sm" color="warning" variant="secondary">
                    {event.status}
                  </Chip>
                ) : null}
              </div>

              <h1 className="text-2xl font-bold leading-tight tracking-tight sm:text-4xl">
                {event.title}
              </h1>

              <div className="flex flex-wrap gap-6 pt-1">
                <KeyValue label="Date">
                  {formatDate(event.startsAt)}
                  {endsAt && endsAt.getDate() !== startsAt.getUTCDate()
                    ? ` to ${formatDate(event.endsAt)}`
                    : ""}
                </KeyValue>
                <KeyValue label="Starts">{formatTime(event.startsAt)}</KeyValue>
                {endsAt ? <KeyValue label="Ends">{formatTime(event.endsAt)}</KeyValue> : null}
                <KeyValue label="Timezone">{event.timezone}</KeyValue>
              </div>
            </div>

            <Card className="ls-elev-2">
              <Card.Header className="pb-0">
                <p className="text-sm font-semibold">Where</p>
              </Card.Header>
              <Card.Content className="gap-1 text-sm text-foreground dark:text-muted">
                {event.isOnline ? (
                  <>
                    <p className="font-medium text-foreground">Online event</p>
                    <p className="text-xs">
                      The joining link is shared by the organiser after purchase.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="font-medium text-foreground">
                      {event.venueName ?? "Venue to be announced"}
                    </p>
                    {event.address ? <p>{event.address}</p> : null}
                    <p>{[event.city, event.state, event.country].filter(Boolean).join(", ")}</p>
                  </>
                )}
              </Card.Content>
            </Card>

            {event.description ? (
              <Card className="ls-elev-2">
                <Card.Header className="pb-0">
                  <p className="text-sm font-semibold">About this event</p>
                </Card.Header>
                <Card.Content className="whitespace-pre-line text-sm text-foreground dark:text-muted">
                  {event.description}
                </Card.Content>
              </Card>
            ) : null}

            {isOwner ? (
              <Card className="ls-elev-2">
                <Card.Content className="gap-2 text-sm">
                  <p className="font-semibold">Organiser view</p>
                  <p className="text-muted">
                    {soldCount} {soldCount === 1 ? "ticket" : "tickets"} sold across{" "}
                    {event.ticketTypes.length} ticket{" "}
                    {event.ticketTypes.length === 1 ? "type" : "types"}.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <ButtonLink
                      href={`/workspace/events/${event.id}/check-in`}
                      size="sm"
                      variant="primary"
                    >
                      Check in tickets
                    </ButtonLink>
                    <ButtonLink href={`/workspace/events/${event.id}`} size="sm" variant="secondary">
                      Manage event
                    </ButtonLink>
                  </div>
                </Card.Content>
              </Card>
            ) : null}
          </div>

          <div className="space-y-4">
            <Card className="ls-elev-2">
              <Card.Header className="flex-col items-start gap-1 pb-2">
                <p className="text-sm font-semibold">Tickets</p>
                <p className="text-xs text-muted">
                  {activeTypes.length === 0
                    ? "No ticket types have been set up"
                    : `From ${formatMoney(event.minPrice ?? 0, event.currency)}`}
                </p>
              </Card.Header>
              <Card.Content>
                {activeTypes.length === 0 ? (
                  <EmptyState
                    compact title="No tickets on sale" description="The organiser has not published ticket types for this event yet."
                  />
                ) : isPast ? (
                  <EmptyState
                    compact title="Ticket sales closed" description="This event has already taken place."
                  />
                ) : allSoldOut ? (
                  <EmptyState
                    compact title="Sold out" description="Every ticket type for this event has sold out."
                  />
                ) : (
                  <TicketPurchasePanel
                    currency={event.currency}
                    eventId={event.id}
                    ticketTypes={activeTypes}
                  />
                )}
              </Card.Content>
            </Card>

            <Card className="ls-elev-2">
              <Card.Content className="flex flex-row items-center gap-3">
                <Avatar size="md">
                  {event.storeLogoUrl ?? undefined ? (
                  <Avatar.Image
                    alt=""
                    className="object-contain p-2"
                    src={event.storeLogoUrl ?? undefined}
                  />
                  ) : null}
                  <Avatar.Fallback>{event.storeName.slice(0, 2).toUpperCase()}</Avatar.Fallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{event.storeName}</p>
                  <p className="text-xs text-muted">Organiser</p>
                </div>
                {isOwner ? null : (
                  <MessageSellerButton
                    size="sm"
                    storeId={event.storeId}
                    sellerName={event.storeName}
                    label="Message"
                  />
                )}
                <ButtonLink href={`/@${event.storeSlug}`} size="sm" variant="secondary">
                  Store
                </ButtonLink>
              </Card.Content>
            </Card>

            <p className="text-xs text-muted">
              Tickets are issued to your email after payment is verified, and can be checked in by
              the organiser at the door.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
