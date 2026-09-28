import { Button } from "@heroui/react/button";
import { Card } from "@heroui/react/card";
import { Chip } from "@heroui/react/chip";
import { Link } from "@heroui/react/link";
import { notFound } from "next/navigation";

import { EventForm } from "@/components/workspace/EventForm";
import { PageHeader, StatTile, StatusChip } from "@/components/ui/atoms";
import { Icon } from "@/components/ui/Icon";
import { EmptyState, InfoNote } from "@/components/ui/feedback";
import { ActionButton, ButtonLink, CopyLinkButton } from "@/components/ui/controls";
import { setEventStatusAction } from "@/app/actions/listings";
import { requireStore } from "@/lib/auth";
import { getEventDetail, listTicketTypes, getOwnedEvent } from "@/lib/server/events";
import { listTicketsForEvent } from "@/lib/server/commerce";
import { eventStatusTone, ticketStatusLabel, ticketStatusTone } from "@/lib/catalog";
import { formatDateTime, formatNumber, formatRelative } from "@/lib/format";
import { formatMoney } from "@/lib/money";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await getEventDetail(id);
  return { title: event ? event.title : "Event" };
}

export default async function ManageEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { store } = await requireStore();
  const { id } = await params;

  const owned = await getOwnedEvent(id, store.id);
  if (!owned) notFound();

  const [detail, tickets] = await Promise.all([getEventDetail(id), listTicketsForEvent(id)]);

  if (!detail) notFound();

  const ticketTypes = await listTicketTypes(id);
  const sold = ticketTypes.reduce((total, type) => total + Number(type.quantity_sold), 0);
  const checkedIn = tickets.filter((ticket) => ticket.status === "used").length;
  const revenue = ticketTypes.reduce(
    (total, type) => total + Number(type.price) * Number(type.quantity_sold),
    0,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={detail.title}
        description={`${formatDateTime(detail.startsAt)} · ${detail.isOnline ? "Online" : detail.venueName ?? "Venue to be announced"}`}
        breadcrumb={
          <Link href="/workspace/events" className="flex items-center gap-1 text-xs font-medium text-muted hover:text-foreground"
          >
            <Icon name="arrowLeft" size={13} />
            Events
          </Link>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip label={detail.status} tone={eventStatusTone(detail.status)} />
            <ButtonLink href={`/workspace/events/${detail.id}/check-in`} size="sm" variant="primary">
              Check in tickets
            </ButtonLink>
            {detail.status === "published" ? (
              <>
                <ActionButton action={setEventStatusAction.bind(null, detail.id, "draft")} variant="secondary">
                  Unpublish
                </ActionButton>
                <ButtonLink href={`/events/${detail.id}`} size="sm" variant="secondary">
                  View public page
                </ButtonLink>
              </>
            ) : (
              <ActionButton
                action={setEventStatusAction.bind(null, detail.id, "published")} variant="primary"
              >
                Publish
              </ActionButton>
            )}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Tickets sold" value={formatNumber(sold)} hint={`${ticketTypes.length} ticket types`} />
        <StatTile label="Checked in" value={formatNumber(checkedIn)} hint={`${sold - checkedIn} not yet scanned`} />
        <StatTile label="Ticket revenue"
          value={formatMoney(revenue, detail.currency)} hint="Based on tickets actually sold"
        />
        <StatTile label="Remaining"
          value={formatNumber(
            ticketTypes.reduce(
              (total, type) =>
                total +
                (Number(type.quantity_total) === 0
                  ? 0
                  : Math.max(0, Number(type.quantity_total) - Number(type.quantity_sold))),
              0,
            ),
          )} hint="Across limited-capacity types"
        />
      </div>

      {detail.status === "published" ? (
        <Card className="ls-elev-2">
          <Card.Header className="flex-row flex-wrap items-center justify-between gap-3 pb-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold">Share this event</p>
              <p className="text-xs text-muted">
                Anyone with this link can read the event and buy tickets. It is the only link you
                need to send.
              </p>
            </div>
            <CopyLinkButton url={`/events/${detail.id}`} />
          </Card.Header>
          <Card.Content className="pt-1">
            <p className="truncate rounded-xl bg-surface-secondary/60 px-3 py-2 font-mono text-xs text-muted">
              /events/{detail.id}
            </p>
          </Card.Content>
        </Card>
      ) : null}

      <Card className="ls-elev-2">
        <Card.Header className="flex-col items-start gap-1">
          <p className="text-sm font-semibold">Ticket types</p>
          <p className="text-xs text-muted">Sales and remaining capacity per type.</p>
        </Card.Header>
        
        <Card.Content className="gap-3">
          {ticketTypes.length === 0 ? (
            <EmptyState
              compact title="No ticket types" description="Add at least one ticket type before publishing this event."
            />
          ) : (
            ticketTypes.map((type) => {
              const remaining =
                Number(type.quantity_total) === 0
                  ? null
                  : Math.max(0, Number(type.quantity_total) - Number(type.quantity_sold));

              return (
                <div
                  key={type.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-secondary/50 p-3"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">{type.name}</p>
                      {type.is_active === 1 ? (
                        <Chip size="sm" variant="secondary" color="success" className="text-xs">
                          On sale
                        </Chip>
                      ) : (
                        <Chip size="sm" variant="secondary" className="text-xs">
                          Off sale
                        </Chip>
                      )}
                    </div>
                    <p className="text-xs text-muted">
                      {formatMoney(Number(type.price), type.currency)} ·{" "}
                      {formatNumber(Number(type.quantity_sold))} sold
                      {remaining === null ? " · unlimited" : ` · ${formatNumber(remaining)} left`}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </Card.Content>
      </Card>

      <Card className="ls-elev-2">
        <Card.Header className="flex-col items-start gap-1">
          <p className="text-sm font-semibold">Issued tickets</p>
          <p className="text-xs text-muted">
            Each ticket has a unique code. Check-in happens at the door — codes can be redeemed once.
          </p>
        </Card.Header>
        
        <Card.Content className="gap-2">
          {tickets.length === 0 ? (
            <EmptyState
              compact title="No tickets issued yet" description="Tickets are generated automatically the moment a payment for this event is verified."
            />
          ) : (
            tickets.slice(0, 50).map((ticket) => (
              <div
                key={ticket.id} className="flex flex-wrap items-center justify-between gap-2 text-sm"
              >
                <div className="min-w-0">
                  <span className="font-mono text-xs font-semibold">{ticket.code}</span>
                  <p className="truncate text-xs text-muted">
                    {ticket.holder_email ?? "No email"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusChip
                    label={ticketStatusLabel(ticket.status)}
                    tone={ticketStatusTone(ticket.status)}
                  />
                  <span className="text-xs text-muted">
                    {formatRelative(ticket.created_at)}
                  </span>
                </div>
              </div>
            ))
          )}
        </Card.Content>
      </Card>

      <InfoNote title="Editing this event">
        Ticket types that have already sold tickets are preserved on save — you can still change their
        price and capacity for future buyers, but you cannot delete them and invalidate tickets people
        already hold.
      </InfoNote>

      <EventForm event={detail} currency={detail.currency} />
    </div>
  );
}
