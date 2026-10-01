"use server";
import { revalidatePath } from "next/cache";
import { getCurrentUser, getStoreForUser } from "@/lib/auth";
import { adjustInventory, createListing, deleteListing, getOwnedListing, listListingVariants, setListingFeatured, setListingStatus, updateListing, type ListingInput } from "@/lib/server/listings";
import { createEvent, deleteEvent, getOwnedEvent, setEventStatus, updateEvent, type EventInput } from "@/lib/server/events";
import { createDiscount, deleteDiscount, getDiscount, setDiscountActive, updateDiscount, setReviewStatus, deleteReview, type DiscountInput } from "@/lib/server/management";
import { recordAnalyticsEvent } from "@/lib/server/insights";
import { fail, ok, type ActionResult, type ListingStatus } from "@/lib/types";
async function context() { const user = await getCurrentUser(); if (!user) return null; const store = await getStoreForUser(user.id); return store ? { storeId: store.id, userId: user.id } : null; }
function refreshCatalogue(id?: string) { revalidatePath("/", "layout"); revalidatePath("/workspace/listings"); revalidatePath("/workspace/events"); if (id) { revalidatePath(`/listing/${id}`); revalidatePath(`/workspace/listings/${id}`); } }
export async function saveListingAction(payload: ListingInput & { id?: string }): Promise<ActionResult<{ listingId: string; variantIds: string[] }>> {
  const ctx = await context(); if (!ctx) return fail("Sign in to your store to save products.");
  if (payload.id) { if (!await getOwnedListing(payload.id, ctx.storeId)) return fail("Product not found."); const result = await updateListing(payload.id, ctx.storeId, payload); if (!result.ok) return fail(result.error); refreshCatalogue(payload.id); return ok({ listingId: payload.id, variantIds: (await listListingVariants(payload.id)).map(variant => variant.id) }); }
  const result = await createListing(ctx.storeId, payload); if (!result.ok) return fail(result.error); refreshCatalogue(result.listingId); return ok({ listingId: result.listingId, variantIds: (await listListingVariants(result.listingId)).map(variant => variant.id) });
}
export async function setListingStatusAction(listingId: string, status: ListingStatus): Promise<ActionResult<undefined>> { const ctx = await context(); if (!ctx) return fail("Your session expired."); const result = await setListingStatus({ listingId, storeId: ctx.storeId, status }); if (!result.ok) return fail(result.error ?? "Could not update your product."); refreshCatalogue(listingId); return ok(undefined); }
export async function toggleListingFeaturedAction(listingId: string, featured: boolean): Promise<ActionResult<undefined>> { const ctx = await context(); if (!ctx) return fail("Your session expired."); const result = await setListingFeatured({ listingId, storeId: ctx.storeId, featured }); if (!result.ok) return fail(result.error ?? "Could not update your product."); refreshCatalogue(listingId); return ok(undefined); }
export async function deleteListingAction(listingId: string): Promise<ActionResult<undefined>> {
  const ctx = await context(); if (!ctx) return fail("Your session expired.");
  // Keep historical order snapshots intact; collection references cascade away.
  const result = await deleteListing({ listingId, storeId: ctx.storeId, userId: ctx.userId }); if (!result.ok) return fail(result.error ?? "Could not delete your product."); refreshCatalogue(listingId); return ok(undefined);
}
export async function adjustInventoryAction(payload: { listingId: string; variantId?: string | null; delta: number; note?: string | null }): Promise<ActionResult<{ stock: number }>> {
  const ctx = await context(); if (!ctx) return fail("Your session expired.");
  if (!Number.isSafeInteger(payload.delta)) return fail("Enter a whole quantity.");
  const result = await adjustInventory({ ...payload, storeId: ctx.storeId, reason: payload.delta > 0 ? "restock" : "adjustment" }); if (!result.ok) return fail(result.error); refreshCatalogue(payload.listingId); revalidatePath("/workspace/inventory"); return ok({ stock: result.stock });
}
export async function saveEventAction(payload: EventInput & { id?: string }): Promise<ActionResult<{ eventId: string }>> {
  const ctx = await context(); if (!ctx) return fail("Sign in to your store to save Events.");
  if (payload.id) { if (!await getOwnedEvent(payload.id, ctx.storeId)) return fail("Event not found."); const result = await updateEvent(payload.id, ctx.storeId, payload); if (!result.ok) return fail(result.error); refreshCatalogue(); revalidatePath(`/events/${payload.id}`); return ok({ eventId: payload.id }); }
  const result = await createEvent(ctx.storeId, payload); if (!result.ok) return fail(result.error); refreshCatalogue(); return ok({ eventId: result.eventId });
}
export async function setEventStatusAction(eventId: string, status: EventInput["status"]): Promise<ActionResult<undefined>> { const ctx = await context(); if (!ctx) return fail("Your session expired."); const result = await setEventStatus({ eventId, storeId: ctx.storeId, status }); if (!result.ok) return fail(result.error ?? "Could not update Event."); refreshCatalogue(); revalidatePath(`/events/${eventId}`); return ok(undefined); }
export async function deleteEventAction(eventId: string): Promise<ActionResult<undefined>> { const ctx = await context(); if (!ctx) return fail("Your session expired."); const result = await deleteEvent({ eventId, storeId: ctx.storeId }); if (!result.ok) return fail(result.error ?? "Could not delete Event."); refreshCatalogue(); return ok(undefined); }
export async function saveDiscountAction(payload: DiscountInput & { id?: string }): Promise<ActionResult<{ id: string }>> {
  const ctx = await context(); if (!ctx) return fail("Your session expired.");
  if (payload.id) { if (!await getDiscount(payload.id, ctx.storeId)) return fail("Discount not found."); const result = await updateDiscount(payload.id, ctx.storeId, payload); if (!result.ok) return fail(result.error ?? "Could not save discount."); revalidatePath("/workspace/discounts"); return ok({ id: payload.id }); }
  const result = await createDiscount(ctx.storeId, payload); if (!result.ok) return fail(result.error); revalidatePath("/workspace/discounts"); return ok({ id: result.id });
}
export async function toggleDiscountAction(discountId: string, active: boolean): Promise<ActionResult<undefined>> { const ctx = await context(); if (!ctx) return fail("Your session expired."); const result = await setDiscountActive(discountId, ctx.storeId, active); if (!result.ok) return fail(result.error ?? "Could not update discount."); revalidatePath("/workspace/discounts"); return ok(undefined); }
export async function deleteDiscountAction(discountId: string): Promise<ActionResult<undefined>> { const ctx = await context(); if (!ctx) return fail("Your session expired."); const result = await deleteDiscount(discountId, ctx.storeId); if (!result.ok) return fail(result.error ?? "Could not delete discount."); revalidatePath("/workspace/discounts"); return ok(undefined); }
export async function setReviewStatusAction(reviewId: string, status: "published" | "hidden"): Promise<ActionResult<undefined>> { const ctx = await context(); if (!ctx) return fail("Your session expired."); const result = await setReviewStatus(reviewId, ctx.storeId, status); if (!result.ok) return fail(result.error ?? "Could not update review."); revalidatePath("/workspace/reviews"); return ok(undefined); }
export async function deleteReviewAction(reviewId: string): Promise<ActionResult<undefined>> { const ctx = await context(); if (!ctx) return fail("Your session expired."); const result = await deleteReview(reviewId, ctx.storeId); if (!result.ok) return fail(result.error ?? "Could not delete review."); revalidatePath("/workspace/reviews"); return ok(undefined); }
export async function trackListingViewAction(payload: { listingId: string; storeId: string; referrer?: string | null }): Promise<ActionResult<undefined>> { const product = await getOwnedListing(payload.listingId, payload.storeId); if (!product || product.status !== "active") return fail("Product not found."); await recordAnalyticsEvent({ ...payload, eventType: "listing_view" }); return ok(undefined); }
