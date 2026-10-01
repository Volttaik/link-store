"use client";
import { Button, Card } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveEventAction } from "@/app/actions/listings";
import { Field, SelectField, TextAreaField } from "@/components/ui/field";
import { useFormAttention } from "@/components/ui/useFormAttention";
import { InfoNote } from "@/components/ui/feedback";
import { SingleImageUploader } from "@/components/ui/MediaUploader";
import { EVENT_STATUSES } from "@/lib/catalog";
import { formatMoney } from "@/lib/money";
import type { EventDetail, ListingCardData } from "@/lib/types";
function localDate(value?: string | null) { if (!value) return ""; const date = new Date(value); return Number.isFinite(date.getTime()) ? new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ""; }
export function EventForm({ event, products, defaultStatus = "draft" }: { event?: EventDetail; products: ListingCardData[]; currency?: string; defaultStatus?: "draft" | "published" }) {
  const { formRef, issue, setIssue, attention, takeMeThere, clearField } = useFormAttention();
  const [uploading, setUploading] = useState(false);
  const router = useRouter(); const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState(event?.title ?? ""); const [description, setDescription] = useState(event?.description ?? "");
  const [cover, setCover] = useState(event?.coverImageUrl ?? null); const [starts, setStarts] = useState(localDate(event?.startsAt)); const [ends, setEnds] = useState(localDate(event?.endsAt));
  const [status, setStatus] = useState(event?.status ?? defaultStatus); const [selected, setSelected] = useState<string[]>(event?.productIds ?? []);
  const [search, setSearch] = useState(""); const [savedId, setSavedId] = useState<string | null>(null);
  const visible = products.filter(product => product.title.toLowerCase().includes(search.trim().toLowerCase()));
  const submit = (e: React.FormEvent) => { e.preventDefault(); if (pending || uploading) return; setIssue(null);
    if (title.trim().length < 2) return setIssue({ message: "Event name required.", field: "name" });
    if (status === "published" && !selected.length) return setIssue({ message: "Select at least one product before publishing.", field: "products" });
    if (status === "published" && products.some(product => selected.includes(product.id) && product.status !== "active")) return setIssue({ message: "Publish your selected products first, or remove unpublished products.", field: "products" });
    if ((starts && !Number.isFinite(Date.parse(starts))) || (ends && !Number.isFinite(Date.parse(ends))) || (starts && ends && Date.parse(ends) < Date.parse(starts))) return setIssue({ message: "Choose valid dates with the end after the start.", field: "timing" });
    startTransition(async () => {
    try {
      const result = await saveEventAction({ id: event?.id ?? savedId ?? undefined, title, description, coverImageUrl: cover, startsAt: starts ? new Date(starts).toISOString() : null, endsAt: ends ? new Date(ends).toISOString() : null, status: status as "draft" | "published" | "cancelled" | "completed", productIds: selected });
      if (!result.ok) return setIssue({ message: result.error });
      setSavedId(result.data.eventId);
      router.push(`/workspace/events/${result.data.eventId}`); router.refresh();
    } catch { setIssue({ message: "Your Event could not be saved. Please try again." }); }
  }); };
  return <form ref={formRef} noValidate onSubmit={submit} className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]"><fieldset disabled={pending} className="contents">
    <div className="space-y-5"><Card><Card.Header><h2 className="font-semibold">Curate your next drop</h2></Card.Header><Card.Content className="gap-5">
      <div {...attention("name")}><Field isRequired label="Event name" value={title} onChange={value => { setTitle(value); clearField("name"); }} placeholder="Summer Sale, New Drop, Weekend Edit…" /></div>
      <TextAreaField label="Description" value={description} onChange={setDescription} rows={4} placeholder="What brings these products together?" />
      <SingleImageUploader value={cover} onChange={image => setCover(image?.url ?? null)} folder="events" label="Upload cover" onBusyChange={setUploading} />
    </Card.Content></Card>
    <Card><Card.Header className="flex justify-between"><h2 className="font-semibold">Select Products</h2><span className="text-sm text-muted">{selected.length} selected</span></Card.Header><Card.Content className="gap-4">
      <div {...attention("products")}><Field label="Search your products" value={search} onChange={setSearch} placeholder="Find a product…" />
      <div className="max-h-[32rem] space-y-2 overflow-y-auto overscroll-contain pr-1">
        {visible.map(product => <label key={product.id} className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-3 transition-colors ${selected.includes(product.id) ? "border-accent bg-accent/5" : "border-border hover:bg-surface-secondary"}`}>
          <input type="checkbox" className="size-5 shrink-0 accent-current" checked={selected.includes(product.id)} onChange={e => { setSelected(previous => e.target.checked ? [...previous, product.id] : previous.filter(id => id !== product.id)); clearField("products"); }} />
          {product.imageUrl ? <img src={product.imageUrl} alt="" loading="lazy" className="size-16 shrink-0 rounded-xl object-cover" /> : <span className="size-16 shrink-0 rounded-xl bg-surface-secondary" />}
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{product.title}</span><span className="block text-sm text-muted">{formatMoney(product.price, product.currency)}{product.status !== "active" ? " · Unpublished" : ""}</span></span>
        </label>)}
        {!visible.length ? <p className="py-10 text-center text-sm text-muted">{products.length ? "No matching products." : "Create a product first, then add it to your Event."}</p> : null}
      </div>
      </div><p className="text-xs text-muted">These are your existing products. Removing one here does not delete it from your store.</p>
    </Card.Content></Card></div>
    <Card className="h-fit"><Card.Header><h2 className="font-semibold">Timing & publishing</h2></Card.Header><Card.Content className="gap-5">
      <div {...attention("timing")} className={`${attention("timing").className} space-y-5`}><Field label="Starts (optional)" type="datetime-local" value={starts} onChange={value => { setStarts(value); clearField("timing"); }} />
      <Field label="Ends (optional)" type="datetime-local" value={ends} onChange={value => { setEnds(value); clearField("timing"); }} /></div>
      <SelectField label="Status" value={status} onChange={value => setStatus(value ?? "draft")} options={EVENT_STATUSES} />
      {issue ? <InfoNote tone="danger"><span role="alert">{issue.message}</span>{issue.field ? <button type="button" onClick={takeMeThere} className="ml-2 font-semibold underline">Take me there</button> : null}</InfoNote> : null}
      <Button type="submit" isDisabled={pending || uploading} isPending={pending} variant="primary">{event ? "Save Event" : "Create Event"}</Button>
    </Card.Content></Card></fieldset>
  </form>;
}
