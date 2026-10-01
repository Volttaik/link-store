/**
 * Listing data access — Link Store's universal sellable entity.
 *
 * Products, fashion, electronics, food, services, vehicles and digital goods
 * are all rows here; `type` (see lib/catalog.ts) drives the differences. This is
 * why the workspace can share one editor and one checkout across categories.
 */

import "server-only";

import { batch, bool, execute, query, queryOne, type BatchStatement } from "../db";
import { isGenericCategory, isSupportedCategory } from "../categories";
import { nowIso } from "../format";
import { newId } from "../ids";
import { slugify } from "../slug";
import { listingTypeMeta, type FulfilmentMode, type ListingType } from "../catalog";
import type {
  ListingCardData,
  ListingDetail,
  ListingImageRow,
  ListingRow,
  ListingStatus,
  ListingVariantRow,
} from "../types";

type ListingJoinRow = ListingRow & {
  store_name: string;
  store_slug: string;
  store_logo_url: string | null;
  category_name: string | null;
  image_url: string | null;
  variant_count: number;
  /** Latest digital file, so a digital card can name what is delivered. */
  /** The event a ticket listing sells admission to, where one is linked. */
};

const LISTING_SELECT = `
  SELECT l.*,
         s.name       AS store_name,
         s.slug       AS store_slug,
         s.logo_url   AS store_logo_url,
         c.name       AS category_name,
         (SELECT COUNT(*) FROM listing_variants lv
           WHERE lv.listing_id = l.id) AS variant_count,
         (SELECT li.image_url FROM listing_images li
           WHERE li.listing_id = l.id
           ORDER BY li.position ASC, li.created_at ASC LIMIT 1) AS image_url
  FROM listings l
  JOIN stores s ON s.id = l.store_id
  LEFT JOIN categories c ON c.id = l.category_id`;

/** The columns a module facet is allowed to filter on. */
export type FilterableColumn =
  | "type"
  | "fulfilment"
  | "service_mode"
  | "duration_minutes"
  | "prep_time_minutes";

const FILTERABLE_COLUMNS: FilterableColumn[] = [
  "type",
  "fulfilment",
  "service_mode",
  "duration_minutes",
  "prep_time_minutes",
];

export function mapListingCard(row: ListingJoinRow): ListingCardData {
  // The listing's own JSON, plus the one fact that lives in another table: the
  // file a digital download delivers. Folding it in here keeps every consumer of
  // a card reading one shape, and the file name is exactly what a digital card
  // has to say for itself.
  const attributes = parseJsonObject(row.attributes);

  return {
    id: row.id,
    storeId: row.store_id,
    storeName: row.store_name,
    storeSlug: row.store_slug,
    storeLogoUrl: row.store_logo_url,
    title: row.title,
    slug: row.slug,
    type: row.type,
    fulfilment: row.fulfilment,
    price: Number(row.price),
    compareAtPrice: row.compare_at_price === null ? null : Number(row.compare_at_price),
    currency: row.currency,
    imageUrl: row.image_url,
    categoryName: isGenericCategory(row.category_name) ? null : row.category_name,
    categoryId: row.category_id,
    status: row.status,
    stock: Number(row.stock),
    trackInventory: bool(row.track_inventory),
    isFeatured: bool(row.is_featured),
    variantCount: Number(row.variant_count ?? 0),
    viewsCount: Number(row.views_count),
    createdAt: row.created_at,
    eventId: null,
    durationMinutes: row.duration_minutes,
    serviceMode: row.service_mode,
    prepTimeMinutes: row.prep_time_minutes,
    attributes,
  };
}

function parseJsonObject(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

// --- Queries ----------------------------------------------------------------

/**
 * A filter on the listing's own `attributes` JSON, run in SQL.
 *
 * A module's filters are part of **that module's data requirements** (a menu item
 * is filtered by diet, a rental by bedrooms), and those facts live in the
 * listing's `attributes` column rather than in a table of their own. Filtering
 * them here — rather than fetching everything and sieving it in the browser — is
 * what keeps a filtered view a real, pageable question about the catalogue.
 *
 * `key` is always one the module registry declares, so the JSON path is never
 * built from anything a caller typed.
 */
export type AttributeFilter = {
  key: string;
  /** Exact match on a scalar (`condition`, `propertyType`, `licenceType`). */
  equals?: string;
  /** Case-insensitive substring on a scalar (`brand`, `fileFormat`). */
  contains?: string;
  /** Membership of an array value — matches when the array holds this (`dietary`). */
  includes?: string;
  /** Numeric lower / upper bound (`bedrooms`). */
  min?: number;
  max?: number;
  /** True when the flag is set (`orderViaChat`, `includesUpdates`). */
  flag?: boolean;
};

export type ListingQuery = {
  storeId?: string;
  types?: string[];
  categoryId?: string | null;
  /**
   * A category and everything beneath it.
   *
   * Choosing "Fashion & Apparel" has to find the garments filed under "Clothing"
   * and "Men's Clothing" too, or the tree would only work for its leaves.
   */
  categoryIds?: string[];
  status?: ListingStatus | "all";
  search?: string;
  minPrice?: number;
  maxPrice?: number;
  inStockOnly?: boolean;
  featuredOnly?: boolean;
  onlyPublishedStores?: boolean;
  /** Filters on the listing's own `attributes` JSON, applied in SQL. */
  attributes?: AttributeFilter[];
  /**
   * Filters on the structural columns a module's facets name — how a service is
   * delivered, how long a menu item takes. Only the columns below are accepted,
   * so a filter can never become an injection point.
   */
  columnFilters?: Array<{ column: FilterableColumn; value?: string; min?: number; max?: number }>;
  sort?: "newest" | "oldest" | "price_asc" | "price_desc" | "popular" | "title";
  limit?: number;
  offset?: number;
};

const SORTS: Record<NonNullable<ListingQuery["sort"]>, string> = {
  newest: "l.created_at DESC",
  oldest: "l.created_at ASC",
  price_asc: "l.price ASC",
  price_desc: "l.price DESC",
  popular: "l.views_count DESC, l.created_at DESC",
  title: "l.title ASC",
};

function buildListingWhere(input: ListingQuery): { clause: string; args: Array<string | number> } {
  const conditions: string[] = ["l.type = 'product'"];
  const args: Array<string | number> = [];

  if (input.storeId) {
    conditions.push("l.store_id = ?");
    args.push(input.storeId);
  }

  if (input.types && input.types.length > 0) {
    conditions.push(`l.type IN (${input.types.map(() => "?").join(", ")})`);
    args.push(...input.types);
  }

  if (input.categoryId) {
    conditions.push("l.category_id = ?");
    args.push(input.categoryId);
  }

  if (input.categoryIds && input.categoryIds.length > 0) {
    conditions.push(`l.category_id IN (${input.categoryIds.map(() => "?").join(", ")})`);
    args.push(...input.categoryIds);
  }

  for (const filter of input.attributes ?? []) {
    const path = `$.${filter.key}`;

    if (typeof filter.equals === "string") {
      conditions.push("json_extract(l.attributes, ?) = ?");
      args.push(path, filter.equals);
    }

    if (typeof filter.contains === "string") {
      conditions.push(
        "LOWER(COALESCE(json_extract(l.attributes, ?), '')) LIKE ?",
      );
      args.push(path, `%${filter.contains.trim().toLowerCase()}%`);
    }

    if (typeof filter.includes === "string") {
      // A multi-choice fact is stored as an array, so membership is asked of the
      // array itself. `json_valid` guards a listing whose JSON was never written.
      conditions.push(
        "(l.attributes IS NOT NULL AND json_valid(l.attributes) AND EXISTS (" +
          "SELECT 1 FROM json_each(l.attributes, ?) entry WHERE entry.value = ?))",
      );
      args.push(path, filter.includes);
    }

    if (typeof filter.min === "number") {
      conditions.push("CAST(json_extract(l.attributes, ?) AS REAL) >= ?");
      args.push(path, filter.min);
    }

    if (typeof filter.max === "number") {
      conditions.push("CAST(json_extract(l.attributes, ?) AS REAL) <= ?");
      args.push(path, filter.max);
    }

    if (filter.flag) {
      // A checkbox fact is stored as a real JSON boolean, which `json_extract`
      // reports as 1; the string form is accepted too, because a value written
      // before the flag existed may be one.
      conditions.push("json_extract(l.attributes, ?) IN (1, 'true')");
      args.push(path);
    }
  }

  for (const filter of input.columnFilters ?? []) {
    if (!FILTERABLE_COLUMNS.includes(filter.column)) continue;
    const column = `l.${filter.column}`;

    if (typeof filter.value === "string") {
      conditions.push(`${column} = ?`);
      args.push(filter.value);
    }

    if (typeof filter.min === "number") {
      conditions.push(`${column} IS NOT NULL AND ${column} >= ?`);
      args.push(filter.min);
    }

    if (typeof filter.max === "number") {
      conditions.push(`${column} IS NOT NULL AND ${column} <= ?`);
      args.push(filter.max);
    }
  }

  if (input.status && input.status !== "all") {
    conditions.push("l.status = ?");
    args.push(input.status);
  }

  if (input.search) {
    const term = `%${input.search.trim().toLowerCase()}%`;
    conditions.push("(LOWER(l.title) LIKE ? OR LOWER(COALESCE(l.description, '')) LIKE ?)");
    args.push(term, term);
  }

  if (typeof input.minPrice === "number") {
    conditions.push("l.price >= ?");
    args.push(input.minPrice);
  }

  if (typeof input.maxPrice === "number") {
    conditions.push("l.price <= ?");
    args.push(input.maxPrice);
  }

  if (input.inStockOnly) {
    conditions.push("(l.track_inventory = 0 OR l.stock > 0)");
  }

  if (input.featuredOnly) {
    conditions.push("l.is_featured = 1");
  }

  if (input.onlyPublishedStores) {
    conditions.push("s.is_published = 1");
  }

  return {
    clause: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "",
    args,
  };
}

export async function listListings(input: ListingQuery = {}): Promise<ListingCardData[]> {
  const { clause, args } = buildListingWhere(input);
  const order = SORTS[input.sort ?? "newest"];
  const limit = Math.min(Math.max(input.limit ?? 24, 1), 100);
  const offset = Math.max(input.offset ?? 0, 0);

  const rows = await query<ListingJoinRow>(
    `${LISTING_SELECT} ${clause} ORDER BY ${order} LIMIT ? OFFSET ?`,
    [...args, limit, offset],
  );

  return rows.map(mapListingCard);
}

/** Store-scoped Event picker; does not silently truncate a store at 100 products. */
export async function listProductsForEvent(storeId: string, options: { activeOnly?: boolean; productIds?: string[] } = {}): Promise<ListingCardData[]> {
  if (options.productIds && !options.productIds.length) return [];
  const ids = options.productIds;
  const rows = await query<ListingJoinRow>(`${LISTING_SELECT} WHERE l.store_id = ? AND l.type = 'product' ${options.activeOnly ? "AND l.status = 'active'" : ""} ${ids ? `AND l.id IN (${ids.map(() => "?").join(",")})` : ""} ORDER BY l.created_at DESC`, [storeId, ...(ids ?? [])]);
  return rows.map(mapListingCard);
}

export async function countListings(input: ListingQuery = {}): Promise<number> {
  const { clause, args } = buildListingWhere(input);
  const row = await queryOne<{ total: number }>(
    `SELECT COUNT(*) AS total FROM listings l JOIN stores s ON s.id = l.store_id ${clause}`,
    args,
  );
  return Number(row?.total ?? 0);
}

/** Aggregated counts per status for the workspace listings header. */
export async function listingStatusCounts(
  storeId: string,
  types?: string[],
): Promise<Record<string, number>> {
  const typeClause = types && types.length > 0 ? `AND type IN (${types.map(() => "?").join(", ")})` : "";
  const rows = await query<{ status: string; total: number }>(
    `SELECT status, COUNT(*) AS total FROM listings WHERE store_id = ? ${typeClause} GROUP BY status`,
    [storeId, ...(types ?? [])],
  );

  const counts = { all: 0, draft: 0, active: 0, archived: 0 } as Record<string, number>;
  for (const row of rows) {
    counts[row.status] = Number(row.total);
    counts.all += Number(row.total);
  }
  return counts;
}

export async function getListingRow(listingId: string): Promise<ListingRow | null> {
  return queryOne<ListingRow>("SELECT * FROM listings WHERE id = ?", [listingId]);
}

export async function getOwnedListing(
  listingId: string,
  storeId: string,
): Promise<ListingRow | null> {
  return queryOne<ListingRow>("SELECT * FROM listings WHERE id = ? AND store_id = ? AND type = 'product'", [
    listingId,
    storeId,
  ]);
}

export async function listListingImages(listingId: string): Promise<ListingImageRow[]> {
  return query<ListingImageRow>(
    "SELECT * FROM listing_images WHERE listing_id = ? ORDER BY position ASC, created_at ASC",
    [listingId],
  );
}

export async function listListingVariants(listingId: string): Promise<ListingVariantRow[]> {
  return query<ListingVariantRow>(
    "SELECT * FROM listing_variants WHERE listing_id = ? ORDER BY position ASC, created_at ASC",
    [listingId],
  );
}

export async function getVariant(variantId: string): Promise<ListingVariantRow | null> {
  return queryOne<ListingVariantRow>("SELECT * FROM listing_variants WHERE id = ?", [variantId]);
}

/** Full detail for the product page and the workspace editor. */
export async function getListingDetail(listingId: string): Promise<ListingDetail | null> {
  const row = await queryOne<ListingJoinRow>(`${LISTING_SELECT} WHERE l.id = ? AND l.type = 'product'`, [listingId]);
  if (!row) return null;

  const [images, variants, digitalAssets, store] = await Promise.all([
    listListingImages(row.id),
    listListingVariants(row.id),
    Promise.resolve([]),
    queryOne<{
      currency: string;
      city: string | null;
      country: string | null;
      is_published: number;
      contact_email: string | null;
      contact_phone: string | null;
      description: string | null;
      tagline: string | null;
    }>(
      `SELECT currency, city, country, is_published, contact_email, contact_phone, description, tagline
       FROM stores WHERE id = ?`,
      [row.store_id],
    ),
  ]);

  return {
    ...mapListingCard(row),
    subtitle: row.subtitle,
    description: row.description,
    sku: row.sku,
    durationMinutes: row.duration_minutes,
    serviceMode: row.service_mode,
    prepTimeMinutes: row.prep_time_minutes,
    attributes: parseJsonObject(row.attributes),
    images,
    variants,
    digitalAssets,
    categoryId: row.category_id,
    costPrice: row.cost_price,
    storeCurrency: store?.currency ?? row.currency,
    storeCity: store?.city ?? null,
    storeCountry: store?.country ?? null,
    storePublished: bool(store?.is_published),
    storeContactEmail: store?.contact_email ?? null,
    storeContactPhone: store?.contact_phone ?? null,
    storeDescription: store?.description ?? null,
    storeTagline: store?.tagline ?? null,
  };
}

export async function getListingBySlugWithinStore(
  storeId: string,
  slug: string,
): Promise<ListingRow | null> {
  return queryOne<ListingRow>("SELECT * FROM listings WHERE store_id = ? AND slug = ?", [
    storeId,
    slug,
  ]);
}

// --- Writes -----------------------------------------------------------------

export type ListingInput = {
  type: ListingType;
  title: string;
  subtitle?: string | null;
  description?: string | null;
  categoryId?: string | null;
  price: number;
  compareAtPrice?: number | null;
  costPrice?: number | null;
  sku?: string | null;
  trackInventory: boolean;
  stock: number;
  durationMinutes?: number | null;
  serviceMode?: string | null;
  prepTimeMinutes?: number | null;
  attributes?: Record<string, unknown>;
  status: ListingStatus;
  isFeatured: boolean;
  images: Array<{ url: string; key: string | null; alt?: string | null }>;
  variants: Array<{
    id?: string;
    name: string;
    sku?: string | null;
    price?: number | null;
    stock: number;
    attributes?: Record<string, unknown>;
  }>;
};

async function validateProductInput(storeId: string, input: ListingInput): Promise<string | null> {
  if (input.type !== "product") return "Only products can be sold.";
  if (!Number.isSafeInteger(input.price) || input.price < 0) return "Enter a valid product price.";
  if (!Number.isSafeInteger(input.stock) || input.stock < 0) return "Enter a whole stock quantity.";
  if (!["draft", "active", "archived"].includes(input.status)) return "Choose a valid status.";
  if (input.compareAtPrice != null && (!Number.isSafeInteger(input.compareAtPrice) || input.compareAtPrice < 0)) return "Enter a valid compare-at price.";
  if (input.status === "active" && !input.categoryId) return "Category required before publishing.";
  if (input.status === "active" && (!Array.isArray(input.images) || !input.images.length)) return "Product image required before publishing.";
  if (input.categoryId) {
    const category = await queryOne<{ name: string; slug: string }>("SELECT name, slug FROM categories WHERE id = ? AND kind = 'product' AND (store_id IS NULL OR store_id = ?)", [input.categoryId, storeId]);
    if (!category || !isSupportedCategory(category)) return "Choose a specific product category belonging to your store.";
  }
  if (!Array.isArray(input.images) || input.images.length > 12 || input.images.some(image => typeof image.url !== "string" || !/^(https?:\/\/|\/api\/files\/)/.test(image.url))) return "Choose valid product photos.";
  if (!Array.isArray(input.variants) || input.variants.length > 60 || input.variants.some(variant => !variant.name?.trim() || !Number.isSafeInteger(variant.stock) || variant.stock < 0 || (variant.price != null && (!Number.isSafeInteger(variant.price) || variant.price < 0)))) return "Check your product options, prices and stock.";
  return null;
}

async function uniqueListingSlug(storeId: string, title: string, excludeId?: string): Promise<string> {
  const base = slugify(title);
  let candidate = base;

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const clash = await queryOne<{ id: string }>(
      "SELECT id FROM listings WHERE store_id = ? AND slug = ? AND (? IS NULL OR id != ?)",
      [storeId, candidate, excludeId ?? null, excludeId ?? null],
    );
    if (!clash) return candidate;
    candidate = `${base}-${attempt + 2}`;
  }

  return `${base}-${Date.now().toString(36)}`;
}

export async function createListing(
  storeId: string,
  input: ListingInput,
): Promise<{ ok: true; listingId: string } | { ok: false; error: string }> {
  const title = input.title.trim();
  if (title.length < 2) return { ok: false, error: "Give this listing a name." };
  const validationError = await validateProductInput(storeId, input);
  if (validationError) return { ok: false, error: validationError };

  const id = newId("lst");
  const timestamp = nowIso();
  const [slug, currency] = await Promise.all([
    uniqueListingSlug(storeId, title),
    storeCurrency(storeId),
  ]);
  const meta = listingTypeMeta(input.type);
  const attributes = buildAttributes(input);

  const statements: BatchStatement[] = [
    {
      sql: `INSERT INTO listings
              (id, store_id, category_id, type, fulfilment, title, slug, subtitle, description,
               currency, price, compare_at_price, cost_price, sku, track_inventory, stock,
               duration_minutes, service_mode, prep_time_minutes, attributes, status, is_featured,
               views_count, published_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
      args: [
        id,
        storeId,
        input.categoryId ?? null,
        input.type,
        meta.fulfilment,
        title,
        slug,
        input.subtitle?.trim() || null,
        input.description?.trim() || null,
        currency,
        input.price,
        input.compareAtPrice ?? null,
        input.costPrice ?? null,
        input.sku?.trim() || null,
        input.trackInventory ? 1 : 0,
        input.trackInventory ? (input.variants.length ? input.variants.reduce((total, variant) => total + variant.stock, 0) : input.stock) : 0,
        input.durationMinutes ?? null,
        input.serviceMode ?? null,
        input.prepTimeMinutes ?? null,
        attributes,
        input.status,
        input.isFeatured ? 1 : 0,
        input.status === "active" ? timestamp : null,
        timestamp,
        timestamp,
      ],
    },
  ];

  statements.push(...imageStatements(id, input.images));
  statements.push(...variantStatements(id, input.variants));

  if (input.trackInventory && input.stock > 0) {
    statements.push({
      sql: `INSERT INTO inventory_movements
              (id, store_id, listing_id, variant_id, delta, reason, note, reference, stock_after, created_at)
            VALUES (?, ?, ?, NULL, ?, 'restock', 'Opening stock', NULL, ?, ?)`,
      args: [newId("inv"), storeId, id, Math.floor(input.stock), Math.floor(input.stock), timestamp],
    });
  }

  await batch(statements);
  return { ok: true, listingId: id };
}

export async function updateListing(
  listingId: string,
  storeId: string,
  input: ListingInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const existing = await getOwnedListing(listingId, storeId);
  if (!existing) return { ok: false, error: "Listing not found." };

  const title = input.title.trim();
  if (title.length < 2) return { ok: false, error: "Give this listing a name." };
  const validationError = await validateProductInput(storeId, input);
  if (validationError) return { ok: false, error: validationError };

  const timestamp = nowIso();
  const meta = listingTypeMeta(input.type);
  const slug =
    slugify(title) === existing.slug
      ? existing.slug
      : await uniqueListingSlug(storeId, title, listingId);

  const nextStatus = input.status;
  const publishedAt =
    nextStatus === "active" ? existing.published_at ?? timestamp : existing.published_at;

  const previousVariants = await listListingVariants(listingId);
  const previousById = new Map(previousVariants.map(variant => [variant.id, variant]));
  const submittedIds = input.variants.flatMap(variant => variant.id ? [variant.id] : []);
  if (new Set(submittedIds).size !== submittedIds.length || submittedIds.some(id => !previousById.has(id))) {
    return { ok: false, error: "One of these product options is no longer available. Reload and try again." };
  }
  const stock = input.trackInventory
    ? (input.variants.length ? input.variants.reduce((total, variant) => total + variant.stock, 0) : input.stock)
    : 0;
  const stockDelta = stock - Number(existing.stock);

  const statements: BatchStatement[] = [
    {
      sql: `UPDATE listings SET
              category_id = ?, type = ?, fulfilment = ?, title = ?, slug = ?, subtitle = ?,
              description = ?, price = ?, compare_at_price = ?, cost_price = ?, sku = ?,
              track_inventory = ?, stock = ?, duration_minutes = ?, service_mode = ?,
              prep_time_minutes = ?, attributes = ?, status = ?, is_featured = ?,
              published_at = ?, updated_at = ?
            WHERE id = ? AND store_id = ?`,
      args: [
        input.categoryId ?? null,
        input.type,
        meta.fulfilment,
        title,
        slug,
        input.subtitle?.trim() || null,
        input.description?.trim() || null,
        input.price,
        input.compareAtPrice ?? null,
        input.costPrice ?? null,
        input.sku?.trim() || null,
        input.trackInventory ? 1 : 0,
        stock,
        input.durationMinutes ?? null,
        input.serviceMode ?? null,
        input.prepTimeMinutes ?? null,
        buildAttributes(input),
        input.status,
        input.isFeatured ? 1 : 0,
        publishedAt,
        timestamp,
        listingId,
        storeId,
      ],
    },
    // Media is fully replaced on save — the editor always submits the final set.
    { sql: "DELETE FROM listing_images WHERE listing_id = ?", args: [listingId] },

  ];

  statements.push(...imageStatements(listingId, input.images));

  // Keep stable option identities for carts, purchased items and stock history.
  for (const previous of previousVariants) {
    if (!submittedIds.includes(previous.id)) {
      statements.push({ sql: "DELETE FROM listing_variants WHERE id = ? AND listing_id = ?", args: [previous.id, listingId] });
    }
  }
  input.variants.forEach((variant, position) => {
    if (!variant.id) {
      statements.push(...variantStatements(listingId, [variant]).map(statement => {
        statement.args![7] = position;
        return statement;
      }));
      return;
    }
    statements.push({
      sql: "UPDATE listing_variants SET name = ?, sku = ?, price = ?, stock = ?, attributes = ?, position = ? WHERE id = ? AND listing_id = ?",
      args: [variant.name.trim().slice(0, 80), variant.sku?.trim() || null, variant.price ?? null, variant.stock,
        variant.attributes ? JSON.stringify(variant.attributes) : null, position, variant.id, listingId],
    });
  });

  if (input.trackInventory && stockDelta !== 0) {
    statements.push({
      sql: `INSERT INTO inventory_movements
              (id, store_id, listing_id, variant_id, delta, reason, note, reference, stock_after, created_at)
            VALUES (?, ?, ?, NULL, ?, 'adjustment', 'Updated from listing editor', NULL, ?, ?)`,
      args: [newId("inv"), storeId, listingId, stockDelta, stock, timestamp],
    });
  }

  for (const variant of input.variants) {
    if (!input.trackInventory) continue;
    const previous = variant.id ? Number(previousById.get(variant.id)?.stock) : undefined;
    if (previous === undefined || previous === variant.stock) continue;
    const delta = variant.stock - previous;
    if (delta === 0) continue;
    statements.push({
      sql: `INSERT INTO inventory_movements
              (id, store_id, listing_id, variant_id, delta, reason, note, reference, stock_after, created_at)
            VALUES (?, ?, ?, (SELECT id FROM listing_variants WHERE listing_id = ? AND name = ? LIMIT 1),
                    ?, 'adjustment', 'Variant stock updated', NULL, ?, ?)`,
      args: [
        newId("inv"),
        storeId,
        listingId,
        listingId,
        variant.name,
        delta,
        variant.stock,
        timestamp,
      ],
    });
  }

  await batch(statements);
  return { ok: true };
}

function buildAttributes(input: ListingInput): string | null {
  const attributes = { ...(input.attributes ?? {}) };
  return Object.keys(attributes).length > 0 ? JSON.stringify(attributes) : null;
}

function imageStatements(
  listingId: string,
  images: ListingInput["images"],
): BatchStatement[] {
  return images.slice(0, 12).map((image, index) => ({
    sql: `INSERT INTO listing_images (id, listing_id, image_url, storage_key, alt, position, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      newId("img"),
      listingId,
      image.url,
      image.key ?? null,
      image.alt ?? null,
      index,
      nowIso(),
    ],
  }));
}

function variantStatements(
  listingId: string,
  variants: ListingInput["variants"],
): BatchStatement[] {
  return variants.slice(0, 60).map((variant, index) => ({
    sql: `INSERT INTO listing_variants (id, listing_id, name, sku, price, stock, attributes, position, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      newId("var"),
      listingId,
      variant.name.trim().slice(0, 80),
      variant.sku?.trim() || null,
      variant.price ?? null,
      Math.max(0, Math.floor(variant.stock)),
      variant.attributes && Object.keys(variant.attributes).length > 0
        ? JSON.stringify(variant.attributes)
        : null,
      index,
      nowIso(),
    ],
  }));
}

async function storeCurrency(storeId: string): Promise<string> {
  const row = await queryOne<{ currency: string }>(
    "SELECT currency FROM stores WHERE id = ?",
    [storeId],
  );
  return row?.currency ?? "NGN";
}

export async function setListingStatus(input: {
  listingId: string;
  storeId: string;
  status: ListingStatus;
}): Promise<{ ok: boolean; error?: string }> {
  const existing = await getOwnedListing(input.listingId, input.storeId);
  if (!existing) return { ok: false, error: "Listing not found." };

  if (!["draft", "active", "archived"].includes(input.status)) return { ok: false, error: "Choose a valid status." };
  if (input.status === "active") {
    const detail = await getListingDetail(input.listingId);
    if (!detail?.categoryId) return { ok: false, error: "Open Edit Product and choose a category before publishing." };
    const category = await queryOne<{ name: string; slug: string }>("SELECT name, slug FROM categories WHERE id = ? AND kind = 'product' AND (store_id IS NULL OR store_id = ?)", [detail.categoryId, input.storeId]);
    if (!category || !isSupportedCategory(category)) return { ok: false, error: "Open Edit Product and choose a current category before publishing." };
    if (!detail.images.length) return { ok: false, error: "Open Edit Product and add a photo before publishing." };
  }
  const timestamp = nowIso();
  await execute(
    `UPDATE listings SET status = ?, published_at = ?, updated_at = ? WHERE id = ? AND store_id = ?`,
    [
      input.status,
      input.status === "active" ? existing.published_at ?? timestamp : existing.published_at,
      timestamp,
      input.listingId,
      input.storeId,
    ],
  );
  return { ok: true };
}

export async function deleteListing(input: {
  listingId: string;
  storeId: string;
  userId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const existing = await getOwnedListing(input.listingId, input.storeId);
  if (!existing) return { ok: false, error: "Listing not found." };

  await execute("DELETE FROM listings WHERE id = ? AND store_id = ?", [
    input.listingId,
    input.storeId,
  ]);
  return { ok: true };
}

export async function setListingFeatured(input: {
  listingId: string;
  storeId: string;
  featured: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const existing = await getOwnedListing(input.listingId, input.storeId);
  if (!existing) return { ok: false, error: "Listing not found." };

  await execute("UPDATE listings SET is_featured = ?, updated_at = ? WHERE id = ? AND store_id = ?", [
    input.featured ? 1 : 0,
    nowIso(),
    input.listingId,
    input.storeId,
  ]);
  return { ok: true };
}

// --- Inventory --------------------------------------------------------------

export async function adjustInventory(input: {
  listingId: string;
  storeId: string;
  delta: number;
  reason: "restock" | "adjustment" | "sale" | "return" | "cancellation";
  note?: string | null;
  variantId?: string | null;
  reference?: string | null;
}): Promise<{ ok: true; stock: number } | { ok: false; error: string }> {
  const listing = await getOwnedListing(input.listingId, input.storeId);
  if (!listing) return { ok: false, error: "Listing not found." };
  if (input.delta === 0) return { ok: false, error: "Enter a quantity to add or remove." };

  const timestamp = nowIso();

  if (input.variantId) {
    const variant = await queryOne<ListingVariantRow>(
      "SELECT * FROM listing_variants WHERE id = ? AND listing_id = ?",
      [input.variantId, input.listingId],
    );
    if (!variant) return { ok: false, error: "Variant not found." };

    const nextStock = Math.max(0, Number(variant.stock) + input.delta);

    await batch([
      {
        sql: "UPDATE listing_variants SET stock = ? WHERE id = ?",
        args: [nextStock, input.variantId],
      },
      {
        sql: `INSERT INTO inventory_movements
                (id, store_id, listing_id, variant_id, delta, reason, note, reference, stock_after, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          newId("inv"),
          input.storeId,
          input.listingId,
          input.variantId,
          input.delta,
          input.reason,
          input.note ?? null,
          input.reference ?? null,
          nextStock,
          timestamp,
        ],
      },
      {
        sql: "UPDATE listings SET updated_at = ? WHERE id = ?",
        args: [timestamp, input.listingId],
      },
    ]);

    // A listing's headline stock mirrors its variants so discovery filters stay
    // accurate without a join.
    const totals = await queryOne<{ total: number }>(
      "SELECT COALESCE(SUM(stock), 0) AS total FROM listing_variants WHERE listing_id = ?",
      [input.listingId],
    );
    await execute("UPDATE listings SET stock = ? WHERE id = ?", [
      Number(totals?.total ?? 0),
      input.listingId,
    ]);

    return { ok: true, stock: nextStock };
  }

  const nextStock = Math.max(0, Number(listing.stock) + input.delta);

  await batch([
    { sql: "UPDATE listings SET stock = ?, updated_at = ? WHERE id = ?", args: [nextStock, timestamp, input.listingId] },
    {
      sql: `INSERT INTO inventory_movements
              (id, store_id, listing_id, variant_id, delta, reason, note, reference, stock_after, created_at)
            VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)`,
      args: [
        newId("inv"),
        input.storeId,
        input.listingId,
        input.delta,
        input.reason,
        input.note ?? null,
        input.reference ?? null,
        nextStock,
        timestamp,
      ],
    },
  ]);

  return { ok: true, stock: nextStock };
}

export async function listInventoryMovements(
  storeId: string,
  limit = 50,
): Promise<Array<{ id: string; listing_id: string; title: string; delta: number; reason: string; stock_after: number; note: string | null; created_at: string }>> {
  return query(
    `SELECT m.id, m.listing_id, l.title, m.delta, m.reason, m.stock_after, m.note, m.created_at
     FROM inventory_movements m
     JOIN listings l ON l.id = m.listing_id
     WHERE m.store_id = ?
     ORDER BY m.created_at DESC
     LIMIT ?`,
    [storeId, limit],
  );
}

/** Listings at or below the store's low-stock threshold. */
export async function listLowStock(
  storeId: string,
  threshold: number,
): Promise<Array<{ id: string; title: string; stock: number; type: string; slug: string }>> {
  return query(
    `SELECT id, title, stock, type, slug FROM listings
     WHERE store_id = ? AND track_inventory = 1 AND status != 'archived' AND stock <= ?
     ORDER BY stock ASC, title ASC
     LIMIT 50`,
    [storeId, threshold],
  );
}

/** Increment the denormalised view counter (listing page + analytics pair up). */
export async function incrementListingViews(listingId: string): Promise<void> {
  await execute("UPDATE listings SET views_count = views_count + 1 WHERE id = ?", [listingId]);
}
