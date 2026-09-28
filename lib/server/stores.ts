/**
 * Store + category data access.
 *
 * Every function here is server-side. Ownership is always enforced by filtering
 * on the owning user id — a store id coming from the client is never trusted on
 * its own.
 */

import "server-only";

import { batch, bool, execute, query, queryOne } from "../db";
import { nowIso } from "../format";
import { newId } from "../ids";
import { handleError, normalizeHandle, slugify } from "../slug";
import type { CategoryRow, StoreRow, StoreSettingsRow } from "../types";

// --- Stores -----------------------------------------------------------------

export async function getStoreById(storeId: string): Promise<StoreRow | null> {
  return queryOne<StoreRow>("SELECT * FROM stores WHERE id = ?", [storeId]);
}

export async function getStoreBySlug(slug: string): Promise<StoreRow | null> {
  return queryOne<StoreRow>("SELECT * FROM stores WHERE slug = ?", [normalizeHandle(slug)]);
}

/** Ownership-checked fetch: returns null if the store is not this user's. */
export async function getOwnedStore(storeId: string, userId: string): Promise<StoreRow | null> {
  return queryOne<StoreRow>("SELECT * FROM stores WHERE id = ? AND user_id = ?", [
    storeId,
    userId,
  ]);
}

export async function isHandleAvailable(slug: string, exceptStoreId?: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    "SELECT id FROM stores WHERE slug = ? AND (? IS NULL OR id != ?)",
    [normalizeHandle(slug), exceptStoreId ?? null, exceptStoreId ?? null],
  );
  return !row;
}

export type CreateStoreInput = {
  userId: string;
  name: string;
  slug: string;
  tagline?: string | null;
  description?: string | null;
  primaryCategory?: string | null;
  currency?: string;
  contactEmail?: string | null;
  contactPhone?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  logoUrl?: string | null;
  bannerUrl?: string | null;
};

export type CreateStoreResult =
  | { ok: true; store: StoreRow }
  | { ok: false; error: string; field?: string };

export async function createStore(input: CreateStoreInput): Promise<CreateStoreResult> {
  const slug = normalizeHandle(input.slug);
  const validation = handleError(slug);
  if (validation) return { ok: false, error: validation, field: "slug" };

  const name = input.name.trim();
  if (name.length < 2) return { ok: false, error: "Store name is too short.", field: "name" };
  if (name.length > 80) return { ok: false, error: "Store name is too long.", field: "name" };

  if (!(await isHandleAvailable(slug))) {
    return { ok: false, error: "That handle is already taken.", field: "slug" };
  }

  const existing = await queryOne<{ id: string }>(
    "SELECT id FROM stores WHERE user_id = ? LIMIT 1",
    [input.userId],
  );
  if (existing) {
    return { ok: false, error: "You already have a store." };
  }

  const id = newId("store");
  const timestamp = nowIso();

  // A store without its settings row would break pricing and payouts later, so
  // both rows are written atomically.
  await batch([
    {
      sql: `INSERT INTO stores
              (id, user_id, slug, name, tagline, description, logo_url, banner_url,
               primary_category, currency, contact_email, contact_phone, city, state, country,
               is_published, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      args: [
        id,
        input.userId,
        slug,
        name,
        input.tagline?.trim() || null,
        input.description?.trim() || null,
        input.logoUrl ?? null,
        input.bannerUrl ?? null,
        input.primaryCategory ?? null,
        input.currency ?? "NGN",
        input.contactEmail?.trim().toLowerCase() || null,
        input.contactPhone?.trim() || null,
        input.city?.trim() || null,
        input.state?.trim() || null,
        input.country?.trim() || "Nigeria",
        timestamp,
        timestamp,
      ],
    },
    {
      sql: "INSERT INTO store_settings (store_id, order_prefix, updated_at) VALUES (?, ?, ?)",
      args: [id, buildOrderPrefix(name), timestamp],
    },
  ]);

  const store = await getStoreById(id);
  if (!store) return { ok: false, error: "The store could not be created." };
  return { ok: true, store };
}

function buildOrderPrefix(name: string): string {
  const letters = name.replace(/[^A-Za-z]/g, "").toUpperCase();
  return letters.slice(0, 3) || "LS";
}

export type UpdateStoreInput = Partial<{
  name: string;
  slug: string;
  tagline: string | null;
  description: string | null;
  primaryCategory: string | null;
  currency: string;
  contactEmail: string | null;
  contactPhone: string | null;
  websiteUrl: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  socials: Record<string, string> | null;
  isPublished: boolean;
}>;

export async function updateStore(
  storeId: string,
  userId: string,
  patch: UpdateStoreInput,
): Promise<{ ok: true; store: StoreRow } | { ok: false; error: string; field?: string }> {
  const store = await getOwnedStore(storeId, userId);
  if (!store) return { ok: false, error: "Store not found." };

  const sets: string[] = [];
  const args: Array<string | number | null> = [];

  const push = (column: string, value: string | number | null) => {
    sets.push(`${column} = ?`);
    args.push(value);
  };

  if (patch.slug !== undefined) {
    const slug = normalizeHandle(patch.slug);
    const validation = handleError(slug);
    if (validation) return { ok: false, error: validation, field: "slug" };
    if (!(await isHandleAvailable(slug, storeId))) {
      return { ok: false, error: "That handle is already taken.", field: "slug" };
    }
    push("slug", slug);
  }

  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (name.length < 2) return { ok: false, error: "Store name is too short.", field: "name" };
    push("name", name);
  }

  if (patch.tagline !== undefined) push("tagline", patch.tagline?.trim() || null);
  if (patch.description !== undefined) push("description", patch.description?.trim() || null);
  if (patch.primaryCategory !== undefined) push("primary_category", patch.primaryCategory || null);
  if (patch.currency !== undefined) push("currency", patch.currency);
  if (patch.contactEmail !== undefined) {
    push("contact_email", patch.contactEmail?.trim().toLowerCase() || null);
  }
  if (patch.contactPhone !== undefined) push("contact_phone", patch.contactPhone?.trim() || null);
  if (patch.websiteUrl !== undefined) push("website_url", patch.websiteUrl?.trim() || null);
  if (patch.address !== undefined) push("address", patch.address?.trim() || null);
  if (patch.city !== undefined) push("city", patch.city?.trim() || null);
  if (patch.state !== undefined) push("state", patch.state?.trim() || null);
  if (patch.country !== undefined) push("country", patch.country?.trim() || null);
  if (patch.logoUrl !== undefined) push("logo_url", patch.logoUrl || null);
  if (patch.bannerUrl !== undefined) push("banner_url", patch.bannerUrl || null);
  if (patch.socials !== undefined) {
    push("socials", patch.socials ? JSON.stringify(patch.socials) : null);
  }
  if (patch.isPublished !== undefined) push("is_published", patch.isPublished ? 1 : 0);

  if (sets.length === 0) return { ok: true, store };

  push("updated_at", nowIso());
  args.push(storeId);

  await execute(`UPDATE stores SET ${sets.join(", ")} WHERE id = ?`, args);

  const updated = await getStoreById(storeId);
  return { ok: true, store: updated ?? store };
}

// --- Settings ---------------------------------------------------------------

export async function getStoreSettings(storeId: string): Promise<StoreSettingsRow> {
  const existing = await queryOne<StoreSettingsRow>(
    "SELECT * FROM store_settings WHERE store_id = ?",
    [storeId],
  );
  if (existing) return existing;

  await execute(
    "INSERT OR IGNORE INTO store_settings (store_id, updated_at) VALUES (?, ?)",
    [storeId, nowIso()],
  );

  const created = await queryOne<StoreSettingsRow>(
    "SELECT * FROM store_settings WHERE store_id = ?",
    [storeId],
  );

  // The insert above guarantees a row; this is a type-level fallback only.
  return (
    created ?? {
      store_id: storeId,
      low_stock_threshold: 5,
      order_prefix: "LS",
      shipping_flat_fee: 0,
      free_shipping_over: null,
      payout_bank_code: null,
      payout_bank_name: null,
      payout_account_number: null,
      payout_account_name: null,
      storefront_sections: null,
      delivery_estimate_min_days: 3,
      delivery_estimate_max_days: 5,
      pickup_location_name: null,
      pickup_address: null,
      pickup_hours: null,
      pickup_instructions: null,
      design_type: null,
      updated_at: nowIso(),
    }
  );
}

export type UpdateSettingsInput = Partial<{
  lowStockThreshold: number;
  orderPrefix: string;
  shippingFlatFee: number;
  freeShippingOver: number | null;
  payoutBankCode: string | null;
  payoutBankName: string | null;
  payoutAccountNumber: string | null;
  payoutAccountName: string | null;
  /** The honest delivery range, in days — an estimate, never a promise. */
  deliveryEstimateMinDays: number;
  deliveryEstimateMaxDays: number;
  /** Where and when a buyer collects a pickup order. */
  pickupLocationName: string | null;
  pickupAddress: string | null;
  pickupHours: string | null;
  pickupInstructions: string | null;
  /**
   * The storefront's lead experience. `"auto"` hands the choice back to the
   * shop's own content; anything else overrides it.
   */
  designType: "auto" | string;
}>;

export async function updateStoreSettings(
  storeId: string,
  userId: string,
  patch: UpdateSettingsInput,
): Promise<{ ok: boolean; error?: string }> {
  const store = await getOwnedStore(storeId, userId);
  if (!store) return { ok: false, error: "Store not found." };

  const sets: string[] = [];
  const args: Array<string | number | null> = [];

  if (patch.lowStockThreshold !== undefined) {
    sets.push("low_stock_threshold = ?");
    args.push(Math.max(0, Math.floor(patch.lowStockThreshold)));
  }
  if (patch.orderPrefix !== undefined) {
    sets.push("order_prefix = ?");
    args.push(patch.orderPrefix.replace(/[^A-Za-z0-9]/g, "").slice(0, 4).toUpperCase() || "LS");
  }
  if (patch.shippingFlatFee !== undefined) {
    sets.push("shipping_flat_fee = ?");
    args.push(Math.max(0, Math.round(patch.shippingFlatFee)));
  }
  if (patch.freeShippingOver !== undefined) {
    sets.push("free_shipping_over = ?");
    args.push(patch.freeShippingOver === null ? null : Math.max(0, Math.round(patch.freeShippingOver)));
  }
  if (patch.payoutBankCode !== undefined) {
    sets.push("payout_bank_code = ?");
    args.push(patch.payoutBankCode?.trim() || null);
  }
  if (patch.payoutBankName !== undefined) {
    sets.push("payout_bank_name = ?");
    args.push(patch.payoutBankName?.trim() || null);
  }
  if (patch.payoutAccountNumber !== undefined) {
    sets.push("payout_account_number = ?");
    args.push(patch.payoutAccountNumber?.trim() || null);
  }
  if (patch.payoutAccountName !== undefined) {
    sets.push("payout_account_name = ?");
    args.push(patch.payoutAccountName?.trim() || null);
  }
  if (patch.deliveryEstimateMinDays !== undefined) {
    sets.push("delivery_estimate_min_days = ?");
    args.push(Math.max(0, Math.floor(patch.deliveryEstimateMinDays)));
  }
  if (patch.deliveryEstimateMaxDays !== undefined) {
    sets.push("delivery_estimate_max_days = ?");
    args.push(Math.max(0, Math.floor(patch.deliveryEstimateMaxDays)));
  }
  if (patch.pickupLocationName !== undefined) {
    sets.push("pickup_location_name = ?");
    args.push(patch.pickupLocationName?.trim() || null);
  }
  if (patch.pickupAddress !== undefined) {
    sets.push("pickup_address = ?");
    args.push(patch.pickupAddress?.trim() || null);
  }
  if (patch.pickupHours !== undefined) {
    sets.push("pickup_hours = ?");
    args.push(patch.pickupHours?.trim() || null);
  }
  if (patch.pickupInstructions !== undefined) {
    sets.push("pickup_instructions = ?");
    args.push(patch.pickupInstructions?.trim() || null);
  }
  if (patch.designType !== undefined) {
    // "auto" clears the override — the storefront goes back to following what
    // the shop actually sells.
    const value = patch.designType.trim();
    sets.push("design_type = ?");
    args.push(value && value !== "auto" ? value : null);
  }

  if (sets.length === 0) return { ok: true };

  await getStoreSettings(storeId);
  sets.push("updated_at = ?");
  args.push(nowIso());
  args.push(storeId);

  await execute(`UPDATE store_settings SET ${sets.join(", ")} WHERE store_id = ?`, args);
  return { ok: true };
}

export function storeIsPublished(store: StoreRow): boolean {
  return bool(store.is_published);
}

export function storeSocials(store: StoreRow): Record<string, string> {
  if (!store.socials) return {};
  try {
    const parsed = JSON.parse(store.socials) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).filter(([, value]) => typeof value === "string" && value) as Array<
        [string, string]
      >,
    );
  } catch {
    return {};
  }
}

// --- Categories -------------------------------------------------------------

export async function listPlatformCategories(): Promise<CategoryRow[]> {
  return query<CategoryRow>(
    "SELECT * FROM categories WHERE store_id IS NULL ORDER BY position ASC, name ASC",
  );
}

export async function listStoreCategories(storeId: string): Promise<CategoryRow[]> {
  return query<CategoryRow>(
    "SELECT * FROM categories WHERE store_id = ? ORDER BY position ASC, name ASC",
    [storeId],
  );
}

/** Platform categories plus this store's own — the seller's picker. */
export async function listAvailableCategories(storeId: string): Promise<CategoryRow[]> {
  return query<CategoryRow>(
    `SELECT * FROM categories
     WHERE store_id IS NULL OR store_id = ?
     ORDER BY (store_id IS NULL) ASC, position ASC, name ASC`,
    [storeId],
  );
}

export async function getCategory(id: string): Promise<CategoryRow | null> {
  return queryOne<CategoryRow>("SELECT * FROM categories WHERE id = ?", [id]);
}

export async function createCategory(input: {
  storeId: string;
  userId: string;
  name: string;
  kind?: string;
  icon?: string | null;
}): Promise<{ ok: true; category: CategoryRow } | { ok: false; error: string }> {
  const store = await getOwnedStore(input.storeId, input.userId);
  if (!store) return { ok: false, error: "Store not found." };

  const name = input.name.trim();
  if (name.length < 2) return { ok: false, error: "Category name is too short." };
  if (name.length > 60) return { ok: false, error: "Category name is too long." };

  const slug = slugify(name);
  const clash = await queryOne<{ id: string }>(
    "SELECT id FROM categories WHERE store_id = ? AND slug = ?",
    [input.storeId, slug],
  );
  if (clash) return { ok: false, error: "You already have a category with that name." };

  const positionRow = await queryOne<{ next: number }>(
    "SELECT COALESCE(MAX(position), 0) + 1 AS next FROM categories WHERE store_id = ?",
    [input.storeId],
  );

  const id = newId("cat");
  await execute(
    `INSERT INTO categories (id, store_id, name, slug, kind, icon, position, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.storeId,
      name,
      slug,
      input.kind ?? "general",
      input.icon ?? null,
      positionRow?.next ?? 1,
      nowIso(),
    ],
  );

  const category = await getCategory(id);
  if (!category) return { ok: false, error: "The category could not be created." };
  return { ok: true, category };
}

export async function updateCategory(input: {
  id: string;
  storeId: string;
  userId: string;
  name?: string;
  kind?: string;
  icon?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const store = await getOwnedStore(input.storeId, input.userId);
  if (!store) return { ok: false, error: "Store not found." };

  // Platform categories are shared and must never be renamed by a seller.
  const category = await queryOne<CategoryRow>(
    "SELECT * FROM categories WHERE id = ? AND store_id = ?",
    [input.id, input.storeId],
  );
  if (!category) return { ok: false, error: "Category not found." };

  const sets: string[] = [];
  const args: Array<string | number | null> = [];

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (name.length < 2) return { ok: false, error: "Category name is too short." };
    sets.push("name = ?", "slug = ?");
    args.push(name, slugify(name));
  }
  if (input.kind !== undefined) {
    sets.push("kind = ?");
    args.push(input.kind);
  }
  if (input.icon !== undefined) {
    sets.push("icon = ?");
    args.push(input.icon || null);
  }

  if (sets.length === 0) return { ok: true };

  args.push(input.id, input.storeId);
  await execute(
    `UPDATE categories SET ${sets.join(", ")} WHERE id = ? AND store_id = ?`,
    args,
  );
  return { ok: true };
}

export async function deleteCategory(input: {
  id: string;
  storeId: string;
  userId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const store = await getOwnedStore(input.storeId, input.userId);
  if (!store) return { ok: false, error: "Store not found." };

  const category = await queryOne<CategoryRow>(
    "SELECT * FROM categories WHERE id = ? AND store_id = ?",
    [input.id, input.storeId],
  );
  if (!category) return { ok: false, error: "Category not found." };

  // Listings keep existing; `ON DELETE SET NULL` simply uncategorises them.
  await execute("DELETE FROM categories WHERE id = ? AND store_id = ?", [
    input.id,
    input.storeId,
  ]);
  return { ok: true };
}

export async function countStoreListingsByCategory(storeId: string): Promise<Record<string, number>> {
  const rows = await query<{ category_id: string | null; total: number }>(
    `SELECT category_id, COUNT(*) AS total FROM listings
     WHERE store_id = ? AND category_id IS NOT NULL AND status != 'archived'
     GROUP BY category_id`,
    [storeId],
  );

  return Object.fromEntries(
    rows.filter((row) => row.category_id).map((row) => [row.category_id as string, Number(row.total)]),
  );
}
