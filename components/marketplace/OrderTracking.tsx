/**
 * The buyer's tracking view.
 *
 * Three things, kept honestly separate:
 *   * **the estimate** — what the seller's range promised at purchase ("3–5
 *     days"), never a guaranteed date;
 *   * **the current status** — where the order actually stands, built only from
 *     recorded acts (each with its timestamp);
 *   * **the map** — the reported places, nothing more. There is no live GPS in
 *     this platform, and the view says so rather than animating a parcel.
 *
 * A server component: the timeline is computed by `shipmentTimeline` from the
 * shipment's own event rows, and the map receives only resolved coordinates.
 */

import { StatusChip } from "@/components/ui/atoms";
import { Icon } from "@/components/ui/Icon";
import { TrackingMap } from "@/components/maps/TrackingMap";
import {
  SHIPMENT_STATE_LABELS,
  shipmentStatusTone,
} from "@/lib/catalog";
import { formatDateTime, humanize } from "@/lib/format";
import {
  buildTrackingMapData,
  estimateWindow,
  shipmentTimeline,
  type ShipmentEventRow,
  type ShipmentRow,
} from "@/lib/server/shipments";
import type { OrderRow } from "@/lib/types";

export function OrderTracking({
  order,
  shipment,
  events,
  pickup,
}: {
  order: Pick<OrderRow, "created_at" | "paid_at" | "cancelled_at" | "status">;
  shipment: ShipmentRow;
  events: ShipmentEventRow[];
  /** Where a pickup order is collected — from the seller's settings. */
  pickup?: {
    locationName: string | null;
    address: string | null;
    hours: string | null;
    instructions: string | null;
  } | null;
}) {
  const steps = shipmentTimeline(order, shipment, events);
  const mapData = buildTrackingMapData(shipment, events);
  const window = estimateWindow(shipment.created_at, shipment.estimated_delivery);
  const isPickup = shipment.method === "pickup";

  return (
    <section className="ls-elev-2 rounded-2xl bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Icon name={isPickup ? "storefront" : "packageCheck"} size={15} />
            {isPickup ? "Collection" : "Delivery"}
          </p>
          <p className="mt-1 text-xs text-muted">
            {isPickup
              ? "This order is collected in person, not posted."
              : "This order is being delivered to you."}
          </p>
        </div>
        <StatusChip
          label={SHIPMENT_STATE_LABELS[shipment.status] ?? humanize(shipment.status)}
          tone={shipmentStatusTone(shipment.status)}
        />
      </div>

      {/* Estimate and actual status, side by side and clearly different. */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-surface-secondary/50 p-3">
          <p className="text-[11px] font-semibold tracking-wide text-muted uppercase">
            {isPickup ? "Estimated collection" : "Estimated delivery"}
          </p>
          <p className="mt-1 text-sm font-semibold">
            {shipment.estimated_delivery
              ? `${shipment.estimated_delivery} after payment`
              : "No estimate was set"}
          </p>
          {window ? (
            <p className="text-xs text-muted">
              That lands around {new Date(window.from).toLocaleDateString()} –{" "}
              {new Date(window.to).toLocaleDateString()}. It is an estimate, not a promised date.
            </p>
          ) : (
            <p className="text-xs text-muted">An estimate, not a promised date.</p>
          )}
        </div>

        <div className="rounded-xl bg-surface-secondary/50 p-3">
          <p className="text-[11px] font-semibold tracking-wide text-muted uppercase">
            Current status
          </p>
          <p className="mt-1 text-sm font-semibold">
            {SHIPMENT_STATE_LABELS[shipment.status] ?? humanize(shipment.status)}
          </p>
          <p className="text-xs text-muted">
            {shipment.current_location
              ? `Last reported: ${shipment.current_location}${
                  shipment.current_location_at
                    ? ` · ${formatDateTime(shipment.current_location_at)}`
                    : ""
                }`
              : `Updated ${formatDateTime(shipment.updated_at)} by the seller.`}
          </p>
        </div>
      </div>

      {/* The timeline — built only from recorded acts. */}
      <ol className="mt-5 space-y-3">
        {steps.map((step) => (
          <li key={step.key} className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className={`mt-1 flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] ${
                step.state === "done"
                  ? "bg-success text-white"
                  : step.state === "current"
                    ? "bg-foreground text-background"
                    : "border border-border bg-transparent text-muted"
              }`}
            >
              {step.state === "done" ? (
                <Icon name="check" size={11} />
              ) : step.state === "current" ? (
                <Icon name="clock" size={11} />
              ) : null}
            </span>
            <div className="min-w-0">
              <p
                className={`text-sm ${
                  step.state === "upcoming" ? "text-muted" : "font-medium text-foreground"
                }`}
              >
                {step.label}
              </p>
              {step.at && step.state !== "upcoming" ? (
                <p className="text-xs text-muted">{formatDateTime(step.at)}</p>
              ) : step.state === "upcoming" ? (
                <p className="text-xs text-muted">Not yet</p>
              ) : null}
              {step.location ? (
                <p className="text-xs text-muted">{step.location}</p>
              ) : null}
              {step.note ? <p className="text-xs text-muted">{step.note}</p> : null}
            </div>
          </li>
        ))}
      </ol>

      {mapData.markers.length > 0 ? (
        <div className="mt-5">
          <TrackingMap data={mapData} />
        </div>
      ) : shipment.current_location ? (
        <p className="mt-5 rounded-xl bg-surface-secondary/50 p-3 text-xs text-muted">
          Last reported location: <span className="font-medium">{shipment.current_location}</span>
          {shipment.current_location_at
            ? `, reported ${formatDateTime(shipment.current_location_at)}`
            : ""}
          . This platform does not use live GPS tracking.
        </p>
      ) : null}

      {isPickup && pickup ? (
        <div className="mt-5 rounded-xl border border-border p-4">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Icon name="mapPin" size={14} />
            Where to collect
          </p>
          <div className="mt-2 space-y-1 text-sm">
            {pickup.locationName ? <p className="font-medium">{pickup.locationName}</p> : null}
            {pickup.address ? <p className="text-muted">{pickup.address}</p> : null}
            {pickup.hours ? (
              <p className="flex items-center gap-1.5 text-muted">
                <Icon name="clock" size={12} /> {pickup.hours}
              </p>
            ) : null}
            {pickup.instructions ? (
              <p className="text-muted">{pickup.instructions}</p>
            ) : null}
          </div>
          <p className="mt-3 text-xs text-muted">
            Show your receipt QR code when you arrive — the seller scans it to hand the order over,
            and each order can only be collected once.
          </p>
        </div>
      ) : null}
    </section>
  );
}
