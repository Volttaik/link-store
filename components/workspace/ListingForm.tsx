"use client";

import { Button, Card, Chip } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  attachDigitalAssetAction,
  detachDigitalAssetAction,
  saveListingAction,
} from "@/app/actions/listings";
import { ActionButton } from "@/components/ui/controls";
import { DynamicListingFields } from "@/components/workspace/DynamicListingFields";
import { Field, SelectField, SwitchField, TextAreaField } from "@/components/ui/field";
import { Icon } from "@/components/ui/Icon";
import { InfoNote } from "@/components/ui/feedback";
import {
  DigitalFileUploader,
  ImageUploader,
  type UploadedImage,
} from "@/components/ui/MediaUploader";
import { LISTING_STATUSES, LISTING_TYPES, listingTypeMeta } from "@/lib/catalog";
import { listingFieldSchema, ownFieldValues } from "@/lib/listing-fields";
import { CURRENCY_OPTIONS, minorToInput, parseMoneyToMinor } from "@/lib/money";
import type { DigitalAssetRow, ListingDetail, ListingStatus, ListingType } from "@/lib/types";

const TYPE_OPTIONS = LISTING_TYPES.map((entry) => ({
  value: entry.value,
  label: entry.label,
  description: entry.blurb,
}));

const STATUS_OPTIONS = LISTING_STATUSES.map((entry) => ({
  value: entry.value,
  label: entry.label,
  description: entry.description,
}));

const SERVICE_MODE_OPTIONS = [
  { value: "online", label: "Online" },
  { value: "onsite", label: "On-site / in person" },
  { value: "either", label: "Either" },
];

/** The period a rental is let over. Stored in `attributes.rentUnit`. */
const RENT_UNIT_OPTIONS = [
  { value: "day", label: "Per day" },
  { value: "week", label: "Per week" },
  { value: "month", label: "Per month" },
  { value: "term", label: "Agreed in the thread" },
];

type VariantDraft = {
  key: string;
  name: string;
  sku: string;
  price: string;
  stock: string;
};

/** One line of the "several at once" form: a whole listing, reduced to its own details. */
type BatchDraft = {
  key: string;
  name: string;
  price: string;
  compareAt: string;
  stock: string;
};

let draftSequence = 0;

function newDraft(): BatchDraft {
  draftSequence += 1;
  return { key: `draft-${draftSequence}`, name: "", price: "", compareAt: "", stock: "1" };
}

export type ListingFormProps = {
  listing?: ListingDetail;
  categories: Array<{ id: string; name: string }>;
  currency: string;
  /** Preselects the type when arriving from a section-specific entry point. */
  defaultType?: ListingType;
  /**
   * Whether the module this form belongs to owns the type.
   *
   * A service form is a *service* form: its type is what the module is, not a
   * choice inside the form, and the fields it asks for are the service ones. The
   * control is therefore shown as the fixed fact it is rather than as a menu
   * that could turn this into a different module's form.
   */
  lockedType?: boolean;
  /**
   * Whether saving publishes immediately.
   *
   * The Listing workflow has no draft in it: adding a product through Listing
   * means "I am listing this for sale now", so the status is not a question and
   * is not offered. Every other module keeps draft → publish, because that is
   * where drafts come from.
   */
  autoPublish?: boolean;
  /** The submit label — the workflow says what it is doing. */
  submitLabel?: string;
};

/**
 * The universal listing editor.
 *
 * One form covers products, fashion, electronics, furniture, vehicles, food,
 * services and digital goods: the type you pick decides which extra fields
 * appear and how checkout will treat the item. Variants and files are only
 * offered where they make sense.
 */
export function ListingForm({
  listing,
  categories,
  currency,
  defaultType,
  lockedType = false,
  autoPublish = false,
  submitLabel,
}: ListingFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [type, setType] = useState<ListingType>(
    (listing?.type as ListingType) ?? defaultType ?? "physical",
  );
  const [title, setTitle] = useState(listing?.title ?? "");
  const [subtitle, setSubtitle] = useState(listing?.subtitle ?? "");
  const [description, setDescription] = useState(listing?.description ?? "");
  const [categoryId, setCategoryId] = useState(listing?.categoryId ?? "");
  const [price, setPrice] = useState(listing ? minorToInput(listing.price, currency) : "");
  const [compareAt, setCompareAt] = useState(
    listing?.compareAtPrice ? minorToInput(listing.compareAtPrice, currency) : "",
  );
  const [costPrice, setCostPrice] = useState(
    listing?.costPrice ? minorToInput(listing.costPrice, currency) : "",
  );
  const [sku, setSku] = useState(listing?.sku ?? "");
  const [trackInventory, setTrackInventory] = useState(listing?.trackInventory ?? true);
  const [stock, setStock] = useState(String(listing?.stock ?? 0));
  const [duration, setDuration] = useState(String(listing?.durationMinutes ?? ""));
  const [serviceMode, setServiceMode] = useState(listing?.serviceMode ?? "either");
  const [prepTime, setPrepTime] = useState(String(listing?.prepTimeMinutes ?? ""));
  // A publishing workflow starts and stays live: the status is not a control, so
  // it cannot be changed to a draft by accident, or by a hand-edited request.
  const [status, setStatus] = useState<ListingStatus>(
    autoPublish ? "active" : ((listing?.status as ListingStatus) ?? "draft"),
  );
  const [isFeatured, setIsFeatured] = useState(listing?.isFeatured ?? false);
  const [listCurrency, setListCurrency] = useState(listing?.currency ?? currency);

  /**
   * The type-specific details, keyed exactly as the field schema declares.
   * Seeded only from this listing's own schema keys, so saving cannot carry back
   * a value for a field the seller has since stopped using.
   */
  const [details, setDetails] = useState<Record<string, unknown>>(() =>
    ownFieldValues(listing?.type, listing?.attributes),
  );

  const setDetail = (key: string, value: unknown) =>
    setDetails((previous) => {
      const next = { ...previous };
      if (value === undefined) delete next[key];
      else next[key] = value;
      return next;
    });

  const [images, setImages] = useState<UploadedImage[]>(
    listing?.images.map((image) => ({
      url: image.image_url,
      key: image.storage_key,
      alt: image.alt,
    })) ?? [],
  );

  const [variants, setVariants] = useState<VariantDraft[]>(
    listing?.variants.map((variant, index) => ({
      key: variant.id || `v${index}`,
      name: variant.name,
      sku: variant.sku ?? "",
      price: variant.price === null ? "" : minorToInput(variant.price, currency),
      stock: String(variant.stock),
    })) ?? [],
  );

  const [assets, setAssets] = useState<DigitalAssetRow[]>(listing?.digitalAssets ?? []);
  const [assetDraft, setAssetDraft] = useState<{
    key: string;
    fileName: string;
    contentType: string;
    size: number;
  } | null>(null);

  /** Several listings at once — the seller fills a line per listing and saves them together. */
  const [batch, setBatch] = useState(false);
  const [drafts, setDrafts] = useState<BatchDraft[]>(() => [newDraft()]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  /** Services only: whether buyers may open a message thread from this listing. */
  const [serviceChat, setServiceChat] = useState(listing?.attributes?.serviceChat === true);
  /** Rentals: the period it is let over, and any deposit the seller asks for. */
  const [rentUnit, setRentUnit] = useState(
    String(listing?.attributes?.rentUnit ?? "month"),
  );
  const [deposit, setDeposit] = useState(
    listing?.attributes?.deposit === undefined ? "" : String(listing.attributes.deposit),
  );
  /**
   * Services and rentals: is this arranged in the thread before it is paid for?
   * A rental defaults to yes — a flat or a vehicle is agreed, not clicked — but
   * the seller can turn it off, and paying up front stays available either way.
   */
  const [orderViaChat, setOrderViaChat] = useState(
    listing?.attributes?.orderViaChat === true || listing?.type === "rental",
  );

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const meta = listingTypeMeta(type);
  const fieldSchema = listingFieldSchema(type);
  const isDigital = type === "digital";
  const supportsVariants = ["physical", "fashion", "electronics", "furniture", "food"].includes(
    type,
  );

  const priceMinor = parseMoneyToMinor(price, listCurrency);

  const addVariant = () =>
    setVariants((previous) => [
      ...previous,
      { key: `new-${Date.now()}`, name: "", sku: "", price: "", stock: "0" },
    ]);

  const updateVariant = (key: string, patch: Partial<VariantDraft>) =>
    setVariants((previous) =>
      previous.map((variant) => (variant.key === key ? { ...variant, ...patch } : variant)),
    );

  const addDraft = () => setDrafts((previous) => [...previous, newDraft()]);

  const updateDraft = (key: string, patch: Partial<BatchDraft>) =>
    setDrafts((previous) =>
      previous.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft)),
    );

  const removeDraft = (key: string) =>
    setDrafts((previous) =>
      previous.length === 1 ? previous : previous.filter((draft) => draft.key !== key),
    );

  /** Copies a line in place, so near-identical listings are one press apart. */
  const duplicateDraft = (key: string) =>
    setDrafts((previous) => {
      const index = previous.findIndex((draft) => draft.key === key);
      if (index === -1) return previous;
      const copy = { ...previous[index], key: newDraft().key };
      return [...previous.slice(0, index + 1), copy, ...previous.slice(index + 1)];
    });

  const batchCount = drafts.filter((draft) => draft.name.trim().length > 0).length;

  /**
   * Saves every filled line, one after another.
   *
   * Sequential rather than parallel on purpose: the seller watches the count
   * climb, and a failure half way through reports exactly how many landed rather
   * than leaving the batch in an unknown state.
   */
  const submitBatch = () => {
    setError(null);
    setSuccess(null);

    const cleaned = drafts
      .map((draft) => ({ ...draft, name: draft.name.trim() }))
      .filter((draft) => draft.name.length > 0);

    if (cleaned.length === 0) {
      setError("Add a name to at least one listing.");
      return;
    }

    const priced = cleaned
      .map((draft) => ({ draft, price: parseMoneyToMinor(draft.price, listCurrency) }))
      .filter((entry): entry is { draft: BatchDraft; price: number } => entry.price !== null);

    if (priced.length !== cleaned.length) {
      const unpriced = cleaned[priced.length];
      setError(`Enter a valid price for “${unpriced.name}”.`);
      return;
    }

    if (status === "active" && isDigital && assets.length === 0) {
      setError(
        "Digital products need at least one attached file before they can be published. Save these as drafts instead.",
      );
      return;
    }

    const total = priced.length;
    setProgress({ done: 0, total });

    startTransition(async () => {
      let saved = 0;

      for (const entry of priced) {
        const draft = entry.draft;
        const result = await saveListingAction({
          type,
          title: draft.name,
          subtitle: null,
          description: null,
          categoryId: categoryId || null,
          price: entry.price,
          compareAtPrice: draft.compareAt.trim()
            ? parseMoneyToMinor(draft.compareAt, listCurrency)
            : null,
          costPrice: null,
          sku: null,
          trackInventory: type === "service" ? false : trackInventory,
          stock: Math.max(0, Number.parseInt(draft.stock || "0", 10) || 0),
          durationMinutes: duration.trim() ? Number.parseInt(duration, 10) || null : null,
          serviceMode: type === "service" ? serviceMode : null,
          prepTimeMinutes: prepTime.trim() ? Number.parseInt(prepTime, 10) || null : null,
          attributes: {
            currency: listCurrency,
            serviceChat: type === "service" ? serviceChat : undefined,
            orderViaChat: type === "service" || type === "rental" ? orderViaChat : undefined,
            rentUnit: type === "rental" ? rentUnit : undefined,
            deposit: type === "rental" && deposit.trim() ? deposit.trim() : undefined,
            ...ownFieldValues(type, details),
          },
          status,
          isFeatured,
          images: images.map((image) => ({
            url: image.url,
            key: image.key,
            alt: image.alt ?? null,
          })),
          variants: [],
        });

        if (!result.ok) {
          setProgress(null);
          setError(
            saved === 0
              ? `Nothing saved. “${draft.name}” failed: ${result.error}`
              : `${saved} of ${total} saved. “${draft.name}” failed: ${result.error}`,
          );
          if (saved > 0) router.refresh();
          return;
        }

        saved += 1;
        setProgress({ done: saved, total });
      }

      setProgress(null);
      setSuccess(`${total} listing${total === 1 ? "" : "s"} created.`);
      setDrafts([newDraft()]);
      router.refresh();
    });
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (batch) {
      submitBatch();
      return;
    }

    if (title.trim().length < 2) {
      setError("Give this listing a name.");
      return;
    }
    if (priceMinor === null) {
      setError("Enter a valid price.");
      return;
    }
    if (status === "active" && isDigital && assets.length === 0) {
      setError(
        "Digital products need at least one attached file before they can be published. Otherwise a customer would pay for nothing.",
      );
      return;
    }

    const cleanVariants = variants
      .filter((variant) => variant.name.trim().length > 0)
      .map((variant) => ({
        name: variant.name.trim(),
        sku: variant.sku.trim() || null,
        price:
          variant.price.trim().length > 0
            ? parseMoneyToMinor(variant.price, listCurrency)
            : null,
        stock: Math.max(0, Number.parseInt(variant.stock || "0", 10) || 0),
      }));

    startTransition(async () => {
      const result = await saveListingAction({
        id: listing?.id,
        type,
        title: title.trim(),
        subtitle: subtitle.trim() || null,
        description: description.trim() || null,
        categoryId: categoryId || null,
        price: priceMinor,
        compareAtPrice: compareAt.trim() ? parseMoneyToMinor(compareAt, listCurrency) : null,
        costPrice: costPrice.trim() ? parseMoneyToMinor(costPrice, listCurrency) : null,
        sku: sku.trim() || null,
        trackInventory,
        stock: Math.max(0, Number.parseInt(stock || "0", 10) || 0),
        durationMinutes: duration.trim() ? Number.parseInt(duration, 10) || null : null,
        serviceMode: type === "service" ? serviceMode : null,
        prepTimeMinutes: prepTime.trim() ? Number.parseInt(prepTime, 10) || null : null,
        attributes: {
          currency: listCurrency,
          serviceChat: type === "service" ? serviceChat : undefined,
          orderViaChat: type === "service" || type === "rental" ? orderViaChat : undefined,
          rentUnit: type === "rental" ? rentUnit : undefined,
          deposit: type === "rental" && deposit.trim() ? deposit.trim() : undefined,
          ...ownFieldValues(type, details),
        },
        status,
        isFeatured,
        images: images.map((image) => ({ url: image.url, key: image.key, alt: image.alt ?? null })),
        variants: cleanVariants,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setSuccess(listing ? "Changes saved." : "Listing created.");

      if (!listing) {
        router.push(`/workspace/listings/${result.data.listingId}`);
      } else {
        router.refresh();
      }
    });
  };

  return (
    <form onSubmit={submit} className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,0.9fr)]">
      <div className="space-y-6">
        {/* One listing, or a batch of them. Creating an editor listing keeps it
            single — a batch only ever creates new rows. */}
        {listing ? null : (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant={batch ? "secondary" : "primary"}
              onPress={() => setBatch(false)}
            >
              One listing
            </Button>
            <Button
              size="sm"
              variant={batch ? "primary" : "secondary"}
              onPress={() => setBatch(true)}
            >
              Several at once
            </Button>
            <span className="text-xs text-muted">
              {batch
                ? "A line per listing: name, price and stock, saved together."
                : "Everything about one listing, including variants and files."}
            </span>
          </div>
        )}

        {batch ? (
          <Card className="ls-elev-2">
            <Card.Header className="flex-col items-start gap-1">
              <p className="text-sm font-semibold">Listings to create</p>
              <p className="text-xs text-muted">
                Type, category, photos and status are shared by the whole batch, so a shelf of
                similar items goes out in one pass.
              </p>
            </Card.Header>
            <Card.Content className="gap-4">
              {drafts.map((draft, index) => (
                <div className="rounded-xl bg-surface-secondary/50 p-4" key={draft.key}>
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-muted">Listing {index + 1}</p>
                    <div className="flex items-center gap-1">
                      <Button
                        isIconOnly
                        aria-label={`Duplicate listing ${index + 1}`}
                        size="sm"
                        variant="ghost"
                        onPress={() => duplicateDraft(draft.key)}
                      >
                        <Icon name="plus" size={14} />
                      </Button>
                      <Button
                        isIconOnly
                        aria-label={`Remove listing ${index + 1}`}
                        isDisabled={drafts.length === 1}
                        size="sm"
                        variant="danger-soft"
                        onPress={() => removeDraft(draft.key)}
                      >
                        <Icon name="trash" size={14} />
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_1fr]">
                    <Field
                      inputClassName="text-sm"
                      label="Name"
                      onChange={(value) => updateDraft(draft.key, { name: value })}
                      placeholder="Ankle boot"
                      value={draft.name}
                    />
                    <Field
                      inputClassName="text-sm"
                      inputProps={{ inputMode: "decimal" }}
                      label={`Price (${listCurrency})`}
                      onChange={(value) => updateDraft(draft.key, { price: value })}
                      placeholder="12000"
                      value={draft.price}
                    />
                    <Field
                      inputClassName="text-sm"
                      inputProps={{ inputMode: "decimal" }}
                      label="Compare-at"
                      onChange={(value) => updateDraft(draft.key, { compareAt: value })}
                      placeholder="Optional"
                      value={draft.compareAt}
                    />
                    <Field
                      inputClassName="text-sm"
                      inputProps={{ inputMode: "numeric" }}
                      label="Stock"
                      onChange={(value) => updateDraft(draft.key, { stock: value })}
                      value={draft.stock}
                    />
                  </div>
                </div>
              ))}

              <Button className="self-start" variant="secondary" onPress={addDraft}>
                <Icon name="plus" size={14} />
                Add another listing
              </Button>
            </Card.Content>
          </Card>
        ) : (
        <Card className="ls-elev-2">
          <Card.Header className="flex-col items-start gap-1">
            <p className="text-sm font-semibold">What are you selling?</p>
            <p className="text-xs text-muted">{meta.blurb}</p>
          </Card.Header>
          <Card.Content className="gap-5">              <SelectField
                description={
                  lockedType
                    ? `${meta.label}, set by the module you came from.`
                    : "This decides how the item behaves at checkout and where it appears."
                }
                isDisabled={lockedType}
                label="Type"
                name="type"
                onChange={(value) => setType((value ?? "physical") as ListingType)}
                options={TYPE_OPTIONS}
                value={type}
              />

            <Field
              isRequired
              label="Name"
              name="title"
              onChange={setTitle}
              placeholder={type === "food" ? "Jollof rice with chicken" : "Nike Air Force 1"}
              value={title}
            />

            <Field
              label="Short line"
              name="subtitle"
              onChange={setSubtitle}
              placeholder="Optional subtitle shown under the name"
              value={subtitle}
            />

            <TextAreaField
              label="Description"
              name="description"
              onChange={setDescription}
              placeholder="Materials, sizes, ingredients, what's included…"
              rows={5}
              value={description}
            />

            <SelectField
              label="Category"
              name="categoryId"
              onChange={(value) => setCategoryId(value ? String(value) : "")}
              options={categories.map((category) => ({
                value: category.id,
                label: category.name,
              }))}
              placeholder="Uncategorised"
              value={categoryId || null}
            />
          </Card.Content>
        </Card>
        )}

        {/* The type-specific half of the form. What is asked for here is decided
            entirely by the schema for the chosen type — this component has no
            idea food is not a flat. */}
        {fieldSchema.fields.length > 0 ? (
          <Card className="ls-elev-2">
            <Card.Header className="flex-col items-start gap-1">
              <p className="text-sm font-semibold">{fieldSchema.title}</p>
              <p className="text-xs text-muted">{fieldSchema.description}</p>
            </Card.Header>
            <Card.Content className="gap-6">
              <DynamicListingFields
                currency={listCurrency}
                schema={fieldSchema}
                values={details}
                onChange={setDetail}
              />
            </Card.Content>
          </Card>
        ) : null}

        <Card className="ls-elev-2">
          <Card.Header className="flex-col items-start gap-1">
            <p className="text-sm font-semibold">Photos</p>
            <p className="text-xs text-muted">
              Uploaded safely to your shop's storage and served from there —
              private until you sell it.
            </p>
          </Card.Header>
          <Card.Content>
            <ImageUploader
              value={images}
              onChange={setImages} folder="listings"
              max={8}
            />
          </Card.Content>
        </Card>

        {isDigital && !batch ? (
          <Card className="ls-elev-2">
            <Card.Header className="flex-col items-start gap-1">
              <p className="text-sm font-semibold">Product files</p>
              <p className="text-xs text-muted">
                Files are stored privately. Buyers receive a limited download link only after their
                payment is verified.
              </p>
            </Card.Header>
            <Card.Content className="gap-4">
              {assets.length === 0 ? (
                <InfoNote title="No file attached yet" tone="warning">
                  A digital product cannot be published without a file, and it cannot be added to a
                  cart.
                </InfoNote>
              ) : (
                <div className="space-y-2">
                  {assets.map((asset) => (
                    <div
                      key={asset.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-secondary/50 p-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{asset.file_name}</p>
                        <p className="text-xs text-muted">
                          version {asset.version}
                          {asset.file_size ? ` · ${Math.round(asset.file_size / 1024)} KB` : ""}
                        </p>
                      </div>
                      <ActionButton
                        variant="danger-soft"
                        confirm={`Remove ${asset.file_name}? The stored file will be deleted too.`}
                        action={async () => {
                          const result = await detachDigitalAssetAction(asset.id);
                          if (result.ok) {
                            setAssets((previous) =>
                              previous.filter((entry) => entry.id !== asset.id),
                            );
                          }
                          return result.ok ? { ok: true } : { ok: false, error: result.error };
                        }}
                      >
                        Remove
                      </ActionButton>
                    </div>
                  ))}
                </div>
              )}

              {listing ? (
                <>
                  
                  <DigitalFileUploader folder="digital"
                    onUploaded={(uploaded) =>
                      setAssetDraft({
                        key: uploaded.key,
                        fileName: uploaded.fileName,
                        contentType: uploaded.contentType,
                        size: uploaded.size,
                      })
                    }
                  />
                  <p className="text-xs text-muted">
                    Upload a file, then attach it. Removing a file also deletes it from storage.
                  </p>
                </>
              ) : (
                <p className="text-xs text-muted">
                  Save this product first, then come back to upload its file.
                </p>
              )}

              {assetDraft ? (
                <Button isPending={pending} variant="secondary"
                  onPress={() => {
                    startTransition(async () => {
                      const result = await attachDigitalAssetAction({
                        listingId: listing?.id ?? "",
                        key: assetDraft.key,
                        fileName: assetDraft.fileName,
                        contentType: assetDraft.contentType,
                        size: assetDraft.size,
                      });
                      if (result.ok) router.refresh();
                      else setError(result.error);
                    });
                  }}
                >
                  Attach file
                </Button>
              ) : null}
            </Card.Content>
          </Card>
        ) : null}

        {supportsVariants && !batch ? (
          <Card className="ls-elev-2">
            <Card.Header className="flex-col items-start gap-1">
              <p className="text-sm font-semibold">Options & variants</p>
              <p className="text-xs text-muted">
                Sizes, colours or portion sizes. Each variant can have its own price and stock.
              </p>
            </Card.Header>
            <Card.Content className="gap-3">
              {variants.length === 0 ? (
                <p className="text-xs text-muted">
                  No variants. The listing sells as a single item.
                </p>
              ) : (
                variants.map((variant) => (
                  <div key={variant.key} className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto]">
                    <Field
                      inputClassName="text-sm"
                      label="Name"
                      onChange={(value) => updateVariant(variant.key, { name: value })}
                      placeholder="Size M / Large"
                      value={variant.name}
                    />
                    <Field
                      inputClassName="text-sm"
                      label={`Price (${listCurrency})`}
                      onChange={(value) => updateVariant(variant.key, { price: value })}
                      placeholder="Inherit"
                      value={variant.price}
                    />
                    <Field
                      inputClassName="text-sm"
                      inputProps={{ inputMode: "numeric" }}
                      label="Stock"
                      onChange={(value) => updateVariant(variant.key, { stock: value })}
                      value={variant.stock}
                    />
                    <Button
                      isIconOnly
                      aria-label="Remove variant"
                      className="self-end"
                      size="sm"
                      variant="danger-soft"
                      onPress={() =>
                        setVariants((previous) =>
                          previous.filter((entry) => entry.key !== variant.key),
                        )
                      }
                    >
                      <Icon name="trash" />
                    </Button>
                  </div>
                ))
              )}

              <Button size="sm" variant="secondary" onPress={addVariant}>
                Add variant
              </Button>
            </Card.Content>
          </Card>
        ) : null}
      </div>

      <div className="space-y-6">
        {batch ? (
          <Card className="ls-elev-2">
            <Card.Header className="flex-col items-start gap-1">
              <p className="text-sm font-semibold">Applies to every listing</p>
              <p className="text-xs text-muted">
                Only what these listings share — the details that differ live on each line.
              </p>
            </Card.Header>
            <Card.Content className="gap-5">
              <SelectField
                description={
                  lockedType
                    ? `${meta.label}, set by the module you came from.`
                    : "This decides how the items behave at checkout and where they appear."
                }
                isDisabled={lockedType}
                label="Type"
                name="type"
                onChange={(value) => setType((value ?? "physical") as ListingType)}
                options={TYPE_OPTIONS}
                value={type}
              />

              <SelectField
                label="Category"
                name="categoryId"
                onChange={(value) => setCategoryId(value ? String(value) : "")}
                options={categories.map((category) => ({
                  value: category.id,
                  label: category.name,
                }))}
                placeholder="Uncategorised"
                value={categoryId || null}
              />

              <SelectField
                label="Currency"
                name="currency"
                onChange={(value) => setListCurrency(value ? String(value) : listCurrency)}
                options={CURRENCY_OPTIONS}
                value={listCurrency}
              />

              {type === "service" || type === "rental" ? (
                <>
                  {type === "service" ? (
                    <>
                      <Field
                        inputProps={{ inputMode: "numeric", min: 0 }}
                        label="Duration (minutes)"
                        name="durationMinutes"
                        onChange={setDuration}
                        value={duration}
                      />
                      <SelectField
                        label="How it's delivered"
                        name="serviceMode"
                        onChange={(value) => setServiceMode(value ? String(value) : "either")}
                        options={SERVICE_MODE_OPTIONS}
                        value={serviceMode}
                      />
                      <SwitchField
                        description="Buyers can open a message thread with you about these services from your storefront."
                        isSelected={serviceChat}
                        name="serviceChat"
                        onChange={setServiceChat}
                      >
                        Let buyers message me
                      </SwitchField>
                    </>
                  ) : (
                    <SelectField
                      label="Let by"
                      name="rentUnit"
                      onChange={(value) => setRentUnit(value ? String(value) : "month")}
                      options={RENT_UNIT_OPTIONS}
                      value={rentUnit}
                    />
                  )}

                  <SwitchField
                    description="The listing leads with the conversation, and paying up front stays available."
                    isSelected={orderViaChat}
                    name="orderViaChat"
                    onChange={setOrderViaChat}
                  >
                    Arrange it in the thread first
                  </SwitchField>
                </>
              ) : (
                <SwitchField
                  description="Each listing keeps the stock you gave it on its line."
                  isSelected={trackInventory}
                  name="trackInventory"
                  onChange={setTrackInventory}
                >
                  Track stock
                </SwitchField>
              )}

              

              {autoPublish ? (
                <InfoNote tone="success" title="These go live on save">
                  Listing publishes: everything created here is on your storefront and in the
                  marketplace the moment it is saved. Unfinished work lives in Drafts instead.
                </InfoNote>
              ) : (
                <SelectField
                  label="Status"
                  name="status"
                  onChange={(value) => setStatus((value ?? "draft") as ListingStatus)}
                  options={STATUS_OPTIONS}
                  value={status}
                />
              )}

              <SwitchField isSelected={isFeatured} name="isFeatured" onChange={setIsFeatured}>
                Feature them on my storefront
              </SwitchField>
            </Card.Content>
          </Card>
        ) : (
        <>
        <Card className="ls-elev-2">
          <Card.Header className="pb-0">
            <p className="text-sm font-semibold">Pricing</p>
          </Card.Header>
          <Card.Content className="gap-5">
            <SelectField
              label="Currency"
              name="currency"
              onChange={(value) => setListCurrency(value ? String(value) : listCurrency)}
              options={CURRENCY_OPTIONS}
              value={listCurrency}
            />

            <Field
              isRequired
              description="Buyers always see the exact amount you enter here."
              inputProps={{ inputMode: "decimal" }}
              label="Price"
              name="price"
              onChange={setPrice}
              placeholder="5000"
              prefix={<span className="text-muted">{listCurrency}</span>}
              value={price}
            />

            <Field
              inputProps={{ inputMode: "decimal" }}
              label="Compare-at price"
              name="compareAtPrice"
              onChange={setCompareAt}
              placeholder="Optional, shows a struck-through price"
              value={compareAt}
            />

            <Field
              inputProps={{ inputMode: "decimal" }}
              label="Cost price"
              name="costPrice"
              onChange={setCostPrice}
              placeholder="Optional, used to estimate margin"
              value={costPrice}
            />

            <Field
              label="SKU"
              name="sku"
              onChange={setSku}
              placeholder="Optional internal reference"
              value={sku}
            />
          </Card.Content>
        </Card>

        <Card className="ls-elev-2">
          <Card.Header className="pb-0">
            <p className="text-sm font-semibold">
              {type === "service"
                ? "Booking"
                : type === "food"
                  ? "Kitchen"
                  : type === "rental"
                    ? "Letting"
                    : "Inventory"}
            </p>
          </Card.Header>
          <Card.Content className="gap-5">
            {type === "service" ? (
              <>
                <Field
                  inputProps={{ inputMode: "numeric", min: 0 }}
                  label="Duration (minutes)"
                  name="durationMinutes"
                  onChange={setDuration}
                  value={duration}
                />
                <SelectField
                  label="How it's delivered"
                  name="serviceMode"
                  onChange={(value) => setServiceMode(value ? String(value) : "either")}
                  options={SERVICE_MODE_OPTIONS}
                  value={serviceMode}
                />

                <SwitchField
                  description="Buyers can open a message thread with you about this service directly from your storefront, instead of leaving to ask elsewhere."
                  isSelected={serviceChat}
                  name="serviceChat"
                  onChange={setServiceChat}
                >
                  Let buyers message me
                </SwitchField>

                <SwitchField
                  description="The listing leads with a conversation: a buyer asks about the job first, and paying up front stays available for anyone who already knows what they want."
                  isSelected={orderViaChat}
                  name="orderViaChat"
                  onChange={setOrderViaChat}
                >
                  Arrange it in the thread first
                </SwitchField>
              </>
            ) : null}

            {type === "rental" ? (
              <>
                <SelectField
                  description="What the price covers. A buyer sees this on the card before they open anything."
                  label="Let by"
                  name="rentUnit"
                  onChange={(value) => setRentUnit(value ? String(value) : "month")}
                  options={RENT_UNIT_OPTIONS}
                  value={rentUnit}
                />

                <Field
                  description="Shown to buyers as “Deposit required”. Leave empty if you ask for none."
                  label="Deposit"
                  name="deposit"
                  onChange={setDeposit}
                  placeholder="Optional"
                  value={deposit}
                />

                <SwitchField
                  description="A flat, a car or a machine is agreed before it is paid for. With this on, the listing leads with the conversation and payment follows; anyone ready to pay can still do it straight away."
                  isSelected={orderViaChat}
                  name="orderViaChat"
                  onChange={setOrderViaChat}
                >
                  Arrange it in the thread first
                </SwitchField>
              </>
            ) : null}

            {type === "food" ? (
              <Field
                inputProps={{ inputMode: "numeric", min: 0 }}
                label="Prep time (minutes)"
                name="prepTimeMinutes"
                onChange={setPrepTime}
                value={prepTime}
              />
            ) : null}

            {type !== "service" ? (
              <>
                <SwitchField
                  description="When off, the item never sells out and no stock is decremented."
                  isSelected={trackInventory}
                  name="trackInventory"
                  onChange={setTrackInventory}
                >
                  Track stock
                </SwitchField>

                {trackInventory ? (
                  <Field
                    description={
                      supportsVariants && variants.length > 0
                        ? "Variants keep their own stock; this becomes their total when you save."
                        : undefined
                    }
                    inputProps={{ inputMode: "numeric", min: 0 }}
                    label="Stock on hand"
                    name="stock"
                    onChange={setStock}
                    value={stock}
                  />
                ) : null}
              </>
            ) : null}
          </Card.Content>
        </Card>

        <Card className="ls-elev-2">
          <Card.Header className="pb-0">
            <p className="text-sm font-semibold">Visibility</p>
          </Card.Header>
          <Card.Content className="gap-5">
            {autoPublish ? (
              <InfoNote tone="success" title="This goes live on save">
                Listing publishes: a product added here is on your storefront and in the marketplace
                the moment it is saved, so there is no draft option in this workflow. Unfinished work
                lives in Drafts instead.
              </InfoNote>
            ) : (
              <SelectField
                label="Status"
                name="status"
                onChange={(value) => setStatus((value ?? "draft") as ListingStatus)}
                options={STATUS_OPTIONS}
                value={status}
              />
            )}

            <SwitchField isSelected={isFeatured} name="isFeatured" onChange={setIsFeatured}>
              Feature on my storefront
            </SwitchField>

          </Card.Content>
        </Card>
        </>
        )}

        <Card className="ls-elev-2">
          <Card.Header className="pb-0">
            <p className="text-sm font-semibold">Save</p>
          </Card.Header>
          <Card.Content className="gap-3">
            <Button isPending={pending} size="lg" type="submit" variant="primary">
              {batch
                ? `Create ${batchCount} listing${batchCount === 1 ? "" : "s"}`
                : listing
                  ? "Save changes"
                  : (submitLabel ?? "Create listing")}
            </Button>

            {progress ? (
              <p className="text-xs text-muted">
                Saving {progress.done} of {progress.total}…
              </p>
            ) : null}

            {error ? <InfoNote tone="danger">{error}</InfoNote> : null}
            {success ? <InfoNote tone="success">{success}</InfoNote> : null}

            {batch ? (
              <p className="text-xs text-muted">
                Each line becomes its own listing. Photos uploaded above are attached to every one
                of them.
              </p>
            ) : (
              <Chip size="sm" variant="secondary" className="self-start">
                {meta.fulfilment === "digital"
                  ? "Delivered instantly after payment"
                  : meta.fulfilment === "shipping"
                    ? "Shipped by you"
                    : meta.fulfilment === "booking"
                      ? "Booking confirmed by you"
                      : "Collected in person"}
              </Chip>
            )}
          </Card.Content>
        </Card>
      </div>
    </form>
  );
}
