/**
 * The ticket inventory — a holder's own tickets.
 *
 * A ticket belongs to the person who bought it. That is the only claim there is,
 * and it is decided here, from the order behind the ticket, never from anything
 * the browser sends: the viewer is the signed-in account, the order's `user_id`
 * must be that account, and only a *guest* order (no account attached) may be
 * matched by the address the account itself signs in with. A ticket id therefore
 * proves nothing on its own, which is what keeps one account's inventory out of
 * another's.
 *
 * Everything a ticket surface needs is one row: the ticket, the event it opens,
 * its type, and the order it came from. `tickets.deleted_at` is the holder's own
 * trash — a state on their view of the ticket, never a deletion of it. The
 * platform never trashes a ticket on the holder's behalf (an event ending does
 * not do it, and neither does a scan), and recovery is the same row coming back.
 */

import "server-only";

import { execute, query, queryOne } from "../db";
import { nowIso } from "../format";
import type { TicketWithEvent } from "../types";

/**
 * Who is looking. The account id is required; the email is the account's own and
 * is only ever used for guest orders that predate an account.
 */
export type TicketScope = { userId: string; email: string | null };

/** A ticket as its holder sees it: with its event, its order and its trash state. */
export type BuyerTicket = TicketWithEvent & {
  deleted_at: string | null;
  order_email: string | null;
  store_name: string | null;
  store_slug: string | null;
};

/**
 * The ownership clause. Consumes, in order: userId, email (for the NULL test),
 * email (for the comparison).
 */
const TICKET_OWNER = `(
  o.user_id = ?
  OR (o.user_id IS NULL AND ? IS NOT NULL AND LOWER(o.email) = LOWER(?))
)`;

function ownerArgs(scope: TicketScope): Array<string | null> {
  return [scope.userId, scope.email, scope.email];
}

const TICKET_SELECT = `SELECT t.*,
         e.title AS event_title, e.slug AS event_slug, e.starts_at AS event_starts_at,
         e.ends_at AS event_ends_at, e.venue_name AS event_venue, e.city AS event_city,
         e.is_online AS event_online,
         tt.name AS ticket_type_name,
         o.order_number AS order_number, o.currency AS order_currency,
         o.email AS order_email,
         s.name AS store_name, s.slug AS store_slug
   FROM tickets t
   JOIN orders o ON o.id = t.order_id
   LEFT JOIN events e ON e.id = t.event_id
   LEFT JOIN ticket_types tt ON tt.id = t.ticket_type_id
   LEFT JOIN stores s ON s.id = t.store_id`;

export type TicketSearch = {
  /** One term, matched against the event, the type, the code and the order. */
  search?: string | null;
  /** True reads the trash; false (or absent) reads the normal inventory. */
  trashed?: boolean;
  limit?: number;
  offset?: number;
};

/** The `LIKE` term, or null when there is nothing to match on. */
function searchClause(search: string | null | undefined): string | null {
  const term = search?.trim().toLowerCase();
  return term ? `%${term}%` : null;
}

/**
 * One page of the holder's tickets, newest first.
 *
 * The search runs in SQL against the fields a person would actually search by —
 * the event, the ticket type, the ticket code and the order number — so an
 * inventory of many tickets is never pulled into the browser to be filtered
 * there. Paging is the database's too.
 */
export async function listBuyerTickets(
  scope: TicketScope,
  options: TicketSearch & { storeId?: string | null } = {},
): Promise<BuyerTicket[]> {
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
  const offset = Math.max(options.offset ?? 0, 0);
  const term = searchClause(options.search);

  const conditions = [TICKET_OWNER, options.trashed ? "t.deleted_at IS NOT NULL" : "t.deleted_at IS NULL"];
  const args: Array<string | number | null> = [...ownerArgs(scope)];

  if (options.storeId) {
    conditions.push("t.store_id = ?");
    args.push(options.storeId);
  }

  if (term) {
    conditions.push(
      `(LOWER(COALESCE(e.title, '')) LIKE ?
        OR LOWER(COALESCE(tt.name, '')) LIKE ?
        OR LOWER(t.code) LIKE ?
        OR LOWER(COALESCE(o.order_number, '')) LIKE ?
        OR LOWER(COALESCE(t.holder_name, '')) LIKE ?)`,
    );
    args.push(term, term, term, term, term);
  }

  return query<BuyerTicket>(
    `${TICKET_SELECT}
      WHERE ${conditions.join(" AND ")}
      ORDER BY COALESCE(e.starts_at, t.created_at) DESC, t.created_at DESC
      LIMIT ? OFFSET ?`,
    [...args, limit, offset],
  );
}

/** How many tickets this page of the inventory has, for paging and counts. */
export async function countBuyerTickets(
  scope: TicketScope,
  options: TicketSearch & { storeId?: string | null } = {},
): Promise<number> {
  const term = searchClause(options.search);

  const conditions = [TICKET_OWNER, options.trashed ? "t.deleted_at IS NOT NULL" : "t.deleted_at IS NULL"];
  const args: Array<string | number | null> = [...ownerArgs(scope)];

  if (options.storeId) {
    conditions.push("t.store_id = ?");
    args.push(options.storeId);
  }

  if (term) {
    conditions.push(
      `(LOWER(COALESCE(e.title, '')) LIKE ?
        OR LOWER(COALESCE(tt.name, '')) LIKE ?
        OR LOWER(t.code) LIKE ?
        OR LOWER(COALESCE(o.order_number, '')) LIKE ?
        OR LOWER(COALESCE(t.holder_name, '')) LIKE ?)`,
    );
    args.push(term, term, term, term, term);
  }

  const row = await queryOne<{ total: number }>(
    `SELECT COUNT(*) AS total
       FROM tickets t
       JOIN orders o ON o.id = t.order_id
       LEFT JOIN events e ON e.id = t.event_id
       LEFT JOIN ticket_types tt ON tt.id = t.ticket_type_id
      WHERE ${conditions.join(" AND ")}`,
    args,
  );

  return Number(row?.total ?? 0);
}

/** Counts for the inventory's two tabs: in the inventory, and in the trash. */
export async function ticketInventoryCounts(
  scope: TicketScope,
): Promise<{ active: number; trashed: number }> {
  const row = await queryOne<{ active: number; trashed: number }>(
    `SELECT
        SUM(CASE WHEN t.deleted_at IS NULL THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN t.deleted_at IS NOT NULL THEN 1 ELSE 0 END) AS trashed
       FROM tickets t
       JOIN orders o ON o.id = t.order_id
      WHERE ${TICKET_OWNER}`,
    ownerArgs(scope),
  );

  return { active: Number(row?.active ?? 0), trashed: Number(row?.trashed ?? 0) };
}

/** One ticket, only if it is this viewer's own. */
export async function getBuyerTicket(
  ticketId: string,
  scope: TicketScope,
): Promise<BuyerTicket | null> {
  return queryOne<BuyerTicket>(
    `${TICKET_SELECT} WHERE t.id = ? AND ${TICKET_OWNER}`,
    [ticketId, ...ownerArgs(scope)],
  );
}

export type TicketActionResult = { ok: true } | { ok: false; error: string };

/**
 * Is this ticket still usable at the door?
 *
 * Only an unused ticket for an event that has not started is. Everything else —
 * used, cancelled, refunded, expired, void, or simply past its date — has become
 * what the holder no longer needs in their inventory, which is exactly what
 * Delete is for. Refresh does not matter: every read re-derives this from the
 * rows, so a ticket whose event has passed is deletable without any job running.
 */
export function ticketIsSpent(ticket: Pick<BuyerTicket, "status" | "event_starts_at" | "event_ends_at">): boolean {
  if (ticket.status !== "valid") return true;
  const end = ticket.event_ends_at ?? ticket.event_starts_at;
  if (!end) return false;
  return nowIso() > end;
}

/**
 * Move one of the viewer's own tickets to their trash.
 *
 * Refused while the ticket is still usable: trashing a live admission would lose
 * a door pass that still works, so a holder is told to use it or ask the seller
 * to cancel it instead. The ticket itself is untouched — one timestamp changes,
 * so its id, its code, its QR, its order and its purchase history all stay.
 */
export async function moveTicketToTrash(
  ticketId: string,
  scope: TicketScope,
): Promise<TicketActionResult> {
  const ticket = await getBuyerTicket(ticketId, scope);
  if (!ticket) return { ok: false, error: "That ticket is not in your inventory." };
  if (ticket.deleted_at) return { ok: true };

  if (!ticketIsSpent(ticket)) {
    return {
      ok: false,
      error:
        "This ticket is still valid, so it stays in your inventory. Use it at the door, or ask the seller to cancel it.",
    };
  }

  await execute("UPDATE tickets SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL", [
    nowIso(),
    ticket.id,
  ]);

  return { ok: true };
}

/**
 * Bring one of the viewer's own tickets back out of the trash.
 *
 * The same row returns — nothing is copied and nothing new is issued, so there
 * is one ticket, one code and one QR for it before and after.
 */
export async function restoreTicket(
  ticketId: string,
  scope: TicketScope,
): Promise<TicketActionResult> {
  const ticket = await getBuyerTicket(ticketId, scope);
  if (!ticket) return { ok: false, error: "That ticket is not in your inventory." };
  if (!ticket.deleted_at) return { ok: true };

  await execute("UPDATE tickets SET deleted_at = NULL WHERE id = ? AND deleted_at IS NOT NULL", [
    ticket.id,
  ]);

  return { ok: true };
}
