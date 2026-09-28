"use client";

/**
 * The seller's fulfilment controls.
 *
 * One panel, one truth: the shipment's state lives in the database, and every
 * change here is a recorded act with a timestamp and (optionally) a place the
 * seller reports. Nothing moves automatically — there is no GPS in this
 * platform, so the seller's updates *are* the tracking data the buyer sees.
 */

import { Button } from "@heroui/react";
import { useState, useTransition } from "react";

import { updateShipmentAction } from "@/app/actions/orders-admin";
import { Icon } from "@/components/ui/Icon";
import { StatusChip } from "@/components/ui/atoms";
import { Field, TextAreaField } from "@/components/ui/field";
import { InfoNote } from "@/components/ui/feedback";
import {
  DELIVERY_LADDER,
  PICKUP_LADDER,
  SHIPMENT_STATE_LABELS,
  shipmentStatusTone,
} from "@/lib/catalog";
import { formatDateTime, formatRelative } from "@/lib/format";

export type ShipmentPanelData = {
  id: string;
  orderId: string;
  method: "delivery" | "pickup";
  status: string;
  origin: string | null;
  destination: string | null;
  current_location: string | null;
  current_location_at: string | null;
  estimated_delivery: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  events: Array<{
    id: string;
    status: string;
    title: string;
    note: string | null;
    location: string | null;
    created_at: string;
  }>;
};

export function ShipmentPanel({ shipment }: { shipment: ShipmentPanelData }) {
  const [status, setStatus] = useState(shipment.status);
  const [location, setLocation] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const terminal = ["delivered", "picked_up", "cancelled"].includes(shipment.status);
  const ladder: readonly string[] =
    shipment.method === "pickup" ? PICKUP_LADDER : DELIVERY_LADDER;
  const currentIndex = ladder.indexOf(shipment.status);

  // Forward only: the ladder never walks backwards, and the current state is
  // offered too — reporting a new place at the same stage is a real update.
  const options =
    currentIndex === -1
      ? [...ladder]
      : ladder.slice(currentIndex);

  const submit = () => {
    setMessage(null);
    startTransition(async () => {
      const result = await updateShipmentAction({
        shipmentId: shipment.id,
        orderId: shipment.orderId,
        status,
        location: location.trim() || null,
        note: note.trim() || null,
      });

      if (result.ok) {
        setMessage({ ok: true, text: "Shipment updated. The buyer can see it now." });
        setLocation("");
        setNote("");
      } else {
        setMessage({ ok: false, text: result.error ?? "The update did not go through." });
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon name={shipment.method === "pickup" ? "storefront" : "packageCheck"} size={16} />
          <p className="text-sm font-semibold">
            {shipment.method === "pickup" ? "Pickup order" : "Delivery"}
          </p>
        </div>
        <StatusChip
          label={SHIPMENT_STATE_LABELS[shipment.status] ?? shipment.status}
          tone={shipmentStatusTone(shipment.status)}
        />
      </div>

      {shipment.estimated_delivery ? (
        <p className="text-xs text-muted">            Buyer&apos;s estimate: {shipment.estimated_delivery} after payment. An estimate, not a
          promised date.
        </p>
      ) : null}

      <div className="space-y-1 text-xs text-muted">
        {shipment.origin ? (
          <p className="flex items-start gap-1.5">
            <Icon name="mapPin" size={12} className="mt-0.5 shrink-0" /> From {shipment.origin}
          </p>
        ) : null}
        {shipment.destination ? (
          <p className="flex items-start gap-1.5">
            <Icon name="mapPin" size={12} className="mt-0.5 shrink-0" />
            {shipment.method === "pickup" ? "Collection point" : "To"} {shipment.destination}
          </p>
        ) : null}
        {shipment.current_location ? (
          <p className="flex items-start gap-1.5">
            <Icon name="clock" size={12} className="mt-0.5 shrink-0" />
            Last reported: {shipment.current_location}
            {shipment.current_location_at
              ? ` (${formatRelative(shipment.current_location_at)})`
              : ""}
          </p>
        ) : null}
      </div>

      {terminal ? (
        <InfoNote tone={shipment.status === "cancelled" ? "danger" : "primary"}
          title={`Fulfilment closed · ${SHIPMENT_STATE_LABELS[shipment.status] ?? shipment.status}`}
        >
          A closed fulfilment cannot be changed. The timeline below is the record of what happened.
        </InfoNote>
      ) : (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-muted">Update to</p>
            <div className="flex flex-wrap gap-1.5">
              {options.map((option) => (
                <Button
                  key={option}
                  size="sm"
                  variant={status === option ? "primary" : "secondary"}
                  isDisabled={pending}
                  onPress={() => setStatus(option)}
                >
                  {SHIPMENT_STATE_LABELS[option] ?? option}
                </Button>
              ))}
            </div>
          </div>

          <Field
            isDisabled={pending}
            value={location}
            onChange={setLocation}
            label="Where is it now? (optional)"
            placeholder="e.g. Lagos distribution hub"
          />

          <TextAreaField
            isDisabled={pending}
            value={note}
            onChange={setNote}
            label="Note for the buyer (optional)"
            placeholder="Anything worth telling them about this update"
            rows={2}
          />

          <Button variant="primary" isPending={pending} onPress={submit} fullWidth>
            Record this update
          </Button>

          <p className="text-xs text-muted">
            You are reporting this. The buyer sees it exactly as a seller-reported update with the
            time you made it. This platform does not use live GPS.
          </p>
        </div>
      )}

      {message ? (
        <p className={message.ok ? "text-xs text-success" : "text-xs text-danger"} role="status">
          {message.text}
        </p>
      ) : null}

      {shipment.events.length > 0 ? (
        <div className="space-y-2.5 border-t border-border pt-3">
          <p className="text-xs font-semibold text-muted uppercase tracking-wide">Timeline</p>
          <ol className="space-y-2.5">
            {shipment.events.map((event) => (
              <li key={event.id} className="flex items-start gap-2.5 text-sm">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-foreground/40" />
                <div className="min-w-0">
                  <p className="text-sm font-medium">{event.title}</p>
                  <p className="text-xs text-muted">
                    {formatDateTime(event.created_at)}
                    {event.location ? ` · ${event.location}` : ""}
                  </p>
                  {event.note ? <p className="text-xs text-muted">{event.note}</p> : null}
                </div>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}
