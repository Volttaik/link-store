"use client";

import { Button, Card } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { saveEventAction } from "@/app/actions/listings";
import { Field, SelectField, SwitchField, TextAreaField } from "@/components/ui/field";
import { InfoNote } from "@/components/ui/feedback";
import { SingleImageUploader } from "@/components/ui/MediaUploader";
import { EVENT_STATUSES } from "@/lib/catalog";
import { minorToInput, parseMoneyToMinor } from "@/lib/money";
import type { EventDetail, TicketTypeRow } from "@/lib/types";

const STATUS_OPTIONS = EVENT_STATUSES.map((entry) => ({
  value: entry.value,
  label: entry.label,
}));

type TicketDraft = {
  key: string;
  id?: string;
  name: string;
  description: string;
  price: string;
  quantityTotal: string;
  maxPerOrder: string;
  isActive: boolean;
  /** Ticket types with sales cannot be removed — this prevents that. */
  sold: number;
};

function toLocalInput(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  // datetime-local expects `YYYY-MM-DDTHH:mm` in the viewer's own timezone.
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function EventForm({
  event,
  currency,
  defaultStatus = "draft",
}: {
  event?: EventDetail;
  currency: string;
  defaultStatus?: "draft" | "published";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [title, setTitle] = useState(event?.title ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(event?.coverImageUrl ?? null);
  const [startsAt, setStartsAt] = useState(toLocalInput(event?.startsAt));
  const [endsAt, setEndsAt] = useState(toLocalInput(event?.endsAt));
  const [timezone, setTimezone] = useState(event?.timezone ?? "Africa/Lagos");
  const [isOnline, setIsOnline] = useState(event?.isOnline ?? false);
  const [venueName, setVenueName] = useState(event?.venueName ?? "");
  const [address, setAddress] = useState(event?.address ?? "");
  const [city, setCity] = useState(event?.city ?? "");
  const [state, setState] = useState(event?.state ?? "");
  const [country, setCountry] = useState(event?.country ?? "Nigeria");
  const [onlineUrl, setOnlineUrl] = useState(event?.onlineUrl ?? "");
  const [capacity, setCapacity] = useState(String(event?.capacity ?? ""));
  const [status, setStatus] = useState<"draft" | "published" | "cancelled" | "completed">(
    (event?.status as "draft" | "published" | "cancelled" | "completed") ?? defaultStatus,
  );

  const [tickets, setTickets] = useState<TicketDraft[]>(
    event?.ticketTypes.map((ticket: TicketTypeRow) => ({
      key: ticket.id,
      id: ticket.id,
      name: ticket.name,
      description: ticket.description ?? "",
      price: minorToInput(ticket.price, ticket.currency),
      quantityTotal: String(ticket.quantity_total),
      maxPerOrder: String(ticket.max_per_order),
      isActive: ticket.is_active === 1,
      sold: Number(ticket.quantity_sold),
    })) ?? [
      {
        key: "first",
        name: "General admission",
        description: "",
        price: "",
        quantityTotal: "100",
        maxPerOrder: "10",
        isActive: true,
        sold: 0,
      },
    ],
  );

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const addTicket = () =>
    setTickets((previous) => [
      ...previous,
      {
        key: `new-${Date.now()}`,
        name: "",
        description: "",
        price: "",
        quantityTotal: "50",
        maxPerOrder: "10",
        isActive: true,
        sold: 0,
      },
    ]);

  const submit = (formEvent: React.FormEvent) => {
    formEvent.preventDefault();
    setError(null);
    setSuccess(null);

    if (title.trim().length < 2) {
      setError("Give this event a name.");
      return;
    }

    const startsAtIso = fromLocalInput(startsAt);
    if (!startsAtIso) {
      setError("Choose the date and time the event starts.");
      return;
    }

    if (status === "published" && tickets.filter((ticket) => ticket.name.trim()).length === 0) {
      setError("Add at least one ticket type before publishing, otherwise nobody can attend.");
      return;
    }

    const cleanedTickets = tickets
      .filter((ticket) => ticket.name.trim().length > 0)
      .map((ticket) => ({
        id: ticket.id,
        name: ticket.name.trim(),
        description: ticket.description.trim() || null,
        price: parseMoneyToMinor(ticket.price || "0", currency) ?? 0,
        quantityTotal: Math.max(0, Number.parseInt(ticket.quantityTotal || "0", 10) || 0),
        maxPerOrder: Math.max(1, Number.parseInt(ticket.maxPerOrder || "10", 10) || 10),
        isActive: ticket.isActive,
      }));

    startTransition(async () => {
      const result = await saveEventAction({
        id: event?.id,
        title: title.trim(),
        description: description.trim() || null,
        coverImageUrl,
        startsAt: startsAtIso,
        endsAt: fromLocalInput(endsAt),
        timezone,
        venueName: venueName.trim() || null,
        address: address.trim() || null,
        city: city.trim() || null,
        state: state.trim() || null,
        country: country.trim() || null,
        isOnline,
        onlineUrl: onlineUrl.trim() || null,
        capacity: capacity.trim() ? Number.parseInt(capacity, 10) || null : null,
        status,
        ticketTypes: cleanedTickets,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setSuccess(event ? "Event saved." : "Event created.");
      if (!event) router.push(`/workspace/events/${result.data.eventId}`);
      else router.refresh();
    });
  };

  return (
    <form onSubmit={submit} className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.9fr)]">
      <div className="space-y-6">
        <Card className="ls-elev-2">
          <Card.Header className="pb-0">
            <p className="text-sm font-semibold">Event details</p>
          </Card.Header>
          <Card.Content className="gap-5">
            <Field
              isRequired
              label="Event name"
              name="title"
              onChange={setTitle}
              placeholder="Lagos Tech Conference 2026"
              value={title}
            />

            <TextAreaField
              label="Description"
              name="description"
              onChange={setDescription}
              placeholder="What attendees can expect, line-up, what to bring…"
              rows={4}
              value={description}
            />

            <div>
              <p className="mb-2 text-xs font-medium text-muted">Cover image</p>
              <SingleImageUploader
                value={coverImageUrl}
                onChange={(image) => setCoverImageUrl(image?.url ?? null)} folder="events" label="Upload cover"
              />
            </div>
          </Card.Content>
        </Card>

        <Card className="ls-elev-2">
          <Card.Header className="flex-col items-start gap-1">
            <p className="text-sm font-semibold">Ticket types</p>
            <p className="text-xs text-muted">
              Each type has its own price and capacity. Types that have already sold tickets cannot be
              deleted, so sold tickets stay valid.
            </p>
          </Card.Header>
          <Card.Content className="gap-4">
            {tickets.map((ticket) => (
              <div key={ticket.key} className="space-y-3 rounded-xl bg-surface-secondary/50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                    {ticket.sold > 0 ? `${ticket.sold} sold` : "New ticket type"}
                  </span>
                  {ticket.sold > 0 ? (
                    <span className="text-xs text-muted">
                      Cannot be removed — tickets have been issued.
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant="danger-soft"
                      onPress={() =>
                        setTickets((previous) =>
                          previous.filter((entry) => entry.key !== ticket.key),
                        )
                      }
                    >
                      Remove
                    </Button>
                  )}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    inputClassName="text-sm"
                    label="Name"
                    onChange={(value) =>
                      setTickets((previous) =>
                        previous.map((entry) =>
                          entry.key === ticket.key ? { ...entry, name: value } : entry,
                        ),
                      )
                    }
                    placeholder="General admission"
                    value={ticket.name}
                  />
                  <Field
                    inputClassName="text-sm"
                    inputProps={{ inputMode: "decimal" }}
                    label={`Price (${currency})`}
                    onChange={(value) =>
                      setTickets((previous) =>
                        previous.map((entry) =>
                          entry.key === ticket.key ? { ...entry, price: value } : entry,
                        ),
                      )
                    }
                    placeholder="0 for free"
                    value={ticket.price}
                  />
                  <Field
                    description="0 means unlimited"
                    inputClassName="text-sm"
                    inputProps={{ inputMode: "numeric", min: 0 }}
                    label="Capacity"
                    onChange={(value) =>
                      setTickets((previous) =>
                        previous.map((entry) =>
                          entry.key === ticket.key ? { ...entry, quantityTotal: value } : entry,
                        ),
                      )
                    }
                    type="number"
                    value={ticket.quantityTotal}
                  />
                  <Field
                    inputClassName="text-sm"
                    inputProps={{ inputMode: "numeric", min: 1 }}
                    label="Max per order"
                    onChange={(value) =>
                      setTickets((previous) =>
                        previous.map((entry) =>
                          entry.key === ticket.key ? { ...entry, maxPerOrder: value } : entry,
                        ),
                      )
                    }
                    type="number"
                    value={ticket.maxPerOrder}
                  />
                </div>

                <SwitchField
                  isSelected={ticket.isActive}
                  size="sm"
                  onChange={(value) =>
                    setTickets((previous) =>
                      previous.map((entry) =>
                        entry.key === ticket.key ? { ...entry, isActive: value } : entry,
                      ),
                    )
                  }
                >
                  On sale
                </SwitchField>
              </div>
            ))}

            <Button size="sm" variant="secondary" onPress={addTicket}>
              Add another ticket type
            </Button>
          </Card.Content>
        </Card>
      </div>

      <div className="space-y-6">
        <Card className="ls-elev-2">
          <Card.Header className="pb-0">
            <p className="text-sm font-semibold">When & where</p>
          </Card.Header>
          <Card.Content className="gap-5">
            <Field
              isRequired
              label="Starts"
              name="startsAt"
              onChange={setStartsAt}
              type="datetime-local"
              value={startsAt}
            />
            <Field
              label="Ends"
              name="endsAt"
              onChange={setEndsAt}
              type="datetime-local"
              value={endsAt}
            />
            <Field
              description="IANA name, e.g. Africa/Lagos"
              label="Timezone"
              name="timezone"
              onChange={setTimezone}
              value={timezone}
            />

            <SwitchField isSelected={isOnline} size="sm" onChange={setIsOnline}>
              Online event
            </SwitchField>

            {isOnline ? (
              <Field
                description="Shared with attendees after purchase."
                label="Meeting link"
                name="onlineUrl"
                onChange={setOnlineUrl}
                placeholder="https://…"
                type="url"
                value={onlineUrl}
              />
            ) : (
              <>
                <Field
                  label="Venue"
                  name="venueName"
                  onChange={setVenueName}
                  placeholder="Eko Convention Centre"
                  value={venueName}
                />
                <Field
                  label="Address"
                  name="address"
                  onChange={setAddress}
                  value={address}
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="City" name="city" onChange={setCity} value={city} />
                  <Field label="State" name="state" onChange={setState} value={state} />
                </div>
                <Field
                  label="Country"
                  name="country"
                  onChange={setCountry}
                  value={country}
                />
              </>
            )}

            <Field
              description="Optional overall limit, separate from ticket capacities."
              inputProps={{ inputMode: "numeric", min: 0 }}
              label="Total capacity"
              name="capacity"
              onChange={setCapacity}
              type="number"
              value={capacity}
            />
          </Card.Content>
        </Card>

        <Card className="ls-elev-2">
          <Card.Header className="pb-0">
            <p className="text-sm font-semibold">Publication</p>
          </Card.Header>
          <Card.Content className="gap-4">
            <SelectField
              label="Status"
              name="status"
              onChange={(value) =>
                setStatus(
                  (value ?? "draft") as "draft" | "published" | "cancelled" | "completed",
                )
              }
              options={STATUS_OPTIONS}
              value={status}
            />

            

            {/*
             * The form is submitted through an onSubmit handler running in a
             * transition, not through a form `action`, so `useFormStatus` would
             * never report it. The button therefore owns its own pending state —
             * like the listing form — instead of silently showing no progress.
             */}
            <Button
              fullWidth isPending={pending} size="lg"
              type="submit" variant="primary"
            >
              {event ? "Save event" : "Create event"}
            </Button>

            {error ? <InfoNote tone="danger">{error}</InfoNote> : null}
            {success ? <InfoNote tone="success">{success}</InfoNote> : null}

            {!pending && status === "published" && tickets.every((ticket) => !ticket.isActive) ? (
              <InfoNote title="Every ticket type is switched off" tone="warning">
                Your event will be visible but nobody will be able to buy a ticket.
              </InfoNote>
            ) : null}
          </Card.Content>
        </Card>
      </div>
    </form>
  );
}
