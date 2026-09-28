import { Card } from "@heroui/react/card";
import { Chip } from "@heroui/react/chip";
import { Link } from "@heroui/react/link";
import { notFound } from "next/navigation";

import { PageHeader, StatTile, StatusChip } from "@/components/ui/atoms";
import { ButtonLink } from "@/components/ui/controls";
import { EmptyState, InfoNote } from "@/components/ui/feedback";
import { Icon } from "@/components/ui/Icon";
import { TicketScanner } from "@/components/workspace/TicketScanner";
import { requireStore } from "@/lib/auth";
import { eventStatusTone } from "@/lib/catalog";
import { listRecentCheckIns, listTicketsForEvent } from "@/lib/server/commerce";
import { getEventDetail, getOwnedEvent, listTicketTypes } from "@/lib/server/events";
import { formatDateTime, formatNumber, formatRelative } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await getEventDetail(id);
  return { title: event ? `Check in · ${event.title}` : "Check in" };
}

/**
 * The door screen.
 *
 * Deliberately one job: verify a ticket, fast, in front of a queue. The shell
 * stays put, the field is focused on arrival, and the result is a single large
 * panel that says what happened — including *why* when a ticket is refused.
 *
 * Access is the seller's own: this page loads through `requireStore()` and the
 * event must belong to that store, and the verification itself re-checks
 * ownership on the server on every scan.
 */
export default async function EventCheckInPage({ params }: { params: Promise<{ id: string }> }) {
  const { store } = await requireStore();
  const { id } = await params;

  const owned = await getOwnedEvent(id, store.id);
  if (!owned) notFound();

  const [detail, ticketTypes] = await Promise.all([getEventDetail(id), listTicketTypes(id)]);
  if (!detail) notFound();

  const [tickets, recent] = await Promise.all([
    listTicketsForEvent(id),
    listRecentCheckIns(id, 8),
  ]);

  const sold = ticketTypes.reduce((total, type) => total + Number(type.quantity_sold), 0);
  const checkedIn = tickets.filter((ticket) => ticket.status === "used").length;
  const stillValid = tickets.filter((ticket) => ticket.status === "valid").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Check in"
        description={
          <>
            {detail.title} · {formatDateTime(detail.startsAt)}
            {detail.isOnline ? " · Online" : detail.venueName ? ` · ${detail.venueName}` : ""}
          </>
        }
        breadcrumb={
          <Link
            className="flex items-center gap-1 text-xs font-medium text-muted hover:text-foreground"
            href={`/workspace/events/${detail.id}`}
          >
            <Icon name="arrowLeft" size={13} />
            Manage event
          </Link>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip label={detail.status} tone={eventStatusTone(detail.status)} />
            <ButtonLink href={`/events/${detail.id}`} size="sm" variant="secondary">
              View public page
            </ButtonLink>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Tickets sold"
          value={formatNumber(sold)}
          hint={`${formatNumber(ticketTypes.length)} ticket ${
            ticketTypes.length === 1 ? "type" : "types"
          }`}
        />
        <StatTile
          label="Checked in"
          value={formatNumber(checkedIn)}
          hint={`${formatNumber(stillValid)} still to arrive`}
        />
        <StatTile
          label="Admissions left"
          value={formatNumber(stillValid)}
          hint="Valid tickets not yet scanned"
        />
      </div>

      <TicketScanner eventId={detail.id} eventTitle={detail.title} />

      <Card className="ls-elev-2">
        <Card.Header className="flex-col items-start gap-1">
          <p className="text-sm font-semibold">Recent check-ins</p>
          <p className="text-xs text-muted">Newest first. Every scan lands here.</p>
        </Card.Header>
        
        <Card.Content className="gap-2.5">
          {recent.length === 0 ? (
            <EmptyState
              compact
              icon="ticket"
              title="Nobody has been scanned in yet"
              description="Scan a ticket's QR code, or type its code into the field above. Each ticket verifies once."
            />
          ) : (
            recent.map((ticket) => (
              <div
                key={ticket.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-secondary/40 p-3 text-sm"
              >
                <div className="min-w-0">
                  <span className="font-mono text-xs font-semibold">{ticket.code}</span>
                  <p className="truncate text-xs text-muted">
                    {ticket.holder_name ?? ticket.holder_email ?? "Ticket holder"}
                    {ticket.ticket_type_name ? ` · ${ticket.ticket_type_name}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Chip color="success" size="sm" variant="soft">
                    Checked in
                  </Chip>
                  <span className="text-xs text-muted">
                    {ticket.checked_in_at ? formatRelative(ticket.checked_in_at) : ""}
                  </span>
                </div>
              </div>
            ))
          )}
        </Card.Content>
      </Card>

      <InfoNote title="How verification works">
        The QR code on a ticket carries only its code. Every scan is checked live against your ticket list — the same record on
        the server — the right store, the right event, a ticket that is still valid and not already
        redeemed — and a ticket can only be marked as used once, even if two devices scan it at the
        same moment. Only you can verify tickets for this event.
      </InfoNote>
    </div>
  );
}
