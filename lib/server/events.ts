import "server-only";
import { batch, execute, query, queryOne, type BatchStatement } from "../db";
import { nowIso } from "../format";
import { newId } from "../ids";
import { slugify } from "../slug";
import { listProductsForEvent } from "./listings";
import type { EventCardData, EventDetail, EventRow } from "../types";

type EventJoin = EventRow & { store_name: string; store_slug: string; store_logo_url: string | null; store_tagline: string | null; currency: string };
const SELECT = `SELECT e.*, s.name AS store_name, s.slug AS store_slug, s.logo_url AS store_logo_url, s.tagline AS store_tagline, s.currency FROM events e JOIN stores s ON s.id = e.store_id`;
export type EventQuery = { storeId?: string; status?: string; search?: string; city?: string; upcomingOnly?: boolean; onlyPublishedStores?: boolean; listingCategoryId?: string; limit?: number; offset?: number };
function where(input: EventQuery) {
  const conditions: string[] = []; const args: Array<string | number> = [];
  if (input.storeId) { conditions.push("e.store_id = ?"); args.push(input.storeId); }
  if (input.status && input.status !== "all") { conditions.push("e.status = ?"); args.push(input.status); }
  if (input.search?.trim()) { conditions.push("(LOWER(e.title) LIKE ? OR LOWER(COALESCE(e.description, '')) LIKE ?)"); const term = `%${input.search.trim().toLowerCase()}%`; args.push(term, term); }
  // A drop that has already started remains discoverable until its end.
  if (input.upcomingOnly) { conditions.push("(e.ends_at IS NULL OR e.ends_at >= ?)"); args.push(nowIso()); }
  if (input.onlyPublishedStores) conditions.push("s.is_published = 1");
  if (input.listingCategoryId) { conditions.push("EXISTS (SELECT 1 FROM event_products ep JOIN listings l ON l.id = ep.product_id WHERE ep.event_id = e.id AND l.store_id = e.store_id AND l.type = 'product' AND l.status = 'active' AND l.category_id = ?)"); args.push(input.listingCategoryId); }
  return { clause: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "", args };
}
async function mapEventCard(row: EventJoin): Promise<EventCardData> {
  const links = await query<{ product_id: string }>("SELECT product_id FROM event_products WHERE event_id = ? ORDER BY position", [row.id]);
  const ids = new Set(links.map(link => link.product_id));
  const products = (await listProductsForEvent(row.store_id, { activeOnly: true, productIds: [...ids] })).filter(product => ids.has(product.id)).sort((a, b) => links.findIndex(link => link.product_id === a.id) - links.findIndex(link => link.product_id === b.id));
  return { id: row.id, storeId: row.store_id, storeName: row.store_name, storeSlug: row.store_slug,
    title: row.title, slug: row.slug, description: row.description, coverImageUrl: row.cover_image_url,
    startsAt: row.starts_at, endsAt: row.ends_at, venueName: null, city: null, country: null, isOnline: false,
    status: row.status, currency: row.currency, products, productCount: products.length };
}
export async function listEvents(input: EventQuery = {}): Promise<EventCardData[]> {
  const { clause, args } = where(input);
  const rows = await query<EventJoin>(`${SELECT} ${clause} ORDER BY e.created_at DESC LIMIT ? OFFSET ?`, [...args, Math.min(100, Math.max(1, input.limit ?? 24)), Math.max(0, input.offset ?? 0)]);
  return Promise.all(rows.map(mapEventCard));
}
export async function countEvents(input: EventQuery = {}): Promise<number> { const { clause, args } = where(input); return Number((await queryOne<{ total: number }>(`SELECT COUNT(*) AS total FROM events e JOIN stores s ON s.id = e.store_id ${clause}`, args))?.total ?? 0); }
export async function getEventDetail(id: string): Promise<EventDetail | null> {
  const row = await queryOne<EventJoin>(`${SELECT} WHERE e.id = ?`, [id]); if (!row) return null;
  const links = await query<{ product_id: string }>("SELECT product_id FROM event_products WHERE event_id = ? ORDER BY position", [id]);
  return { ...await mapEventCard(row), timezone: row.timezone, address: null, state: null, onlineUrl: null, capacity: null, productIds: links.map(link => link.product_id), storeLogoUrl: row.store_logo_url, storeTagline: row.store_tagline };
}
export async function getEventRow(id: string) { return queryOne<EventRow>("SELECT * FROM events WHERE id = ?", [id]); }
export async function getOwnedEvent(id: string, storeId: string) { return queryOne<EventRow>("SELECT * FROM events WHERE id = ? AND store_id = ?", [id, storeId]); }
export async function findEventBySlug(value: string) { return queryOne<EventRow>("SELECT * FROM events WHERE id = ? OR slug = ? LIMIT 1", [value, value]); }
export async function listEventStatusCounts(storeId: string): Promise<Record<string, number>> {
  const rows = await query<{ status: string; total: number }>("SELECT status, COUNT(*) AS total FROM events WHERE store_id = ? GROUP BY status", [storeId]);
  const counts: Record<string, number> = { all: 0, draft: 0, published: 0, cancelled: 0, completed: 0 };
  for (const row of rows) { counts[row.status] = Number(row.total); counts.all += Number(row.total); } return counts;
}
export type EventInput = { title: string; description?: string | null; coverImageUrl?: string | null; startsAt?: string | null; endsAt?: string | null; timezone?: string; status: "draft" | "published" | "cancelled" | "completed"; productIds: string[] };
async function validate(storeId: string, input: EventInput): Promise<string | null> {
  if (typeof input.title !== "string" || input.title.trim().length < 2) return "Give your Event a name.";
  if (!["draft", "published", "cancelled", "completed"].includes(input.status)) return "Choose a valid publication status.";
  if (!Array.isArray(input.productIds) || input.productIds.length > 100 || input.productIds.some(id => typeof id !== "string")) return "Select up to 100 products.";
  const ids = [...new Set(input.productIds)];
  if (input.status === "published" && !ids.length) return "Select at least one product before publishing.";
  if ((input.startsAt && !Number.isFinite(Date.parse(input.startsAt))) || (input.endsAt && !Number.isFinite(Date.parse(input.endsAt)))) return "Choose valid start and end dates.";
  if (input.endsAt && input.startsAt && Date.parse(input.endsAt) < Date.parse(input.startsAt)) return "The end must be after the start.";
  if (ids.length) {
    const rows = await query<{ id: string; status: string }>(`SELECT id, status FROM listings WHERE store_id = ? AND type = 'product' AND id IN (${ids.map(() => "?").join(",")})`, [storeId, ...ids]);
    if (rows.length !== ids.length) return "Choose products from your own store only.";
    if (input.status === "published" && rows.some(row => row.status !== "active")) return "Publish your selected products before publishing this Event.";
  }
  return null;
}
function links(eventId: string, storeId: string, ids: string[]): BatchStatement[] {
  return [...new Set(ids)].map((id, position) => ({
    // Ownership is checked again inside the write transaction, not just on read.
    sql: `INSERT INTO event_products (event_id, product_id, position) SELECT e.id, l.id, ? FROM events e JOIN listings l ON l.store_id = e.store_id WHERE e.id = ? AND e.store_id = ? AND l.id = ? AND l.type = 'product'`,
    args: [position, eventId, storeId, id],
  }));
}
async function uniqueSlug(storeId: string, title: string, id?: string) {
  const base = slugify(title);
  for (let i = 0; i < 40; i++) { const slug = i ? `${base}-${i + 1}` : base; if (!await queryOne("SELECT id FROM events WHERE store_id = ? AND slug = ? AND id != ?", [storeId, slug, id ?? ""])) return slug; }
  return `${base}-${newId("drop")}`;
}
export async function createEvent(storeId: string, input: EventInput): Promise<{ ok: true; eventId: string } | { ok: false; error: string }> {
  const error = await validate(storeId, input); if (error) return { ok: false, error };
  const id = newId("evt"), now = nowIso(), slug = await uniqueSlug(storeId, input.title);
  await batch([{ sql: `INSERT INTO events (id, store_id, title, slug, description, cover_image_url, starts_at, ends_at, timezone, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, args: [id, storeId, input.title.trim(), slug, input.description?.trim() || null, input.coverImageUrl ?? null, input.startsAt || now, input.endsAt || null, input.timezone || "UTC", input.status, now, now] }, ...links(id, storeId, input.productIds)]);
  return { ok: true, eventId: id };
}
export async function updateEvent(id: string, storeId: string, input: EventInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const existing = await getOwnedEvent(id, storeId); if (!existing) return { ok: false, error: "Event not found." };
  const error = await validate(storeId, input); if (error) return { ok: false, error };
  const slug = await uniqueSlug(storeId, input.title, id);
  await batch([{ sql: "UPDATE events SET title = ?, slug = ?, description = ?, cover_image_url = ?, starts_at = ?, ends_at = ?, status = ?, updated_at = ? WHERE id = ? AND store_id = ?", args: [input.title.trim(), slug, input.description?.trim() || null, input.coverImageUrl ?? null, input.startsAt || existing.starts_at, input.endsAt || null, input.status, nowIso(), id, storeId] }, { sql: "DELETE FROM event_products WHERE event_id = ? AND EXISTS (SELECT 1 FROM events WHERE id = ? AND store_id = ?)", args: [id, id, storeId] }, ...links(id, storeId, input.productIds)]);
  return { ok: true };
}
export async function setEventStatus(input: { eventId: string; storeId: string; status: EventInput["status"] }): Promise<{ ok: boolean; error?: string }> {
  const detail = await getEventDetail(input.eventId); if (!detail || detail.storeId !== input.storeId) return { ok: false, error: "Event not found." };
  return updateEvent(input.eventId, input.storeId, { title: detail.title, description: detail.description, coverImageUrl: detail.coverImageUrl, startsAt: detail.startsAt, endsAt: detail.endsAt, status: input.status, productIds: detail.productIds });
}
export async function deleteEvent(input: { eventId: string; storeId: string }): Promise<{ ok: boolean; error?: string }> {
  if (!await getOwnedEvent(input.eventId, input.storeId)) return { ok: false, error: "Event not found." };
  await execute("DELETE FROM events WHERE id = ? AND store_id = ?", [input.eventId, input.storeId]); return { ok: true };
}
