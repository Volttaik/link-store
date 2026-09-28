"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser, getStoreForUser, requireStore } from "@/lib/auth";
import {
  createCategory,
  createStore,
  deleteCategory,
  updateCategory,
  updateStore,
  updateStoreSettings,
} from "@/lib/server/stores";
import { parseMoneyToMinor } from "@/lib/money";
import { normalizeHandle } from "@/lib/slug";
import { isShopDesignType } from "@/lib/catalog";
import type { ActionResult } from "@/lib/types";
import { fail, ok } from "@/lib/types";

export type SimpleState = { ok?: boolean; error?: string; message?: string } | null;

function str(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function nullable(formData: FormData, key: string): string | null {
  const value = str(formData, key);
  return value.length > 0 ? value : null;
}

// --- Store creation ---------------------------------------------------------

export async function createStoreAction(
  _previous: SimpleState,
  formData: FormData,
): Promise<SimpleState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Your session expired. Please sign in again." };

  const result = await createStore({
    userId: user.id,
    name: str(formData, "name"),
    slug: normalizeHandle(str(formData, "slug")),
    tagline: nullable(formData, "tagline"),
    description: nullable(formData, "description"),
    primaryCategory: nullable(formData, "primaryCategory"),
    currency: str(formData, "currency") || "NGN",
    contactEmail: nullable(formData, "contactEmail") ?? user.email,
    contactPhone: nullable(formData, "contactPhone"),
    city: nullable(formData, "city"),
    state: nullable(formData, "state"),
    country: nullable(formData, "country") ?? "Nigeria",
    logoUrl: nullable(formData, "logoUrl"),
    bannerUrl: nullable(formData, "bannerUrl"),
  });

  if (!result.ok) {
    return { error: result.error };
  }

  revalidatePath("/workspace");
  revalidatePath("/workspace/onboarding");
  return { ok: true, message: "Store created." };
}

// --- Store profile ----------------------------------------------------------

export async function updateStoreProfileAction(
  _previous: SimpleState,
  formData: FormData,
): Promise<SimpleState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Your session expired. Please sign in again." };

  const store = await getStoreForUser(user.id);
  if (!store) return { error: "Create your store first." };

  const socials: Record<string, string> = {};
  for (const network of ["instagram", "x", "tiktok", "whatsapp", "facebook", "youtube"]) {
    const value = str(formData, `social_${network}`);
    if (value) socials[network] = value;
  }

  const result = await updateStore(store.id, user.id, {
    name: str(formData, "name"),
    slug: str(formData, "slug"),
    tagline: nullable(formData, "tagline"),
    description: nullable(formData, "description"),
    primaryCategory: nullable(formData, "primaryCategory"),
    currency: str(formData, "currency") || store.currency,
    contactEmail: nullable(formData, "contactEmail"),
    contactPhone: nullable(formData, "contactPhone"),
    // No `websiteUrl`: the storefront address is /@handle, and the form no longer
    // asks for a second one. The column and the update path remain for any store
    // that already has a value.
    address: nullable(formData, "address"),
    city: nullable(formData, "city"),
    state: nullable(formData, "state"),
    country: nullable(formData, "country"),
    logoUrl: nullable(formData, "logoUrl"),
    bannerUrl: nullable(formData, "bannerUrl"),
    socials: Object.keys(socials).length > 0 ? socials : null,
  });

  if (!result.ok) return { error: result.error };

  revalidatePath("/workspace/settings");
  revalidatePath("/workspace");
  revalidatePath(`/@${result.store.slug}`);
  return { ok: true, message: "Store details saved." };
}

export async function toggleStorePublishedAction(): Promise<SimpleState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Your session expired." };

  const store = await getStoreForUser(user.id);
  if (!store) return { error: "Create your store first." };

  const nextPublished = store.is_published !== 1;

  // Publishing an empty storefront would give visitors a dead end, so it is
  // refused until there is at least one live listing.
  if (nextPublished) {
    const { countListings } = await import("@/lib/server/listings");
    const live = await countListings({ storeId: store.id, status: "active" });
    if (live === 0) {
      return {
        error: "Publish at least one listing before making your storefront public.",
      };
    }
  }

  const result = await updateStore(store.id, user.id, { isPublished: nextPublished });
  if (!result.ok) return { error: result.error };

  revalidatePath("/workspace");
  revalidatePath("/workspace/settings");
  revalidatePath("/", "layout");
  return { ok: true, message: nextPublished ? "Storefront published." : "Storefront hidden." };
}

// --- Settings ---------------------------------------------------------------

export async function updateStoreSettingsAction(
  _previous: SimpleState,
  formData: FormData,
): Promise<SimpleState> {
  const { user, store } = await requireStore();

  // Money inputs arrive in whole units and are stored in minor units; an empty
  // free-delivery threshold means "disabled" rather than zero.
  const shippingFlatFee = parseMoneyToMinor(str(formData, "shippingFlatFee") || "0", store.currency);
  if (shippingFlatFee === null) {
    return { error: "Enter a valid delivery fee." };
  }

  const freeShippingOverRaw = str(formData, "freeShippingOver");
  const freeShippingOver = freeShippingOverRaw
    ? parseMoneyToMinor(freeShippingOverRaw, store.currency)
    : null;
  if (freeShippingOverRaw && freeShippingOver === null) {
    return { error: "Enter a valid free-delivery threshold, or leave it empty." };
  }

  const estimateMin = Number(str(formData, "deliveryEstimateMinDays") || "3");
  const estimateMax = Number(str(formData, "deliveryEstimateMaxDays") || "5");
  if (
    !Number.isFinite(estimateMin) ||
    !Number.isFinite(estimateMax) ||
    estimateMin < 0 ||
    estimateMax < 0
  ) {
    return { error: "Enter a valid delivery estimate in days." };
  }

  const result = await updateStoreSettings(store.id, user.id, {
    lowStockThreshold: Number(str(formData, "lowStockThreshold") || "5"),
    orderPrefix: str(formData, "orderPrefix") || "LS",
    shippingFlatFee,
    freeShippingOver,
    deliveryEstimateMinDays: estimateMin,
    deliveryEstimateMaxDays: Math.max(estimateMin, estimateMax),
    pickupLocationName: nullable(formData, "pickupLocationName"),
    pickupAddress: nullable(formData, "pickupAddress"),
    pickupHours: nullable(formData, "pickupHours"),
    pickupInstructions: nullable(formData, "pickupInstructions"),
  });

  if (!result.ok) return { error: result.error };

  revalidatePath("/workspace/settings");
  return { ok: true, message: "Settings saved." };
}

/**
 * The storefront's lead experience. "auto" follows what the shop actually
 * sells; any design type overrides it for every visitor.
 */
export async function updateDesignTypeAction(
  _previous: SimpleState,
  formData: FormData,
): Promise<SimpleState> {
  const { user, store } = await requireStore();
  const designType = str(formData, "designType") || "auto";

  if (designType !== "auto" && !isShopDesignType(designType)) {
    return { error: "Choose a design type." };
  }

  const result = await updateStoreSettings(store.id, user.id, { designType });
  if (!result.ok) return { error: result.error };

  revalidatePath("/workspace/settings");
  revalidatePath(`/@${store.slug}`);
  return {
    ok: true,
    message:
      designType === "auto"
        ? "Your storefront now follows what you sell."
        : "Your storefront design type is saved.",
  };
}

export async function updatePayoutDetailsAction(
  _previous: SimpleState,
  formData: FormData,
): Promise<SimpleState> {
  const { user, store } = await requireStore();

  const result = await updateStoreSettings(store.id, user.id, {
    payoutBankCode: nullable(formData, "payoutBankCode"),
    payoutBankName: nullable(formData, "payoutBankName"),
    payoutAccountNumber: nullable(formData, "payoutAccountNumber"),
    payoutAccountName: nullable(formData, "payoutAccountName"),
  });

  if (!result.ok) return { error: result.error };

  revalidatePath("/workspace/settings");
  revalidatePath("/workspace/finance");
  return { ok: true, message: "Bank details saved." };
}

// --- Profile ----------------------------------------------------------------

export async function updateProfileAction(
  _previous: SimpleState,
  formData: FormData,
): Promise<SimpleState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Your session expired." };

  const name = str(formData, "name");
  if (name.length < 2) return { error: "Enter your name." };

  const { execute } = await import("@/lib/db");
  const { nowIso } = await import("@/lib/format");

  await execute(
    "UPDATE users SET name = ?, phone = ?, avatar_url = ?, updated_at = ? WHERE id = ?",
    [name, nullable(formData, "phone"), nullable(formData, "avatarUrl"), nowIso(), user.id],
  );

  revalidatePath("/workspace/settings");
  revalidatePath("/workspace", "layout");
  return { ok: true, message: "Profile updated." };
}

// --- Categories -------------------------------------------------------------

export type CategoryPayload = {
  id?: string;
  name: string;
  kind: string;
  icon?: string | null;
};

export async function saveCategoryAction(
  payload: CategoryPayload,
): Promise<ActionResult<{ id: string }>> {
  const user = await getCurrentUser();
  if (!user) return fail("Your session expired.");

  const store = await getStoreForUser(user.id);
  if (!store) return fail("Create your store first.");

  if (payload.id) {
    const result = await updateCategory({
      id: payload.id,
      storeId: store.id,
      userId: user.id,
      name: payload.name,
      kind: payload.kind,
      icon: payload.icon,
    });
    if (!result.ok) return fail(result.error ?? "Could not update that category.");
    revalidatePath("/workspace/categories");
    return ok({ id: payload.id });
  }

  const result = await createCategory({
    storeId: store.id,
    userId: user.id,
    name: payload.name,
    kind: payload.kind,
    icon: payload.icon,
  });

  if (!result.ok) return fail(result.error);

  revalidatePath("/workspace/categories");
  return ok({ id: result.category.id });
}

export async function deleteCategoryAction(
  categoryId: string,
): Promise<ActionResult<undefined>> {
  const user = await getCurrentUser();
  if (!user) return fail("Your session expired.");

  const store = await getStoreForUser(user.id);
  if (!store) return fail("Create your store first.");

  const result = await deleteCategory({ id: categoryId, storeId: store.id, userId: user.id });
  if (!result.ok) return fail(result.error ?? "Could not delete that category.");

  revalidatePath("/workspace/categories");
  return ok(undefined);
}
