"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser, getStoreForUser } from "@/lib/auth";
import { queryOne } from "@/lib/db";
import { refundOrder, setOrderStatus, verifyReceiptCode } from "@/lib/server/commerce";
import { resendOrderEmails } from "@/lib/server/email";
import { updateShipment, type ShipmentStatus } from "@/lib/server/shipments";
import { normaliseReceiptCode } from "@/lib/receipts";
import { fail, ok, type ActionResult } from "@/lib/types";
import type { OrderStatus } from "@/lib/types";

/** Seller-side order status changes. Ownership is enforced by the store filter. */
export async function setOrderStatusAction(
  orderId: string,
  status: OrderStatus,
): Promise<ActionResult<undefined>> {
  const user = await getCurrentUser();
  if (!user) return fail("Your session expired.");

  const store = await getStoreForUser(user.id);
  if (!store) return fail("Create your store first.");

  const result = await setOrderStatus({ orderId, storeId: store.id, status });
  if (!result.ok) return fail(result.error ?? "Could not update that order.");

  revalidatePath("/workspace/orders");
  revalidatePath(`/workspace/orders/${orderId}`);
  revalidatePath("/workspace");
  return ok(undefined);
}

/**
 * The seller acting on a shipment: a new state and/or a newly reported place.
 *
 * Ownership is enforced inside `updateShipment` by the store filter, and the
 * shipment ladder refuses backwards movement and terminal rewrites. Nothing
 * here can move anyone else's order.
 */
export async function updateShipmentAction(input: {
  shipmentId: string;
  orderId: string;
  /** Validated against the method's ladder inside `updateShipment`. */
  status: string;
  location?: string | null;
  note?: string | null;
}): Promise<ActionResult<{ message: string }>> {
  const user = await getCurrentUser();
  if (!user) return fail("Your session expired.");

  const store = await getStoreForUser(user.id);
  if (!store) return fail("Create your store first.");

  const result = await updateShipment({
    shipmentId: input.shipmentId,
    storeId: store.id,
    status: input.status as ShipmentStatus,
    location: input.location ?? null,
    note: input.note ?? null,
  });

  if (!result.ok) return fail(result.error ?? "The shipment could not be updated.");

  revalidatePath(`/workspace/orders/${input.orderId}`);
  revalidatePath("/workspace/orders");
  revalidatePath("/workspace");
  return ok({ message: "Shipment updated." });
}

/**
 * Refunds a paid order. The money goes back through Paystack first — a refusal
 * there changes nothing on the order.
 */
export async function refundOrderAction(orderId: string): Promise<ActionResult<{ message: string }>> {
  const user = await getCurrentUser();
  if (!user) return fail("Your session expired.");

  const store = await getStoreForUser(user.id);
  if (!store) return fail("Create your store first.");

  const result = await refundOrder({ orderId, storeId: store.id });
  if (!result.ok) return fail(result.error ?? "The refund could not be processed.");

  revalidatePath(`/workspace/orders/${orderId}`);
  revalidatePath("/workspace/orders");
  revalidatePath("/workspace");
  return ok({ message: result.message });
}

/**
 * Scans a customer's receipt QR and reports what the order actually is.
 *
 * The code is only a lookup key: the answer is re-read from the database, and
 * the lookup is scoped to this seller's store — a code that belongs to another
 * shop resolves to nothing here.
 */
export async function verifyReceiptAction(input: {
  code: string;
}): Promise<ActionResult<Awaited<ReturnType<typeof verifyReceiptCode>>>> {
  const user = await getCurrentUser();
  if (!user) return fail("Your session expired. Sign in again to verify receipts.");

  const store = await getStoreForUser(user.id);
  if (!store) return fail("Create your store first.");

  const code = normaliseReceiptCode(input.code);
  const result = await verifyReceiptCode(code, store.id);
  return ok(result);
}

/**
 * Hands a pickup order over: `ready_for_pickup → picked_up`, once.
 *
 * The ladder in `updateShipment` is authoritative — a completed pickup is
 * terminal, so a second scan at the door cannot collect the same order twice.
 */
export async function completePickupAction(input: {
  shipmentId: string;
  orderId: string;
}): Promise<ActionResult<{ message: string }>> {
  const user = await getCurrentUser();
  if (!user) return fail("Your session expired.");

  const store = await getStoreForUser(user.id);
  if (!store) return fail("Create your store first.");

  const result = await updateShipment({
    shipmentId: input.shipmentId,
    storeId: store.id,
    status: "picked_up",
    note: "Collected by the buyer.",
  });

  if (!result.ok) return fail(result.error ?? "The pickup could not be recorded.");

  revalidatePath(`/workspace/orders/${input.orderId}`);
  revalidatePath("/workspace/orders/verify");
  revalidatePath("/workspace");
  return ok({ message: "Order collected. This pickup is closed." });
}

/**
 * Sends a paid order's invoice (and tickets) again.
 *
 * Only sends: the order is already paid and already fulfilled, so this never
 * re-charges, re-issues tickets or moves stock. Used when a buyer says the mail
 * never arrived, or to clear a failed send from before mail was configured.
 */
export async function resendOrderEmailsAction(
  orderId: string,
): Promise<ActionResult<{ message: string }>> {
  const user = await getCurrentUser();
  if (!user) return fail("Your session expired.");

  const store = await getStoreForUser(user.id);
  if (!store) return fail("Create your store first.");

  // An order id alone is not permission — it has to be this store's order.
  const owned = await queryOne<{ id: string }>(
    "SELECT id FROM orders WHERE id = ? AND store_id = ?",
    [orderId, store.id],
  );
  if (!owned) return fail("That order is not in your store.");

  const result = await resendOrderEmails(orderId);
  if (!result.ok) return fail(result.error ?? "The invoice could not be sent.");

  revalidatePath(`/workspace/orders/${orderId}`);
  revalidatePath("/workspace/orders");
  return ok({ message: "Invoice sent." });
}
