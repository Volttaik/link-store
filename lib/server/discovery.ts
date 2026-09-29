/**
 * Public discovery + admin data access.
 *
 * Everything here reads only published content (`listings.status = 'active'`
 * and a published store). Sections that have no rows return empty arrays and
 * the UI renders a real empty state — the marketplace never invents activity to
 * look busy.
 */

import "server-only";

import { bool, query, queryOne } from "../db";
import {
  autoDesignType,
  isShopDesignType,
  shopDesignMeta,
  shopDesignTypeFor,
  type ShopDesignType,
} from "../catalog";
import { listListings, type ListingQuery } from "./listings";
import { listEvents } from "./events";
import { getStoreSettings } from "./stores";
import type { CategoryRow, EventCardData, ListingCardData, StoreRow } from "../types";

/**
 * One real listing from a store, used by the shop card's mini gallery.
 *
 * The gallery is what tells a shopper what a shop actually sells, so it is
 * pulled from the seller's own published listings — never invented, and never
 * padded with an empty box when the store has no photography yet.
 */
export type StoreShowcaseItem = {
  id: string;
  title: string;
  imageUrl: string;
  price: number;
  currency: string;
};

export type StoreCard = {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  primaryCategory: string | null;
  city: string | null;
  country: string | null;
  listingCount: number;
  publishedListingCount: number;
  createdAt: string;
  /** Populated by `listStores({ withGallery: true })`; empty otherwise. */
  gallery: StoreShowcaseItem[];
};

/** How many listing images a shop card shows. */
export const STORE_GALLERY_SIZE = 4;

type StoreCardRow = {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  logo_url: string | null;
  banner_url: string | null;
  primary_category: string | null;
  city: string | null;
  country: string | null;
  created_at: string;
  listing_count: number;
  published_listing_count: number;
};

function mapStoreCard(row: StoreCardRow): StoreCard {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    tagline: row.tagline,
    logoUrl: row.logo_url,
    bannerUrl: row.banner_url,
    primaryCategory: row.primary_category,
    city: row.city,
    country: row.country,
    listingCount: Number(row.listing_count ?? 0),
    publishedListingCount: Number(row.published_listing_count ?? 0),
    createdAt: row.created_at,
    gallery: [],
  };
}

/**
 * Attach each store's newest photographed listings, in one extra query rather
 * than one query per store.
 */
async function attachGalleries(
  cards: StoreCard[],
  perStore = STORE_GALLERY_SIZE,
): Promise<StoreCard[]> {
  if (cards.length === 0) return cards;

  const placeholders = cards.map(() => "?").join(", ");
  const rows = await query<{
    id: string;
    store_id: string;
    title: string;
    price: number;
    currency: string;
    image_url: string | null;
  }>(
    `SELECT l.id, l.store_id, l.title, l.price, l.currency,
            (SELECT li.image_url FROM listing_images li
              WHERE li.listing_id = l.id
              ORDER BY li.position ASC, li.created_at ASC LIMIT 1) AS image_url
     FROM listings l
     WHERE l.store_id IN (${placeholders}) AND l.status = 'active'
     ORDER BY l.created_at DESC`,
    cards.map((card) => card.id),
  );

  const byStore = new Map<string, StoreShowcaseItem[]>();
  for (const row of rows) {
    if (!row.image_url) continue;
    const bucket = byStore.get(row.store_id) ?? [];
    if (bucket.length >= perStore) continue;
    bucket.push({
      id: row.id,
      title: row.title,
      imageUrl: row.image_url,
      price: Number(row.price ?? 0),
      currency: row.currency,
    });
    byStore.set(row.store_id, bucket);
  }

  return cards.map((card) => ({ ...card, gallery: byStore.get(card.id) ?? [] }));
}

const STORE_CARD_SELECT = `
  SELECT s.id, s.slug, s.name, s.tagline, s.logo_url, s.banner_url, s.primary_category,
         s.city, s.country, s.created_at,
         (SELECT COUNT(*) FROM listings l WHERE l.store_id = s.id) AS listing_count,
         (SELECT COUNT(*) FROM listings l WHERE l.store_id = s.id AND l.status = 'active') AS published_listing_count
  FROM stores s`;

export async function listStores(input: {
  search?: string;
  category?: string;
  city?: string;
  limit?: number;
  offset?: number;
  onlyWithListings?: boolean;
  sort?: "newest" | "name" | "listings";
  /** Only stores that have a published listing in this catalogue category. */
  listingCategoryId?: string;
  /** Include each store's newest photographed listings, for shop cards. */
  withGallery?: boolean;
} = {}): Promise<StoreCard[]> {
  const conditions: string[] = ["s.is_published = 1"];
  const args: Array<string | number> = [];

  if (input.search) {
    const term = `%${input.search.trim().toLowerCase()}%`;
    conditions.push("(LOWER(s.name) LIKE ? OR LOWER(COALESCE(s.tagline, '')) LIKE ?)");
    args.push(term, term);
  }
  if (input.category) {
    conditions.push("s.primary_category = ?");
    args.push(input.category);
  }
  if (input.city) {
    conditions.push("LOWER(COALESCE(s.city, '')) = ?");
    args.push(input.city.toLowerCase());
  }
  if (input.onlyWithListings) {
    conditions.push(
      "EXISTS (SELECT 1 FROM listings l WHERE l.store_id = s.id AND l.status = 'active')",
    );
  }
  if (input.listingCategoryId) {
    conditions.push(
      "EXISTS (SELECT 1 FROM listings l WHERE l.store_id = s.id AND l.status = 'active' AND l.category_id = ?)",
    );
    args.push(input.listingCategoryId);
  }

  const order =
    input.sort === "name"
      ? "s.name ASC"
      : input.sort === "listings"
        ? "published_listing_count DESC, s.created_at DESC"
        : "s.created_at DESC";

  const limit = Math.min(Math.max(input.limit ?? 24, 1), 100);
  const offset = Math.max(input.offset ?? 0, 0);

  const rows = await query<StoreCardRow>(
    `${STORE_CARD_SELECT} WHERE ${conditions.join(" AND ")} ORDER BY ${order} LIMIT ? OFFSET ?`,
    [...args, limit, offset],
  );

  const cards = rows.map(mapStoreCard);
  return input.withGallery ? attachGalleries(cards) : cards;
}

export async function countStores(input: {
  search?: string;
  category?: string;
  onlyWithListings?: boolean;
  listingCategoryId?: string;
} = {}): Promise<number> {
  const conditions: string[] = ["s.is_published = 1"];
  const args: Array<string | number> = [];

  if (input.search) {
    const term = `%${input.search.trim().toLowerCase()}%`;
    conditions.push("(LOWER(s.name) LIKE ? OR LOWER(COALESCE(s.tagline, '')) LIKE ?)");
    args.push(term, term);
  }
  if (input.category) {
    conditions.push("s.primary_category = ?");
    args.push(input.category);
  }
  if (input.onlyWithListings) {
    conditions.push(
      "EXISTS (SELECT 1 FROM listings l WHERE l.store_id = s.id AND l.status = 'active')",
    );
  }
  if (input.listingCategoryId) {
    conditions.push(
      "EXISTS (SELECT 1 FROM listings l WHERE l.store_id = s.id AND l.status = 'active' AND l.category_id = ?)",
    );
    args.push(input.listingCategoryId);
  }

  const row = await queryOne<{ total: number }>(
    `SELECT COUNT(*) AS total FROM stores s WHERE ${conditions.join(" AND ")}`,
    args,
  );
  return Number(row?.total ?? 0);
}

export async function getStoreCard(slug: string): Promise<StoreCard | null> {
  const row = await queryOne<StoreCardRow>(`${STORE_CARD_SELECT} WHERE s.slug = ?`, [slug]);
  return row ? mapStoreCard(row) : null;
}

/**
 * The home page's filtered feed: everything published in one catalogue
 * category. Empty when nothing has been published there — the UI says so
 * rather than padding the grid.
 */
export async function listCategoryFeed(categoryId: string, limit = 12): Promise<ListingCardData[]> {
  return listListings({
    status: "active",
    onlyPublishedStores: true,
    categoryId,
    sort: "newest",
    limit,
  });
}

// --- Marketplace discovery --------------------------------------------------

/**
 * Everything the public home page needs, in one round of parallel queries.
 *
 * Deliberately three feeds and no more: the home page has *one* product
 * discovery section, *one* shop discovery section and *one* events section.
 * Five near-identical rails (featured / new / trending / food / stores) were
 * the same job repeated, and repetition is what makes a marketplace page read
 * as a wall of entry points rather than a curated front door.
 */
export type MarketplaceHome = {
  /** The product feed: newest first, across every seller. */
  listings: ListingCardData[];
  /** Shops that have something published, with a gallery of their listings. */
  stores: StoreCard[];
  events: EventCardData[];
};

/**
 * The unfiltered homepage: one product feed, one shop feed, upcoming events.
 *
 * Featured listings lead the product feed when a seller has marked any,
 * because that is the one ranking the platform actually offers — but they are
 * folded into the same feed rather than given a second rail of their own.
 */
export async function getMarketplaceHome(): Promise<MarketplaceHome> {
  const publicFilter: ListingQuery = { status: "active", onlyPublishedStores: true };

  const [featured, newest, events, stores] = await Promise.all([
    listListings({ ...publicFilter, sort: "newest", limit: 6, featuredOnly: true }),
    listListings({ ...publicFilter, sort: "newest", limit: 12 }),
    listEvents({
      status: "published",
      upcomingOnly: true,
      onlyPublishedStores: true,
      limit: 4,
    }),
    listStores({ onlyWithListings: true, sort: "listings", limit: 8, withGallery: true }),
  ]);

  const seen = new Set(featured.map((listing) => listing.id));
  const listings = [...featured, ...newest.filter((listing) => !seen.has(listing.id))].slice(0, 16);

  return { listings, stores, events };
}

/**
 * The homepage reorganised around one catalogue category: the same three jobs
 * (products, shops, events) restricted to what that category actually holds.
 * Any of the three can come back empty, and the page says so instead of
 * inventing filler.
 */
export async function getCategoryMarketplace(categoryId: string): Promise<{
  listings: ListingCardData[];
  stores: StoreCard[];
  events: EventCardData[];
}> {
  const [listings, stores, events] = await Promise.all([
    listCategoryFeed(categoryId, 16),
    listStores({
      onlyWithListings: true,
      listingCategoryId: categoryId,
      sort: "listings",
      limit: 8,
      withGallery: true,
    }),
    listEvents({
      status: "published",
      upcomingOnly: true,
      onlyPublishedStores: true,
      listingCategoryId: categoryId,
      limit: 4,
    }),
  ]);

  return { listings, stores, events };
}

// --- Storefront -------------------------------------------------------------

export type StorefrontSection = {
  /** The section identity: food, products, services, events, digital, rentals. */
  design: ShopDesignType;
  label: string;
  /** The word the welcome line uses — “the Food section”. */
  welcomeLabel: string;
  /** How this kind of section shows its wares: same system, different emphasis. */
  presentation: "menu" | "shelf" | "services" | "posters";
  items: ListingCardData[];
  /**
   * The filters that mean something *inside* this section: only the categories
   * that actually appear in its items. Never a list of options that filter to
   * nothing.
   */
  categories: Array<{ name: string; count: number }>;
};

export type Storefront = {
  store: StoreRow;
  card: StoreCard;
  sections: StorefrontSection[];
  events: EventCardData[];
  categories: CategoryRow[];
  totalListings: number;
  /**
   * The shop's primary design type — the experience its storefront leads with.
   * The owner's manual choice wins; otherwise it is derived from what the shop
   * actually sells.
   */
  designType: ShopDesignType;
};

/**
 * The public storefront.
 *
 * Sections are derived from what the seller actually created, so a restaurant
 * leads with a menu while a clothing seller leads with products and an event
 * organiser leads with events — without any configuration screen. The owner can
 * steer the lead in Shop Settings → Design Type, which overrides the automatic
 * choice.
 */
export async function getStorefront(slug: string): Promise<Storefront | null> {
  const store = await queryOne<StoreRow>("SELECT * FROM stores WHERE slug = ?", [slug]);
  if (!store) return null;

  const card = await getStoreCard(slug);
  if (!card) return null;

  const baseFilter: ListingQuery = { storeId: store.id, status: "active", sort: "newest" };

  const [allItems, events, categories, settings] = await Promise.all([
    listListings({ ...baseFilter, limit: 60 }),
    listEvents({ storeId: store.id, status: "published", limit: 12 }),
    query<CategoryRow>(
      "SELECT * FROM categories WHERE store_id = ? ORDER BY position ASC, name ASC",
      [store.id],
    ),
    getStoreSettings(store.id),
  ]);

  // Everything the shop sells, gathered under the experience it belongs to.
  const grouped = new Map<ShopDesignType, ListingCardData[]>();
  const counts: Partial<Record<ShopDesignType, number>> = {};

  for (const item of allItems) {
    const design = shopDesignTypeFor(item.type);
    const bucket = grouped.get(design) ?? [];
    bucket.push(item);
    grouped.set(design, bucket);
    counts[design] = (counts[design] ?? 0) + 1;
  }
  if (events.length > 0) counts.events = events.length;

  const designType: ShopDesignType =
    isShopDesignType(settings.design_type) ? settings.design_type : autoDesignType(counts);

  // The shop leads with its primary design type; the rest keep the catalogue's
  // order so every storefront reads consistently.
  const order: ShopDesignType[] = ["food", "products", "services", "digital", "rentals", "events"];
  const orderedDesigns = [
    designType,
    ...order.filter((design) => design !== designType),
  ];

  const sections: StorefrontSection[] = [];

  for (const design of orderedDesigns) {
    const items = grouped.get(design);
    if (!items || items.length === 0) continue;

    const meta = shopDesignMeta(design);
    const categoryCounts = new Map<string, number>();
    for (const item of items) {
      const name = item.categoryName?.trim();
      if (!name) continue;
      categoryCounts.set(name, (categoryCounts.get(name) ?? 0) + 1);
    }

    sections.push({
      design,
      label: meta?.label ?? design,
      welcomeLabel: meta?.welcomeLabel ?? design,
      presentation: meta?.presentation ?? "shelf",
      items,
      categories: [...categoryCounts.entries()].map(([name, count]) => ({ name, count })),
    });
  }

  return {
    store,
    card,
    sections,
    events,
    categories,
    totalListings: allItems.length,
    designType,
  };
}

export async function storeNeighbourhood(storeId: string, limit = 4): Promise<StoreCard[]> {
  const store = await queryOne<{ primary_category: string | null }>(
    "SELECT primary_category FROM stores WHERE id = ?",
    [storeId],
  );

  if (!store?.primary_category) return [];

  return query<StoreCardRow>(
    `${STORE_CARD_SELECT}
     WHERE s.is_published = 1 AND s.primary_category = ? AND s.id != ?
       AND EXISTS (SELECT 1 FROM listings l WHERE l.store_id = s.id AND l.status = 'active')
     ORDER BY published_listing_count DESC LIMIT ?`,
    [store.primary_category, storeId, limit],
  ).then((rows) => rows.map(mapStoreCard));
}

// --- Admin ------------------------------------------------------------------

export type AdminStoreRow = StoreCard & { ownerEmail: string; ownerName: string; isPublished: boolean };

export async function listAllStoresForAdmin(input: {
  search?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<AdminStoreRow[]> {
  const conditions: string[] = [];
  const args: Array<string | number> = [];

  if (input.search) {
    const term = `%${input.search.trim().toLowerCase()}%`;
    conditions.push("(LOWER(s.name) LIKE ? OR LOWER(s.slug) LIKE ? OR LOWER(u.email) LIKE ?)");
    args.push(term, term, term);
  }

  const limit = Math.min(Math.max(input.limit ?? 25, 1), 100);
  const offset = Math.max(input.offset ?? 0, 0);

  const rows = await query<
    StoreCardRow & { owner_email: string; owner_name: string; is_published: number }
  >(
    `SELECT s.id, s.slug, s.name, s.tagline, s.logo_url, s.banner_url, s.primary_category,
            s.city, s.country, s.created_at, s.is_published,
            u.email AS owner_email, u.name AS owner_name,
            (SELECT COUNT(*) FROM listings l WHERE l.store_id = s.id) AS listing_count,
            (SELECT COUNT(*) FROM listings l WHERE l.store_id = s.id AND l.status = 'active') AS published_listing_count
     FROM stores s JOIN users u ON u.id = s.user_id
     ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
     ORDER BY s.created_at DESC LIMIT ? OFFSET ?`,
    [...args, limit, offset],
  );

  return rows.map((row) => ({
    ...mapStoreCard(row),
    ownerEmail: row.owner_email,
    ownerName: row.owner_name,
    isPublished: bool(row.is_published),
  }));
}

export async function listAllUsersForAdmin(
  search?: string,
  limit = 25,
): Promise<
  Array<{
    id: string;
    email: string;
    name: string;
    role: string;
    created_at: string;
    last_login_at: string | null;
    store_count: number;
    order_count: number;
  }>
> {
  const conditions: string[] = [];
  const args: Array<string | number> = [];

  if (search) {
    const term = `%${search.trim().toLowerCase()}%`;
    conditions.push("(LOWER(u.email) LIKE ? OR LOWER(u.name) LIKE ?)");
    args.push(term, term);
  }

  return query(
    `SELECT u.id, u.email, u.name, u.role, u.created_at, u.last_login_at,
            (SELECT COUNT(*) FROM stores s WHERE s.user_id = u.id) AS store_count,
            (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) AS order_count
     FROM users u
     ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
     ORDER BY u.created_at DESC LIMIT ?`,
    [...args, Math.min(limit, 100)],
  );
}
