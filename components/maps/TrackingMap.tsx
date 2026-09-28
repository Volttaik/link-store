"use client";

/**
 * The buyer's tracking map.
 *
 * A real map (Leaflet + OpenStreetMap tiles through `lib/maps.ts`), showing
 * exactly the points that are known: where the order left from, where the
 * seller last reported it to be, and where it is going. It never animates a
 * parcel along the route — there is no GPS here, and a moving dot that nobody
 * fed would be a lie. The caption under the map says so, in plain words.
 */

import { useEffect, useRef, useState } from "react";

import { OrbLoader } from "@/components/visual/OrbLoader";
import type { TrackingMapData } from "@/lib/maps";

export function TrackingMap({ data }: { data: TrackingMapData }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let disposed = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let map: any = null;

    (async () => {
      try {
        const leaflet = (await import("leaflet")).default;
        await import("leaflet/dist/leaflet.css");

        if (disposed || !containerRef.current || data.markers.length === 0) return;

        const L = leaflet;
        map = L.map(containerRef.current, {
          scrollWheelZoom: false,
          attributionControl: true,
        });

        L.tileLayer(data.tiles.url, {
          attribution: data.tiles.attribution,
          maxZoom: 19,
        }).addTo(map);

        const pin = (emoji: string, tone: string) =>
          L.divIcon({
            className: "",
            html: `<div style="display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50%;background:${tone};color:#fff;font-size:14px;box-shadow:0 2px 8px rgba(0,0,0,.35);border:2px solid #fff">${emoji}</div>`,
            iconSize: [30, 30],
            iconAnchor: [15, 15],
          });

        const iconFor = { origin: "●", current: "●", destination: "◎" } as const;
        const toneFor = { origin: "#6b7280", current: "#7c3aed", destination: "#111827" } as const;

        const latLngs: [number, number][] = [];
        for (const marker of data.markers) {
          const point: [number, number] = [marker.lat, marker.lng];
          latLngs.push(point);
          L.marker(point, { icon: pin(iconFor[marker.kind], toneFor[marker.kind]) })
            .addTo(map)
            .bindPopup(
              `<strong style="font-size:12px">${escapeHtml(marker.label)}</strong>`,
            );
        }

        if (data.route.length > 1) {
          L.polyline(data.route, {
            color: "#7c3aed",
            weight: 3,
            opacity: 0.55,
            dashArray: "6 8",
          }).addTo(map);
        }

        if (latLngs.length > 1) {
          map.fitBounds(L.latLngBounds(latLngs), { padding: [36, 36] });
        } else {
          map.setView(latLngs[0], 13);
        }

        setReady(true);
      } catch {
        if (!disposed) setFailed(true);
      }
    })();

    return () => {
      disposed = true;
      if (map) map.remove();
    };
  }, [data]);

  if (data.markers.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="relative h-64 w-full overflow-hidden rounded-2xl border border-border sm:h-72">
        <div ref={containerRef} className="h-full w-full" />
        {!ready && !failed ? (
          <div className="absolute inset-0 flex items-center justify-center bg-surface-secondary/70">
            <OrbLoader className="h-4 w-28" />
          </div>
        ) : null}
        {failed ? (
          <div className="absolute inset-0 flex items-center justify-center bg-surface-secondary/70 p-6 text-center text-sm text-muted">
            The map could not load. The reported locations are listed above — tracking does not
            depend on the map.
          </div>
        ) : null}
      </div>
      <p className="text-xs text-muted">
        Locations on this map are updates reported by the seller
        {data.reportedAt ? `, last reported ${new Date(data.reportedAt).toLocaleString()}` : ""}.
        This platform does not use live GPS tracking.
      </p>
    </div>
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
