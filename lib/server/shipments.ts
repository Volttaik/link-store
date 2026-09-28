/**
 * Shipments — the fulfilment record behind tracking and pickup.
 *
 * This module is the source of truth for where an order stands on its way to
 * the buyer. Two honest rules govern everything in it:
 *
 * 1. **Nothing moves unless a seller says so.** There is no GPS integration on
 *    this platform, so every state change and every location is a *seller
 *    report* — a person telling the system what they know. The buyer's
 *    tracking view shows exactly that: the last reported place, and when it
 *    was reported. Nothing is interpolated, animated or invented to look live.
 * 2. **States are actions.** A status only exists because someone did
 *    something: the seller marked it shipped, the buyer collected it. The
 *    timeline is built from those recorded acts, each with its timestamp.
 *
 * The map is presentation of these recorded coordinates and nothing more — see
 * `lib/maps.ts` for the (replaceable) provider boundary.
 */

import "server-only";

import { SHIPMENT_STATE_LABELS as SHIPMENT_LABELS } from "../catalog";
import { execute, query, queryOne, batch, type BatchStatement } from "../db";
import { sendOrderCompletedEmail, sendShipmentUpdateEmail } from "./email";
import { newId } from "../ids";
import { nowIso } from "../format";
import { geocode, mapConfig, type TrackingMapData } from "../maps";
import type { OrderRow, OrderItemRow, StoreSettingsRow } from "../types";

// --- Vocabulary -------------------------------------------------------------

export type ShipmentMethod = "delivery" | "pickup";

/** Delivery lifecycle — every state corresponds to a real seller action. */
export const DELIVERY_STATES = [
  "preparing",
  "ready_to_ship",
  "shipped",
  "in_transit",
  "out_for_delivery",
  "delivered",
] as const;

/** Pickup lifecycle — collection is verified at the door, not assumed. */
export const PICKUP_STATES = ["preparing", "ready_for_pickup", "picked_up"] as const;

export type ShipmentStatus =
  | (typeof DELIVERY_STATES)[number]
  | (typeof PICKUP_STATES)[number]
  | "cancelled";

export type ShipmentRow = {
  id: string;
  order_id: string;
  store_id: string;
  method: ShipmentMethod;
  status: ShipmentStatus;
  origin: string | null;
  destination: string | null;
  current_location: string | null;
  /** When the seller last reported where things are — the map's honesty stamp. */
  current_location_at: string | null;
  current_lat: number | null;
  current_lng: number | null;
  origin_lat: number | null;
  origin_lng: number | null;
  destination_lat: number | null;
  destination_lng: number | null;
  carrier_note: string | null;
  estimated_delivery: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ShipmentEventRow = {
  id: string;
  shipment_id: string;
  status: string;
  title: string;
  note: string | null;
  location: string | null;
  lat: number | null;
  lng: number | null;
  actor: string;
  created_at: string;
};

// The state vocabulary lives in `lib/catalog` so client components can speak it
// without importing server code; this re-export keeps the typed name here.
export const SHIPMENT_STATE_LABELS: Record<ShipmentStatus, string> =
  SHIPMENT_LABELS as Record<ShipmentStatus, string>;

/** The ordered ladder a delivery climbs. Cancelled is off-ladder on purpose. */
const LADDER: Record<ShipmentMethod, readonly ShipmentStatus[]> = {
  delivery: DELIVERY_STATES,
  pickup: PICKUP_STATES,
};

export function isTerminal(status: ShipmentStatus): boolean {
  return status === "delivered" || status === "picked_up" || status === "cancelled";
}

/**
 * The milestones a buyer is actually waiting on. A plain location tweak at the
 * same stage is not one — nobody wants an email for that.
 */
const NOTIFIED_STATES: readonly ShipmentStatus[] = [
  "shipped",
  "in_transit",
  "out_for_delivery",
  "ready_for_pickup",
  "delivered",
  "picked_up",
];

/**
 * Tell the buyer what just happened to their order. Fire-and-forget: mail is
 * never allowed to break fulfilment, so a failure is logged and forgotten.
 *
 * A delivery or pickup that lands is the *completion* of the order, and says so
 * as such — one email per order, never a "delivered" and a "completed" for the
 * same moment. Every other milestone is the plain fulfilment update.
 */
async function notifyBuyerOfUpdate(input: {
  orderId: string;
  status: ShipmentStatus;
  method: ShipmentMethod;
  note: string | null;
  location: string | null;
  at: string;
}): Promise<void> {
  if (!NOTIFIED_STATES.includes(input.status)) return;

  try {
    const order = await queryOne<{
      id: string;
      email: string;
      order_number: string;
      access_token: string;
      store_id: string;
      customer_name: string | null;
      total: number;
      currency: string;
    }>(
      "SELECT id, email, order_number, access_token, store_id, customer_name, total, currency FROM orders WHERE id = ?",
      [input.orderId],
    );
    if (!order) return;

    if (input.status === "delivered" || input.status === "picked_up") {
      await sendOrderCompletedEmail({
        order,
        method: input.method,
        at: input.at,
      });
      return;
    }

    await sendShipmentUpdateEmail({
      order,
      statusLabel: SHIPMENT_STATE_LABELS[input.status] ?? input.status,
      note: input.note,
      location: input.location,
      at: input.at,
      method: input.method,
    });
  } catch (error) {
    console.error(`[shipment] order ${input.orderId}: buyer update email failed`, error);
  }
}

// --- Fulfilment method and estimates ----------------------------------------

/**
 * How this order reaches its buyer, decided from the items it actually holds.
 *
 * Delivery wins over pickup (an order that must be posted cannot also be
 * collected), digital is pure downloads, and a pure-ticket order needs no
 * fulfilment at all — the ticket *is* the delivery. Items collected in person
 * (food, click-and-collect goods) make the order a pickup order; bookings and
 * on-site services need no fulfilment record either.
 */
export function deriveFulfilmentMethod(
  items: Array<Pick<OrderItemRow, "item_type"> & { fulfilment?: string }>,
): "delivery" | "pickup" | "digital" | "none" {
  const modes = new Set(
    items
      .filter((item) => item.item_type !== "ticket")
      .map((item) => item.fulfilment ?? (item.item_type === "digital" ? "digital" : "shipping")),
  );

  if (modes.size === 0) return "none";
  if ([...modes].every((mode) => mode === "digital")) return "digital";
  if (modes.has("shipping")) return "delivery";
  if (modes.has("pickup")) return "pickup";
  // Booking / on-site only: arranged in person, nothing to post or hand over.
  return "none";
}

/**
 * The seller's honest delivery estimate as a human range — "3–5 days".
 *
 * It is a range the seller configured, not a promised date, and the interface
 * always shows it as an estimate. `same day` when the seller works that fast.
 */
export function deliveryEstimate(settings: Pick<StoreSettingsRow, "delivery_estimate_min_days" | "delivery_estimate_max_days">): string {
  const min = Math.max(0, Number(settings.delivery_estimate_min_days ?? 3));
  const max = Math.max(min, Number(settings.delivery_estimate_max_days ?? 5));

  if (min === 0 && max === 0) return "same day";
  if (min === max) return `${min} ${min === 1 ? "day" : "days"}`;
  return `${min}–${max} days`;
}

/** The date window an estimate lands on, for display beside it. */
export function estimateWindow(placedAt: string, estimate: string | null): { from: string; to: string } | null {
  if (!estimate) return null;
  const match = estimate.match(/(\d+)\s*[–-]\s*(\d+)/);
  const single = estimate.match(/^(\d+)/);
  const days = match
    ? [Number(match[1]), Number(match[2])]
    : single
      ? [Number(single[1]), Number(single[1])]
      : null;
  if (!days) return null;

  const base = new Date(placedAt);
  const from = new Date(base.getTime() + days[0] * 86_400_000);
  const to = new Date(base.getTime() + days[1] * 86_400_000);
  return { from: from.toISOString(), to: to.toISOString() };
}

// --- Reading ----------------------------------------------------------------

export async function getShipmentForOrder(orderId: string): Promise<ShipmentRow | null> {
  return queryOne<ShipmentRow>("SELECT * FROM shipments WHERE order_id = ? LIMIT 1", [orderId]);
}

export async function listShipmentEvents(shipmentId: string): Promise<ShipmentEventRow[]> {
  return query<ShipmentEventRow>(
    "SELECT * FROM shipment_events WHERE shipment_id = ? ORDER BY created_at ASC, rowid ASC",
    [shipmentId],
  );
}

export async function getShipmentForStore(
  shipmentId: string,
  storeId: string,
): Promise<ShipmentRow | null> {
  return queryOne<ShipmentRow>("SELECT * FROM shipments WHERE id = ? AND store_id = ?", [
    shipmentId,
    storeId,
  ]);
}

// --- Writing ----------------------------------------------------------------

/**
 * Open the fulfilment record the moment an order is paid.
 *
 * The first event is the payment itself — the timeline starts from facts the
 * platform already recorded, before the seller has touched anything.
 */
export async function openShipmentForOrder(input: {
  order: OrderRow;
  method: ShipmentMethod;
  estimate: string | null;
  origin: string | null;
  destination: string | null;
}): Promise<ShipmentRow> {
  // Idempotent: a payment is fulfilled once, but a retried call must not open a
  // second record for the same order.
  const existing = await getShipmentForOrder(input.order.id);
  if (existing) return existing;

  const id = newId("shp");
  const timestamp = nowIso();

  // Places are resolved to coordinates best-effort so the map can draw them;
  // an unresolvable place simply stays text. Nothing here is ever invented.
  const [originPoint, destinationPoint] = await Promise.all([
    input.origin ? geocode(input.origin) : Promise.resolve(null),
    input.destination ? geocode(input.destination) : Promise.resolve(null),
  ]);

  await execute(
    `INSERT INTO shipments
       (id, order_id, store_id, method, status, origin, destination,
        origin_lat, origin_lng, destination_lat, destination_lng,
        estimated_delivery, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'preparing', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.order.id,
      input.order.store_id,
      input.method,
      input.origin,
      input.destination,
      originPoint?.lat ?? null,
      originPoint?.lng ?? null,
      destinationPoint?.lat ?? null,
      destinationPoint?.lng ?? null,
      input.estimate,
      timestamp,
      timestamp,
    ],
  );

  await execute(
    `INSERT INTO shipment_events (id, shipment_id, status, title, note, actor, created_at)
     VALUES (?, ?, 'preparing', ?, ?, 'system', ?)`,
    [
      newId("shev"),
      id,
      input.method === "pickup" ? "Payment confirmed, preparing for collection" : "Payment confirmed, preparing your order",
      input.estimate
        ? `Estimated ${input.method === "pickup" ? "collection" : "delivery"}: ${input.estimate}`
        : null,
      input.order.paid_at ?? timestamp,
    ],
  );

  const row = await queryOne<ShipmentRow>("SELECT * FROM shipments WHERE id = ?", [id]);
  if (!row) throw new Error("The fulfilment record could not be created.");
  return row;
}

export type UpdateShipmentInput = {
  shipmentId: string;
  storeId: string;
  status: ShipmentStatus;
  /** Where things are now — a place the seller names, not a GPS reading. */
  location?: string | null;
  /** Optional coordinates the seller set (e.g. by clicking the map). */
  lat?: number | null;
  lng?: number | null;
  note?: string | null;
  origin?: string | null;
  destination?: string | null;
};

export type UpdateShipmentResult =
  | { ok: true; shipment: ShipmentRow }
  | { ok: false; error: string };

/**
 * The seller acting on a shipment: a status change and/or a new reported
 * location, each recorded as its own timeline event.
 *
 * The transition is validated against the method's ladder: a shipment may move
 * forward (skipping a stage is a real thing a seller does) or report a new
 * place at the same stage, but it can never walk backwards — the timeline is
 * history, and history does not un-happen. Terminal states are final.
 */
export async function updateShipment(input: UpdateShipmentInput): Promise<UpdateShipmentResult> {
  const shipment = await getShipmentForStore(input.shipmentId, input.storeId);
  if (!shipment) return { ok: false, error: "That shipment is not in your store." };

  if (isTerminal(shipment.status)) {
    return {
      ok: false,
      error: `This order is already ${SHIPMENT_STATE_LABELS[shipment.status].toLowerCase()}. Its fulfilment is closed.`,
    };
  }

  const ladder = LADDER[shipment.method];
  const from = ladder.indexOf(shipment.status);
  const to = ladder.indexOf(input.status);

  if (to === -1) {
    return {
      ok: false,
      error:
        shipment.method === "pickup"
          ? "A pickup order is either being prepared, ready for collection, or collected."
          : "That is not a stage of this delivery.",
    };
  }

  const statusChanged = input.status !== shipment.status;

  if (statusChanged && to < from) {
    return {
      ok: false,
      error: `A shipment cannot go backwards. It is already ${SHIPMENT_STATE_LABELS[shipment.status].toLowerCase()}.`,
    };
  }

  if (input.status === "delivered" && shipment.method !== "delivery") {
    return { ok: false, error: "A pickup order is collected, not delivered." };
  }
  if (input.status === "picked_up" && shipment.method !== "pickup") {
    return { ok: false, error: "A delivery order is delivered, not collected." };
  }

  const timestamp = nowIso();
  const newLocationText = input.location?.trim() || null;
  const location = newLocationText || shipment.current_location;
  const locationChanged = Boolean(newLocationText) && newLocationText !== shipment.current_location;

  // Explicit coordinates win; a changed place name is resolved best-effort so
  // the map can plot it. If it cannot be resolved the place stays text-only.
  let lat = input.lat === undefined ? shipment.current_lat : input.lat;
  let lng = input.lng === undefined ? shipment.current_lng : input.lng;

  if (locationChanged && input.lat === undefined && newLocationText) {
    const resolved = await geocode(newLocationText);
    if (resolved) {
      lat = resolved.lat;
      lng = resolved.lng;
    } else {
      lat = null;
      lng = null;
    }
  }

  // "Out for delivery" and beyond are movement: they come with a place.
  // The platform never fakes one — it just records what the seller says.
  const statements: BatchStatement[] = [
    {
      sql: `UPDATE shipments SET status = ?, current_location = ?, current_lat = ?, current_lng = ?,
              current_location_at = CASE WHEN ? IS NOT NULL THEN ? ELSE current_location_at END,
              origin = COALESCE(?, origin), destination = COALESCE(?, destination),
              carrier_note = COALESCE(?, carrier_note),
              shipped_at = CASE WHEN ? IN ('shipped', 'in_transit', 'out_for_delivery', 'delivered')
                                THEN COALESCE(shipped_at, ?) ELSE shipped_at END,
              delivered_at = CASE WHEN ? IN ('delivered', 'picked_up') THEN ? ELSE delivered_at END,
              updated_at = ?
            WHERE id = ? AND store_id = ?`,
      args: [
        input.status,
        location,
        lat,
        lng,
        location,
        timestamp,
        input.origin?.trim() || null,
        input.destination?.trim() || null,
        input.note?.trim() || null,
        input.status,
        timestamp,
        input.status,
        timestamp,
        timestamp,
        input.shipmentId,
        input.storeId,
      ],
    },
    {
      sql: `INSERT INTO shipment_events (id, shipment_id, status, title, note, location, lat, lng, actor, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'seller', ?)`,
      args: [
        newId("shev"),
        input.shipmentId,
        input.status,
        statusChanged ? SHIPMENT_STATE_LABELS[input.status] : "Location updated",
        input.note?.trim() || null,
        location,
        lat,
        lng,
        timestamp,
      ],
    },
  ];

  await batch(statements);

  const updated = await queryOne<ShipmentRow>("SELECT * FROM shipments WHERE id = ?", [
    input.shipmentId,
  ]);
  if (!updated) return { ok: false, error: "The shipment could not be updated." };

  if (statusChanged) {
    await notifyBuyerOfUpdate({
      orderId: shipment.order_id,
      status: input.status,
      method: shipment.method,
      note: input.note?.trim() || null,
      location: location ?? null,
      at: timestamp,
    });
  }

  // A delivery that lands closes its order — the same act, one source of truth.
  if (input.status === "delivered" || input.status === "picked_up") {
    await execute(
      `UPDATE orders SET status = 'fulfilled', fulfilled_at = ?, updated_at = ?
        WHERE id = ? AND status != 'fulfilled'`,
      [timestamp, timestamp, shipment.order_id],
    );
    await execute(
      "UPDATE order_items SET fulfilment_status = 'fulfilled' WHERE order_id = ? AND item_type != 'digital'",
      [shipment.order_id],
    );
  } else if (statusChanged && (input.status === "shipped" || input.status === "in_transit")) {
    await execute(
      `UPDATE orders SET status = 'processing', updated_at = ? WHERE id = ? AND status = 'paid'`,
      [timestamp, shipment.order_id],
    );
  }

  return { ok: true, shipment: updated };
}

/**
 * Close an open shipment at its terminal state — delivered, or picked up —
 * without walking the ladder. Called when the seller marks the order fulfilled
 * directly, so the buyer's tracking view always agrees with the order state.
 */
export async function closeShipmentForOrder(orderId: string): Promise<void> {
  const shipment = await getShipmentForOrder(orderId);
  if (!shipment || isTerminal(shipment.status)) return;

  const terminal: ShipmentStatus = shipment.method === "pickup" ? "picked_up" : "delivered";
  const timestamp = nowIso();

  await batch([
    {
      sql: `UPDATE shipments SET status = ?, delivered_at = ?, updated_at = ? WHERE id = ?`,
      args: [terminal, timestamp, timestamp, shipment.id],
    },
    {
      sql: `INSERT INTO shipment_events (id, shipment_id, status, title, actor, created_at)
            VALUES (?, ?, ?, ?, 'seller', ?)`,
      args: [
        newId("shev"),
        shipment.id,
        terminal,
        SHIPMENT_STATE_LABELS[terminal],
        timestamp,
      ],
    },
  ]);

  await notifyBuyerOfUpdate({
    orderId: shipment.order_id,
    status: terminal,
    method: shipment.method,
    note: null,
    location: shipment.current_location,
    at: timestamp,
  });
}

/**
 * Close a shipment as cancelled — called when its order is cancelled or
 * refunded. Recorded as an event so the timeline explains what happened.
 */
export async function cancelShipment(orderId: string, title = "Cancelled"): Promise<void> {
  const shipment = await getShipmentForOrder(orderId);
  if (!shipment || isTerminal(shipment.status)) return;

  const timestamp = nowIso();
  await batch([
    {
      sql: "UPDATE shipments SET status = 'cancelled', updated_at = ? WHERE id = ?",
      args: [timestamp, shipment.id],
    },
    {
      sql: `INSERT INTO shipment_events (id, shipment_id, status, title, actor, created_at)
            VALUES (?, ?, 'cancelled', ?, 'system', ?)`,
      args: [newId("shev"), shipment.id, title, timestamp],
    },
  ]);
}

// --- The buyer's map --------------------------------------------------------

/**
 * The map payload for a shipment: only the points that are actually known,
 * in journey order. A point missing its coordinates is simply absent from the
 * map — the timeline and the location list still name it in words.
 */
export function buildTrackingMapData(
  shipment: ShipmentRow,
  events: ShipmentEventRow[],
): TrackingMapData {
  const markers: TrackingMapData["markers"] = [];

  if (shipment.origin && shipment.origin_lat !== null && shipment.origin_lng !== null) {
    markers.push({
      lat: shipment.origin_lat,
      lng: shipment.origin_lng,
      label: `From ${shipment.origin}`,
      kind: "origin",
    });
  }

  if (
    shipment.current_location &&
    shipment.current_lat !== null &&
    shipment.current_lng !== null &&
    (shipment.current_lat !== shipment.origin_lat || shipment.current_lng !== shipment.origin_lng)
  ) {
    markers.push({
      lat: shipment.current_lat,
      lng: shipment.current_lng,
      label: `Last reported: ${shipment.current_location}`,
      kind: "current",
    });
  }

  if (
    shipment.destination &&
    shipment.destination_lat !== null &&
    shipment.destination_lng !== null
  ) {
    markers.push({
      lat: shipment.destination_lat,
      lng: shipment.destination_lng,
      label:
        shipment.method === "pickup" ? `Collection: ${shipment.destination}` : `To ${shipment.destination}`,
      kind: "destination",
    });
  }

  // The journey line is drawn between reported points only — a straight
  // segment is "these two reported places", not a claimed route.
  const order: Array<"origin" | "current" | "destination"> = ["origin", "current", "destination"];
  const route = order
    .map((kind) => markers.find((marker) => marker.kind === kind))
    .filter((marker): marker is TrackingMapData["markers"][number] => Boolean(marker))
    .map((marker) => [marker.lat, marker.lng] as [number, number]);

  const lastReport = [...events].reverse().find((event) => event.location);

  return {
    markers,
    route,
    tiles: mapConfig.tiles,
    reportedAt: shipment.current_location_at ?? lastReport?.created_at ?? null,
    reportedLabel: shipment.current_location,
  };
}

// --- The buyer's timeline ---------------------------------------------------

export type TimelineStep = {
  key: string;
  label: string;
  state: "done" | "current" | "upcoming";
  /** When this happened — only set once it has. */
  at: string | null;
  /** The seller's words/where, when they reported any. */
  note: string | null;
  location: string | null;
};

/**
 * The tracking timeline, built only from recorded acts.
 *
 * Each step lights up because something happened and is stamped with when —
 * future steps are visibly *not yet* rather than greyed-out decoration. The
 * current step is where the order actually stands right now.
 */
export function shipmentTimeline(
  order: Pick<OrderRow, "created_at" | "paid_at" | "cancelled_at" | "status">,
  shipment: ShipmentRow | null,
  events: ShipmentEventRow[],
): TimelineStep[] {
  const eventByStatus = new Map<string, ShipmentEventRow>();
  for (const event of events) {
    if (!eventByStatus.has(event.status)) eventByStatus.set(event.status, event);
  }

  const cancelled = shipment?.status === "cancelled" || order.status === "cancelled" || order.status === "refunded";

  const placement: TimelineStep[] = [
    {
      key: "placed",
      label: "Order placed",
      state: "done",
      at: order.created_at,
      note: null,
      location: null,
    },
    {
      key: "paid",
      label: "Payment confirmed",
      state: order.paid_at ? "done" : "current",
      at: order.paid_at,
      note: null,
      location: null,
    },
  ];

  if (!shipment) return placement;

  const ladder = LADDER[shipment.method];
  const currentIndex = ladder.indexOf(shipment.status);

  const stageLabels: Record<string, string> = {
    preparing: shipment.method === "pickup" ? "Preparing for collection" : "Seller processing",
    ready_to_ship: "Ready for shipment",
    shipped: "Shipped",
    in_transit: "In transit",
    out_for_delivery: "Out for delivery",
    delivered: "Delivered",
    ready_for_pickup: "Ready for pickup",
    picked_up: "Picked up",
    cancelled: "Cancelled",
  };

  const steps: TimelineStep[] = [...placement];

  for (const [index, status] of ladder.entries()) {
    const event = eventByStatus.get(status);
    const reached = index <= currentIndex;
    const isCurrent = index === currentIndex && !cancelled;

    steps.push({
      key: status,
      label: stageLabels[status] ?? SHIPMENT_STATE_LABELS[status],
      state: reached ? (isCurrent ? "current" : "done") : "upcoming",
      at: event?.created_at ?? (reached ? shipment.updated_at : null),
      note: event?.note ?? null,
      location: event?.location ?? (isCurrent ? shipment.current_location : null),
    });
  }

  if (cancelled) {
    steps.push({
      key: "cancelled",
      label: "Cancelled",
      state: "current",
      at: order.cancelled_at ?? shipment.updated_at,
      note: eventByStatus.get("cancelled")?.note ?? null,
      location: null,
    });
  }

  return steps;
}
