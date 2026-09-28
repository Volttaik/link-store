"use client";

import { Button } from "@heroui/react";
import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  toggleStorePublishedAction,
  updateDesignTypeAction,
  updatePayoutDetailsAction,
  updateProfileAction,
  updateStoreProfileAction,
  updateStoreSettingsAction,
  type SimpleState,
} from "@/app/actions/store";
import { listPayoutBanksAction, resolvePayoutAccountAction } from "@/app/actions/finance";
import { FormAlert, SubmitButton } from "@/components/ui/controls";
import { Field, SelectField, SwitchField, TextAreaField } from "@/components/ui/field";
import { InfoNote } from "@/components/ui/feedback";
import { SingleImageUploader } from "@/components/ui/MediaUploader";
import { SHOP_DESIGN_TYPES, STORE_CATEGORIES } from "@/lib/catalog";
import { CURRENCY_OPTIONS, minorToInput } from "@/lib/money";

function StateAlert({ state }: { state: SimpleState }) {
  if (!state) return null;
  return <FormAlert error={state.error} message={state.message} />;
}

// --- Storefront -------------------------------------------------------------

export function StoreProfileForm({
  store,
}: {
  store: {
    name: string;
    slug: string;
    tagline: string | null;
    description: string | null;
    primary_category: string | null;
    currency: string;
    contact_email: string | null;
    contact_phone: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    country: string | null;
    logo_url: string | null;
    banner_url: string | null;
    socials: Record<string, string>;
  };
}) {
  const [state, formAction] = useActionState<SimpleState, FormData>(
    updateStoreProfileAction,
    null,
  );
  const [logoUrl, setLogoUrl] = useState<string | null>(store.logo_url);
  const [bannerUrl, setBannerUrl] = useState<string | null>(store.banner_url);

  return (
    <form action={formAction} className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field isRequired defaultValue={store.name} label="Store name" name="name" />
        <Field
          defaultValue={store.slug}
          description="Changing this changes your public storefront address."
          label="Your link"
          name="slug"
          prefix={<span className="text-muted">/@</span>}
        />
      </div>

      <Field
        defaultValue={store.tagline ?? ""}
        label="Tagline"
        name="tagline"
        placeholder="One short line about what you sell"
      />

      <TextAreaField
        defaultValue={store.description ?? ""}
        label="About your store"
        name="description"
        rows={3}
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <SelectField
          defaultValue={store.primary_category}
          label="Main category"
          name="primaryCategory"
          options={STORE_CATEGORIES}
          placeholder="Choose a category"
        />

        <SelectField
          defaultValue={store.currency}
          description="Existing prices keep the currency they were created in."
          label="Currency"
          name="currency"
          options={CURRENCY_OPTIONS}
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          defaultValue={store.contact_email ?? ""}
          label="Contact email"
          name="contactEmail"
          type="email"
        />
        <Field
          defaultValue={store.contact_phone ?? ""}
          label="Contact phone"
          name="contactPhone"
          type="tel"
        />
      </div>

      {/*
        There is no website field. A shop on this platform already has an
        address — /@handle, the one this workspace publishes and the one the
        seller hands out — so a second URL was a field whose only job was to
        send a customer somewhere else. The column stays in the database,
        unused, so nothing is lost for anyone who had filled it in.
      */}

      <Field
        defaultValue={store.address ?? ""}
        label="Address"
        name="address"
        placeholder="Where customers can find you"
      />

      <div className="grid gap-5 sm:grid-cols-3">
        <Field defaultValue={store.city ?? ""} label="City" name="city" />
        <Field defaultValue={store.state ?? ""} label="State" name="state" />
        <Field defaultValue={store.country ?? ""} label="Country" name="country" />
      </div>

      {/*
        Real uploads, not URL fields: a shop's identity images are stored by
        this platform's own storage, so they survive, they are validated, and
        they can never be a dead external link.
      */}
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Shop logo</p>
          <p className="text-xs text-muted">
            Your mark — shown on your storefront, beside your name, and on cards across the
            marketplace.
          </p>
          <SingleImageUploader
            value={logoUrl}
            onChange={(image) => setLogoUrl(image?.url ?? null)}
            folder="store"
            label="Upload logo"
          />
          <input name="logoUrl" type="hidden" value={logoUrl ?? ""} />
        </div>

        <div className="space-y-1.5">
          <p className="text-sm font-medium">Shop cover</p>
          <p className="text-xs text-muted">
            The wide image behind your shop&apos;s identity — name, logo and details sit on top of
            it.
          </p>
          <SingleImageUploader
            value={bannerUrl}
            onChange={(image) => setBannerUrl(image?.url ?? null)}
            folder="store"
            label="Upload cover"
          />
          <input name="bannerUrl" type="hidden" value={bannerUrl ?? ""} />
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-3">
        {(["instagram", "x", "tiktok"] as const).map((network) => (
          <Field
            key={network}
            defaultValue={store.socials[network] ?? ""}
            label={network === "x" ? "X (Twitter)" : network[0].toUpperCase() + network.slice(1)}
            name={`social_${network}`}
            placeholder="@handle"
          />
        ))}
      </div>

      <div className="grid gap-5 sm:grid-cols-3">
        {(["whatsapp", "facebook", "youtube"] as const).map((network) => (
          <Field
            key={network}
            defaultValue={store.socials[network] ?? ""}
            label={network[0].toUpperCase() + network.slice(1)}
            name={`social_${network}`}
            placeholder="@handle"
          />
        ))}
      </div>

      <StateAlert state={state} />
      <SubmitButton>Save storefront</SubmitButton>
    </form>
  );
}

export function PublishToggle({ isPublished }: { isPublished: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<SimpleState>(null);

  const toggle = () => {
    startTransition(async () => {
      const next = await toggleStorePublishedAction();
      setResult(next);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <SwitchField
        description="A hidden storefront is still reachable by direct link, but it is not listed in the marketplace."
        isDisabled={pending}
        isSelected={isPublished}
        name="isPublished"
        size="sm"
        onChange={toggle}
      >
        {isPublished ? "Storefront is public" : "Storefront is hidden"}
      </SwitchField>
      <StateAlert state={result} />
    </div>
  );
}

/**
 * Shop Settings → Design Type.
 *
 * How the storefront leads. "Auto" follows what the shop actually sells — the
 * biggest part of the catalogue sets the tone; a manual choice overrides it.
 */
export function DesignTypeForm({ designType }: { designType: string | null }) {
  const [state, formAction] = useActionState<SimpleState, FormData>(updateDesignTypeAction, null);

  return (
    <form action={formAction} className="space-y-4">
      <SelectField
        description="Auto follows what you sell. A manual choice changes the storefront's lead experience for every visitor."
        defaultValue={designType ?? "auto"}
        label="Design type"
        name="designType"
        options={[
          { value: "auto", label: "Automatic · follow what I sell" },
          ...SHOP_DESIGN_TYPES.map((entry) => ({
            value: entry.value,
            label: `${entry.label} · ${entry.description}`,
          })),
        ]}
      />
      <StateAlert state={state} />
      <SubmitButton>Save design type</SubmitButton>
    </form>
  );
}

// --- Store behaviour --------------------------------------------------------

export function StoreRulesForm({
  settings,
  currency,
}: {
  settings: {
    low_stock_threshold: number;
    order_prefix: string;
    shipping_flat_fee: number;
    free_shipping_over: number | null;
    delivery_estimate_min_days: number;
    delivery_estimate_max_days: number;
    pickup_location_name: string | null;
    pickup_address: string | null;
    pickup_hours: string | null;
    pickup_instructions: string | null;
  };
  currency: string;
}) {
  const [state, formAction] = useActionState<SimpleState, FormData>(
    updateStoreSettingsAction,
    null,
  );

  return (
    <form action={formAction} className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          defaultValue={settings.order_prefix}
          description="Used at the start of every order number, e.g. LS-0001."
          label="Order prefix"
          name="orderPrefix"
        />
        <Field
          defaultValue={String(settings.low_stock_threshold)}
          description="Warn when tracked stock falls to this level."
          inputProps={{ inputMode: "numeric", min: 0 }}
          label="Low stock threshold"
          name="lowStockThreshold"
          type="number"
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          defaultValue={minorToInput(settings.shipping_flat_fee, currency)}
          description="Charged on physical orders at checkout."
          inputProps={{ inputMode: "decimal" }}
          label={`Flat delivery fee (${currency})`}
          name="shippingFlatFee"
        />
        <Field
          defaultValue={
            settings.free_shipping_over === null
              ? ""
              : minorToInput(settings.free_shipping_over, currency)
          }
          inputProps={{ inputMode: "decimal" }}
          label={`Free delivery over (${currency})`}
          name="freeShippingOver"
          placeholder="Leave empty to disable"
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          defaultValue={String(settings.delivery_estimate_min_days)}
          description="Your honest fastest case. Buyers see a range, never a promised date."
          inputProps={{ inputMode: "numeric", min: 0 }}
          label="Minimum delivery days"
          name="deliveryEstimateMinDays"
          type="number"
        />
        <Field
          defaultValue={String(settings.delivery_estimate_max_days)}
          description="Shown to buyers as “Estimated delivery: min–max days”."
          inputProps={{ inputMode: "numeric", min: 0 }}
          label="Maximum delivery days"
          name="deliveryEstimateMaxDays"
          type="number"
        />
      </div>

      <div className="space-y-1">
        <p className="text-sm font-semibold">Pickup (click &amp; collect)</p>
        <p className="text-xs text-muted">
          Used by orders that are collected instead of delivered. Fill this in if any of your
          products are marked for pickup — buyers see these details inside their order.
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          defaultValue={settings.pickup_location_name ?? ""}
          label="Pickup location name"
          name="pickupLocationName"
          placeholder="e.g. My Shop, Ikeja"
        />
        <Field
          defaultValue={settings.pickup_address ?? ""}
          label="Pickup address"
          name="pickupAddress"
          placeholder="Street, city, state"
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          defaultValue={settings.pickup_hours ?? ""}
          label="Collection hours"
          name="pickupHours"
          placeholder="e.g. Mon–Sat, 9am – 6pm"
        />
        <Field
          defaultValue={settings.pickup_instructions ?? ""}
          label="Collection instructions"
          name="pickupInstructions"
          placeholder="Ask for the manager, bring your order number…"
        />
      </div>

      <StateAlert state={state} />
      <SubmitButton>Save checkout rules</SubmitButton>
    </form>
  );
}

// --- Payments ---------------------------------------------------------------

export function PayoutDetailsForm({
  settings,
}: {
  settings: {
    payout_bank_code: string | null;
    payout_bank_name: string | null;
    payout_account_number: string | null;
    payout_account_name: string | null;
  };
}) {
  const [state, formAction] = useActionState<SimpleState, FormData>(
    updatePayoutDetailsAction,
    null,
  );

  const [banks, setBanks] = useState<Array<{ value: string; label: string }> | null>(null);
  const [bankCode, setBankCode] = useState(settings.payout_bank_code ?? "");
  const [bankName, setBankName] = useState(settings.payout_bank_name ?? "");
  const [accountNumber, setAccountNumber] = useState(settings.payout_account_number ?? "");
  const [accountName, setAccountName] = useState(settings.payout_account_name ?? "");
  const [lookup, setLookup] = useState<{ error?: string; note?: string } | null>(null);
  const [pending, startTransition] = useTransition();

  /**
   * Load the banks Paystack actually settles to.
   *
   * Nothing is assumed when this fails: the manual fields stay usable, and the
   * provider's own message is what the seller is shown.
   */
  const loadBanks = () => {
    setLookup(null);
    startTransition(async () => {
      const result = await listPayoutBanksAction();
      if (!result.ok) {
        setLookup({ error: result.error });
        return;
      }
      setBanks(result.data.banks.map((bank) => ({ value: bank.code, label: bank.name })));
      setLookup({ note: `${result.data.banks.length} banks returned by Paystack.` });
    });
  };

  /** Ask Paystack who owns the account, and only ever record its answer. */
  const verifyAccount = () => {
    setLookup(null);
    startTransition(async () => {
      const result = await resolvePayoutAccountAction({ bankCode, accountNumber });
      if (!result.ok) {
        setAccountName("");
        setLookup({ error: result.error });
        return;
      }
      setAccountName(result.data.accountName);
      setAccountNumber(result.data.accountNumber);
      setLookup({ note: `Paystack confirmed this account.` });
    });
  };

  const chosenBankName =
    banks?.find((bank) => bank.value === bankCode)?.label ?? bankName;

  return (
    <form action={formAction} className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          isPending={pending}
          size="sm"
          variant="secondary"
          onPress={loadBanks}
        >
          Load banks from Paystack
        </Button>
        {lookup?.note ? <span className="text-xs text-muted">{lookup.note}</span> : null}
      </div>

      {lookup?.error ? (
        <InfoNote tone="warning" title="Paystack could not be reached">
          {lookup.error}
        </InfoNote>
      ) : null}

      {banks ? (
        <SelectField
          label="Bank"
          name="payoutBankCode"
          options={banks}
          value={bankCode}
          onChange={(value) => {
            const code = String(value ?? "");
            setBankCode(code);
            setBankName(banks.find((bank) => bank.value === code)?.label ?? "");
          }}
        />
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Bank name"
          name="payoutBankName"
          onChange={setBankName}
          placeholder="e.g. Guaranty Trust Bank"
          value={banks ? chosenBankName : bankName}
        />
        {banks ? null : (
          <Field
            label="Bank code"
            name="payoutBankCode"
            onChange={setBankCode}
            placeholder="Paystack bank code, e.g. 058"
            value={bankCode}
          />
        )}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          inputProps={{ inputMode: "numeric" }}
          label="Account number"
          name="payoutAccountNumber"
          onChange={setAccountNumber}
          value={accountNumber}
        />
        <Field
          description={accountName ? "Confirmed by Paystack for this account number." : "Verify the account to fill this in."}
          label="Account name"
          name="payoutAccountName"
          onChange={setAccountName}
          value={accountName}
        />
      </div>

      <Button
        isDisabled={!bankCode || accountNumber.trim().length < 6}
        isPending={pending}
        size="sm"
        variant="secondary"
        onPress={verifyAccount}
      >
        Verify account with Paystack
      </Button>

      <StateAlert state={state} />
      <SubmitButton>Save payout account</SubmitButton>
    </form>
  );
}

// --- Profile ----------------------------------------------------------------

export function ProfileForm({
  user,
}: {
  user: { name: string; email: string; phone: string | null; avatarUrl: string | null };
}) {
  const [state, formAction] = useActionState<SimpleState, FormData>(updateProfileAction, null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user.avatarUrl);

  return (
    <form action={formAction} className="space-y-5">
      <Field
        defaultValue={user.email}
        description="Your sign-in address cannot be changed here."
        isReadOnly
        label="Email"
        name="email"
        type="email"
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <Field isRequired defaultValue={user.name} label="Full name" name="name" />
        <Field
          defaultValue={user.phone ?? ""}
          label="Phone"
          name="phone"
          placeholder="+234 800 000 0000"
          type="tel"
        />
      </div>

      <div className="space-y-1.5">
        <p className="text-sm font-medium">Profile picture</p>
        <p className="text-xs text-muted">
          Uploaded and stored by this platform. It appears everywhere your account does — replace
          or remove it at any time.
        </p>
        <SingleImageUploader
          value={avatarUrl}
          onChange={(image) => setAvatarUrl(image?.url ?? null)}
          folder="avatar"
          purpose="avatar"
          label="Upload picture"
        />
        <input name="avatarUrl" type="hidden" value={avatarUrl ?? ""} />
      </div>

      <StateAlert state={state} />
      <SubmitButton>Save profile</SubmitButton>
    </form>
  );
}

// --- Security ---------------------------------------------------------------


export function SignOutAllDevices() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-start gap-3">
      <Button
        isPending={pending}
        variant="danger-soft"
        onPress={() =>
          startTransition(async () => {
            const { signOutEverywhereAction } = await import("@/app/actions/auth");
            const result = await signOutEverywhereAction();
            setMessage(result.message);
            router.refresh();
          })
        }
      >
        Sign out of all devices
      </Button>
      {message ? <p className="text-xs text-muted">{message}</p> : null}
    </div>
  );
}
