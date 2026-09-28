import { Card } from "@heroui/react/card";

import { TicketCard } from "@/components/cards/TicketCard";
import { TicketInventoryActions } from "@/components/marketplace/TicketInventoryActions";
import { TicketQr } from "@/components/marketplace/TicketQr";
import { PageHeader, StatTile } from "@/components/ui/atoms";
import { ButtonLink } from "@/components/ui/controls";
import { EmptyState } from "@/components/ui/feedback";
import { Icon } from "@/components/ui/Icon";
import { SearchForm } from "@/components/ui/SearchForm";
import { UrlPagination } from "@/components/workspace/UrlPagination";
import { getCurrentUser } from "@/lib/auth";
import { formatNumber } from "@/lib/format";
import {
  countBuyerTickets,
  listBuyerTickets,
  ticketInventoryCounts,
  ticketIsSpent,
} from "@/lib/server/tickets";

export const metadata = { title: "Your tickets" };

export const dynamic = "force-dynamic";

const PER_PAGE = 12;

/**
 * The ticket inventory.
 *
 * Everything the holder bought, one ticket at a time — each with its own code
 * and its own QR — searched and paged by the database rather than in the
 * browser, so an inventory of many tickets stays fast. The Trash is the same
 * page in a different state, and it is a state on the tickets themselves: the
 * platform never deletes a ticket when an event ends, and the only thing that
 * ever moves one out of the inventory is the holder deciding to.
 *
 * Scoping is the session's: the account id and its own email are the only
 * claims used, both read server-side, so nothing here can be pointed at another
 * account's tickets.
 */
export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const user = await getCurrentUser();

  const query = typeof params.q === "string" ? params.q.trim() : "";
  const trashed = params.trash === "1";
  const page = Math.max(1, Number.parseInt(String(params.page ?? "1"), 10) || 1);

  if (!user) {
    return (
      <div className="mx-auto w-full max-w-4xl space-y-7 px-4 py-8 sm:px-6">
        <PageHeader
          title="Your tickets"
          description="Every ticket you buy, individually — each with its own code and QR, ready to show at the door."
        />
        <EmptyState
          icon="ticket"
          title="Sign in to see your tickets"
          description="Tickets belong to the account that bought them, so sign in and your whole inventory appears here. Guest orders stay reachable from the receipt you were emailed."
          action={
            <ButtonLink href="/sign-in" variant="primary">
              Sign in
            </ButtonLink>
          }
        />
      </div>
    );
  }

  const scope = { userId: user.id, email: user.email };

  const [counts, tickets, total] = await Promise.all([
    ticketInventoryCounts(scope),
    listBuyerTickets(scope, {
      search: query,
      trashed,
      limit: PER_PAGE,
      offset: (page - 1) * PER_PAGE,
    }),
    countBuyerTickets(scope, { search: query, trashed }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const searching = query.length > 0;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-7 px-4 py-8 sm:px-6">
      <PageHeader
        title="Your tickets"
        description={
          trashed
            ? "Tickets you have moved out of your inventory. Nothing here is destroyed — recover any of them and it returns exactly as it was."
            : "Every ticket you have bought, counted individually. Open a ticket to show its QR at the door."
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ButtonLink
              href="/tickets"
              size="sm"
              variant={trashed ? "secondary" : "primary"}
            >
              <Icon name="ticket" size={15} />
              Inventory
              <span className="ml-1 tabular-nums">({formatNumber(counts.active)})</span>
            </ButtonLink>
            {/* The Trash Bin action — the only way into the deleted tickets. */}
            <ButtonLink
              href="/tickets?trash=1"
              size="sm"
              variant={trashed ? "primary" : "secondary"}
            >
              <Icon name="trash" size={15} />
              Trash
              <span className="ml-1 tabular-nums">({formatNumber(counts.trashed)})</span>
            </ButtonLink>
          </div>
        }
      />

      {!trashed && counts.active > 0 ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatTile label="Tickets" value={formatNumber(counts.active)} hint="In your inventory" />
          <StatTile
            label="In trash"
            value={formatNumber(counts.trashed)}
            hint="Recoverable, never destroyed"
          />
          <StatTile
            label={searching ? "Matching" : "This page"}
            value={formatNumber(total)}
            hint={searching ? `Results for “${query}”` : "Newest first"}
          />
        </div>
      ) : null}

      {/* Search is the database's: the term is matched against the event, the
          ticket type, the ticket code and the order number, and only one page is
          ever read. */}
      <Card className="ls-elev-2">
        <Card.Content>
          <SearchForm
            action="/tickets"
            ariaLabel="Search your tickets"
            buttonClassName="shrink-0"
            className="flex flex-col gap-2 sm:flex-row sm:items-center"
            label="Search"
          >
            {trashed ? <input name="trash" type="hidden" value="1" /> : null}
            <input
              aria-label="Search tickets by event, ticket type, code or order"
              className="ls-input w-full min-w-0 rounded-xl px-3.5 py-2.5 text-[14px] text-foreground outline-none placeholder:text-muted"
              defaultValue={query}
              name="q"
              placeholder="Event, ticket type, ticket code or order number"
              type="search"
            />
          </SearchForm>
        </Card.Content>
      </Card>

      {tickets.length === 0 ? (
        <EmptyState
          icon={trashed ? "trash" : "ticket"}
          title={
            searching
              ? "No tickets match that search"
              : trashed
                ? "Your trash is empty"
                : "No tickets yet"
          }
          description={
            searching
              ? `Nothing in ${trashed ? "your trash" : "your inventory"} matches “${query}”. Try the event name, the ticket type, the ticket code or the order number.`
              : trashed
                ? "Tickets you delete land here, with everything about them intact, and can be recovered at any time."
                : "Tickets you buy appear here one by one, each with its own code and QR. Browse events to find something to go to."
          }
          action={
            searching ? (
              <ButtonLink href={trashed ? "/tickets?trash=1" : "/tickets"} variant="secondary">
                Clear search
              </ButtonLink>
            ) : trashed ? (
              <ButtonLink href="/tickets" variant="secondary">
                Back to inventory
              </ButtonLink>
            ) : (
              <ButtonLink href="/events" variant="primary">
                Browse events
              </ButtonLink>
            )
          }
        />
      ) : (
        <>
          <div className="flex flex-col gap-5">
            {tickets.map((ticket) => (
              <div key={ticket.id} className="flex flex-col gap-3">
                <TicketCard
                  ticket={ticket}
                  orderEmail={ticket.order_email}
                  qr={<TicketQr code={ticket.code} />}
                />
                <div className="flex flex-wrap items-center justify-between gap-3 px-1">
                  <p className="text-[12.5px] text-muted">
                    {ticket.store_name ? `Sold by ${ticket.store_name}` : "Ticket"}
                    {ticket.deleted_at ? " · In your trash" : ""}
                  </p>
                  <TicketInventoryActions
                    canDelete={ticketIsSpent(ticket)}
                    ticketId={ticket.id}
                    trashed={trashed}
                  />
                </div>
              </div>
            ))}
          </div>

          <UrlPagination
            page={page}
            summary={
              total > PER_PAGE
                ? `${formatNumber((page - 1) * PER_PAGE + 1)}–${formatNumber(
                    Math.min(page * PER_PAGE, total),
                  )} of ${formatNumber(total)}`
                : `${formatNumber(total)} ${total === 1 ? "ticket" : "tickets"}`
            }
            totalPages={totalPages}
          />
        </>
      )}
    </div>
  );
}
