/**
 * Commerce engine — cart, pricing, orders, payments, fulfilment.
 *
 * Non-negotiable rules enforced here:
 *   * Prices, totals, shipping and discounts are computed on the server from
 *     database rows. Nothing money-related is accepted from the browser.
 *   * A payment is only ever trusted after Paystack verification or a signature
 *     -verified webhook. The client's word is never enough.
 *   * Fulfilment is idempotent. The payment row is claimed with a conditional
 *     UPDATE, so a webhook and a callback racing each other cannot issue tickets
 *     or download grants twice.
 */

import "server-only";

import { listingIsCartable } from "../catalog";
import { bool, batch, execute, query, queryOne, type BatchStatement } from "../db";
import { nowIso } from "../format";
import { newId, newOrderNumber, randomCode, randomHex } from "../ids";
import { percentOf } from "../money";
import { platformConfig } from "../env";
import { refundTransaction, verifyTransaction } from "../paystack";
import {
  sendOrderCancelledEmail,
  sendOrderCompletedEmail,
  sendOrderEmails,
  sendPaymentFailedEmail,
  sendRefundEmails,
  sendSellerOrderEmail,
  storeOwnerContact,
} from "./email";
import { getStoreSettings } from "./stores";
import {
  cancelShipment,
  closeShipmentForOrder,
  deliveryEstimate,
  deriveFulfilmentMethod,
  getShipmentForOrder,
  openShipmentForOrder,
} from "./shipments";
import { recordAnalyticsEvent } from "./insights";
import type {
  CartItemView,
  CartRow,
  CartStoreGroup,
  CartView,
  DigitalAssetRow,
  DownloadRow,
  ListingRow,
  OrderItemRow,
  OrderRow,
  OrderWithItems,
  PaymentRow,
  StoreRow,
  TicketWithEvent,
} from "../types";

export const CART_COOKIE = "ls_cart";
const ORDER_ACCESS_COOKIE = "ls_orders";
const MAX_LINE_QUANTITY = 50;

export { ORDER_ACCESS_COOKIE };

// --- Cart -------------------------------------------------------------------

export function newCartToken(): string {
  return randomCode(28);
}

export async function findActiveCartByToken(token: string): Promise<CartRow | null> {
  if (!token) return null;
  return queryOne<CartRow>("SELECT * FROM carts WHERE token = ? AND status = 'active'", [token]);
}

/**
 * The basket this viewer is allowed to see — always scoped to the signed-in
 * account.
 *
 * A guest sees only the unowned basket behind their own cookie token. A
 * signed-in account sees only *its own* basket, resolved from the account on
 * the server — never from a cookie token alone. Replaying another account's
 * cart cookie therefore cannot expose that account's basket: ownership is
 * derived from the authenticated session, not from anything the client holds.
 */
export async function resolveActiveCart(
  token: string | null,
  userId: string | null,
): Promise<CartRow | null> {
  if (userId) {
    return queryOne<CartRow>(
      "SELECT * FROM carts WHERE user_id = ? AND status = 'active' ORDER BY updated_at DESC LIMIT 1",
      [userId],
    );
  }
  if (!token) return null;
  return queryOne<CartRow>(
    "SELECT * FROM carts WHERE token = ? AND status = 'active' AND user_id IS NULL",
    [token],
  );
}

/**
 * The shopper's one active basket, whatever store the next item comes from.
 *
 * A cart is never bound to a seller: lines carry their own store (through their
 * listing), and checkout splits the basket per store so each seller is still
 * paid on their own. A signed-in shopper keeps the same basket even if the
 * cookie is lost, which is what makes "add from three shops" behave sanely.
 *
 * Ownership is decided here too: a signed-in account's basket is its own, and a
 * cookie token pointing at *another* account's basket is ignored rather than
 * adopted — so switching accounts on one browser can never carry the previous
 * account's cart across.
 */
export async function getOrCreateCart(
  token: string | null,
  userId: string | null,
): Promise<{ cart: CartRow; token: string }> {
  if (userId) {
    // The account's own basket wins, whatever cookie is present.
    const owned = await queryOne<CartRow>(
      "SELECT * FROM carts WHERE user_id = ? AND status = 'active' ORDER BY updated_at DESC LIMIT 1",
      [userId],
    );
    if (owned) return { cart: owned, token: owned.token };

    // No basket yet: adopt the guest basket behind this token only when it is
    // genuinely unowned — never another account's.
    if (token) {
      const guest = await queryOne<CartRow>(
        "SELECT * FROM carts WHERE token = ? AND status = 'active' AND user_id IS NULL",
        [token],
      );
      if (guest) {
        await execute("UPDATE carts SET user_id = ? WHERE id = ?", [userId, guest.id]);
        guest.user_id = userId;
        return { cart: guest, token };
      }
    }
  } else if (token) {
    // A guest keeps only their own unowned basket.
    const guest = await queryOne<CartRow>(
      "SELECT * FROM carts WHERE token = ? AND status = 'active' AND user_id IS NULL",
      [token],
    );
    if (guest) return { cart: guest, token };
  }

  const id = newId("cart");
  const freshToken = newCartToken();
  const timestamp = nowIso();

  await execute(
    `INSERT INTO carts (id, token, user_id, status, created_at, updated_at)
     VALUES (?, ?, ?, 'active', ?, ?)`,
    [id, freshToken, userId, timestamp, timestamp],
  );

  const cart = await queryOne<CartRow>("SELECT * FROM carts WHERE id = ?", [id]);
  return { cart: cart as CartRow, token: freshToken };
}

type CartJoinRow = CartItemView & {
  cart_id: string;
  listing_price: number;
  listing_currency: string;
  listing_status: string;
  list_stock: number;
  list_track: number;
  variant_price: number | null;
  variant_stock: number | null;
  ticket_price: number | null;
  ticket_active: number | null;
  quantity_total: number | null;
  quantity_sold: number | null;
  event_status: string | null;
};

/**
 * The basket, with every line's seller resolved from its listing.
 *
 * Lines are returned flat (for basket-wide totals) *and* grouped by store,
 * because a basket spanning three shops is three orders waiting to happen.
 */
export async function getCartView(cartId: string): Promise<CartView | null> {
  const cart = await queryOne<CartRow>("SELECT * FROM carts WHERE id = ?", [cartId]);
  if (!cart) return null;

  const rows = await query<{
    id: string;
    listing_id: string;
    variant_id: string | null;
    ticket_type_id: string | null;
    quantity: number;
    unit_price: number;
    currency: string;
    title: string;
    slug: string;
    type: string;
    fulfilment: string;
    store_id: string;
    store_name: string;
    store_slug: string;
    listing_price: number;
    listing_status: string;
    list_stock: number;
    list_track: number;
    image_url: string | null;
    variant_name: string | null;
    variant_price: number | null;
    variant_stock: number | null;
    ticket_name: string | null;
    ticket_price: number | null;
    ticket_active: number | null;
    quantity_total: number | null;
    quantity_sold: number | null;
    event_id: string | null;
    event_title: string | null;
    event_status: string | null;
  }>(
    `SELECT ci.id, ci.listing_id, ci.variant_id, ci.ticket_type_id, ci.quantity, ci.unit_price, ci.currency,
            l.title, l.slug, l.type, l.fulfilment, l.price AS listing_price, l.status AS listing_status,
            l.stock AS list_stock, l.track_inventory AS list_track,
            s.id AS store_id, s.name AS store_name, s.slug AS store_slug,
            (SELECT li.image_url FROM listing_images li WHERE li.listing_id = l.id
              ORDER BY li.position ASC, li.created_at ASC LIMIT 1) AS image_url,
            lv.name AS variant_name, lv.price AS variant_price, lv.stock AS variant_stock,
            tt.name AS ticket_name, tt.price AS ticket_price, tt.is_active AS ticket_active,
            tt.quantity_total, tt.quantity_sold,
            e.id AS event_id, e.title AS event_title, e.status AS event_status
     FROM cart_items ci
     JOIN listings l ON l.id = ci.listing_id
     JOIN stores s ON s.id = l.store_id
     LEFT JOIN listing_variants lv ON lv.id = ci.variant_id
     LEFT JOIN ticket_types tt ON tt.id = ci.ticket_type_id
     LEFT JOIN events e ON e.id = tt.event_id
     WHERE ci.cart_id = ?
     ORDER BY s.name ASC, ci.created_at ASC`,
    [cartId],
  );

  const items: CartItemView[] = rows.map((row) => {
    const isTicket = Boolean(row.ticket_type_id);
    const currentPrice = isTicket
      ? Number(row.ticket_price ?? 0)
      : row.variant_price !== null && row.variant_price !== undefined
        ? Number(row.variant_price)
        : Number(row.listing_price);

    const trackInventory = bool(row.list_track);
    const availableStock = isTicket
      ? Math.max(0, Number(row.quantity_total ?? 0) - Number(row.quantity_sold ?? 0))
      : row.variant_id && row.variant_stock !== null
        ? Number(row.variant_stock)
        : trackInventory
          ? Number(row.list_stock)
          : null;

    return {
      id: row.id,
      listingId: row.listing_id,
      variantId: row.variant_id,
      ticketTypeId: row.ticket_type_id,
      title: isTicket
        ? `${row.event_title ?? "Event"} · ${row.ticket_name ?? "Ticket"}`
        : row.title,
      variantName: row.variant_name,
      imageUrl: row.image_url,
      slug: row.slug,
      type: isTicket ? "ticket" : row.type,
      fulfilment: (isTicket ? "ticket" : row.fulfilment) as CartItemView["fulfilment"],
      quantity: Number(row.quantity),
      unitPrice: Number(row.unit_price),
      lineTotal: Number(row.unit_price) * Number(row.quantity),
      currency: row.currency,
      currentPrice,
      availableStock,
      trackInventory: isTicket || trackInventory,
      status: isTicket ? (row.event_status ?? "draft") : row.listing_status,
      eventId: row.event_id,
      eventTitle: row.event_title,
    };
  });

  const groups: CartStoreGroup[] = [];

  for (const row of rows) {
    const item = items.find((entry) => entry.id === row.id);
    if (!item) continue;

    let group = groups.find((entry) => entry.storeId === row.store_id);
    if (!group) {
      group = {
        storeId: row.store_id,
        storeName: row.store_name,
        storeSlug: row.store_slug,
        items: [],
        subtotal: 0,
        itemCount: 0,
      };
      groups.push(group);
    }

    group.items.push(item);
    group.subtotal += item.lineTotal;
    group.itemCount += item.quantity;
  }

  const subtotal = items.reduce((total, item) => total + item.lineTotal, 0);

  return {
    id: cart.id,
    currency: items[0]?.currency ?? "NGN",
    items,
    subtotal,
    itemCount: items.reduce((total, item) => total + item.quantity, 0),
    groups,
    storeCount: groups.length,
  };
}

export type AddToCartInput = {
  listingId?: string;
  variantId?: string | null;
  ticketTypeId?: string | null;
  quantity: number;
  cartToken: string | null;
  userId: string | null;
  /** Set when the shopper is the store owner, so they can test unpublished items. */
  viewerUserId?: string | null;
};

export type AddToCartResult =
  | { ok: true; cartToken: string; cartId: string; itemCount: number }
  | { ok: false; error: string };

export async function addToCart(input: AddToCartInput): Promise<AddToCartResult> {
  const quantity = Math.max(1, Math.min(Math.floor(input.quantity || 1), MAX_LINE_QUANTITY));

  let listing: ListingRow | null = null;
  let price = 0;
  let currency = "NGN";
  let storeId = "";

  // Tickets never enter the cart. An admission is bought directly — see
  // `createTicketOrder` — because a ticket is not stock: what a ticket quantity
  // produces is one ticket per admission, issued on payment. Refusing here means
  // the rule holds at the only door a cart line can be created through, whatever
  // the browser asks for.
  if (input.ticketTypeId) {
    return {
      ok: false,
      error:
        "Tickets are bought directly, not through the cart. Open the event and choose your tickets there.",
    };
  }

  if (!input.listingId) return { ok: false, error: "No item was specified." };

  listing = await queryOne<ListingRow>("SELECT * FROM listings WHERE id = ?", [input.listingId]);
  if (!listing) return { ok: false, error: "That item no longer exists." };
  storeId = listing.store_id;

  // The basket holds goods, meals and bookable services — nothing else. A
  // rental is an agreement made in the conversation (it is opened, not bought),
  // and an admission is one individual ticket bought directly. Neither can ever
  // be a cart line, whatever any client asks for — this is the one door a line
  // can be created through.
  if (listing.type === "rental") {
    return {
      ok: false,
      error:
        "Rentals are not bought through the cart. Open the listing and agree the terms with the owner in the conversation.",
    };
  }
  if (!listingIsCartable(listing.type) || listing.fulfilment === "ticket") {
    return {
      ok: false,
      error: "Tickets are bought directly, not through the cart. Open the event and choose your tickets there.",
    };
  }

  const store = await queryOne<StoreRow>("SELECT * FROM stores WHERE id = ?", [storeId]);
  const isOwner = Boolean(input.viewerUserId && store && store.user_id === input.viewerUserId);

  if (listing.status !== "active" && !isOwner) {
    return { ok: false, error: "That item is not available right now." };
  }
  if (store && !bool(store.is_published) && !isOwner) {
    return { ok: false, error: "That store is not open yet." };
  }

  price = Number(listing.price);
  currency = listing.currency;

  if (input.variantId) {
    const variant = await queryOne<{ id: string; price: number | null; stock: number; name: string }>(
      "SELECT id, price, stock, name FROM listing_variants WHERE id = ? AND listing_id = ?",
      [input.variantId, listing.id],
    );
    if (!variant) return { ok: false, error: "That option is not available." };
    if (variant.price !== null && variant.price !== undefined) price = Number(variant.price);
    if (bool(listing.track_inventory) && Number(variant.stock) < quantity) {
      return { ok: false, error: `Only ${variant.stock} left in ${variant.name}.` };
    }
  } else if (bool(listing.track_inventory) && Number(listing.stock) < quantity) {
    return {
      ok: false,
      error: Number(listing.stock) <= 0 ? "That item is sold out." : `Only ${listing.stock} left in stock.`,
    };
  }

  // A digital product with no file attached cannot be delivered, so it must
  // never be purchasable.
  if (listing.fulfilment === "digital") {
    const asset = await queryOne<{ id: string }>(
      "SELECT id FROM digital_assets WHERE listing_id = ? LIMIT 1",
      [listing.id],
    );
    if (!asset) {
      return { ok: false, error: "This digital product has no file attached yet." };
    }
  }

  // One basket per shopper: adding from a second store joins the same cart.
  const { cart, token } = await getOrCreateCart(input.cartToken, input.userId);

  const existing = await queryOne<{ id: string; quantity: number }>(
    `SELECT id, quantity FROM cart_items
     WHERE cart_id = ? AND listing_id = ?
       AND (variant_id IS ? OR variant_id = ?)
       AND (ticket_type_id IS ? OR ticket_type_id = ?)`,
    [
      cart.id,
      listing.id,
      input.variantId ?? null,
      input.variantId ?? null,
      input.ticketTypeId ?? null,
      input.ticketTypeId ?? null,
    ],
  );

  const timestamp = nowIso();

  if (existing) {
    const nextQuantity = Math.min(MAX_LINE_QUANTITY, Number(existing.quantity) + quantity);
    await execute(
      "UPDATE cart_items SET quantity = ?, unit_price = ?, updated_at = ? WHERE id = ? AND cart_id = ?",
      [nextQuantity, price, timestamp, existing.id, cart.id],
    );
  } else {
    await execute(
      `INSERT INTO cart_items
         (id, cart_id, listing_id, variant_id, ticket_type_id, quantity, unit_price, currency, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
      [
        newId("citem"),
        cart.id,
        listing.id,
        input.variantId ?? null,
        input.ticketTypeId ?? null,
        quantity,
        price,
        currency,
        timestamp,
        timestamp,
      ],
    );
  }

  await execute("UPDATE carts SET updated_at = ? WHERE id = ?", [timestamp, cart.id]);

  const view = await getCartView(cart.id);
  await recordAnalyticsEvent({
    storeId,
    listingId: listing.id,
    eventType: "add_to_cart",
    userId: input.userId ?? null,
  });

  return {
    ok: true,
    cartToken: token,
    cartId: cart.id,
    itemCount: view?.itemCount ?? quantity,
  };
}

export async function updateCartItem(
  cartId: string,
  itemId: string,
  quantity: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const item = await queryOne<{ id: string; listing_id: string; variant_id: string | null; ticket_type_id: string | null }>(
    "SELECT id, listing_id, variant_id, ticket_type_id FROM cart_items WHERE id = ? AND cart_id = ?",
    [itemId, cartId],
  );
  if (!item) return { ok: false, error: "Item not found in your cart." };

  if (quantity <= 0) {
    await execute("DELETE FROM cart_items WHERE id = ? AND cart_id = ?", [itemId, cartId]);
    return { ok: true };
  }

  const capped = Math.min(Math.floor(quantity), MAX_LINE_QUANTITY);

  const listing = await queryOne<ListingRow>("SELECT * FROM listings WHERE id = ?", [
    item.listing_id,
  ]);
  if (!listing) return { ok: false, error: "That item no longer exists." };

  if (item.ticket_type_id) {
    const ticket = await queryOne<{ quantity_total: number; quantity_sold: number }>(
      "SELECT quantity_total, quantity_sold FROM ticket_types WHERE id = ?",
      [item.ticket_type_id],
    );
    if (ticket && Number(ticket.quantity_total) > 0) {
      const remaining = Number(ticket.quantity_total) - Number(ticket.quantity_sold);
      if (capped > remaining) return { ok: false, error: `Only ${remaining} ticket(s) left.` };
    }
  } else if (bool(listing.track_inventory)) {
    const stock = item.variant_id
      ? Number(
          (
            await queryOne<{ stock: number }>("SELECT stock FROM listing_variants WHERE id = ?", [
              item.variant_id,
            ])
          )?.stock ?? 0,
        )
      : Number(listing.stock);
    if (capped > stock) return { ok: false, error: `Only ${stock} left in stock.` };
  }

  await execute("UPDATE cart_items SET quantity = ?, updated_at = ? WHERE id = ? AND cart_id = ?", [
    capped,
    nowIso(),
    itemId,
    cartId,
  ]);
  await execute("UPDATE carts SET updated_at = ? WHERE id = ?", [nowIso(), cartId]);
  return { ok: true };
}

export async function removeCartItem(cartId: string, itemId: string): Promise<void> {
  await execute("DELETE FROM cart_items WHERE id = ? AND cart_id = ?", [itemId, cartId]);
  await execute("UPDATE carts SET updated_at = ? WHERE id = ?", [nowIso(), cartId]);
}

/**
 * Cart badge data for the layout. Reads the cart cookie and returns only what
 * the header needs, so every page does not pay for a full cart view.
 *
 * `storeName` is only meaningful for a single-seller basket; a basket spanning
 * several shops reports `storeCount` instead so the header can say so honestly.
 */
export async function getCartSummary(
  token: string | null,
  userId: string | null = null,
): Promise<{ itemCount: number; storeName: string | null; storeCount: number }> {
  const cart = await resolveActiveCart(token, userId);
  if (!cart) return { itemCount: 0, storeName: null, storeCount: 0 };

  const row = await queryOne<{ total: number; store_count: number; store_name: string | null }>(
    `SELECT COALESCE(SUM(ci.quantity), 0) AS total,
            COUNT(DISTINCT l.store_id) AS store_count,
            CASE WHEN COUNT(DISTINCT l.store_id) = 1 THEN MIN(s.name) END AS store_name
     FROM cart_items ci
     JOIN listings l ON l.id = ci.listing_id
     JOIN stores s ON s.id = l.store_id
     WHERE ci.cart_id = ?`,
    [cart.id],
  );

  return {
    itemCount: Number(row?.total ?? 0),
    storeName: row?.store_name ?? null,
    storeCount: Number(row?.store_count ?? 0),
  };
}

/**
 * Adopt the guest basket on sign-in.
 *
 * Only an unowned basket is claimed, and only when the account has no basket of
 * its own yet — so signing in never produces two live baskets for one person,
 * and never reassigns another account's basket.
 */
export async function attachCartToUser(token: string | null, userId: string): Promise<void> {
  if (!token) return;
  const owned = await queryOne<CartRow>(
    "SELECT id FROM carts WHERE user_id = ? AND status = 'active' LIMIT 1",
    [userId],
  );
  if (owned) return;
  await execute("UPDATE carts SET user_id = ? WHERE token = ? AND user_id IS NULL", [token, userId]);
}

// --- Server-side pricing ----------------------------------------------------

/**
 * What one seller in the basket would be paid.
 *
 * Delivery is charged per store — each seller sets their own flat rate and
 * free-delivery threshold — which is why this is broken out rather than
 * summed into a single number.
 */
export type CartGroupTotals = {
  storeId: string;
  storeName: string;
  storeSlug: string;
  subtotal: number;
  discountTotal: number;
  shippingTotal: number;
  total: number;
  itemCount: number;
  requiresShipping: boolean;
};

export type CartTotals = {
  subtotal: number;
  discountTotal: number;
  shippingTotal: number;
  total: number;
  currency: string;
  discountId: string | null;
  discountMessage: string | null;
  issues: string[];
  /** Per-seller breakdown; one entry means one order at checkout. */
  groups: CartGroupTotals[];
};

const EMPTY_TOTALS: Omit<CartTotals, "issues"> = {
  subtotal: 0,
  discountTotal: 0,
  shippingTotal: 0,
  total: 0,
  currency: "NGN",
  discountId: null,
  discountMessage: null,
  groups: [],
};

/**
 * Re-price a cart from the database.
 *
 * Every line is re-read: if a seller changed a price or a customer's stock
 * vanished, the discrepancy is reported instead of being silently charged.
 *
 * Pass `storeId` to price only one seller's slice of the basket — that is what
 * checkout does, so a shopper never pays one shop for another shop's goods.
 */
export async function priceCart(
  cartId: string,
  discountCode?: string | null,
  storeId?: string | null,
): Promise<CartTotals> {
  const view = await getCartView(cartId);
  const issues: string[] = [];

  if (!view || view.items.length === 0) {
    return { ...EMPTY_TOTALS, issues: ["Your cart is empty."] };
  }

  const groups = storeId ? view.groups.filter((group) => group.storeId === storeId) : view.groups;

  if (groups.length === 0) {
    return { ...EMPTY_TOTALS, issues: ["Nothing from that shop is in your cart."] };
  }

  const items = groups.flatMap((group) => group.items);

  let subtotal = 0;
  const groupTotals: CartGroupTotals[] = [];

  for (const group of groups) {
    const settings = await getStoreSettings(group.storeId);
    const groupSubtotal = group.items.reduce(
      (total, item) => total + item.currentPrice * item.quantity,
      0,
    );
    const requiresShipping = group.items.some((item) => item.fulfilment === "shipping");

    let groupShipping = 0;
    if (requiresShipping) {
      const flat = Number(settings.shipping_flat_fee ?? 0);
      const freeOver =
        settings.free_shipping_over === null ? null : Number(settings.free_shipping_over);
      groupShipping = freeOver !== null && groupSubtotal >= freeOver ? 0 : flat;
    }

    subtotal += groupSubtotal;

    groupTotals.push({
      storeId: group.storeId,
      storeName: group.storeName,
      storeSlug: group.storeSlug,
      subtotal: groupSubtotal,
      discountTotal: 0,
      shippingTotal: groupShipping,
      total: groupSubtotal + groupShipping,
      itemCount: group.itemCount,
      requiresShipping,
    });
  }

  for (const item of items) {
    if (item.status !== "active") {
      issues.push(`“${item.title}” is no longer available.`);
    }
    if (item.availableStock !== null && item.trackInventory && item.availableStock < item.quantity) {
      issues.push(
        item.availableStock <= 0
          ? `“${item.title}” is now sold out.`
          : `Only ${item.availableStock} of “${item.title}” remain.`,
      );
    }
  }

  const shippingTotal = groupTotals.reduce((total, group) => total + group.shippingTotal, 0);

  let discountTotal = 0;
  let discountId: string | null = null;
  let discountMessage: string | null = null;

  const code = discountCode?.trim().toUpperCase();

  // Discounts belong to a seller, so a code can only be honoured when the basket
  // (or the slice being paid for) comes from exactly one store.
  const discountStoreId = groups.length === 1 ? groups[0].storeId : null;

  if (code && !discountStoreId) {
    discountMessage = "Discount codes belong to a shop. Apply it at checkout for each shop.";
  } else if (code) {
    const discount = await queryOne<{
      id: string;
      type: string;
      value: number;
      min_subtotal: number;
      usage_limit: number | null;
      used_count: number;
      scope: string;
      listing_id: string | null;
      starts_at: string | null;
      ends_at: string | null;
      is_active: number;
      name: string;
    }>("SELECT * FROM discounts WHERE store_id = ? AND UPPER(code) = ?", [discountStoreId, code]);

    const now = nowIso();

    if (!discount || !bool(discount.is_active)) {
      discountMessage = "That discount code is not valid.";
    } else if (discount.starts_at && now < discount.starts_at) {
      discountMessage = "That discount code is not active yet.";
    } else if (discount.ends_at && now > discount.ends_at) {
      discountMessage = "That discount code has expired.";
    } else if (
      discount.usage_limit !== null &&
      Number(discount.used_count) >= Number(discount.usage_limit)
    ) {
      discountMessage = "That discount code has reached its usage limit.";
    } else if (subtotal < Number(discount.min_subtotal)) {
      discountMessage = `Spend at least ${Number(discount.min_subtotal) / 100} to use that code.`;
    } else {
      // A listing-scoped discount only applies to lines for that listing.
      const eligible =
        discount.scope === "listing" && discount.listing_id
          ? items
              .filter((item) => item.listingId === discount.listing_id)
              .reduce((total, item) => total + item.currentPrice * item.quantity, 0)
          : subtotal;

      if (eligible <= 0) {
        discountMessage = "That discount code does not apply to anything in your cart.";
      } else {
        discountTotal =
          discount.type === "percentage"
            ? Math.floor((eligible * Number(discount.value)) / 100)
            : Math.min(Number(discount.value), eligible);
        discountId = discount.id;
        // The code belongs to the single store being priced, so the reduction
        // lands on that store's total and nowhere else.
        groupTotals[0].discountTotal = discountTotal;
        groupTotals[0].total = Math.max(0, groupTotals[0].total - discountTotal);
        discountMessage = `${discount.name} applied.`;
      }
    }
  }

  const total = Math.max(0, subtotal + shippingTotal - discountTotal);

  return {
    subtotal,
    discountTotal,
    shippingTotal,
    total,
    currency: view.currency,
    discountId,
    discountMessage,
    issues,
    groups: groupTotals,
  };
}

// --- Orders -----------------------------------------------------------------

export type CheckoutCustomer = {
  email: string;
  name?: string | null;
  phone?: string | null;
  shippingAddress?: Record<string, string> | null;
  note?: string | null;
};

export type CreateOrderResult =
  | { ok: true; order: OrderRow }
  | { ok: false; error: string; issues?: string[] };

/**
 * Turn one store's slice of the basket into a real order.
 *
 * A basket can span several shops, so checkout runs once per store: each call
 * creates an order for that seller, removes only their lines, and leaves the
 * rest of the basket untouched for the next payment. That keeps the invariant
 * the payments code relies on — one order, one seller, one payment.
 */
export async function createOrderFromCart(input: {
  cartId: string;
  userId: string | null;
  customer: CheckoutCustomer;
  discountCode?: string | null;
  source?: string;
  /** Which seller's slice to pay for. Defaults to the only store in the cart. */
  storeId?: string | null;
}): Promise<CreateOrderResult> {
  const cart = await queryOne<CartRow>("SELECT * FROM carts WHERE id = ?", [input.cartId]);
  if (!cart) return { ok: false, error: "Your cart could not be found." };

  const view = await getCartView(input.cartId);
  if (!view || view.items.length === 0) return { ok: false, error: "Your cart is empty." };

  const storeId = input.storeId ?? (view.groups.length === 1 ? view.groups[0].storeId : null);
  if (!storeId) {
    return {
      ok: false,
      error:
        "Your basket has items from more than one shop. Choose which shop to pay for. Each one is paid separately.",
    };
  }

  const group = view.groups.find((entry) => entry.storeId === storeId);
  if (!group || group.items.length === 0) {
    return { ok: false, error: "Nothing from that shop is in your basket." };
  }

  const cartItems = group.items;
  const totals = await priceCart(input.cartId, input.discountCode, storeId);

  if (totals.issues.length > 0) {
    return {
      ok: false,
      error: "Some items in your cart need attention before you can check out.",
      issues: totals.issues,
    };
  }

  const email = input.customer.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ok: false, error: "Enter a valid email address." };
  }

  const store = await queryOne<StoreRow>("SELECT * FROM stores WHERE id = ?", [storeId]);
  if (!store) return { ok: false, error: "This store is no longer available." };

  const settings = await getStoreSettings(storeId);

  // How this order reaches the buyer is decided by what is in it — a shipped
  // item is delivered, a pickup item is collected — and the honest estimate is
  // the seller's configured range, frozen here so later edits cannot rewrite
  // what this buyer was promised.
  const fulfilmentMethod = deriveFulfilmentMethod(
    cartItems.map((item) => ({
      item_type: item.ticketTypeId ? "ticket" : item.fulfilment === "digital" ? "digital" : item.type,
      fulfilment: item.fulfilment,
    })),
  );
  const estimate =
    fulfilmentMethod === "delivery" || fulfilmentMethod === "pickup"
      ? deliveryEstimate(settings)
      : null;

  // A sale must never complete without a working payment route: either the
  // store's Paystack setup is live, or we refuse rather than fake success.
  const currency = view.currency;
  if (!["NGN", "USD", "GHS", "ZAR", "KES"].includes(currency)) {
    return { ok: false, error: `Payments in ${currency} are not supported by Paystack.` };
  }

  // Customer records are per store and de-duplicated by email.
  const existingCustomer = await queryOne<{ id: string }>(
    "SELECT id FROM customers WHERE store_id = ? AND email = ?",
    [storeId, email],
  );

  const customerId = existingCustomer?.id ?? newId("cus");
  const orderId = newId("ord");
  const timestamp = nowIso();
  const orderNumber = newOrderNumber(settings.order_prefix);
  const accessToken = randomCode(40);
  // The receipt's QR encodes this and nothing else: an opaque identifier that
  // opens a seller-scoped verification view, never the buyer's full receipt.
  const receiptCode = `RC-${randomHex(8)}`;

  const statements: BatchStatement[] = [];

  if (!existingCustomer) {
    statements.push({
      sql: `INSERT INTO customers (id, store_id, user_id, email, name, phone, orders_count, total_spent, last_order_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 0, 0, NULL, ?, ?)`,
      args: [
        customerId,
        storeId,
        input.userId,
        email,
        input.customer.name?.trim() || null,
        input.customer.phone?.trim() || null,
        timestamp,
        timestamp,
      ],
    });
  } else {
    statements.push({
      sql: `UPDATE customers SET name = COALESCE(?, name), phone = COALESCE(?, phone),
              user_id = COALESCE(user_id, ?), updated_at = ? WHERE id = ?`,
      args: [
        input.customer.name?.trim() || null,
        input.customer.phone?.trim() || null,
        input.userId,
        timestamp,
        customerId,
      ],
    });
  }

  statements.push({
    sql: `INSERT INTO orders
            (id, order_number, store_id, customer_id, user_id, email, customer_name, phone,
             currency, subtotal, discount_total, shipping_total, tax_total, total, status,
             payment_status, discount_code, customer_note, shipping_address, access_token, source,
             fulfilment_method, estimated_delivery, receipt_code, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'pending', 'unpaid', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      orderId,
      orderNumber,
      storeId,
      customerId,
      input.userId,
      email,
      input.customer.name?.trim() || null,
      input.customer.phone?.trim() || null,
      currency,
      totals.subtotal,
      totals.discountTotal,
      totals.shippingTotal,
      totals.total,
      input.discountCode?.trim().toUpperCase() || null,
      input.customer.note?.trim() || null,
      input.customer.shippingAddress ? JSON.stringify(input.customer.shippingAddress) : null,
      accessToken,
      input.source ?? "marketplace",
      fulfilmentMethod,
      estimate,
      receiptCode,
      timestamp,
      timestamp,
    ],
  });

  // Line items snapshot title and price so an order stays historically accurate
  // even if the seller later edits or deletes the listing.
  for (const item of cartItems) {
    const itemType = item.ticketTypeId
      ? "ticket"
      : item.fulfilment === "digital"
        ? "digital"
        : item.type === "food"
          ? "food"
          : item.type === "service"
            ? "service"
            : "product";

    statements.push({
      sql: `INSERT INTO order_items
              (id, order_id, item_type, listing_id, variant_id, ticket_type_id, event_id, title,
               variant_name, unit_price, quantity, total, currency, metadata, fulfilment_status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
      args: [
        newId("oitem"),
        orderId,
        itemType,
        item.listingId,
        item.variantId,
        item.ticketTypeId,
        item.eventId,
        item.title,
        item.variantName,
        item.currentPrice,
        item.quantity,
        item.currentPrice * item.quantity,
        item.currency,
        itemType === "digital" ? "pending_delivery" : "unfulfilled",
        timestamp,
      ],
    });
  }

  // Only this store's lines leave the basket. Anything the shopper added from
  // another shop stays behind, so the basket stays usable after each payment.
  for (const item of cartItems) {
    statements.push({
      sql: "DELETE FROM cart_items WHERE id = ?",
      args: [item.id],
    });
  }

  const remaining = view.items.length - cartItems.length;

  statements.push({
    sql:
      remaining > 0
        ? "UPDATE carts SET updated_at = ? WHERE id = ?"
        : "UPDATE carts SET status = 'converted', updated_at = ? WHERE id = ?",
    args: [timestamp, cart.id],
  });

  await batch(statements);

  const order = await queryOne<OrderRow>("SELECT * FROM orders WHERE id = ?", [orderId]);
  if (!order) return { ok: false, error: "The order could not be created." };

  await recordAnalyticsEvent({
    storeId,
    eventType: "checkout_start",
    userId: input.userId,
  });

  return { ok: true, order };
}

/**
 * Buy tickets — a ticket purchase, not a cart line.
 *
 * Tickets are deliberately *not* physical products, and the shopping cart is for
 * physical products: putting an admission in the same basket as a pair of shoes
 * means a ticket quantity can be edited, re-priced or abandoned like stock, when
 * what actually happens at the end of it is five admissions issued one by one.
 * So a ticket purchase is its own flow straight to a paid order, and this is it.
 *
 * Nothing here trusts the browser. Each line is re-read from the database and
 * must belong to *this* event, be on sale, be inside its sales window and have
 * the capacity left for it; the price and the total are the database's. One
 * order is created per event, paid once, and fulfilment issues one ticket row
 * per admission afterwards, exactly as it always has.
 */
export type TicketPurchaseLine = { ticketTypeId: string; quantity: number };

export async function createTicketOrder(input: {
  eventId: string;
  userId: string | null;
  customer: CheckoutCustomer;
  lines: TicketPurchaseLine[];
}): Promise<CreateOrderResult> {
  // An event has no currency of its own — the shop's currency is the money
  // everything in that shop is priced in, and it is read from the shop.
  const event = await queryOne<{
    id: string;
    store_id: string;
    title: string;
    status: string;
    currency: string | null;
    listing_id: string | null;
  }>(
    `SELECT e.id, e.store_id, e.title, e.status, e.listing_id,
            (SELECT currency FROM stores WHERE id = e.store_id) AS currency
       FROM events e WHERE e.id = ?`,
    [input.eventId],
  );

  if (!event) return { ok: false, error: "That event no longer exists." };
  if (event.status !== "published") {
    return { ok: false, error: "Tickets for this event are not on sale." };
  }

  // One line per ticket type, however many times the request named it.
  const wanted = new Map<string, number>();
  for (const line of input.lines) {
    const quantity = Math.floor(Number(line.quantity) || 0);
    if (!line.ticketTypeId || quantity <= 0) continue;
    wanted.set(line.ticketTypeId, (wanted.get(line.ticketTypeId) ?? 0) + quantity);
  }

  if (wanted.size === 0) return { ok: false, error: "Choose at least one ticket." };

  const timestamp = nowIso();
  const lines: Array<{
    ticketTypeId: string;
    name: string;
    price: number;
    quantity: number;
  }> = [];

  let subtotal = 0;

  for (const [ticketTypeId, quantity] of wanted) {
    const type = await queryOne<{
      id: string;
      name: string;
      price: number;
      currency: string;
      is_active: number;
      quantity_total: number;
      quantity_sold: number;
      max_per_order: number;
      sales_start: string | null;
      sales_end: string | null;
    }>("SELECT * FROM ticket_types WHERE id = ? AND event_id = ?", [ticketTypeId, event.id]);

    if (!type) return { ok: false, error: "One of those ticket types is not for this event." };
    if (!bool(type.is_active)) return { ok: false, error: `“${type.name}” is not on sale.` };

    if (type.sales_start && timestamp < type.sales_start) {
      return { ok: false, error: `“${type.name}” is not on sale yet.` };
    }
    if (type.sales_end && timestamp > type.sales_end) {
      return { ok: false, error: `Sales for “${type.name}” have closed.` };
    }

    const perOrder = Math.max(1, Number(type.max_per_order) || MAX_LINE_QUANTITY);
    if (quantity > perOrder) {
      return {
        ok: false,
        error: `You can buy up to ${perOrder} “${type.name}” tickets in one order.`,
      };
    }

    const total_quantity = Number(type.quantity_total);
    if (total_quantity > 0) {
      const remaining = Math.max(0, total_quantity - Number(type.quantity_sold));
      if (remaining < quantity) {
        return {
          ok: false,
          error:
            remaining <= 0
              ? `“${type.name}” is sold out.`
              : `Only ${remaining} “${type.name}” ticket(s) left.`,
        };
      }
    }

    lines.push({ ticketTypeId: type.id, name: type.name, price: Number(type.price), quantity });
    subtotal += Number(type.price) * quantity;
  }

  const currency = event.currency ?? "NGN";
  if (!["NGN", "USD", "GHS", "ZAR", "KES"].includes(currency)) {
    return { ok: false, error: `Payments in ${currency} are not supported by Paystack.` };
  }

  const email = input.customer.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ok: false, error: "Enter a valid email address." };
  }

  const store = await queryOne<StoreRow>("SELECT * FROM stores WHERE id = ?", [event.store_id]);
  if (!store) return { ok: false, error: "This event is no longer available." };

  const settings = await getStoreSettings(event.store_id);
  const existingCustomer = await queryOne<{ id: string }>(
    "SELECT id FROM customers WHERE store_id = ? AND email = ?",
    [event.store_id, email],
  );

  const customerId = existingCustomer?.id ?? newId("cus");
  const orderId = newId("ord");
  const orderNumber = newOrderNumber(settings.order_prefix);
  const accessToken = randomCode(40);
  const receiptCode = `RC-${randomHex(8)}`;

  const statements: BatchStatement[] = [];

  if (!existingCustomer) {
    statements.push({
      sql: `INSERT INTO customers (id, store_id, user_id, email, name, phone, orders_count, total_spent, last_order_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 0, 0, NULL, ?, ?)`,
      args: [
        customerId,
        event.store_id,
        input.userId,
        email,
        input.customer.name?.trim() || null,
        input.customer.phone?.trim() || null,
        timestamp,
        timestamp,
      ],
    });
  } else {
    statements.push({
      sql: `UPDATE customers SET name = COALESCE(?, name), phone = COALESCE(?, phone),
              user_id = COALESCE(user_id, ?), updated_at = ? WHERE id = ?`,
      args: [
        input.customer.name?.trim() || null,
        input.customer.phone?.trim() || null,
        input.userId,
        timestamp,
        customerId,
      ],
    });
  }

  statements.push({
    sql: `INSERT INTO orders
            (id, order_number, store_id, customer_id, user_id, email, customer_name, phone,
             currency, subtotal, discount_total, shipping_total, tax_total, total, status,
             payment_status, discount_code, customer_note, shipping_address, access_token, source,
             fulfilment_method, estimated_delivery, receipt_code, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, 'pending', 'unpaid', NULL, ?, NULL, ?, 'tickets',
                  'none', NULL, ?, ?, ?)`,
    args: [
      orderId,
      orderNumber,
      event.store_id,
      customerId,
      input.userId,
      email,
      input.customer.name?.trim() || null,
      input.customer.phone?.trim() || null,
      currency,
      subtotal,
      subtotal,
      input.customer.note?.trim() || null,
      accessToken,
      receiptCode,
      timestamp,
      timestamp,
    ],
  });

  for (const line of lines) {
    statements.push({
      sql: `INSERT INTO order_items
              (id, order_id, item_type, listing_id, variant_id, ticket_type_id, event_id, title,
               variant_name, unit_price, quantity, total, currency, metadata, fulfilment_status, created_at)
            VALUES (?, ?, 'ticket', ?, NULL, ?, ?, ?, NULL, ?, ?, ?, ?, NULL, 'unfulfilled', ?)`,
      args: [
        newId("oitem"),
        orderId,
        event.listing_id,
        line.ticketTypeId,
        event.id,
        `${event.title} · ${line.name}`,
        line.price,
        line.quantity,
        line.price * line.quantity,
        currency,
        timestamp,
      ],
    });
  }

  await batch(statements);

  const order = await queryOne<OrderRow>("SELECT * FROM orders WHERE id = ?", [orderId]);
  if (!order) return { ok: false, error: "The order could not be created." };

  await recordAnalyticsEvent({
    storeId: event.store_id,
    eventType: "checkout_start",
    userId: input.userId,
    metadata: { eventId: event.id, kind: "ticket" },
  });

  return { ok: true, order };
}

export async function getOrderRow(orderId: string): Promise<OrderRow | null> {
  return queryOne<OrderRow>("SELECT * FROM orders WHERE id = ?", [orderId]);
}

export async function getOrderWithItems(orderId: string): Promise<OrderWithItems | null> {
  const order = await queryOne<OrderRow & { store_name: string; store_slug: string; store_logo_url: string | null }>(
    `SELECT o.*, s.name AS store_name, s.slug AS store_slug, s.logo_url AS store_logo_url
     FROM orders o JOIN stores s ON s.id = o.store_id
     WHERE o.id = ?`,
    [orderId],
  );
  if (!order) return null;

  const items = await listOrderItems(orderId);

  return {
    ...order,
    storeName: order.store_name,
    storeSlug: order.store_slug,
    storeLogoUrl: order.store_logo_url,
    items,
  };
}

export async function listOrderItems(orderId: string): Promise<OrderItemRow[]> {
  return query<OrderItemRow>(
    "SELECT * FROM order_items WHERE order_id = ? ORDER BY created_at ASC",
    [orderId],
  );
}

export async function getOrderByAccessToken(token: string): Promise<OrderRow | null> {
  if (!token) return null;
  return queryOne<OrderRow>("SELECT * FROM orders WHERE access_token = ?", [token]);
}

// --- Receipt verification ---------------------------------------------------

/**
 * What a seller sees when a customer's receipt QR is scanned.
 *
 * Deliberately narrow: enough for “is this a real order, and is this the person
 * who placed it?” — and nothing more. No address, no phone, no full email: the
 * contact is masked, because a scanner is not a data-harvesting tool.
 */
export type ReceiptVerification = {
  ok: boolean;
  reason?: "empty" | "not_found";
  message: string;
  orderNumber: string | null;
  placedAt: string | null;
  paidAt: string | null;
  buyerName: string | null;
  buyerContact: string | null;
  items: Array<{ title: string; quantity: number; total: number; currency: string }>;
  total: number;
  currency: string;
  paymentStatus: string;
  orderStatus: string;
  fulfilmentMethod: string;
  /** The shipment's state, when the order carries something physical. */
  shipmentStatus: string | null;
  /** Set once the order was delivered or collected — the “not again” stamp. */
  completedAt: string | null;
  /** Can the seller hand the goods over right now? */
  canCompletePickup: boolean;
  orderId: string | null;
  shipmentId: string | null;
};

function maskContact(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "•••";
  return `${local.slice(0, 1)}•••@${domain}`;
}

/**
 * Resolve a receipt code for the store that owns the order.
 *
 * The store scope is the permission: a code scanned through another seller's
 * workspace resolves to nothing. Everything shown is re-read from the order —
 * the QR is only a lookup key.
 */
export async function verifyReceiptCode(
  code: string,
  storeId: string,
): Promise<ReceiptVerification> {
  const empty: ReceiptVerification = {
    ok: false,
    reason: "empty",
    message: "Enter or scan a receipt code.",
    orderNumber: null,
    placedAt: null,
    paidAt: null,
    buyerName: null,
    buyerContact: null,
    items: [],
    total: 0,
    currency: "NGN",
    paymentStatus: "",
    orderStatus: "",
    fulfilmentMethod: "",
    shipmentStatus: null,
    completedAt: null,
    canCompletePickup: false,
    orderId: null,
    shipmentId: null,
  };

  const normalised = code.trim().toUpperCase();
  if (!normalised) return empty;

  const order = await queryOne<OrderRow>(
    "SELECT * FROM orders WHERE UPPER(receipt_code) = ? AND store_id = ?",
    [normalised, storeId],
  );

  if (!order) {
    return {
      ...empty,
      reason: "not_found",
      message: "No order in your store matches that receipt code.",
    };
  }

  const [items, shipment] = await Promise.all([
    listOrderItems(order.id),
    getShipmentForOrder(order.id),
  ]);

  const completedAt = shipment?.delivered_at ?? order.fulfilled_at;
  const canCompletePickup =
    order.payment_status === "paid" &&
    shipment?.method === "pickup" &&
    shipment.status !== "picked_up" &&
    shipment.status !== "cancelled";

  return {
    ok: true,
    message:
      order.payment_status === "paid"
        ? "Legitimate paid order in your store."
        : "This order exists but has not been paid.",
    orderNumber: order.order_number,
    placedAt: order.created_at,
    paidAt: order.paid_at,
    buyerName: order.customer_name,
    buyerContact: maskContact(order.email),
    items: items.map((item) => ({
      title: item.title,
      quantity: item.quantity,
      total: item.total,
      currency: item.currency,
    })),
    total: order.total,
    currency: order.currency,
    paymentStatus: order.payment_status,
    orderStatus: order.status,
    fulfilmentMethod: order.fulfilment_method,
    shipmentStatus: shipment?.status ?? null,
    completedAt,
    canCompletePickup,
    orderId: order.id,
    shipmentId: shipment?.id ?? null,
  };
}

export type OrderQuery = {
  storeId?: string;
  status?: string;
  paymentStatus?: string;
  search?: string;
  email?: string;
  userId?: string;
  limit?: number;
  offset?: number;
};

function buildOrderWhere(input: OrderQuery): { clause: string; args: Array<string | number> } {
  const conditions: string[] = [];
  const args: Array<string | number> = [];

  if (input.storeId) {
    conditions.push("o.store_id = ?");
    args.push(input.storeId);
  }
  if (input.status && input.status !== "all") {
    conditions.push("o.status = ?");
    args.push(input.status);
  }
  if (input.paymentStatus && input.paymentStatus !== "all") {
    conditions.push("o.payment_status = ?");
    args.push(input.paymentStatus);
  }
  if (input.email) {
    conditions.push("o.email = ?");
    args.push(input.email.toLowerCase());
  }
  if (input.userId) {
    conditions.push("o.user_id = ?");
    args.push(input.userId);
  }
  if (input.search) {
    const term = `%${input.search.trim().toLowerCase()}%`;
    conditions.push(
      "(LOWER(o.order_number) LIKE ? OR LOWER(o.email) LIKE ? OR LOWER(COALESCE(o.customer_name, '')) LIKE ?)",
    );
    args.push(term, term, term);
  }

  return {
    clause: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "",
    args,
  };
}

export async function listOrders(
  input: OrderQuery = {},
): Promise<Array<OrderRow & { store_name: string; item_count: number }>> {
  const { clause, args } = buildOrderWhere(input);
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 100);
  const offset = Math.max(input.offset ?? 0, 0);

  return query(
    `SELECT o.*, s.name AS store_name,
            (SELECT COALESCE(SUM(quantity), 0) FROM order_items oi WHERE oi.order_id = o.id) AS item_count
     FROM orders o
     JOIN stores s ON s.id = o.store_id
     ${clause}
     ORDER BY o.created_at DESC
     LIMIT ? OFFSET ?`,
    [...args, limit, offset],
  );
}

export async function countOrders(input: OrderQuery = {}): Promise<number> {
  const { clause, args } = buildOrderWhere(input);
  const row = await queryOne<{ total: number }>(
    `SELECT COUNT(*) AS total FROM orders o ${clause}`,
    args,
  );
  return Number(row?.total ?? 0);
}

export async function setOrderStatus(input: {
  orderId: string;
  storeId: string;
  status: OrderRow["status"];
}): Promise<{ ok: boolean; error?: string }> {
  const order = await queryOne<OrderRow>(
    "SELECT * FROM orders WHERE id = ? AND store_id = ?",
    [input.orderId, input.storeId],
  );
  if (!order) return { ok: false, error: "Order not found." };

  if (input.status === "cancelled" && order.payment_status === "paid") {
    return {
      ok: false,
      error: "This order is already paid. Refund it instead. The money has to go back first.",
    };
  }

  const timestamp = nowIso();
  await execute(
    `UPDATE orders SET status = ?, fulfilled_at = ?, cancelled_at = ?, updated_at = ?
     WHERE id = ? AND store_id = ?`,
    [
      input.status,
      input.status === "fulfilled" ? timestamp : order.fulfilled_at,
      input.status === "cancelled" ? timestamp : order.cancelled_at,
      timestamp,
      input.orderId,
      input.storeId,
    ],
  );

  if (input.status === "fulfilled") {
    await execute(
      "UPDATE order_items SET fulfilment_status = 'fulfilled' WHERE order_id = ? AND item_type != 'digital'",
      [input.orderId],
    );
    // One source of truth: a fulfilled order's shipment is closed too, so the
    // buyer's tracking view never disagrees with the seller's order state.
    await closeShipmentForOrder(input.orderId);
  }

  if (input.status === "cancelled") {
    await execute(
      "UPDATE order_items SET fulfilment_status = 'cancelled' WHERE order_id = ?",
      [input.orderId],
    );
    // Tickets follow their order — an unpaid order's tickets never existed, so
    // this is a no-op there, and a paid one is refused above.
    await voidTicketsForOrder(input.orderId, "cancelled");
    await cancelShipment(input.orderId, "Order cancelled");
  }

  // A meaningful state change the buyer is waiting on — exactly one email per
  // order whichever code path reaches it (the shipment tracker closes its
  // orders too, and the delivery record's dedupe key keeps them single).
  if (input.status === "fulfilled") {
    await sendOrderCompletedEmail({
      order,
      method: fulfilmentMethodLabel(order.fulfilment_method),
      at: timestamp,
    });
  } else if (input.status === "cancelled") {
    await sendOrderCancelledEmail({ order });
  }

  return { ok: true };
}

/** How the order reaches its buyer, as the mail speaks of it. */
function fulfilmentMethodLabel(
  method: OrderRow["fulfilment_method"] | null | undefined,
): "delivery" | "pickup" | "digital" | "none" {
  return method === "pickup" || method === "digital" || method === "delivery" ? method : "none";
}

// --- Payments ---------------------------------------------------------------

export async function recordPaymentIntent(input: {
  orderId: string;
  storeId: string;
  reference: string;
  amount: number;
  currency: string;
  authorizationUrl: string;
}): Promise<string> {
  const id = newId("pay");
  const timestamp = nowIso();

  await execute(
    `INSERT INTO payments
       (id, order_id, store_id, provider, reference, authorization_url, amount, currency, status, created_at, updated_at)
     VALUES (?, ?, ?, 'paystack', ?, ?, ?, ?, 'pending', ?, ?)`,
    [
      id,
      input.orderId,
      input.storeId,
      input.reference,
      input.authorizationUrl,
      input.amount,
      input.currency,
      timestamp,
      timestamp,
    ],
  );

  await execute("UPDATE orders SET payment_status = 'pending', updated_at = ? WHERE id = ?", [
    timestamp,
    input.orderId,
  ]);

  return id;
}

export async function getPaymentByReference(reference: string): Promise<PaymentRow | null> {
  return queryOne<PaymentRow>("SELECT * FROM payments WHERE reference = ?", [reference]);
}

export async function listPaymentsForOrder(orderId: string): Promise<PaymentRow[]> {
  return query<PaymentRow>(
    "SELECT * FROM payments WHERE order_id = ? ORDER BY created_at DESC",
    [orderId],
  );
}

/**
 * Verify a payment with Paystack and fulfil the order exactly once.
 *
 * Safe to call from both the browser callback and the webhook: whoever gets
 * there first claims the payment row, everyone else becomes a no-op.
 */
export async function verifyAndFulfilPayment(reference: string): Promise<{
  ok: boolean;
  status: "success" | "failed" | "pending" | "already" | "unknown";
  orderId?: string;
  error?: string;
}> {
  const payment = await getPaymentByReference(reference);
  if (!payment) return { ok: false, status: "unknown", error: "Unknown payment reference." };

  if (payment.status === "success") {
    return { ok: true, status: "already", orderId: payment.order_id };
  }

  const verification = await verifyTransaction(reference);
  if (!verification.ok) {
    return { ok: false, status: "pending", error: verification.error };
  }

  const result = verification.data;

  if (result.status !== "success") {
    await execute(
      `UPDATE payments SET status = 'failed', failure_reason = ?, raw_payload = ?, updated_at = ?
       WHERE id = ?`,
      [result.gatewayResponse ?? result.status, JSON.stringify(result.raw), nowIso(), payment.id],
    );
    await execute("UPDATE orders SET payment_status = 'failed', updated_at = ? WHERE id = ?", [
      nowIso(),
      payment.order_id,
    ]);
    // The buyer hears it failed — once per payment, however many verification
    // paths (webhook, return page, retry) see the same failure.
    await notifyPaymentFailed(payment.id);
    return { ok: false, status: "failed", orderId: payment.order_id, error: "Payment was not successful." };
  }

  // The verified amount must match what we asked for — a mismatch means someone
  // tampered with the amount, so refuse to fulfil.
  if (result.amountMinor !== Number(payment.amount)) {
    await execute(
      `UPDATE payments SET status = 'failed', failure_reason = ?, raw_payload = ?, updated_at = ?
       WHERE id = ?`,
      [
        `Amount mismatch: expected ${payment.amount}, received ${result.amountMinor}`,
        JSON.stringify(result.raw),
        nowIso(),
        payment.id,
      ],
    );
    return { ok: false, status: "failed", orderId: payment.order_id, error: "Payment amount did not match the order." };
  }

  // Atomic claim — only one caller can move the payment out of a non-success state.
  const claim = await execute(
    `UPDATE payments SET status = 'success', paid_at = ?, channel = ?, provider_reference = ?,
       raw_payload = ?, updated_at = ?
     WHERE id = ? AND status != 'success'`,
    [
      result.paidAt ?? nowIso(),
      result.channel,
      result.providerReference,
      JSON.stringify(result.raw),
      nowIso(),
      payment.id,
    ],
  );

  if (claim.rowsAffected !== 1) {
    return { ok: true, status: "already", orderId: payment.order_id };
  }

  await fulfilOrder(payment.order_id, payment.id);

  // Mail comes after fulfilment, never before it: by the time the buyer's inbox
  // says "paid", the order, its tickets and the ledger already say so too. A
  // mail failure is recorded against the order and does not undo any of that.
  await deliverOrderMail(payment.order_id);
  await deliverSellerMail(payment.order_id);

  return { ok: true, status: "success", orderId: payment.order_id };
}

/**
 * The seller's new-order notice for a verified payment.
 *
 * Exactly once per order (the payment claim upstream is the gate), and only
 * for marketplace orders — a chat payment request's seller gets the
 * payment-received notice for that request instead, never both. Never throws:
 * mail is not allowed to taint a settled payment.
 */
export async function deliverSellerMail(orderId: string): Promise<void> {
  try {
    const order = await queryOne<OrderRow>("SELECT * FROM orders WHERE id = ?", [orderId]);
    if (!order || order.source === "chat") return;

    const owner = await storeOwnerContact(order.store_id);
    if (!owner) return;

    const items = await query<OrderItemRow>(
      "SELECT * FROM order_items WHERE order_id = ? ORDER BY created_at ASC",
      [orderId],
    );

    const itemSummary = items
      .map((item) => `${item.quantity} × ${item.title}${item.variant_name ? ` (${item.variant_name})` : ""}`)
      .join(", ");
    const fulfilment =
      order.fulfilment_method === "pickup"
        ? "Pickup"
        : order.fulfilment_method === "digital"
          ? "Digital delivery"
          : order.fulfilment_method === "delivery"
            ? `Delivery${order.estimated_delivery ? ` · ${order.estimated_delivery}` : ""}`
            : "No delivery needed";

    await sendSellerOrderEmail({
      sellerEmail: owner.email,
      sellerName: owner.name,
      orderId: order.id,
      storeId: order.store_id,
      orderNumber: order.order_number,
      customerName: order.customer_name,
      itemSummary: itemSummary || "—",
      amountMinor: Number(order.total),
      currency: order.currency,
      fulfilment,
      isFood: items.length > 0 && items.every((item) => item.item_type === "food"),
    });
  } catch (error) {
    console.error(`[mail] order ${orderId}: seller notice failed`, error);
  }
}

/**
 * Tell the buyer a payment failed. Fire-and-forget and exactly once per
 * payment: the delivery record's dedupe key absorbs every repeated trigger.
 */
export async function notifyPaymentFailed(paymentId: string): Promise<void> {
  try {
    const payment = await queryOne<PaymentRow>("SELECT * FROM payments WHERE id = ?", [paymentId]);
    if (!payment) return;
    const order = await queryOne<OrderRow>("SELECT * FROM orders WHERE id = ?", [payment.order_id]);
    if (!order) return;

    // The conversation is where a chat payment is retried; an order page is
    // where a marketplace one is.
    const request = await queryOne<{ conversation_id: string }>(
      "SELECT conversation_id FROM payment_requests WHERE order_id = ? ORDER BY created_at ASC LIMIT 1",
      [order.id],
    );
    const ctaUrl = request
      ? `${platformConfig.appUrl}/messages/${request.conversation_id}`
      : `${platformConfig.appUrl}/orders/${order.access_token}`;

    await sendPaymentFailedEmail({
      to: order.email,
      name: order.customer_name,
      orderNumber: order.order_number,
      amountMinor: Number(payment.amount),
      currency: payment.currency,
      reason: payment.failure_reason,
      ctaUrl,
      paymentId: payment.id,
      orderId: order.id,
      storeId: order.store_id,
    });
  } catch (error) {
    console.error(`[mail] payment ${paymentId}: failure notice failed`, error);
  }
}

/**
 * Sends the buyer their invoice and, where the order has them, their tickets.
 *
 * Never throws: an order that has been paid must stay paid even if the mail
 * service is down, so this never fails the payment. Each attempt is recorded in
 * `email_deliveries`, which is where the seller sees the real outcome — and
 * what the order page's "send again" reads.
 */
async function deliverOrderMail(orderId: string): Promise<void> {
  try {
    const outcome = await sendOrderEmails(orderId);

    const note = outcome.invoice.sent
      ? outcome.tickets?.sent
        ? "Invoice and tickets emailed"
        : outcome.tickets
          ? `Invoice emailed; tickets failed: ${outcome.tickets.error ?? "unknown error"}`
          : "Invoice emailed"
      : `Invoice not sent: ${outcome.invoice.error ?? "unknown error"}`;

    console.info(`[mail] order ${orderId}: ${note}`);
  } catch (error) {
    console.error(`[mail] order ${orderId}: delivery failed`, error);
  }
}

/**
 * Post-payment fulfilment: stock, tickets, downloads, customer totals and the
 * money ledger. Runs only after a payment has been claimed.
 */
async function fulfilOrder(orderId: string, paymentId: string): Promise<void> {
  const order = await queryOne<OrderRow>("SELECT * FROM orders WHERE id = ?", [orderId]);
  if (!order) return;

  const items = await listOrderItems(orderId);
  const timestamp = nowIso();
  const statements: BatchStatement[] = [];

  statements.push({
    sql: `UPDATE orders SET status = 'paid', payment_status = 'paid', paid_at = ?, updated_at = ?
          WHERE id = ?`,
    args: [timestamp, timestamp, orderId],
  });

  const ticketCounts = new Map<string, number>();

  for (const item of items) {
    if (item.item_type === "ticket" && item.ticket_type_id && item.event_id) {
      // One ticket row per attendee, each with its own scannable code.
      for (let index = 0; index < item.quantity; index += 1) {
        statements.push({
          sql: `INSERT INTO tickets
                  (id, order_id, order_item_id, event_id, ticket_type_id, store_id, code,
                   holder_name, holder_email, status, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'valid', ?)`,
          args: [
            newId("tix"),
            orderId,
            item.id,
            item.event_id,
            item.ticket_type_id,
            order.store_id,
            `LS-${randomCode(8)}`,
            order.customer_name,
            order.email,
            timestamp,
          ],
        });
      }
      ticketCounts.set(
        item.ticket_type_id,
        (ticketCounts.get(item.ticket_type_id) ?? 0) + item.quantity,
      );
      continue;
    }

    if (item.item_type === "digital" && item.listing_id) {
      const assets = await query<ListingAssetRow>(
        "SELECT id FROM digital_assets WHERE listing_id = ?",
        [item.listing_id],
      );

      for (const asset of assets) {
        statements.push({
          sql: `INSERT INTO downloads
                  (id, order_id, order_item_id, listing_id, asset_id, token, email,
                   download_count, max_downloads, expires_at, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, 0, 10, NULL, ?)`,
          args: [
            newId("dl"),
            orderId,
            item.id,
            item.listing_id,
            asset.id,
            randomCode(40),
            order.email,
            timestamp,
          ],
        });
      }

      statements.push({
        sql: "UPDATE order_items SET fulfilment_status = 'fulfilled' WHERE id = ?",
        args: [item.id],
      });
      continue;
    }

    // Physical / food / service lines draw down stock and leave an audit trail.
    if (item.listing_id) {
      const listing = await queryOne<ListingRow>("SELECT * FROM listings WHERE id = ?", [
        item.listing_id,
      ]);
      if (listing && bool(listing.track_inventory)) {
        if (item.variant_id) {
          // Variant stock alongside its own movement row, so the audit trail
          // records the exact resulting quantity for this option.
          const variant = await queryOne<{ stock: number }>(
            "SELECT stock FROM listing_variants WHERE id = ?",
            [item.variant_id],
          );
          const variantStockAfter = Math.max(0, Number(variant?.stock ?? 0) - item.quantity);

          statements.push({
            sql: "UPDATE listing_variants SET stock = ? WHERE id = ?",
            args: [variantStockAfter, item.variant_id],
          });
          statements.push({
            sql: `INSERT INTO inventory_movements
                    (id, store_id, listing_id, variant_id, delta, reason, note, reference, stock_after, created_at)
                  VALUES (?, ?, ?, ?, ?, 'sale', ?, ?, ?, ?)`,
            args: [
              newId("inv"),
              order.store_id,
              item.listing_id,
              item.variant_id,
              -item.quantity,
              `Order ${order.order_number}`,
              order.order_number,
              variantStockAfter,
              timestamp,
            ],
          });

          // The listing's headline stock mirrors the sum of its variants.
          statements.push({
            sql: `UPDATE listings SET stock =
                    (SELECT COALESCE(SUM(stock), 0) FROM listing_variants WHERE listing_id = ?),
                    updated_at = ?
                  WHERE id = ?`,
            args: [item.listing_id, timestamp, item.listing_id],
          });
        } else {
          statements.push({
            sql: "UPDATE listings SET stock = MAX(0, stock - ?), updated_at = ? WHERE id = ?",
            args: [item.quantity, timestamp, item.listing_id],
          });
          statements.push({
            sql: `INSERT INTO inventory_movements
                    (id, store_id, listing_id, variant_id, delta, reason, note, reference, stock_after, created_at)
                  VALUES (?, ?, ?, NULL, ?, 'sale', ?, ?, MAX(0, ? - ?), ?)`,
            args: [
              newId("inv"),
              order.store_id,
              item.listing_id,
              -item.quantity,
              `Order ${order.order_number}`,
              order.order_number,
              Number(listing.stock),
              item.quantity,
              timestamp,
            ],
          });
        }
      }
    }
  }

  // Ticket inventory is incremented with a guard so it can never oversell.
  for (const [ticketTypeId, quantity] of ticketCounts) {
    statements.push({
      sql: `UPDATE ticket_types
            SET quantity_sold = quantity_sold + ?
            WHERE id = ? AND (quantity_total = 0 OR quantity_sold + ? <= quantity_total)`,
      args: [quantity, ticketTypeId, quantity],
    });
  }

  // Ledger: a sale credit and the platform fee debit, keeping a running balance.
  const balanceRow = await queryOne<{ balance: number }>(
    `SELECT COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount ELSE -amount END), 0) AS balance
     FROM transactions WHERE store_id = ?`,
    [order.store_id],
  );
  const currentBalance = Number(balanceRow?.balance ?? 0);
  const fee = percentOf(Number(order.total), platformConfig.feePercent);
  const saleNet = Number(order.total) - fee;
  const balanceAfterSale = currentBalance + saleNet;

  statements.push({
    sql: `INSERT INTO transactions
            (id, store_id, order_id, payment_id, payout_id, type, direction, amount, currency,
             balance_after, description, reference, created_at)
          VALUES (?, ?, ?, ?, NULL, 'sale', 'credit', ?, ?, ?, ?, ?, ?)`,
    args: [
      newId("txn"),
      order.store_id,
      orderId,
      paymentId,
      saleNet,
      order.currency,
      balanceAfterSale,
      `Sale ${order.order_number}`,
      order.order_number,
      timestamp,
    ],
  });

  if (fee > 0) {
    statements.push({
      sql: `INSERT INTO transactions
              (id, store_id, order_id, payment_id, payout_id, type, direction, amount, currency,
               balance_after, description, reference, created_at)
            VALUES (?, ?, ?, ?, NULL, 'platform_fee', 'debit', ?, ?, ?, ?, ?, ?)`,
      args: [
        newId("txn"),
        order.store_id,
        orderId,
        paymentId,
        fee,
        order.currency,
        balanceAfterSale,
        `Platform fee (${platformConfig.feePercent}%) on ${order.order_number}`,
        order.order_number,
        timestamp,
      ],
    });
  }

  // Customer lifetime value, recomputed from paid orders only.
  if (order.customer_id) {
    statements.push({
      sql: `UPDATE customers
            SET orders_count = orders_count + 1,
                total_spent = total_spent + ?,
                last_order_at = ?,
                updated_at = ?
            WHERE id = ?`,
      args: [Number(order.total), timestamp, timestamp, order.customer_id],
    });
  }

  // Discount usage is counted at fulfilment, never at checkout.
  if (order.discount_code) {
    statements.push({
      sql: "UPDATE discounts SET used_count = used_count + 1, updated_at = ? WHERE store_id = ? AND UPPER(code) = ?",
      args: [timestamp, order.store_id, order.discount_code.toUpperCase()],
    });
  }

  await batch(statements);

  // The fulfilment record opens the moment the money lands, so the buyer's
  // tracking timeline starts from facts the platform recorded before the seller
  // touched anything. Only orders that carry something physical need one.
  if (order.fulfilment_method === "delivery" || order.fulfilment_method === "pickup") {
    try {
      const store = await queryOne<StoreRow>("SELECT * FROM stores WHERE id = ?", [
        order.store_id,
      ]);
      const settings = await getStoreSettings(order.store_id);
      const origin = [store?.address, store?.city].filter(Boolean).join(", ") || null;
      const destination =
        order.fulfilment_method === "pickup"
          ? settings.pickup_address || settings.pickup_location_name || origin
          : readableAddress(order.shipping_address) || origin;

      await openShipmentForOrder({
        order,
        method: order.fulfilment_method,
        estimate: order.estimated_delivery ?? deliveryEstimate(settings),
        origin,
        destination,
      });
    } catch (error) {
      // Tracking is a record of the sale, never a condition of it: a failure
      // here must not undo a paid order. It is logged loudly instead.
      console.error(`[shipment] order ${orderId}: fulfilment record could not open`, error);
    }
  }

  await recordAnalyticsEvent({
    storeId: order.store_id,
    eventType: "purchase",
    userId: order.user_id,
    metadata: { orderId, total: Number(order.total), currency: order.currency },
  });
}

/** The stored shipping address JSON, as one readable line where possible. */
function readableAddress(json: string | null): string | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as Record<string, string>;
    return [parsed.line1, parsed.city, parsed.state, parsed.country].filter(Boolean).join(", ") || null;
  } catch {
    return null;
  }
}

/**
 * Put back what a paid order took from stock, with an audit trail.
 *
 * Only ever called for orders that actually drew stock down (fulfilment ran),
 * which is why the cancellation of an *unpaid* order does not touch inventory.
 */
async function restoreStockForOrder(orderId: string, reason: "return" | "cancellation"): Promise<void> {
  const order = await queryOne<OrderRow>("SELECT * FROM orders WHERE id = ?", [orderId]);
  if (!order) return;

  const items = await listOrderItems(orderId);
  const timestamp = nowIso();
  const statements: BatchStatement[] = [];

  for (const item of items) {
    if (item.item_type === "ticket" || item.item_type === "digital" || !item.listing_id) continue;

    const listing = await queryOne<ListingRow>("SELECT * FROM listings WHERE id = ?", [
      item.listing_id,
    ]);
    if (!listing || !bool(listing.track_inventory)) continue;

    if (item.variant_id) {
      const variant = await queryOne<{ stock: number }>(
        "SELECT stock FROM listing_variants WHERE id = ?",
        [item.variant_id],
      );
      const variantStockAfter = Number(variant?.stock ?? 0) + item.quantity;

      statements.push({
        sql: "UPDATE listing_variants SET stock = ? WHERE id = ?",
        args: [variantStockAfter, item.variant_id],
      });
      statements.push({
        sql: `INSERT INTO inventory_movements
                (id, store_id, listing_id, variant_id, delta, reason, note, reference, stock_after, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          newId("inv"),
          order.store_id,
          item.listing_id,
          item.variant_id,
          item.quantity,
          reason,
          `Order ${order.order_number} ${reason === "return" ? "refunded" : "cancelled"}`,
          order.order_number,
          variantStockAfter,
          timestamp,
        ],
      });
      statements.push({
        sql: `UPDATE listings SET stock =
                (SELECT COALESCE(SUM(stock), 0) FROM listing_variants WHERE listing_id = ?),
                updated_at = ?
              WHERE id = ?`,
        args: [item.listing_id, timestamp, item.listing_id],
      });
    } else {
      statements.push({
        sql: "UPDATE listings SET stock = stock + ?, updated_at = ? WHERE id = ?",
        args: [item.quantity, timestamp, item.listing_id],
      });
      statements.push({
        sql: `INSERT INTO inventory_movements
                (id, store_id, listing_id, variant_id, delta, reason, note, reference, stock_after, created_at)
              VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)`,
        args: [
          newId("inv"),
          order.store_id,
          item.listing_id,
          item.quantity,
          reason,
          `Order ${order.order_number} ${reason === "return" ? "refunded" : "cancelled"}`,
          order.order_number,
          Number(listing.stock) + item.quantity,
          timestamp,
        ],
      });
    }
  }

  if (statements.length > 0) await batch(statements);
}

export type RefundResult = { ok: true; message: string } | { ok: false; error: string };

/**
 * Refund a paid order.
 *
 * The money goes back through Paystack first — the platform never claims a
 * refund it did not actually initiate. Only once Paystack accepts the refund is
 * the order marked refunded, its tickets voided, its shipment closed and its
 * stock returned. A Paystack failure changes nothing at all.
 */
export async function refundOrder(input: {
  orderId: string;
  storeId: string;
}): Promise<RefundResult> {
  const order = await queryOne<OrderRow>(
    "SELECT * FROM orders WHERE id = ? AND store_id = ?",
    [input.orderId, input.storeId],
  );
  if (!order) return { ok: false, error: "Order not found." };
  if (order.payment_status === "refunded") {
    return { ok: false, error: "This order has already been refunded." };
  }
  if (order.payment_status !== "paid") {
    return { ok: false, error: "This order has no verified payment to refund." };
  }

  const payments = await listPaymentsForOrder(order.id);
  const settled = payments.find((payment) => payment.status === "success");
  if (!settled) {
    return {
      ok: false,
      error: "No settled payment was recorded for this order, so there is nothing to refund here.",
    };
  }

  const refund = await refundTransaction(settled.reference, Number(settled.amount));
  if (!refund.ok) {
    return {
      ok: false,
      error: `The refund was not accepted by Paystack: ${refund.error} Nothing has changed on the order.`,
    };
  }

  const timestamp = nowIso();
  await execute(
    `UPDATE orders SET status = 'refunded', payment_status = 'refunded', updated_at = ? WHERE id = ?`,
    [timestamp, order.id],
  );
  await execute(
    `UPDATE payments SET status = 'reversed', failure_reason = ?, updated_at = ? WHERE id = ?`,
    [`Refunded${refund.status ? ` (${refund.status})` : ""}`, timestamp, settled.id],
  );
  await execute(
    "UPDATE order_items SET fulfilment_status = 'cancelled' WHERE order_id = ?",
    [order.id],
  );

  // Everything the sale created follows it back out.
  await voidTicketsForOrder(order.id, "refunded");
  await cancelShipment(order.id, "Order refunded");
  await restoreStockForOrder(order.id, "return");

  // Both sides hear the same facts — the money has actually gone back, so the
  // notices are honest. Never blocks the refund itself.
  await sendRefundEmails({ order });

  // The ledger: the seller's balance gives the net sale back. The platform fee
  // is not returned — that is the platform's stated policy, visible in the
  // description rather than hidden in the arithmetic.
  const balanceRow = await queryOne<{ balance: number }>(
    `SELECT COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount ELSE -amount END), 0) AS balance
     FROM transactions WHERE store_id = ?`,
    [order.store_id],
  );
  const currentBalance = Number(balanceRow?.balance ?? 0);
  const fee = percentOf(Number(order.total), platformConfig.feePercent);
  const saleNet = Number(order.total) - fee;

  await execute(
    `INSERT INTO transactions
            (id, store_id, order_id, payment_id, payout_id, type, direction, amount, currency,
             balance_after, description, reference, created_at)
          VALUES (?, ?, ?, ?, NULL, 'refund', 'debit', ?, ?, ?, ?, ?, ?)`,
    [
      newId("txn"),
      order.store_id,
      order.id,
      settled.id,
      saleNet,
      order.currency,
      currentBalance - saleNet,
      `Refund for ${order.order_number} (net of platform fee)`,
      order.order_number,
      timestamp,
    ],
  );

  return {
    ok: true,
    message: `Refund submitted to Paystack for ${order.order_number}. The order is closed and its tickets are void.`,
  };
}

type ListingAssetRow = Pick<DigitalAssetRow, "id">;

// --- Digital downloads ------------------------------------------------------

export async function listDownloadsForOrder(orderId: string): Promise<DownloadRow[]> {
  return query<DownloadRow>("SELECT * FROM downloads WHERE order_id = ? ORDER BY created_at ASC", [
    orderId,
  ]);
}

/**
 * Resolve a download grant by its token.
 *
 * The token is the only credential required, which is what makes it safe to
 * email a customer a link: it is long, random and scoped to one file.
 */
export async function getDownloadGrant(token: string): Promise<
  | (DownloadRow & {
      listing_title: string;
      item_title: string;
      store_name: string;
      order_number: string;
    })
  | null
> {
  if (!token || token.length < 20) return null;

  return queryOne(
    `SELECT d.*, l.title AS listing_title, oi.title AS item_title,
            s.name AS store_name, o.order_number
     FROM downloads d
     JOIN listings l ON l.id = d.listing_id
     JOIN order_items oi ON oi.id = d.order_item_id
     JOIN orders o ON o.id = d.order_id
     JOIN stores s ON s.id = o.store_id
     WHERE d.token = ?`,
    [token],
  );
}

/**
 * Record a download and return the asset key to stream.
 * Refuses once the grant has expired or hit its download limit.
 */
export async function consumeDownload(
  token: string,
): Promise<
  | { ok: true; key: string; fileName: string; contentType: string | null }
  | { ok: false; error: string }
> {
  const grant = await queryOne<DownloadRow & { storage_key: string; file_name: string; content_type: string | null }>(
    `SELECT d.*, a.storage_key, a.file_name, a.content_type
     FROM downloads d
     LEFT JOIN digital_assets a ON a.id = d.asset_id
     WHERE d.token = ?`,
    [token],
  );

  if (!grant) return { ok: false, error: "That download link is not valid." };

  if (grant.expires_at && new Date(grant.expires_at).getTime() < Date.now()) {
    return { ok: false, error: "That download link has expired." };
  }

  if (grant.download_count >= grant.max_downloads) {
    return { ok: false, error: "This download has reached its limit." };
  }

  if (!grant.storage_key) {
    return { ok: false, error: "The seller has not attached a file to this product yet." };
  }

  await execute(
    "UPDATE downloads SET download_count = download_count + 1, last_downloaded_at = ? WHERE id = ?",
    [nowIso(), grant.id],
  );

  return {
    ok: true,
    key: grant.storage_key,
    fileName: grant.file_name,
    contentType: grant.content_type,
  };
}

// --- Tickets ----------------------------------------------------------------

/**
 * The ticket columns every ticket view needs, with the event it opens folded
 * in — a ticket without its event is meaningless to a holder or to a door.
 */
const TICKET_SELECT = `SELECT t.*,
         e.title AS event_title, e.slug AS event_slug, e.starts_at AS event_starts_at,
         e.ends_at AS event_ends_at, e.venue_name AS event_venue, e.city AS event_city,
         e.is_online AS event_online,
         tt.name AS ticket_type_name,
         o.order_number AS order_number, o.currency AS order_currency
   FROM tickets t
   LEFT JOIN events e ON e.id = t.event_id
   LEFT JOIN ticket_types tt ON tt.id = t.ticket_type_id
   LEFT JOIN orders o ON o.id = t.order_id`;

export async function listTicketsForOrder(orderId: string): Promise<TicketWithEvent[]> {
  return query<TicketWithEvent>(`${TICKET_SELECT} WHERE t.order_id = ? ORDER BY t.created_at ASC`, [
    orderId,
  ]);
}

export async function listTicketsForEvent(eventId: string): Promise<TicketWithEvent[]> {
  return query<TicketWithEvent>(`${TICKET_SELECT} WHERE t.event_id = ? ORDER BY t.created_at DESC`, [
    eventId,
  ]);
}

/** The most recent arrivals at the door, for the check-in screen. */
export async function listRecentCheckIns(
  eventId: string,
  limit = 8,
): Promise<TicketWithEvent[]> {
  return query<TicketWithEvent>(
    `${TICKET_SELECT} WHERE t.event_id = ? AND t.status = 'used'
     ORDER BY t.checked_in_at DESC LIMIT ?`,
    [eventId, limit],
  );
}

export type TicketCheckInResult = {
  ok: boolean;
  /**
   * Why a scan failed. `not_found` and `wrong_event` must never reveal more
   * than they have to — a door scanner is not a lookup service for other
   * people's tickets.
   */
  reason?:
    | "not_found"
    | "wrong_event"
    | "already_used"
    | "cancelled"
    | "refunded"
    | "expired"
    | "invalid";
  ticket?: TicketWithEvent;
  error?: string;
};

/**
 * Verify and redeem a ticket at the door.
 *
 * This is the only path that can mark a ticket as used, and every check that
 * matters happens here rather than in the browser:
 *
 * 1. the code must exist **and** belong to the store asking (`storeId`);
 * 2. when the caller names an event, the ticket must belong to that event;
 * 3. the ticket must still be `valid` — a used, cancelled, refunded, expired
 *    or void ticket fails, each with its own honest explanation;
 * 4. the redemption itself is a conditional `UPDATE`, so two scanners racing on
 *    the same code cannot both succeed: the loser's update matches no row.
 *
 * The state machine is the database's, not the browser's: `valid → used`
 * happens exactly once, here.
 */
export async function checkInTicket(input: {
  code: string;
  storeId: string;
  eventId?: string | null;
}): Promise<TicketCheckInResult> {
  const code = input.code.trim().toUpperCase();
  if (!code) return { ok: false, error: "Enter a ticket code." };

  const ticket = await queryOne<TicketWithEvent>(
    `${TICKET_SELECT} WHERE t.code = ? AND t.store_id = ?`,
    [code, input.storeId],
  );

  if (!ticket) return { ok: false, reason: "not_found", error: "No ticket matches that code." };

  if (input.eventId && ticket.event_id !== input.eventId) {
    return {
      ok: false,
      reason: "wrong_event",
      ticket,
      error: `That ticket is for ${ticket.event_title ?? "another event"}, not this one.`,
    };
  }

  if (ticket.status === "used") {
    return {
      ok: false,
      reason: "already_used",
      ticket,
      error: ticket.checked_in_at
        ? `This ticket was already used. Admitted ${formatDateTimeForDoor(ticket.checked_in_at)}.`
        : "This ticket was already used.",
    };
  }

  if (ticket.status === "cancelled") {
    return {
      ok: false,
      reason: "cancelled",
      ticket,
      error: "This ticket was cancelled and cannot be admitted.",
    };
  }

  if (ticket.status === "refunded") {
    return {
      ok: false,
      reason: "refunded",
      ticket,
      error: "This ticket was refunded and cannot be admitted.",
    };
  }

  if (ticket.status === "expired") {
    return {
      ok: false,
      reason: "expired",
      ticket,
      error: "This ticket has expired.",
    };
  }

  if (ticket.status !== "valid") {
    return {
      ok: false,
      reason: "invalid",
      ticket,
      error: "This ticket is not valid for entry.",
    };
  }

  // A ticket for a finished event is expired, and the database says so — the
  // state is written only here, at the door, never guessed in advance.
  const eventEnd = ticket.event_ends_at ?? ticket.event_starts_at;
  if (eventEnd && nowIso() > eventEnd) {
    await execute("UPDATE tickets SET status = 'expired' WHERE id = ? AND status = 'valid'", [
      ticket.id,
    ]);
    return {
      ok: false,
      reason: "expired",
      ticket: { ...ticket, status: "expired" },
      error: "This event has ended, so the ticket is no longer valid for entry.",
    };
  }

  const usedAt = nowIso();
  const redeemed = await execute(
    `UPDATE tickets SET status = 'used', checked_in_at = ?
     WHERE id = ? AND status = 'valid'`,
    [usedAt, ticket.id],
  );

  if (redeemed.rowsAffected !== 1) {
    // Another scanner won the race for the same single admission.
    return {
      ok: false,
      reason: "already_used",
      ticket,
      error: "This ticket was just used by another device.",
    };
  }

  return {
    ok: true,
    ticket: { ...ticket, status: "used", checked_in_at: usedAt },
  };
}

/** Timestamps at the door are read at a glance, not parsed. */
function formatDateTimeForDoor(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

/**
 * Void every ticket on an order, in one state.
 *
 * Called when an order is cancelled (`cancelled`) or refunded (`refunded`): a
 * ticket follows its order, so a ticket whose purchase no longer stands can
 * never be admitted. Tickets already used at the door keep their state — the
 * person was let in, and history does not un-happen.
 */
export async function voidTicketsForOrder(
  orderId: string,
  status: "cancelled" | "refunded",
): Promise<void> {
  await execute(
    `UPDATE tickets SET status = ? WHERE order_id = ? AND status IN ('valid', 'expired')`,
    [status, orderId],
  );
}
