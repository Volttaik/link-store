/**
 * The map boundary.
 *
 * Everything the platform knows about *places* passes through this file, so the
 * map provider can be replaced (another tile server, another geocoder, a paid
 * provider later) without touching a single feature. Nothing here invents
 * location data: a coordinate exists only when a seller reported a place and a
 * geocoder resolved it, or when a seller set coordinates themselves.
 *
 * Two honest rules, mirrored from `lib/server/shipments.ts`:
 *   * a point on the map is a **reported** place, never a live GPS feed;
 *   * when a place cannot be resolved, it stays text — the interface shows the
 *     last reported location and when it was reported, and plots nothing.
 *
 * Geocoding is OpenStreetMap's Nominatim: free, open and keyless. It is used
 * lightly (a handful of lookups when a seller updates a shipment), never for
 * bulk work, and a failure is always non-fatal.
 */

import "server-only";

export type GeoPoint = {
  lat: number;
  lng: number;
  /** Display label for the marker. */
  label: string;
  /** Which part of the journey this point represents. */
  kind: "origin" | "current" | "destination";
};

export type MapMarker = GeoPoint;

/** Marker payload the client map renders. */
export type TrackingMapData = {
  markers: MapMarker[];
  /** Straight segments between the points that are known, in journey order. */
  route: Array<[number, number]>;
  tiles: { url: string; attribution: string };
  /** When the seller last reported a location — the map shows reported state. */
  reportedAt: string | null;
  /** Where the seller last reported things to be, even without coordinates. */
  reportedLabel: string | null;
};

export const mapConfig = {
  tiles: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
  /** Nominatim's usage policy asks for a identifying User-Agent. */
  geocoder: "https://nominatim.openstreetmap.org/search",
};

/**
 * Resolve a human place name to coordinates. Best-effort, never throws.
 *
 * Returns `null` whenever the answer is unknown — the caller keeps the place as
 * text, which is exactly what the tracking interface says happened.
 */
export async function geocode(place: string): Promise<{ lat: number; lng: number } | null> {
  const query = place.trim();
  if (query.length < 3) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);

  try {
    const url = new URL(mapConfig.geocoder);
    url.searchParams.set("q", query);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "1");

    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "RushCart/1.0 (shipment tracking)" },
      cache: "no-store",
    });
    if (!response.ok) return null;

    const results = (await response.json()) as Array<{ lat?: string; lon?: string }>;
    const first = results[0];
    const lat = Number(first?.lat);
    const lng = Number(first?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    return { lat, lng };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** A link that opens a place in the map provider, for "open in maps". */
export function mapLink(point: { lat: number; lng: number }): string {
  return `https://www.openstreetmap.org/?mlat=${point.lat}&mlon=${point.lng}#map=15/${point.lat}/${point.lng}`;
}
