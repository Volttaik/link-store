"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth";
import {
  CART_COOKIE,
  ORDER_ACCESS_COOKIE,
  addToCart,
  createOrderFromCart,
  createTicketOrder,
  getCartView,
  priceCart,
  recordPaymentIntent,
  removeCartItem,
  resolveActiveCart,
  updateCartItem,
  verifyAndFulfilPayment,
} from "@/lib/server/commerce";
import { createReview, listListingReviews } from "@/lib/server/management";
import { syncPaymentRequestForPayment } from "@/lib/server/payment-requests";
import { isPaystackConfigured, requestBaseUrl } from "@/lib/env";
import { initializeTransaction } from "@/lib/paystack";
import { randomCode } from "@/lib/ids";
import { fail, ok, type ActionResult } from "@/lib/types";

/**
 * Read the shopper's active cart — scoped to the signed-in account, never the
 * bare cookie, so one account can never mutate another's basket.
 */
export async function getActiveCartId(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(CART_COOKIE)?.value ?? null;
  const user = await getCurrentUser();
  const cart = await resolveActiveCart(token, user?.id ?? null);
  return cart?.id ?? null;
}

export async function addToCartAction(payload: {
  listingId?: string;
  variantId?: string | null;
  ticketTypeId?: string | null;
  quantity: number;
}): Promise<ActionResult<{ itemCount: number }>> {
  const cookieStore = await cookies();
  const user = await getCurrentUser();
  const token = cookieStore.get(CART_COOKIE)?.value ?? null;

  const result = await addToCart({
    listingId: payload.listingId,
    variantId: payload.variantId ?? null,
    ticketTypeId: payload.ticketTypeId ?? null,
    quantity: payload.quantity,
    cartToken: token,
    userId: user?.id ?? null,
    viewerUserId: user?.id ?? null,
  });

  if (!result.ok) return fail(result.error);

  cookieStore.set(CART_COOKIE, result.cartToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  revalidatePath("/cart");
  revalidatePath("/", "layout");
  return ok({ itemCount: result.itemCount });
}

export async function updateCartItemAction(
  itemId: string,
  quantity: number,
): Promise<ActionResult<{ subtotal: number }>> {
  const cartId = await getActiveCartId();
  if (!cartId) return fail("Your cart could not be found.");

  const result = await updateCartItem(cartId, itemId, quantity);
  if (!result.ok) return fail(result.error);

  const view = await getCartView(cartId);
  revalidatePath("/cart");
  revalidatePath("/", "layout");
  return ok({ subtotal: view?.subtotal ?? 0 });
}

export async function removeCartItemAction(itemId: string): Promise<ActionResult<undefined>> {
  const cartId = await getActiveCartId();
  if (!cartId) return fail("Your cart could not be found.");

  await removeCartItem(cartId, itemId);
  revalidatePath("/cart");
  revalidatePath("/", "layout");
  return ok(undefined);
}

export async function applyDiscountAction(
  code: string,
): Promise<ActionResult<{ discountTotal: number; total: number; message: string | null }>> {
  const cartId = await getActiveCartId();
  if (!cartId) return fail("Your cart could not be found.");

  const totals = await priceCart(cartId, code);
  if (totals.discountMessage && totals.discountTotal === 0) {
    return fail(totals.discountMessage);
  }

  revalidatePath("/cart");
  return ok({
    discountTotal: totals.discountTotal,
    total: totals.total,
    message: totals.discountMessage,
  });
}

export type CheckoutPayload = {
  /** Which shop's slice of the basket to pay for. */
  storeId?: string | null;
  email: string;
  name?: string | null;
  phone?: string | null;
  note?: string | null;
  discountCode?: string | null;
  address?: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    country?: string;
    postalCode?: string;
  } | null;
};

export type CheckoutResult =
  | { ok: true; authorizationUrl: string; orderNumber: string; orderId: string }
  | { ok: false; error: string; issues?: string[]; fieldErrors?: Record<string, string> };

/**
 * Create the order, then hand off to Paystack.
 *
 * The order is persisted *before* payment so the payment reference always
 * resolves to a real order, and the amount sent to Paystack is the server's own
 * calculation — never anything the browser supplied.
 */
export async function startCheckoutAction(
  payload: CheckoutPayload,
): Promise<CheckoutResult> {
  const cookieStore = await cookies();
  const cartId = await getActiveCartId();
  if (!cartId) return { ok: false, error: "Your cart is empty." };

  const user = await getCurrentUser();

  const result = await createOrderFromCart({
    cartId,
    storeId: payload.storeId ?? null,
    userId: user?.id ?? null,
    customer: {
      email: payload.email,
      name: payload.name ?? null,
      phone: payload.phone ?? null,
      note: payload.note ?? null,
      shippingAddress: payload.address
        ? Object.fromEntries(
            Object.entries(payload.address).filter(([, value]) => Boolean(value)) as Array<
              [string, string]
            >,
          )
        : null,
    },
    discountCode: payload.discountCode ?? null,
  });

  if (!result.ok) {
    return { ok: false, error: result.error, issues: result.issues };
  }

  const order = result.order;

  // Without Paystack credentials we cannot take money. Say so plainly rather
  // than pretending the order succeeded.
  if (!isPaystackConfigured) {
    return {
      ok: false,
      error:
        `Good news and bad news: order ${order.order_number} is saved, but this shop ` +
        "can't take payments yet. Try again a little later. Your basket is safe.",
    };
  }

  if (order.total <= 0) {
    return {
      ok: false,
      error: "There's nothing left to pay on this order. It may already be covered.",
    };
  }

  const reference = `LS_${randomCode(18)}`;

  const initialized = await initializeTransaction({
    email: order.email,
    amountMinor: order.total,
    currency: order.currency,
    reference,
    callbackUrl: `${await requestBaseUrl()}/checkout/callback`,
    metadata: {
      orderId: order.id,
      orderNumber: order.order_number,
      storeId: order.store_id,
    },
  });

  if (!initialized.ok) {
    return { ok: false, error: initialized.error };
  }

  await recordPaymentIntent({
    orderId: order.id,
    storeId: order.store_id,
    reference: initialized.reference,
    amount: order.total,
    currency: order.currency,
    authorizationUrl: initialized.authorizationUrl,
  });

  // Remember the order so the customer can find it again without an account.
  cookieStore.set(ORDER_ACCESS_COOKIE, order.access_token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
  });

  // The basket only disappears when this payment emptied it. A mixed cart keeps
  // the other shops' items, so the shopper can go straight on to the next one.
  const remaining = await getCartView(cartId);
  const stillShopping = Boolean(remaining && remaining.items.length > 0);
  if (!stillShopping) cookieStore.delete(CART_COOKIE);

  revalidatePath("/cart");
  revalidatePath("/checkout");
  revalidatePath("/workspace");

  return {
    ok: true,
    authorizationUrl: initialized.authorizationUrl,
    orderNumber: order.order_number,
    orderId: order.id,
  };
}

export type TicketCheckoutPayload = {
  eventId: string;
  /** What the buyer chose: ticket type → how many. */
  items: Array<{ ticketTypeId: string; quantity: number }>;
  email: string;
  name?: string | null;
  phone?: string | null;
  note?: string | null;
};

/**
 * Buy tickets.
 *
 * The ticket purchase flow: no cart, no cart cookie, no basket line — the chosen
 * admissions become one order for one event, and the amount sent to Paystack is
 * the server's own calculation from the database. Everything about the choice
 * (which types, which prices, how many are left, whether they are on sale) is
 * re-verified in `createTicketOrder`, so an edited request buys nothing extra.
 */
export async function startTicketCheckoutAction(
  payload: TicketCheckoutPayload,
): Promise<CheckoutResult> {
  const user = await getCurrentUser();
  const cookieStore = await cookies();

  const result = await createTicketOrder({
    eventId: payload.eventId,
    userId: user?.id ?? null,
    customer: {
      email: payload.email,
      name: payload.name ?? null,
      phone: payload.phone ?? null,
      note: payload.note ?? null,
    },
    lines: payload.items,
  });

  if (!result.ok) {
    return { ok: false, error: result.error, issues: result.issues };
  }

  const order = result.order;

  if (!isPaystackConfigured) {
    return {
      ok: false,
      error:
        `Order ${order.order_number} is saved, but this event can't take payments yet. ` +
        "Your tickets are not issued until the payment is verified. Try again a little later.",
    };
  }

  if (order.total <= 0) {
    return { ok: false, error: "There's nothing to pay on this order." };
  }

  const reference = `LS_${randomCode(18)}`;

  const initialized = await initializeTransaction({
    email: order.email,
    amountMinor: order.total,
    currency: order.currency,
    reference,
    callbackUrl: `${await requestBaseUrl()}/checkout/callback`,
    metadata: {
      orderId: order.id,
      orderNumber: order.order_number,
      storeId: order.store_id,
      kind: "ticket",
    },
  });

  if (!initialized.ok) {
    return { ok: false, error: initialized.error };
  }

  await recordPaymentIntent({
    orderId: order.id,
    storeId: order.store_id,
    reference: initialized.reference,
    amount: order.total,
    currency: order.currency,
    authorizationUrl: initialized.authorizationUrl,
  });

  // The same guest-order cookie the product checkout uses, so a buyer without an
  // account can find this order (and its tickets) again.
  cookieStore.set(ORDER_ACCESS_COOKIE, order.access_token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
  });

  revalidatePath("/tickets");
  revalidatePath("/orders");
  revalidatePath("/workspace");

  return {
    ok: true,
    authorizationUrl: initialized.authorizationUrl,
    orderNumber: order.order_number,
    orderId: order.id,
  };
}

/**
 * Called from the Paystack return page. Verification is server-to-server, so a
 * customer cannot fake success by editing the URL.
 */
export async function verifyPaymentAction(reference: string): Promise<ActionResult<{
  status: string;
  orderId?: string;
}>> {
  const result = await verifyAndFulfilPayment(reference);

  // A chat payment card must reflect the same verified state as the ledger.
  await syncPaymentRequestForPayment(reference);

  revalidatePath("/workspace");
  revalidatePath("/workspace/orders");

  if (result.ok) {
    return ok({ status: result.status, orderId: result.orderId });
  }

  return fail(result.error ?? "We could not verify that payment yet.");
}

export async function submitReviewAction(payload: {
  storeId: string;
  listingId?: string | null;
  email: string;
  name?: string | null;
  rating: number;
  title?: string | null;
  body?: string | null;
}): Promise<ActionResult<undefined>> {
  const result = await createReview({
    storeId: payload.storeId,
    listingId: payload.listingId ?? null,
    email: payload.email,
    name: payload.name ?? null,
    rating: payload.rating,
    title: payload.title ?? null,
    body: payload.body ?? null,
  });

  if (!result.ok) return fail(result.error);

  revalidatePath("/");
  return ok(undefined);
}

export async function loadListingReviewsAction(listingId: string) {
  return listListingReviews(listingId);
}
