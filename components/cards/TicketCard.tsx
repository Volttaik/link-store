/**
 * The ticket card — an actual ticket.
 *
 * A ticket should read as a ticket the moment it is seen, not as a rectangle
 * that happens to contain ticket information. So this card carries the
 * silhouette of the real object: the admission body on one side, the stub on
 * the other, and a real perforation — dashed, with the notches bitten out of
 * the edges where it tears — between them.
 *
 * The body says what a holder needs at the door: which event, when, where, and
 * whose ticket it is. The stub says what the door scans: the QR (always on its
 * white plate — a QR that inverts with the theme is a QR that fails to scan),
 * the ticket number and the state of the ticket.
 *
 * The QR is rendered by the caller (`TicketQr` is a server component), so this
 * card stays a plain composition.
 */

import { Link } from "@heroui/react/link";
import type { ReactNode } from "react";

import { Icon } from "@/components/ui/Icon";
import { StatusChip } from "@/components/ui/atoms";
import { ticketStatusLabel, ticketStatusTone } from "@/lib/catalog";
import { formatTime } from "@/lib/format";
import type { TicketWithEvent } from "@/lib/types";

export function TicketCard({
  ticket,
  orderEmail,
  qr,
}: {
  ticket: TicketWithEvent;
  /** The order's email — the holder of last resort when the ticket names none. */
  orderEmail?: string | null;
  /** The QR plate, rendered on the server by `TicketQr`. */
  qr: ReactNode;
}) {
  const startsAt = ticket.event_starts_at ? new Date(ticket.event_starts_at) : null;
  const place =
    ticket.event_online === 1
      ? "Online event"
      : [ticket.event_venue, ticket.event_city].filter(Boolean).join(", ") ||
        "Venue to be announced";
  const holder = ticket.holder_name ?? ticket.holder_email ?? orderEmail ?? null;
  const used = ticket.status === "used";

  /** “SAT 26 SEP” — the date a ticket is surrendered at the door. */
  const dayLine = startsAt
    ? startsAt
        .toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })
        .toUpperCase()
    : "DATE TO BE ANNOUNCED";

  return (
    <article className="ls-ticket motion-safe:animate-ticket">
      {/* The admission body — what the holder needs at the door. */}
      <div className="flex min-w-0 flex-1 flex-col gap-3.5 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.18em] text-muted uppercase">
            <Icon name="ticket" size={12} className="shrink-0" />
            {ticket.ticket_type_name ?? "Admission"}
          </span>
          <StatusChip
            label={ticketStatusLabel(ticket.status)}
            tone={ticketStatusTone(ticket.status)}
          />
        </div>

        <div className="min-w-0">
          <h3 className="text-[17px] leading-snug font-semibold tracking-tight">
            <Link
              className="text-foreground no-underline hover:underline"
              href={`/events/${ticket.event_id}`}
            >
              {ticket.event_title ?? "Event ticket"}
            </Link>
          </h3>

          <p className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-[15px] font-semibold tracking-[0.12em] tabular-nums text-foreground">
              {dayLine}
            </span>
            {startsAt ? (
              <span className="flex items-center gap-1.5 text-[13.5px] tabular-nums text-muted">
                <Icon name="clock" size={12} className="shrink-0" />
                {formatTime(startsAt)}
              </span>
            ) : null}
          </p>

          <p className="mt-1.5 flex items-center gap-1.5 text-[13px] text-muted">
            <Icon name="mapPin" size={12} className="shrink-0" />
            <span className="truncate">{place}</span>
          </p>
        </div>

        <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-[12px] text-muted">
          {holder ? (
            <span className="flex items-center gap-1.5">
              <Icon name="user" size={12} className="shrink-0" />
              <span className="truncate">{holder}</span>
            </span>
          ) : null}
          {ticket.order_number ? (
            <span className="flex items-center gap-1.5 tabular-nums">
              <Icon name="receipt" size={12} className="shrink-0" />
              Order {ticket.order_number}
            </span>
          ) : null}
          {used && ticket.checked_in_at ? (
            <span className="flex items-center gap-1.5">
              <Icon name="check" size={12} className="shrink-0" />
              Used at the door
            </span>
          ) : ticket.status === "valid" ? (
            <span>Show the code at the entrance. Each ticket is admitted once.</span>
          ) : (
            <span>This ticket is no longer valid for entry.</span>
          )}
        </div>
      </div>

      {/* The perforation — where this ticket tears. */}
      <div aria-hidden="true" className="ls-ticket__perf" />

      {/* The stub — what the door scans. */}
      <div className="flex w-full shrink-0 flex-col items-center gap-2.5 p-5 sm:w-52">
        {/* White plate, always: a QR that inverts is a QR that fails. */}
        <div className="w-36 sm:w-full">{qr}</div>

        <p className="text-center text-[10px] font-semibold tracking-[0.22em] text-muted uppercase">
          Ticket
        </p>
        <p className="max-w-full truncate font-mono text-[13px] font-semibold tracking-wide text-foreground">
          {ticket.code}
        </p>
      </div>
    </article>
  );
}
