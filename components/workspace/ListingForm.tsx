"use client";

import { Button, Card } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveListingAction } from "@/app/actions/listings";
import { Field, SelectField, SwitchField, TextAreaField } from "@/components/ui/field";
import { useFormAttention } from "@/components/ui/useFormAttention";
import { InfoNote } from "@/components/ui/feedback";
import { ImageUploader, type UploadedImage } from "@/components/ui/MediaUploader";
import { LISTING_STATUSES } from "@/lib/catalog";
import { minorToInput, parseMoneyToMinor } from "@/lib/money";
import type { ListingDetail, ListingStatus, ListingType } from "@/lib/types";

export type ListingFormProps = {
  listing?: ListingDetail; categories: Array<{ id: string; name: string }>; currency: string;
  stayOnPage?: boolean;
  defaultType?: ListingType; lockedType?: boolean; autoPublish?: boolean; submitLabel?: string; defaultCategoryId?: string;
};
type Variant = { id?: string; key: string; name: string; price: string; stock: string; sku: string };
export function ListingForm({ listing, categories, currency, autoPublish = false, submitLabel, defaultCategoryId, stayOnPage = false }: ListingFormProps) {
  currency = listing?.currency ?? currency;
  const router = useRouter();
  const { formRef, issue, setIssue, attention, takeMeThere, clearField } = useFormAttention();
  const [uploading, setUploading] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState(listing?.title ?? "");
  const [description, setDescription] = useState(listing?.description ?? "");
  const initialCategory = listing?.categoryId ?? defaultCategoryId;
  const [categoryId, setCategoryId] = useState(categories.some(category => category.id === initialCategory) ? initialCategory! : "");
  const [price, setPrice] = useState(listing ? minorToInput(listing.price, currency) : "");
  const [compareAt, setCompareAt] = useState(listing?.compareAtPrice != null ? minorToInput(listing.compareAtPrice, currency) : "");
  const [stock, setStock] = useState(String(listing?.stock ?? 0));
  const [trackInventory, setTrackInventory] = useState(listing?.trackInventory ?? true);
  const [status, setStatus] = useState<ListingStatus>((listing?.status as ListingStatus) ?? (autoPublish ? "active" : "draft"));
  const [featured, setFeatured] = useState(listing?.isFeatured ?? false);
  const [images, setImages] = useState<UploadedImage[]>(listing?.images.map(image => ({ url: image.image_url, key: image.storage_key, alt: image.alt })) ?? []);
  const [variants, setVariants] = useState<Variant[]>(listing?.variants.map(variant => ({ id: variant.id, key: variant.id, name: variant.name, price: variant.price == null ? "" : minorToInput(variant.price, currency), stock: String(variant.stock), sku: variant.sku ?? "" })) ?? []);
  const setError = (message: string, field?: string) => setIssue({ message, field });
  const updateVariant = (key: string, patch: Partial<Variant>) => setVariants(previous => previous.map(variant => variant.key === key ? { ...variant, ...patch } : variant));
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (pending || uploading) return;
    setIssue(null);
    const amount = parseMoneyToMinor(price, currency);
    const compare = compareAt.trim() ? parseMoneyToMinor(compareAt, currency) : null;
    if (title.trim().length < 2) return setError("Product name required.", "name");
    if (status === "active" && !categoryId) return setError("Category required before publishing.", "category");
    if (status === "active" && !images.length) return setError("Product image required before publishing.", "photos");
    if (amount === null || amount < 0) return setError("Enter a valid price.", "price");
    if (compareAt.trim() && compare === null) return setError("Enter a valid compare-at price.", "price");
    if (!Number.isSafeInteger(Number(stock)) || Number(stock) < 0) return setError("Stock must be a whole number of zero or more.", "price");
    const cleanVariants = variants.map(variant => ({ id: variant.id, name: variant.name.trim(), sku: variant.sku || null, price: variant.price.trim() ? parseMoneyToMinor(variant.price, currency) : null, stock: Number(variant.stock) }));
    if (cleanVariants.some((variant, index) => !variant.name || !Number.isSafeInteger(variant.stock) || variant.stock < 0 || (variants[index].price.trim() && variant.price === null))) return setError("Check each option's name, price and stock.", "options");
    startTransition(async () => {
      try {
        const result = await saveListingAction({
          id: listing?.id ?? savedId ?? undefined, type: "product", title: title.trim(), description: description.trim() || null,
          subtitle: listing?.subtitle ?? null, categoryId: categoryId || null, price: amount, compareAtPrice: compare,
          costPrice: listing?.costPrice ?? null, sku: listing?.sku ?? null, trackInventory,
          stock: cleanVariants.length ? cleanVariants.reduce((total, variant) => total + variant.stock, 0) : Number(stock),
          attributes: listing?.attributes ?? {}, status, isFeatured: featured,
          images: images.map(image => ({ url: image.url, key: image.key, alt: image.alt ?? null })), variants: cleanVariants,
        });
        if (!result.ok) return setError(result.error);
        setSavedId(result.data.listingId);
        setVariants(previous => previous.map((variant, index) => ({ ...variant, id: result.data.variantIds[index] })));
        if (!stayOnPage) router.push(`/workspace/listings/${result.data.listingId}`);
        router.refresh();
      } catch { setError("Your product could not be saved. Please try again."); }
    });
  };
  return <form ref={formRef} noValidate onSubmit={submit} onChange={event => { const field = (event.target as HTMLElement).closest<HTMLElement>("[data-form-field]")?.dataset.formField; if (field) clearField(field); }} className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]"><fieldset disabled={pending} className="contents">
    <div className="space-y-5">
      <Card><Card.Header><h2 className="font-semibold">Your product</h2></Card.Header><Card.Content className="gap-5">
        <div {...attention("name")}><Field isRequired label="Product name" value={title} onChange={setTitle} placeholder="What are you selling?" /></div>
        <TextAreaField label="Description" value={description} onChange={setDescription} rows={5} placeholder="Tell buyers what makes it special, including size and materials." />
        {listing?.categoryId && !categories.some(category => category.id === listing.categoryId) ? <InfoNote title="Choose a current category">This product&apos;s old category has been retired. Select a specific category when updating it.</InfoNote> : null}
        <div {...attention("category")}><SelectField label="Category" name="categoryId" value={categoryId || null} onChange={value => { setCategoryId(value ?? ""); clearField("category"); }} options={categories.map(category => ({ value: category.id, label: category.name }))} placeholder="Select Category" /></div>
      </Card.Content></Card>
      <Card><Card.Header><h2 className="font-semibold">Photos</h2></Card.Header><Card.Content className="gap-3"><p className="text-sm text-muted">Your first photo leads. Add clear views of the product.</p><div {...attention("photos")}><ImageUploader value={images} onChange={value => { setImages(value); clearField("photos"); }} onBusyChange={setUploading} folder="listings" max={8} /></div></Card.Content></Card>
      <Card><Card.Header className="flex items-center justify-between"><h2 className="font-semibold">Options</h2><Button size="sm" variant="secondary" onPress={() => setVariants(previous => [...previous, { key: crypto.randomUUID(), name: "", price: "", stock: "0", sku: "" }])}>Add option</Button></Card.Header><Card.Content className="gap-4">
        <div {...attention("options")}>{!variants.length ? <p className="text-sm text-muted">Optional sizes or colours, each with its own stock.</p> : variants.map(variant => <div key={variant.key} className="grid gap-3 rounded-2xl bg-surface-secondary p-3 sm:grid-cols-3">
          <Field label="Name" value={variant.name} onChange={name => updateVariant(variant.key, { name })} placeholder="Blue / Medium" />
          <Field label={`Price (${currency})`} value={variant.price} onChange={price => updateVariant(variant.key, { price })} placeholder="Use product price" inputProps={{ inputMode: "decimal" }} />
          <Field label="Stock" value={variant.stock} onChange={stock => updateVariant(variant.key, { stock })} type="number" inputProps={{ min: 0, step: 1 }} />
          <Button size="sm" variant="danger-soft" onPress={() => setVariants(previous => previous.filter(item => item.key !== variant.key))}>Remove option</Button>
        </div>)}</div>
      </Card.Content></Card>
    </div>
    <div className="space-y-5">
      <Card><Card.Header><h2 className="font-semibold">Price & stock</h2></Card.Header><Card.Content className="gap-5"><div {...attention("price")} className={`${attention("price").className} space-y-5`}>
        <Field isRequired label={`Price (${currency})`} value={price} onChange={setPrice} inputProps={{ inputMode: "decimal" }} />
        <Field label="Compare-at price" value={compareAt} onChange={setCompareAt} description="Optional original price when this product is on sale." inputProps={{ inputMode: "decimal" }} />
        <SwitchField isSelected={trackInventory} onChange={setTrackInventory}>Track inventory</SwitchField>
        {trackInventory && !variants.length ? <Field label="Stock" value={stock} onChange={setStock} type="number" inputProps={{ min: 0, step: 1 }} /> : null}
        {trackInventory && variants.length ? <p className="text-sm text-muted">Stock is tracked separately for each option.</p> : null}</div>
      </Card.Content></Card>
      <Card><Card.Header><h2 className="font-semibold">Publishing</h2></Card.Header><Card.Content className="gap-5">
        <SelectField label="Status" value={status} onChange={value => setStatus((value ?? "draft") as ListingStatus)} options={LISTING_STATUSES} />
        <SwitchField isSelected={featured} onChange={setFeatured}>Feature on my storefront</SwitchField>
        {stayOnPage && savedId ? <p role="status" className="text-sm text-success">Product saved. Further saves update this product.</p> : null}
        {issue ? <InfoNote tone="danger"><span role="alert">{issue.message}</span>{issue.field ? <button type="button" onClick={takeMeThere} className="ml-2 font-semibold underline">Take me there</button> : null}</InfoNote> : null}
        <Button isPending={pending} isDisabled={uploading || pending} type="submit" variant="primary">{listing || savedId ? "Save changes" : submitLabel ?? "Create product"}</Button>
      </Card.Content></Card>
    </div></fieldset>
  </form>;
}
