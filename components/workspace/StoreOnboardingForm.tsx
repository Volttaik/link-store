"use client";

import { useActionState, useState } from "react";

import { createStoreAction, type SimpleState } from "@/app/actions/store";
import { FormAlert, SubmitButton } from "@/components/ui/controls";
import { Field, SelectField, TextAreaField, type FieldOption } from "@/components/ui/field";
import { SingleImageUploader } from "@/components/ui/MediaUploader";
import { CURRENCY_OPTIONS } from "@/lib/money";
import { HANDLE_PATTERN, handleError, slugify } from "@/lib/slug";

/**
 * Store creation.
 *
 * The handle field is validated with the exact same rules the server applies, so
 * a customer-facing link is never created that the server would reject.
 */
export function StoreOnboardingForm({
  defaultEmail,
  defaultName,
  categories,
}: {
  defaultEmail: string;
  defaultName: string;
  categories: FieldOption[];
}) {
  const [state, formAction] = useActionState<SimpleState, FormData>(createStoreAction, null);

  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [touchedHandle, setTouchedHandle] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  // Derive the handle from the store name until the seller edits it themselves.
  const effectiveHandle = touchedHandle ? handle : slugify(name).slice(0, 30);
  const handleProblem = effectiveHandle ? handleError(effectiveHandle) : null;
  const handleLooksValid = effectiveHandle.length > 0 && !handleProblem;

  return (
    <form action={formAction} className="space-y-5">
      <Field
        isRequired
        description="The name customers see on your storefront and on their receipts."
        label="Store name"
        name="name"
        onChange={setName}
        placeholder="Ada's Kitchen"
        value={name}
      />

      <Field
        isRequired
        description={
          handleLooksValid
            ? `Your storefront will be at /@${effectiveHandle}`
            : "3–30 characters: lowercase letters, numbers, dot, underscore or hyphen."
        }
        error={handleProblem && effectiveHandle ? handleProblem : null}
        inputProps={{ pattern: HANDLE_PATTERN.source }}
        label="Your link"
        name="slug"
        onChange={(value) => {
          setTouchedHandle(true);
          setHandle(slugify(value).slice(0, 30));
        }}
        placeholder="adaskitchen"
        prefix={<span className="text-muted">/@</span>}
        value={effectiveHandle}
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <SelectField
          label="Main category"
          name="primaryCategory"
          options={categories}
          placeholder="Choose a category"
        />

        <SelectField
          defaultValue="NGN"
          label="Currency"
          name="currency"
          options={CURRENCY_OPTIONS}
        />
      </div>

      <Field
        description="One short line that appears under your store name."
        label="Tagline"
        name="tagline"
        placeholder="Home-cooked Nigerian meals, delivered."
      />

      <TextAreaField
        label="About your store"
        name="description"
        placeholder="What you sell, where you deliver, and anything customers should know."
        rows={3}
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          defaultValue={defaultEmail}
          description="Shown on your storefront so customers can reach you."
          label="Contact email"
          name="contactEmail"
          type="email"
        />
        <Field
          label="Contact phone"
          name="contactPhone"
          placeholder="+234 800 000 0000"
          type="tel"
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="City" name="city" placeholder="Lagos" />
        <Field label="State" name="state" placeholder="Lagos" />
        <Field defaultValue="Nigeria" label="Country" name="country" />
      </div>

      <div>
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Shop logo</p>
          <p className="text-xs text-muted">Your mark, shown beside your name everywhere.</p>
          <SingleImageUploader
            value={logoUrl}
            onChange={(image) => setLogoUrl(image?.url ?? null)}
            fit="contain"
            folder="store"
            label="Upload logo"
            previewClassName="h-24 w-24"
          />
          <input name="logoUrl" type="hidden" value={logoUrl ?? ""} />
        </div>
      </div>

      <input name="ownerName" type="hidden" value={defaultName} />

      <FormAlert error={state?.error ?? null} />

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton isDisabled={!handleLooksValid} size="lg">
          Create my storefront
        </SubmitButton>
        <span className="text-xs text-muted">
          You can rename your store or change the handle later in settings.
        </span>
      </div>
    </form>
  );
}
