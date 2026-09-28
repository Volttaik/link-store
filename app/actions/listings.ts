"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser, getStoreForUser } from "@/lib/auth";
import {
  addDigitalAsset,
  adjustInventory,
  createListing,
  deleteListing,
  getOwnedListing,
  removeDigitalAsset,
  setListingFeatured,
  setListingStatus,
  updateListing,
  type ListingInput,
} from "@/lib/server/listings";
import {
  createEvent,
  deleteEvent,
  getOwnedEvent,
  setEventStatus,
  updateEvent,
  type EventInput,
} from "@/lib/server/events";
import {
  createDiscount,
  deleteDiscount,
  getDiscount,
  setDiscountActive,
  updateDiscount,
  type DiscountInput,
} from "@/lib/server/management";
import { checkInTicket } from "@/lib/server/commerce";
import { recordAnalyticsEvent } from "@/lib/server/insights";
import { deleteObject } from "@/lib/storage";
import { normaliseTicketCode } from "@/lib/tickets";
import { fail, ok, type ActionResult } from "@/lib/types";
import type { ListingStatus } from "@/lib/types";

/** Resolve the signed-in user's store, or report the reason we cannot. */
async function context(): Promise<{ storeId: string; userId: string } | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const store = await getStoreForUser(user.id);
  if (!store) return null;
  return { storeId: store.id, userId: user.id };
}

// --- Ticket verification ----------------------------------------------------

/**
 * The outcome of one verification attempt, shaped for the door UI.
 *
 * It is intentionally a plain, flat record: the check-in screen renders one
 * large result from it, and nothing here can be trusted by the browser — the
 * server produced it after re-reading the ticket's real state.
 */
export type TicketVerification = {
  ok: boolean;
  /** Empty when the operator submitted nothing. */
  code: string;
  message: string;
  reason?:
    | "not_found"
    | "wrong_event"
    | "already_used"
    | "cancelled"
    | "refunded"
    | "expired"
    | "invalid"
    | "empty"
    | "not_authorised";
  holderName: string | null;
  ticketType: string | null;
  eventTitle: string | null;
  eventStartsAt: string | null;
  /** When the ticket was used at the door — only set once it has been. */
  usedAt: string | null;
};

/**
 * Verify and redeem a ticket at the door.
 *
 * This is the only way a ticket can be marked as used, and it is deliberately
 * server-side and owner-scoped:
 *
 * 1. the caller must be signed in and own a store;
 * 2. the event must belong to **that** store — a seller can never verify, or
 *    even query, tickets for somebody else's event;
 * 3. the code is normalised from whatever the scanner produced (raw code, the
 *    QR payload, or a scanned URL) and then checked against the database;
 * 4. the database decides everything else: whether the ticket belongs to this
 *    event, whether it is still valid, and whether it has already been redeemed.
 *
 * The QR code itself is only a lookup key, so a forged or replayed code cannot
 * produce a "verified" result in the browser.
 */
export async function verifyTicketAction(input: {
  eventId: string;
  code: string;
}): Promise<ActionResult<TicketVerification>> {
  const ctx = await context();
  if (!ctx) {
    return fail("Your session expired. Sign in again to check tickets in.");
  }

  const event = await getOwnedEvent(input.eventId, ctx.storeId);
  if (!event) {
    return fail("That event is not in your store.");
  }

  const code = normaliseTicketCode(input.code);
  if (!code) {
    return ok({
      ok: false,
      code: "",
      reason: "empty" as const,
      message: "Enter or scan a ticket code.",
      holderName: null,
      ticketType: null,
      eventTitle: event.title,
      eventStartsAt: event.starts_at,
      usedAt: null,
    });
  }

  const result = await checkInTicket({ code, storeId: ctx.storeId, eventId: event.id });

  // The door list and the event's own counters change on every scan.
  revalidatePath(`/workspace/events/${event.id}/check-in`);
  revalidatePath(`/workspace/events/${event.id}`);
  revalidatePath("/workspace/events");

  return ok({
    ok: result.ok,
    code: result.ticket?.code ?? code,
    reason: result.reason,
    message: result.ok
      ? "Ticket verified, admitted"
      : (result.error ?? "This ticket could not be verified."),
    holderName: result.ticket?.holder_name ?? null,
    ticketType: result.ticket?.ticket_type_name ?? null,
    eventTitle: result.ticket?.event_title ?? event.title,
    eventStartsAt: result.ticket?.event_starts_at ?? event.starts_at,
    usedAt: result.ticket?.checked_in_at ?? null,
  });
}

// --- Listings ---------------------------------------------------------------

export async function saveListingAction(
  payload: ListingInput & { id?: string },
): Promise<ActionResult<{ listingId: string }>> {
  const ctx = await context();
  if (!ctx) return fail("Your session expired, or your store has not been created yet.");

  if (payload.title.trim().length < 2) {
    return fail("Give this listing a name.", { title: "A name is required." });
  }

  if (payload.id) {
    const existing = await getOwnedListing(payload.id, ctx.storeId);
    if (!existing) return fail("That listing no longer exists.");

    const result = await updateListing(payload.id, ctx.storeId, payload);
    if (!result.ok) return fail(result.error);

    revalidatePath("/workspace/listings");
    revalidatePath(`/workspace/listings/${payload.id}`);
    revalidatePath(`/listing/${payload.id}`);
    return ok({ listingId: payload.id });
  }

  const result = await createListing(ctx.storeId, payload);
  if (!result.ok) return fail(result.error);

  revalidatePath("/workspace/listings");
  revalidatePath("/workspace");
  return ok({ listingId: result.listingId });
}

export async function setListingStatusAction(
  listingId: string,
  status: ListingStatus,
): Promise<ActionResult<undefined>> {
  const ctx = await context();
  if (!ctx) return fail("Your session expired.");

  const result = await setListingStatus({ listingId, storeId: ctx.storeId, status });
  if (!result.ok) return fail(result.error ?? "Could not change that status.");

  revalidatePath("/workspace/listings");
  revalidatePath(`/listing/${listingId}`);
  revalidatePath("/workspace");
  return ok(undefined);
}

export async function toggleListingFeaturedAction(
  listingId: string,
  featured: boolean,
): Promise<ActionResult<undefined>> {
  const ctx = await context();
  if (!ctx) return fail("Your session expired.");

  const result = await setListingFeatured({ listingId, storeId: ctx.storeId, featured });
  if (!result.ok) return fail(result.error ?? "Could not update that listing.");

  revalidatePath("/workspace/listings");
  return ok(undefined);
}

export async function deleteListingAction(listingId: string): Promise<ActionResult<undefined>> {
  const ctx = await context();
  if (!ctx) return fail("Your session expired.");

  // Remove the stored files first so deleting a listing cannot orphan objects
  // in the bucket.
  const existing = await getOwnedListing(listingId, ctx.storeId);
  if (!existing) return fail("That listing no longer exists.");

  const { listListingImages, listDigitalAssets } = await import("@/lib/server/listings");
  const [images, assets] = await Promise.all([
    listListingImages(listingId),
    listDigitalAssets(listingId),
  ]);

  await Promise.all([
    ...images.filter((image) => image.storage_key).map((image) => deleteObject(image.storage_key as string)),
    ...assets.map((asset) => deleteObject(asset.storage_key)),
  ]);

  const result = await deleteListing({ listingId, storeId: ctx.storeId, userId: ctx.userId });
  if (!result.ok) return fail(result.error ?? "Could not delete that listing.");

  revalidatePath("/workspace/listings");
  revalidatePath("/workspace");
  return ok(undefined);
}

// --- Digital assets ---------------------------------------------------------

export async function attachDigitalAssetAction(payload: {
  listingId: string;
  key: string;
  fileName: string;
  contentType: string;
  size: number;
}): Promise<ActionResult<undefined>> {
  const ctx = await context();
  if (!ctx) return fail("Your session expired.");

  const result = await addDigitalAsset({ ...payload, storeId: ctx.storeId });
  if (!result.ok) return fail(result.error ?? "Could not attach that file.");

  revalidatePath(`/workspace/listings/${payload.listingId}`);
  return ok(undefined);
}

export async function detachDigitalAssetAction(
  assetId: string,
): Promise<ActionResult<undefined>> {
  const ctx = await context();
  if (!ctx) return fail("Your session expired.");

  const { getDigitalAssetForStore } = await import("@/lib/server/listings");
  const asset = await getDigitalAssetForStore(assetId, ctx.storeId);
  if (!asset) return fail("That file no longer exists.");

  await deleteObject(asset.storage_key);

  const result = await removeDigitalAsset({ assetId, storeId: ctx.storeId });
  if (!result.ok) return fail(result.error ?? "Could not remove that file.");

  revalidatePath(`/workspace/listings/${asset.listing_id}`);
  return ok(undefined);
}

// --- Inventory --------------------------------------------------------------

export async function adjustInventoryAction(payload: {
  listingId: string;
  variantId?: string | null;
  delta: number;
  note?: string | null;
}): Promise<ActionResult<{ stock: number }>> {
  const ctx = await context();
  if (!ctx) return fail("Your session expired.");

  const result = await adjustInventory({
    listingId: payload.listingId,
    storeId: ctx.storeId,
    variantId: payload.variantId ?? null,
    delta: payload.delta,
    reason: payload.delta > 0 ? "restock" : "adjustment",
    note: payload.note ?? null,
  });

  if (!result.ok) return fail(result.error);

  revalidatePath("/workspace/inventory");
  revalidatePath("/workspace/listings");
  return ok({ stock: result.stock });
}

// --- Events -----------------------------------------------------------------

export async function saveEventAction(
  payload: EventInput & { id?: string },
): Promise<ActionResult<{ eventId: string }>> {
  const ctx = await context();
  if (!ctx) return fail("Your session expired, or your store has not been created yet.");

  if (payload.id) {
    const existing = await getOwnedEvent(payload.id, ctx.storeId);
    if (!existing) return fail("That event no longer exists.");

    const result = await updateEvent(payload.id, ctx.storeId, payload);
    if (!result.ok) return fail(result.error);

    revalidatePath("/workspace/events");
    revalidatePath(`/workspace/events/${payload.id}`);
    revalidatePath(`/events/${payload.id}`);
    return ok({ eventId: payload.id });
  }

  const result = await createEvent(ctx.storeId, payload);
  if (!result.ok) return fail(result.error);

  revalidatePath("/workspace/events");
  return ok({ eventId: result.eventId });
}

export async function setEventStatusAction(
  eventId: string,
  status: "draft" | "published" | "cancelled" | "completed",
): Promise<ActionResult<undefined>> {
  const ctx = await context();
  if (!ctx) return fail("Your session expired.");

  const result = await setEventStatus({ eventId, storeId: ctx.storeId, status });
  if (!result.ok) return fail(result.error ?? "Could not change that event.");

  revalidatePath("/workspace/events");
  revalidatePath(`/events/${eventId}`);
  return ok(undefined);
}

export async function deleteEventAction(eventId: string): Promise<ActionResult<undefined>> {
  const ctx = await context();
  if (!ctx) return fail("Your session expired.");

  const result = await deleteEvent({ eventId, storeId: ctx.storeId });
  if (!result.ok) return fail(result.error ?? "Could not delete that event.");

  revalidatePath("/workspace/events");
  return ok(undefined);
}

// --- Discounts --------------------------------------------------------------

export async function saveDiscountAction(
  payload: DiscountInput & { id?: string },
): Promise<ActionResult<{ id: string }>> {
  const ctx = await context();
  if (!ctx) return fail("Your session expired.");

  if (payload.id) {
    const existing = await getDiscount(payload.id, ctx.storeId);
    if (!existing) return fail("That discount no longer exists.");

    const result = await updateDiscount(payload.id, ctx.storeId, payload);
    if (!result.ok) return fail(result.error ?? "Could not save that discount.");

    revalidatePath("/workspace/discounts");
    return ok({ id: payload.id });
  }

  const result = await createDiscount(ctx.storeId, payload);
  if (!result.ok) return fail(result.error);

  revalidatePath("/workspace/discounts");
  return ok({ id: result.id });
}

export async function toggleDiscountAction(
  discountId: string,
  active: boolean,
): Promise<ActionResult<undefined>> {
  const ctx = await context();
  if (!ctx) return fail("Your session expired.");

  const result = await setDiscountActive(discountId, ctx.storeId, active);
  if (!result.ok) return fail(result.error ?? "Could not update that discount.");

  revalidatePath("/workspace/discounts");
  return ok(undefined);
}

export async function deleteDiscountAction(discountId: string): Promise<ActionResult<undefined>> {
  const ctx = await context();
  if (!ctx) return fail("Your session expired.");

  const result = await deleteDiscount(discountId, ctx.storeId);
  if (!result.ok) return fail(result.error ?? "Could not delete that discount.");

  revalidatePath("/workspace/discounts");
  return ok(undefined);
}

// --- Reviews ----------------------------------------------------------------

export async function setReviewStatusAction(
  reviewId: string,
  status: "published" | "hidden",
): Promise<ActionResult<undefined>> {
  const ctx = await context();
  if (!ctx) return fail("Your session expired.");

  const { setReviewStatus } = await import("@/lib/server/management");
  const result = await setReviewStatus(reviewId, ctx.storeId, status);
  if (!result.ok) return fail(result.error ?? "Could not update that review.");

  revalidatePath("/workspace/reviews");
  return ok(undefined);
}

export async function deleteReviewAction(reviewId: string): Promise<ActionResult<undefined>> {
  const ctx = await context();
  if (!ctx) return fail("Your session expired.");

  const { deleteReview } = await import("@/lib/server/management");
  const result = await deleteReview(reviewId, ctx.storeId);
  if (!result.ok) return fail(result.error ?? "Could not delete that review.");

  revalidatePath("/workspace/reviews");
  return ok(undefined);
}

/** Public: record a product view. Fire-and-forget from the detail page. */
export async function trackListingViewAction(payload: {
  listingId: string;
  storeId: string;
  referrer?: string | null;
}): Promise<ActionResult<undefined>> {
  await recordAnalyticsEvent({
    storeId: payload.storeId,
    listingId: payload.listingId,
    eventType: "listing_view",
    referrer: payload.referrer ?? null,
  });
  return ok(undefined);
}
