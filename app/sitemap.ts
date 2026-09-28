import type { MetadataRoute } from "next";

import { query } from "@/lib/db";

/**
 * sitemap.xml — the marketplace's living map.
 *
 * Two halves: the fixed browse pages of the platform, and everything the
 * community has published — stores, listings and events, read fresh from the
 * database. The map is generated per request (`force-dynamic`) because a
 * marketplace's map that only updates on deploy is a stale map: a new listing
 * should be discoverable the hour it goes live, not the next time somebody
 * remembers to redeploy.
 *
 * Only publicly viewable pages appear: published stores, active listings and
 * published events. Drafts and unlisted shops are never handed to crawlers.
 */

const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:5000").replace(/\/+$/, "");

/** Rebuilt on every fetch — new stores and listings appear immediately. */
export const dynamic = "force-dynamic";

/** Cap per type so the map stays well inside the 50,000-URL sitemap limit. */
const LIMIT_PER_TYPE = 5000;

/** The fixed, always-public pages of the platform. */
function browsePages(): MetadataRoute.Sitemap {
  const pages: Array<{ path: string; priority: number }> = [
    { path: "/", priority: 1 },
    { path: "/products", priority: 0.9 },
    { path: "/stores", priority: 0.8 },
    { path: "/events", priority: 0.8 },
    { path: "/tickets", priority: 0.7 },
    { path: "/fashion", priority: 0.7 },
    { path: "/electronics", priority: 0.7 },
    { path: "/furniture", priority: 0.7 },
    { path: "/food", priority: 0.7 },
    { path: "/services", priority: 0.7 },
    { path: "/digital", priority: 0.7 },
    { path: "/cars", priority: 0.7 },
    { path: "/rentals", priority: 0.7 },
    { path: "/cargo", priority: 0.7 },
  ];

  return pages.map(({ path, priority }) => ({
    url: `${appUrl}${path}`,
    changeFrequency: "daily" as const,
    priority,
  }));
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  try {
    const [stores, listings, events] = await Promise.all([
      query<{ slug: string; updated_at: string }>(
        `SELECT slug, updated_at FROM stores WHERE is_published = 1 ORDER BY updated_at DESC LIMIT ?`,
        [LIMIT_PER_TYPE],
      ),
      query<{ id: string; updated_at: string }>(
        `SELECT l.id, l.updated_at FROM listings l
           JOIN stores s ON s.id = l.store_id
          WHERE l.status = 'active' AND s.is_published = 1
          ORDER BY l.updated_at DESC LIMIT ?`,
        [LIMIT_PER_TYPE],
      ),
      query<{ id: string; updated_at: string }>(
        `SELECT e.id, e.updated_at FROM events e
           JOIN stores s ON s.id = e.store_id
          WHERE e.status = 'published' AND s.is_published = 1
          ORDER BY e.updated_at DESC LIMIT ?`,
        [LIMIT_PER_TYPE],
      ),
    ]);

    return [
      ...browsePages(),
      ...stores.map((store) => ({
        url: `${appUrl}/@${encodeURIComponent(store.slug)}`,
        lastModified: store.updated_at,
        changeFrequency: "daily" as const,
        priority: 0.8,
      })),
      ...listings.map((listing) => ({
        url: `${appUrl}/listing/${encodeURIComponent(listing.id)}`,
        lastModified: listing.updated_at,
        changeFrequency: "weekly" as const,
        priority: 0.7,
      })),
      ...events.map((event) => ({
        url: `${appUrl}/events/${encodeURIComponent(event.id)}`,
        lastModified: event.updated_at,
        changeFrequency: "weekly" as const,
        priority: 0.7,
      })),
    ];
  } catch {
    // A build or boot without a database still owes crawlers the browse map;
    // the published pages catch up on the next fetch that has one.
    return browsePages();
  }
}
