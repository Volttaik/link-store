/**
 * Events + ticketing data access.
 *
 * Events sit beside listings rather than inside them: an event can have several
 * ticket types with their own prices and capacities, and tickets are issued per
 * attendee. Everything still settles through the same cart, order and payment
 * pipeline — a ticket is simply another order item shape.
 */

import "server-only";

import { batch, bool, execute, query, queryOne, type BatchStatement } from "../db";
import { nowIso } from "../format";
import { newId } from "../ids";
import { formatDateTime } from "../format";
import { slugify } from "../slug";
import { platformConfig } from "../env";
import { sendEventChangeEmail } from "./email";
import type { EventCardData, EventDetail, EventRow, TicketTypeRow } from "../types";

type EventJoinRow = EventRow & {
  store_name: string;
  store_slug: string;
  store_logo_url: string | null;
  store_tagline: string | null;
  min_price: number | null;
  tickets_available: number | null;
  tickets_sold: number | null;
  tickets_total: number | null;
  checked_in: number | null;
};

const EVENT_SELECT = `
  SELECT e.*,
         s.name     AS store_name,
         s.slug     AS store_slug,
         s.logo_url AS store_logo_url,
         s.tagline  AS store_tagline,
         (SELECT MIN(t.price) FROM ticket_types t
           WHERE t.event_id = e.id AND t.is_active = 1) AS min_price,
         (SELECT COALESCE(SUM(t.quantity_total - t.quantity_sold), 0) FROM ticket_types t
           WHERE t.event_id = e.id AND t.is_active = 1) AS tickets_available,
         -- Sold and issued are different questions: one is what the seller has
         -- earned, the other is who is coming. Both are asked on the events
         -- page, so both are answered here rather than per row.
         (SELECT COALESCE(SUM(t.quantity_sold), 0) FROM ticket_types t
           WHERE t.event_id = e.id) AS tickets_sold,
         (SELECT COALESCE(SUM(t.quantity_total), 0) FROM ticket_types t
           WHERE t.event_id = e.id) AS tickets_total,
         (SELECT COUNT(*) FROM tickets k
           WHERE k.event_id = e.id AND k.status = 'used') AS checked_in
  FROM events e
  JOIN stores s ON s.id = e.store_id`;

export function mapEventCard(row: EventJoinRow, currency = "NGN"): EventCardData {
  return {
    id: row.id,
    storeId: row.store_id,
    storeName: row.store_name,
    storeSlug: row.store_slug,
    title: row.title,
    slug: row.slug,
    description: row.description,
    coverImageUrl: row.cover_image_url,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    venueName: row.venue_name,
    city: row.city,
    country: row.country,
    isOnline: bool(row.is_online),
    status: row.status,
    minPrice: row.min_price === null ? null : Number(row.min_price),
    currency,
    ticketsAvailable: Number(row.tickets_available ?? 0),
    ticketsSold: Number(row.tickets_sold ?? 0),
    ticketsTotal: Number(row.tickets_total ?? 0),
    checkedIn: Number(row.checked_in ?? 0),
  };
}

// --- Queries ----------------------------------------------------------------

export type EventQuery = {
  storeId?: string;
  status?: string;
  search?: string;
  city?: string;
  upcomingOnly?: boolean;
  onlyPublishedStores?: boolean;
  /**
   * Events whose ticket listing sits in this catalogue category. The relation is
   * real: an event's tickets are a listing, and listings carry the category, so
   * this is the honest way to answer "what is happening in Cars?"
   */
  listingCategoryId?: string;
  limit?: number;
  offset?: number;
};

function buildEventWhere(input: EventQuery): { clause: string; args: Array<string | number> } {
  const conditions: string[] = [];
  const args: Array<string | number> = [];

  if (input.storeId) {
    conditions.push("e.store_id = ?");
    args.push(input.storeId);
  }
  if (input.status && input.status !== "all") {
    conditions.push("e.status = ?");
    args.push(input.status);
  }
  if (input.search) {
    const term = `%${input.search.trim().toLowerCase()}%`;
    conditions.push("(LOWER(e.title) LIKE ? OR LOWER(COALESCE(e.description, '')) LIKE ?)");
    args.push(term, term);
  }
  if (input.city) {
    conditions.push("LOWER(COALESCE(e.city, '')) = ?");
    args.push(input.city.toLowerCase());
  }
  if (input.upcomingOnly) {
    conditions.push("e.starts_at >= ?");
    args.push(nowIso());
  }
  if (input.onlyPublishedStores) {
    conditions.push("s.is_published = 1");
  }
  if (input.listingCategoryId) {
    conditions.push(
      "EXISTS (SELECT 1 FROM listings l WHERE l.id = e.listing_id AND l.category_id = ?)",
    );
    args.push(input.listingCategoryId);
  }

  return {
    clause: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "",
    args,
  };
}

export async function listEvents(input: EventQuery = {}): Promise<EventCardData[]> {
  const { clause, args } = buildEventWhere(input);
  const limit = Math.min(Math.max(input.limit ?? 24, 1), 100);
  const offset = Math.max(input.offset ?? 0, 0);

  const rows = await query<EventJoinRow>(
    `${EVENT_SELECT} ${clause} ORDER BY e.starts_at ASC LIMIT ? OFFSET ?`,
    [...args, limit, offset],
  );

  // Store currencies are resolved in one pass to avoid N+1 lookups.
  const storeIds = [...new Set(rows.map((row) => row.store_id))];
  const currencies = new Map<string, string>();
  if (storeIds.length > 0) {
    const storeRows = await query<{ id: string; currency: string }>(
      `SELECT id, currency FROM stores WHERE id IN (${storeIds.map(() => "?").join(", ")})`,
      storeIds,
    );
    for (const row of storeRows) currencies.set(row.id, row.currency);
  }

  return rows.map((row) => mapEventCard(row, currencies.get(row.store_id) ?? "NGN"));
}

export async function countEvents(input: EventQuery = {}): Promise<number> {
  const { clause, args } = buildEventWhere(input);
  const row = await queryOne<{ total: number }>(
    `SELECT COUNT(*) AS total FROM events e JOIN stores s ON s.id = e.store_id ${clause}`,
    args,
  );
  return Number(row?.total ?? 0);
}

export async function getEventDetail(eventId: string): Promise<EventDetail | null> {
  const row = await queryOne<EventJoinRow>(`${EVENT_SELECT} WHERE e.id = ?`, [eventId]);
  if (!row) return null;

  const [ticketTypes, store] = await Promise.all([
    listTicketTypes(row.id),
    queryOne<{ currency: string }>("SELECT currency FROM stores WHERE id = ?", [row.store_id]),
  ]);

  return {
    ...mapEventCard(row, store?.currency ?? "NGN"),
    timezone: row.timezone,
    address: row.address,
    state: row.state,
    onlineUrl: row.online_url,
    capacity: row.capacity === null ? null : Number(row.capacity),
    ticketTypes,
    storeLogoUrl: row.store_logo_url,
    storeTagline: row.store_tagline,
  };
}

export async function getEventRow(eventId: string): Promise<EventRow | null> {
  return queryOne<EventRow>("SELECT * FROM events WHERE id = ?", [eventId]);
}

export async function getOwnedEvent(eventId: string, storeId: string): Promise<EventRow | null> {
  return queryOne<EventRow>("SELECT * FROM events WHERE id = ? AND store_id = ?", [
    eventId,
    storeId,
  ]);
}

export async function findEventBySlug(eventIdOrSlug: string): Promise<EventRow | null> {
  return queryOne<EventRow>("SELECT * FROM events WHERE id = ? OR slug = ? LIMIT 1", [
    eventIdOrSlug,
    eventIdOrSlug,
  ]);
}

export async function listEventStatusCounts(storeId: string): Promise<Record<string, number>> {
  const rows = await query<{ status: string; total: number }>(
    "SELECT status, COUNT(*) AS total FROM events WHERE store_id = ? GROUP BY status",
    [storeId],
  );

  const counts: Record<string, number> = { all: 0, draft: 0, published: 0, cancelled: 0, completed: 0 };
  for (const row of rows) {
    counts[row.status] = Number(row.total);
    counts.all += Number(row.total);
  }
  return counts;
}

// --- Ticket types -----------------------------------------------------------

export async function listTicketTypes(eventId: string): Promise<TicketTypeRow[]> {
  return query<TicketTypeRow>(
    "SELECT * FROM ticket_types WHERE event_id = ? ORDER BY position ASC, price ASC",
    [eventId],
  );
}

export async function getTicketType(
  ticketTypeId: string,
): Promise<(TicketTypeRow & { store_id: string }) | null> {
  return queryOne<TicketTypeRow & { store_id: string }>(
    `SELECT t.*, e.store_id FROM ticket_types t
     JOIN events e ON e.id = t.event_id
     WHERE t.id = ?`,
    [ticketTypeId],
  );
}

export type TicketTypeInput = {
  id?: string;
  name: string;
  description?: string | null;
  price: number;
  quantityTotal: number;
  maxPerOrder: number;
  salesStart?: string | null;
  salesEnd?: string | null;
  isActive: boolean;
};

async function uniqueEventSlug(storeId: string, title: string, excludeId?: string): Promise<string> {
  const base = slugify(title);
  let candidate = base;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const clash = await queryOne<{ id: string }>(
      "SELECT id FROM events WHERE store_id = ? AND slug = ? AND (? IS NULL OR id != ?)",
      [storeId, candidate, excludeId ?? null, excludeId ?? null],
    );
    if (!clash) return candidate;
    candidate = `${base}-${attempt + 2}`;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export type EventInput = {
  title: string;
  description?: string | null;
  coverImageUrl?: string | null;
  startsAt: string;
  endsAt?: string | null;
  timezone: string;
  venueName?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  isOnline: boolean;
  onlineUrl?: string | null;
  capacity?: number | null;
  status: "draft" | "published" | "cancelled" | "completed";
  ticketTypes: TicketTypeInput[];
};

/**
 * INSERT statements for new ticket types. Deleting is intentionally *not* part
 * of this helper: ticket types that already sold tickets must survive an edit,
 * so each caller decides precisely what it is allowed to remove.
 */
function insertTicketTypeStatements(
  eventId: string,
  storeId: string,
  ticketTypes: TicketTypeInput[],
): BatchStatement[] {
  const statements: BatchStatement[] = [];

  ticketTypes.slice(0, 20).forEach((ticket, index) => {
    statements.push({
      sql: `INSERT INTO ticket_types
              (id, event_id, name, description, price, currency, quantity_total, quantity_sold,
               max_per_order, sales_start, sales_end, is_active, position, created_at)
            VALUES (?, ?, ?, ?, ?, (SELECT currency FROM stores WHERE id = ?), ?, 0, ?, ?, ?, ?, ?, ?)`,
      args: [
        newId("tkt"),
        eventId,
        ticket.name.trim().slice(0, 80),
        ticket.description?.trim() || null,
        Math.max(0, Math.round(ticket.price)),
        storeId,
        Math.max(0, Math.floor(ticket.quantityTotal)),
        Math.max(1, Math.floor(ticket.maxPerOrder)),
        ticket.salesStart || null,
        ticket.salesEnd || null,
        ticket.isActive ? 1 : 0,
        index,
        nowIso(),
      ],
    });
  });

  return statements;
}

export async function createEvent(
  storeId: string,
  input: EventInput,
): Promise<{ ok: true; eventId: string } | { ok: false; error: string }> {
  const title = input.title.trim();
  if (title.length < 2) return { ok: false, error: "Give this event a name." };
  if (!input.startsAt) return { ok: false, error: "An event needs a start date and time." };
  if (input.ticketTypes.length === 0 && input.status === "published") {
    return { ok: false, error: "Add at least one ticket type before publishing." };
  }

  const id = newId("evt");
  const timestamp = nowIso();
  const slug = await uniqueEventSlug(storeId, title);

  const statements: BatchStatement[] = [
    {
      sql: `INSERT INTO events
              (id, store_id, listing_id, title, slug, description, cover_image_url, starts_at, ends_at,
               timezone, venue_name, address, city, state, country, is_online, online_url, capacity,
               status, created_at, updated_at)
            VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        id,
        storeId,
        title,
        slug,
        input.description?.trim() || null,
        input.coverImageUrl ?? null,
        input.startsAt,
        input.endsAt || null,
        input.timezone || "Africa/Lagos",
        input.venueName?.trim() || null,
        input.address?.trim() || null,
        input.city?.trim() || null,
        input.state?.trim() || null,
        input.country?.trim() || "Nigeria",
        input.isOnline ? 1 : 0,
        input.onlineUrl?.trim() || null,
        input.capacity ?? null,
        input.status,
        timestamp,
        timestamp,
      ],
    },
  ];

  statements.push(...insertTicketTypeStatements(id, storeId, input.ticketTypes));

  await batch(statements);
  return { ok: true, eventId: id };
}

export async function updateEvent(
  eventId: string,
  storeId: string,
  input: EventInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const existing = await getOwnedEvent(eventId, storeId);
  if (!existing) return { ok: false, error: "Event not found." };

  const title = input.title.trim();
  if (title.length < 2) return { ok: false, error: "Give this event a name." };
  if (!input.startsAt) return { ok: false, error: "An event needs a start date and time." };

  // Tickets already sold must remain intact: their ticket types cannot be
  // removed, so a sold-out type is preserved rather than silently recreated.
  const existingTypes = await listTicketTypes(eventId);
  const soldTypes = existingTypes.filter((type) => Number(type.quantity_sold) > 0);
  const incomingIds = new Set(input.ticketTypes.map((type) => type.id).filter(Boolean));
  const orphanedSold = soldTypes.filter((type) => !incomingIds.has(type.id));

  const timestamp = nowIso();
  const slug =
    slugify(title) === existing.slug ? existing.slug : await uniqueEventSlug(storeId, title, eventId);

  const statements: BatchStatement[] = [
    {
      sql: `UPDATE events SET
              title = ?, slug = ?, description = ?, cover_image_url = ?, starts_at = ?, ends_at = ?,
              timezone = ?, venue_name = ?, address = ?, city = ?, state = ?, country = ?,
              is_online = ?, online_url = ?, capacity = ?, status = ?, updated_at = ?
            WHERE id = ? AND store_id = ?`,
      args: [
        title,
        slug,
        input.description?.trim() || null,
        input.coverImageUrl ?? null,
        input.startsAt,
        input.endsAt || null,
        input.timezone || "Africa/Lagos",
        input.venueName?.trim() || null,
        input.address?.trim() || null,
        input.city?.trim() || null,
        input.state?.trim() || null,
        input.country?.trim() || "Nigeria",
        input.isOnline ? 1 : 0,
        input.onlineUrl?.trim() || null,
        input.capacity ?? null,
        input.status,
        timestamp,
        eventId,
        storeId,
      ],
    },
    // Only unsold ticket types are replaced wholesale.
    { sql: "DELETE FROM ticket_types WHERE event_id = ? AND quantity_sold = 0", args: [eventId] },
    {
      sql: `UPDATE ticket_types SET is_active = 0 WHERE event_id = ? AND quantity_sold > 0
            AND id NOT IN (${input.ticketTypes.map(() => "?").join(", ") || "''"})`,
      args: [eventId, ...input.ticketTypes.map((type) => type.id ?? "")],
    },
  ];

  // Re-insert the submitted types; update ones with sales in place.
  const keepIds = new Set(soldTypes.map((type) => type.id));
  const toInsert = input.ticketTypes.filter((type) => !type.id || !keepIds.has(type.id));
  statements.push(...insertTicketTypeStatements(eventId, storeId, toInsert));

  input.ticketTypes.forEach((ticket, index) => {
    if (!ticket.id || !keepIds.has(ticket.id)) return;
    statements.push({
      sql: `UPDATE ticket_types SET
              name = ?, description = ?, price = ?, quantity_total = ?, max_per_order = ?,
              sales_start = ?, sales_end = ?, is_active = ?, position = ?
            WHERE id = ? AND event_id = ?`,
      args: [
        ticket.name.trim().slice(0, 80),
        ticket.description?.trim() || null,
        Math.max(0, Math.round(ticket.price)),
        Math.max(0, Math.floor(ticket.quantityTotal)),
        Math.max(1, Math.floor(ticket.maxPerOrder)),
        ticket.salesStart || null,
        ticket.salesEnd || null,
        ticket.isActive ? 1 : 0,
        index,
        ticket.id,
        eventId,
      ],
    });
  });

  void orphanedSold;
  await batch(statements);

  // People booked a specific night at a specific place. If either moved — or
  // the event is off — they hear it from us, not on the door.
  await notifyTicketHoldersOfChange(
    eventId,
    existing,
    {
      title,
      startsAt: input.startsAt,
      venueName: input.venueName?.trim() || null,
      city: input.city?.trim() || null,
      status: input.status,
    },
    timestamp,
  );

  return { ok: true };
}

/** The change facts an update notice is about. */
type EventChangeFacts = {
  title: string;
  startsAt: string | null;
  venueName: string | null;
  city: string | null;
  status: string;
};

/**
 * Tell ticket holders when the night they bought a ticket for actually moves.
 *
 * Only real changes count — a time, a place, or the event being cancelled —
 * never a re-save that changed nothing. One notice per holder per change, to
 * the address on the ticket, and fire-and-forget: an edit must never be held
 * hostage by an inbox.
 */
async function notifyTicketHoldersOfChange(
  eventId: string,
  before: Pick<EventRow, "title" | "starts_at" | "venue_name" | "city" | "status">,
  after: EventChangeFacts,
  changedAt: string,
): Promise<void> {
  try {
    const cancelled = after.status === "cancelled" && before.status !== "cancelled";
    const timeChanged = (after.startsAt ?? null) !== (before.starts_at ?? null);
    const venueChanged =
      (after.venueName ?? null) !== (before.venue_name ?? null) ||
      (after.city ?? null) !== (before.city ?? null);
    if (!cancelled && !timeChanged && !venueChanged) return;

    const tickets = await query<{ holder_email: string | null; holder_name: string | null }>(
      "SELECT holder_email, holder_name FROM tickets WHERE event_id = ? AND status = 'valid'",
      [eventId],
    );

    const holders = new Map<string, string | null>();
    for (const ticket of tickets) {
      const email = ticket.holder_email?.trim().toLowerCase();
      if (email && !holders.has(email)) holders.set(email, ticket.holder_name ?? null);
    }
    if (holders.size === 0) return;

    const detailLines: Array<{ label: string; value: string }> = [];
    if (timeChanged) {
      detailLines.push({
        label: "New date & time",
        value: after.startsAt ? formatDateTime(after.startsAt) : "To be announced",
      });
    }
    if (venueChanged) {
      detailLines.push({
        label: "New location",
        value: [after.venueName, after.city].filter(Boolean).join(", ") || "To be announced",
      });
    }

    const changeLine = cancelled
      ? `the organiser has cancelled ${after.title}.`
      : timeChanged && venueChanged
        ? `the date, time and location of ${after.title} have changed.`
        : timeChanged
          ? `the date and time of ${after.title} have changed.`
          : `the location of ${after.title} has changed.`;

    for (const [to, holderName] of holders) {
      await sendEventChangeEmail({
        to,
        holderName,
        eventId,
        eventTitle: after.title,
        eventUrl: `${platformConfig.appUrl}/events/${eventId}`,
        changeLine,
        detailLines,
        cancelled,
        changedAt,
      }).catch(() => {});
    }
  } catch (error) {
    console.error(`[mail] event ${eventId}: change notices failed`, error);
  }
}

export async function setEventStatus(input: {
  eventId: string;
  storeId: string;
  status: "draft" | "published" | "cancelled" | "completed";
}): Promise<{ ok: boolean; error?: string }> {
  const event = await getOwnedEvent(input.eventId, input.storeId);
  if (!event) return { ok: false, error: "Event not found." };

  if (input.status === "published") {
    const types = await listTicketTypes(input.eventId);
    if (types.length === 0) {
      return { ok: false, error: "Add at least one ticket type before publishing." };
    }
  }

  const at = nowIso();
  await execute("UPDATE events SET status = ?, updated_at = ? WHERE id = ? AND store_id = ?", [
    input.status,
    at,
    input.eventId,
    input.storeId,
  ]);

  // A cancellation is the one status change ticket holders must hear about.
  if (input.status === "cancelled" && event.status !== "cancelled") {
    await notifyTicketHoldersOfChange(
      input.eventId,
      event,
      {
        title: event.title,
        startsAt: event.starts_at,
        venueName: event.venue_name,
        city: event.city,
        status: "cancelled",
      },
      at,
    );
  }

  return { ok: true };
}

export async function deleteEvent(input: {
  eventId: string;
  storeId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const event = await getOwnedEvent(input.eventId, input.storeId);
  if (!event) return { ok: false, error: "Event not found." };

  const sold = await queryOne<{ total: number }>(
    "SELECT COALESCE(SUM(quantity_sold), 0) AS total FROM ticket_types WHERE event_id = ?",
    [input.eventId],
  );
  if (Number(sold?.total ?? 0) > 0) {
    return { ok: false, error: "Tickets have been sold for this event, so it cannot be deleted." };
  }

  await execute("DELETE FROM events WHERE id = ? AND store_id = ?", [input.eventId, input.storeId]);
  return { ok: true };
}

/** Reserve ticket inventory. Called only after a payment is verified. */
export async function recordTicketSales(
  entries: Array<{ ticketTypeId: string; quantity: number }>,
): Promise<void> {
  if (entries.length === 0) return;

  await batch(
    entries.map((entry) => ({
      sql: `UPDATE ticket_types SET quantity_sold = quantity_sold + ?
            WHERE id = ? AND (quantity_total = 0 OR quantity_sold + ? <= quantity_total)`,
      args: [entry.quantity, entry.ticketTypeId, entry.quantity],
    })),
  );
}
