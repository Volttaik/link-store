/**
 * Chat payment requests — the negotiated amount, agreed in a conversation.
 *
 * Rentals are settled in chat. So are custom food orders, negotiated prices and
 * anything else two people agree on before money moves. This is the record of
 * that agreement and the way it is paid: the seller sends a payment request into
 * the thread, the buyer pays it from the payment card, and Paystack verifies it
 * server-side exactly like every other payment on the platform.
 *
 * The rules that make it safe are enforced here, never in the client:
 *
 *   * The agreed amount is written once, at creation, and never rewritten. A
 *     negotiated price is real — but only the seller's own request carries it,
 *     and nothing can edit it afterwards.
 *   * A request never changes the listing's public price. It is a payment
 *     instruction about a listing, not a new price for it.
 *   * Only the seller of the thread's store can create a request; only the
 *     buyer it was sent to can pay it. Both are read back from the database on
 *     every single action.
 *   * A request is paid exactly once. The Paystack amount is checked against
 *     the stored amount server-side, and an already-paid request cannot be
 *     initialized, re-paid, or reused.
 *   * Money truth is established only by server-to-server verification — the
 *     webhook and the explicit verify call — with the same atomic claim the
 *     marketplace checkout uses.
 */

import "server-only";

import { batch, db, execute, query, queryOne, type BatchStatement } from "../db";
import { isPaystackConfigured, requestBaseUrl } from "../env";
import { nowIso } from "../format";
import { newId, newOrderNumber, randomCode, randomHex } from "../ids";
import { formatMoney } from "../money";
import { initializeTransaction, verifyTransaction } from "../paystack";
import type {
  ChatMessageDto,
  ChatPaymentRequestDto,
} from "../chat/types";
import type {
  MessageRow,
  OrderRow,
  PaymentRequestRow,
  PaymentRequestStatus,
  StoreRow,
  StoreSettingsRow,
} from "../types";
import { getPaymentByReference, recordPaymentIntent, verifyAndFulfilPayment } from "./commerce";
import {
  sendPaymentReceivedEmail,
  sendPaymentRequestCancelledEmail,
  sendPaymentRequestEmail,
} from "./email";
import { conversationParties, toChatMessage } from "./messages";
import { emitChatEvent } from "./realtime";
import { getStoreSettings } from "./stores";

/** Paystack settles these currencies on this platform. */
const SUPPORTED_CURRENCIES = ["NGN", "USD", "GHS", "ZAR", "KES"];

/** The agreed amount is bounded like real money: at least ₦1, at most ₦100M. */
const MIN_AMOUNT_MINOR = 100;
const MAX_AMOUNT_MINOR = 10_000_000_000;

/* -------------------------------------------------------------------------- */
/* Reading — the card's view of a request                                     */
/* -------------------------------------------------------------------------- */

/**
 * The status as it stands right now.
 *
 * A request whose expiry passed is expired whether or not anything has written
 * that down yet — the card must never claim a dead request is still payable.
 * The stored row keeps its state; payment attempts actively mark it (see
 * `startPaymentRequestCheckout`).
 */
export function effectivePaymentRequestStatus(row: PaymentRequestRow): PaymentRequestStatus {
  if (
    (row.status === "awaiting_payment" || row.status === "processing") &&
    row.expires_at &&
    row.expires_at <= nowIso()
  ) {
    return "expired";
  }
  return row.status;
}

/** The request as the payment card renders it — display facts only. */
export function paymentRequestDto(row: PaymentRequestRow): ChatPaymentRequestDto {
  return {
    id: row.id,
    amount: Number(row.amount),
    currency: row.currency,
    description: row.description,
    status: effectivePaymentRequestStatus(row),
    listingId: row.listing_id,
    contextTitle: row.context_title,
    contextImageUrl: row.context_image_url,
    sellerName: row.seller_name,
    originalAmount: row.original_amount === null ? null : Number(row.original_amount),
    recipientUserId: row.recipient_user_id,
    createdAt: row.created_at,
    paidAt: row.paid_at,
    expiresAt: row.expires_at,
  };
}

export async function getPaymentRequestRow(id: string): Promise<PaymentRequestRow | null> {
  return queryOne<PaymentRequestRow>("SELECT * FROM payment_requests WHERE id = ?", [id]);
}

/** Several requests at once — one query for a whole page of messages. */
export async function loadPaymentRequestDtos(
  ids: string[],
): Promise<Map<string, ChatPaymentRequestDto>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const map = new Map<string, ChatPaymentRequestDto>();
  if (unique.length === 0) return map;

  const rows = await query<PaymentRequestRow>(
    `SELECT * FROM payment_requests WHERE id IN (${unique.map(() => "?").join(", ")})`,
    unique,
  );
  for (const row of rows) map.set(row.id, paymentRequestDto(row));
  return map;
}

/**
 * A page of stored messages as the chat renders them — with each payment card
 * message's live request state attached, in one batch.
 */
export async function toChatMessagesWithPayments(rows: MessageRow[]): Promise<ChatMessageDto[]> {
  const dtos = rows.map(toChatMessage);
  const requests = await loadPaymentRequestDtos(
    dtos.map((dto) => dto.paymentRequestId).filter((id): id is string => Boolean(id)),
  );

  return dtos.map((dto) =>
    dto.paymentRequestId
      ? { ...dto, paymentRequest: requests.get(dto.paymentRequestId) ?? null }
      : dto,
  );
}

/** One payment card message, with its request's live state attached. */
export async function paymentMessageDto(messageId: string): Promise<ChatMessageDto | null> {
  const row = await queryOne<MessageRow>("SELECT * FROM messages WHERE id = ?", [messageId]);
  if (!row) return null;
  const [dto] = await toChatMessagesWithPayments([row]);
  return dto ?? null;
}

/** The request a paid order settled, when that order came from chat. */
export async function paymentRequestForOrder(
  orderId: string,
): Promise<PaymentRequestRow | null> {
  return queryOne<PaymentRequestRow>(
    "SELECT * FROM payment_requests WHERE order_id = ? ORDER BY created_at ASC LIMIT 1",
    [orderId],
  );
}

/**
 * Push a request's fresh state into its conversation as a message update —
 * both sides see the payment card change in place, without a refresh.
 */
async function emitPaymentRequestUpdate(requestId: string): Promise<void> {
  const request = await getPaymentRequestRow(requestId);
  if (!request) return;

  const message = await queryOne<MessageRow>(
    "SELECT * FROM messages WHERE payment_request_id = ? ORDER BY created_at ASC LIMIT 1",
    [requestId],
  );
  if (!message) return;

  const dto = await paymentMessageDto(message.id);
  if (!dto) return;

  const parties = await conversationParties(message.conversation_id);
  if (!parties) return;

  emitChatEvent({
    type: "message-updated",
    audience: [parties.buyerUserId, parties.storeOwnerId],
    message: dto,
  });
}

/* -------------------------------------------------------------------------- */
/* Creating — the seller's payment card                                       */
/* -------------------------------------------------------------------------- */

export type CreatePaymentRequestInput = {
  /** The seller asking. Verified against the thread's store — never trusted. */
  actorId: string;
  conversationId: string;
  /** The agreed amount in minor units. Written once; never changed after. */
  amountMinor: number;
  description?: string | null;
  /** The listing the deal relates to, when there is one. Context only. */
  listingId?: string | null;
};

export type CreatePaymentRequestResult =
  | { ok: true; message: ChatMessageDto }
  | { ok: false; error: string };

/**
 * Send a payment request into a conversation — the seller's alone.
 *
 * Everything about the request is decided here: whose store it belongs to, who
 * will pay it, what it is about and in what currency. The client sends only the
 * agreed amount, an optional description and an optional listing to point at —
 * and the listing is checked to belong to this thread's store before it is
 * ever quoted on a card.
 */
export async function createPaymentRequest(
  input: CreatePaymentRequestInput,
): Promise<CreatePaymentRequestResult> {
  const conversation = await queryOne<{
    id: string;
    store_id: string;
    listing_id: string | null;
    buyer_user_id: string;
    owner_id: string;
    store_name: string;
    store_currency: string;
  }>(
    `SELECT c.id, c.store_id, c.listing_id, c.buyer_user_id,
            s.user_id AS owner_id, s.name AS store_name, s.currency AS store_currency
       FROM conversations c
       JOIN stores s ON s.id = c.store_id
      WHERE c.id = ?`,
    [input.conversationId],
  );
  if (!conversation) return { ok: false, error: "That conversation is not yours." };

  // Only the seller side sends payment requests — the one who owes nothing.
  if (conversation.owner_id !== input.actorId) {
    return { ok: false, error: "Only the seller can send a payment request." };
  }
  if (conversation.buyer_user_id === input.actorId) {
    return { ok: false, error: "You cannot send a payment request to yourself." };
  }

  const amount = Number(input.amountMinor);
  if (!Number.isInteger(amount) || amount < MIN_AMOUNT_MINOR) {
    return { ok: false, error: "Enter an amount to request." };
  }
  if (amount > MAX_AMOUNT_MINOR) {
    return { ok: false, error: "That amount is too large for one payment request." };
  }

  const description = input.description?.trim().slice(0, 200) || null;

  // The listing, when the deal has one: it must belong to this thread's store,
  // and it is quoted as context only — its public price is never touched.
  const listingId = input.listingId ?? conversation.listing_id;
  let contextTitle: string | null = null;
  let contextImageUrl: string | null = null;
  let originalAmount: number | null = null;
  let currency = conversation.store_currency;

  if (listingId) {
    const listing = await queryOne<{
      id: string;
      title: string;
      price: number;
      currency: string;
      image_url: string | null;
    }>(
      `SELECT l.id, l.title, l.price, l.currency,
              (SELECT li.image_url FROM listing_images li
                WHERE li.listing_id = l.id
                ORDER BY li.position ASC, li.created_at ASC LIMIT 1) AS image_url
         FROM listings l
        WHERE l.id = ? AND l.store_id = ? AND l.type = 'product'`,
      [listingId, conversation.store_id],
    );

    if (!listing) return { ok: false, error: "Choose a product from this store." };
    if (listing) {
      contextTitle = listing.title;
      contextImageUrl = listing.image_url;
      originalAmount = Number(listing.price);
      currency = listing.currency;
    }
  }

  if (!SUPPORTED_CURRENCIES.includes(currency)) {
    return { ok: false, error: `Payments in ${currency} are not supported by Paystack.` };
  }

  const id = newId("preq");
  const timestamp = nowIso();

  await execute(
    `INSERT INTO payment_requests
       (id, conversation_id, store_id, created_by, recipient_user_id, listing_id,
        context_title, context_image_url, seller_name, original_amount, description,
        amount, currency, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'awaiting_payment', ?, ?)`,
    [
      id,
      conversation.id,
      conversation.store_id,
      input.actorId,
      conversation.buyer_user_id,
      listingId ?? null,
      contextTitle,
      contextImageUrl,
      conversation.store_name,
      originalAmount,
      description,
      amount,
      currency,
      timestamp,
      timestamp,
    ],
  );

  // The card's place in the conversation is a normal message: it orders, it
  // previews and it ages exactly like every other message in the thread.
  const messageId = newId("msg");
  const body = `Payment request · ${formatMoney(amount, currency)}`;

  await batch([
    {
      sql: `INSERT INTO messages (id, conversation_id, sender_user_id, body, payment_request_id)
            VALUES (?, ?, ?, ?, ?)`,
      args: [messageId, conversation.id, input.actorId, body, id],
    },
    {
      sql: "UPDATE conversations SET last_message_at = ? WHERE id = ?",
      args: [timestamp, conversation.id],
    },
  ]);

  const dto = await paymentMessageDto(messageId);
  if (!dto) return { ok: false, error: "The payment request could not be sent." };

  // Both sides hear it in the same beat — the buyer's card appears without a
  // refresh, and the sender's own other tabs see it too.
  emitChatEvent({
    type: "message",
    audience: [conversation.buyer_user_id, conversation.owner_id],
    message: dto,
  });
  emitChatEvent({
    type: "conversation",
    audience: [conversation.buyer_user_id, conversation.owner_id],
    conversationId: conversation.id,
  });

  // The buyer may not be watching the thread — money asked for deserves an
  // inbox too. Fire-and-forget: a mail failure never unwrites a real request.
  const buyer = await queryOne<{ email: string; name: string }>(
    "SELECT email, name FROM users WHERE id = ?",
    [conversation.buyer_user_id],
  );
  if (buyer) {
    await sendPaymentRequestEmail({
      buyerEmail: buyer.email,
      buyerName: buyer.name,
      sellerName: conversation.store_name,
      amountMinor: amount,
      currency,
      description,
      contextTitle,
      conversationId: conversation.id,
      paymentRequestId: id,
    }).catch(() => {});
  }

  return { ok: true, message: dto };
}

/**
 * Withdraw a payment request — the seller's alone, and only while nothing has
 * been paid. A paid request is history and can never be rewritten.
 */
export async function cancelPaymentRequest(input: {
  actorId: string;
  paymentRequestId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const request = await getPaymentRequestRow(input.paymentRequestId);
  if (!request) return { ok: false, error: "That payment request no longer exists." };
  if (request.created_by !== input.actorId) {
    return { ok: false, error: "Only the seller can cancel this payment request." };
  }

  const status = effectivePaymentRequestStatus(request);
  if (status === "paid") return { ok: false, error: "That payment request has already been paid." };
  if (status === "cancelled") return { ok: true };
  if (status === "expired") return { ok: false, error: "That payment request has expired." };

  const timestamp = nowIso();
  const claim = await execute(
    `UPDATE payment_requests SET status = 'cancelled', cancelled_at = ?, updated_at = ?
      WHERE id = ? AND status NOT IN ('paid', 'cancelled')`,
    [timestamp, timestamp, input.paymentRequestId],
  );
  await emitPaymentRequestUpdate(input.paymentRequestId);

  // The notice follows the actual cancellation — and only ever one, even if
  // two attempts race: the update above changes state exactly once.
  if (claim.rowsAffected === 1) {
    const buyer = await queryOne<{ email: string; name: string }>(
      "SELECT email, name FROM users WHERE id = ?",
      [request.recipient_user_id],
    );
    const seller = await queryOne<{ name: string }>("SELECT name FROM stores WHERE id = ?", [
      request.store_id,
    ]);
    if (buyer) {
      await sendPaymentRequestCancelledEmail({
        buyerEmail: buyer.email,
        buyerName: buyer.name,
        sellerName: seller?.name ?? "The seller",
        amountMinor: Number(request.amount),
        currency: request.currency,
        conversationId: request.conversation_id,
        paymentRequestId: request.id,
      }).catch(() => {});
    }
  }

  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* Paying — the buyer's side                                                  */
/* -------------------------------------------------------------------------- */

export type StartPaymentRequestCheckoutResult =
  | { ok: true; authorizationUrl: string }
  | { ok: false; error: string };

/**
 * Begin paying a payment request — the recipient's alone, at the stored amount.
 *
 * The amount sent to Paystack is read from the request row and nothing else.
 * The order this settles into is created here, once, and every attempt gets its
 * own transaction reference — so a failed attempt can be retried while a paid
 * request can never be charged again.
 */
export async function startPaymentRequestCheckout(input: {
  actorId: string;
  paymentRequestId: string;
}): Promise<StartPaymentRequestCheckoutResult> {
  const request = await getPaymentRequestRow(input.paymentRequestId);
  if (!request) return { ok: false, error: "That payment request no longer exists." };

  // Who may pay is a fact about the row, not a claim from the browser.
  if (request.recipient_user_id !== input.actorId) {
    return { ok: false, error: "Only the person this request was sent to can pay it." };
  }

  const status = effectivePaymentRequestStatus(request);
  if (status === "paid") {
    return { ok: false, error: "This payment request has already been paid." };
  }
  if (status === "cancelled") {
    return { ok: false, error: "This payment request was cancelled by the seller." };
  }
  if (status === "expired") {
    if (request.status !== "expired") {
      await execute(
        "UPDATE payment_requests SET status = 'expired', updated_at = ? WHERE id = ? AND status = 'awaiting_payment'",
        [nowIso(), request.id],
      );
      await emitPaymentRequestUpdate(request.id);
    }
    return { ok: false, error: "This payment request has expired." };
  }

  if (!isPaystackConfigured) {
    return {
      ok: false,
      error: "Payments are currently unavailable. Nothing has been charged.",
    };
  }

  const buyer = await queryOne<{ id: string; email: string; name: string }>(
    "SELECT id, email, name FROM users WHERE id = ?",
    [request.recipient_user_id],
  );
  if (!buyer) return { ok: false, error: "Your account could not be found." };

  const store = await queryOne<StoreRow>("SELECT * FROM stores WHERE id = ?", [request.store_id]);
  if (!store) return { ok: false, error: "That shop is no longer available." };

  // A previous attempt may already have settled — or be live right now. Never
  // start a second charge against a request that is spoken for.
  if (request.reference) {
    const existing = await getPaymentByReference(request.reference);
    if (existing) {
      if (existing.status === "success") {
        await syncPaymentRequestForPayment(request.reference);
        return { ok: false, error: "This payment request has already been paid." };
      }

      // Ask Paystack, not memory: an attempt the browser abandoned may still
      // have completed after the customer left.
      const verification = await verifyTransaction(request.reference);
      if (verification.ok && verification.data.status === "success") {
        await verifyAndFulfilPayment(request.reference);
        await syncPaymentRequestForPayment(request.reference);
        return { ok: false, error: "This payment request has already been paid." };
      }

      const live = verification.ok ? verification.data.status : null;
      if (live === "ongoing" || live === "pending") {
        if (existing.authorization_url) {
          return { ok: true, authorizationUrl: existing.authorization_url };
        }
      }
      // Failed or abandoned: fall through and begin a fresh attempt below.
    }
  }

  // The order is created the moment the buyer commits to paying — never when
  // the request is only sent. Whoever claims it creates it; the loser reuses it.
  let orderId = request.order_id;
  if (!orderId) {
    const claim = await claimChatOrder({ request, store, buyer });
    if (!claim.ok) return claim;
    orderId = claim.orderId;
  }

  await ensureChatOrder({ request, store, buyer, orderId });

  // One attempt, one reference. The amount is the request's stored amount.
  const reference = `RCC_${randomCode(18)}`;
  const initialized = await initializeTransaction({
    email: buyer.email,
    amountMinor: Number(request.amount),
    currency: request.currency,
    reference,
    callbackUrl: `${await requestBaseUrl()}/checkout/callback`,
    metadata: {
      paymentRequestId: request.id,
      conversationId: request.conversation_id,
      orderId,
      kind: "chat",
    },
  });

  if (!initialized.ok) {
    // The attempt could not even begin — the gateway refused or was
    // unreachable. The request returns to a payable state and says so, rather
    // than sitting in "Processing" for a payment that never started. Nothing
    // is ever marked paid on a failed call to the provider.
    await execute(
      `UPDATE payment_requests SET status = 'failed', updated_at = ?
        WHERE id = ? AND status = 'processing' AND (reference IS NULL OR reference = ?)`,
      [nowIso(), request.id, request.reference],
    );
    await emitPaymentRequestUpdate(request.id);
    return { ok: false, error: initialized.error };
  }

  await recordPaymentIntent({
    orderId,
    storeId: request.store_id,
    reference: initialized.reference,
    amount: Number(request.amount),
    currency: request.currency,
    authorizationUrl: initialized.authorizationUrl,
  });

  await execute(
    `UPDATE payment_requests SET reference = ?, status = 'processing', updated_at = ?
      WHERE id = ? AND status NOT IN ('paid', 'cancelled')`,
    [initialized.reference, nowIso(), request.id],
  );
  await emitPaymentRequestUpdate(request.id);

  return { ok: true, authorizationUrl: initialized.authorizationUrl };
}

/**
 * Claim a payment request's order and create it — as one transaction.
 *
 * The claim comes first (`WHERE order_id IS NULL`, so exactly one caller ever
 * wins) and the order row is written in the same transaction: there is never a
 * claim without its order, and never an order nobody claimed. The request's
 * foreign key to its order is checked at commit time, where the inserts in this
 * transaction already satisfy it.
 */
async function claimChatOrder(input: {
  request: PaymentRequestRow;
  store: StoreRow;
  buyer: { id: string; email: string; name: string };
}): Promise<{ ok: true; orderId: string } | { ok: false; error: string }> {
  const { request, store, buyer } = input;
  const claimedId = newId("ord");
  const timestamp = nowIso();

  // The order's snapshot facts, read before the transaction opens.
  const settings: StoreSettingsRow = await getStoreSettings(store.id);
  const itemType = await chatItemType(request);

  const tx = await db.transaction("write");
  try {
    await tx.execute("PRAGMA defer_foreign_keys = ON");

    const claim = await tx.execute({
      sql: `UPDATE payment_requests SET order_id = ?, status = 'processing', updated_at = ?
             WHERE id = ? AND order_id IS NULL AND status NOT IN ('paid', 'cancelled')`,
      args: [claimedId, timestamp, request.id],
    });

    if (claim.rowsAffected !== 1) {
      await tx.rollback();

      // Somebody else claimed it a moment ago — and their write lock held
      // until their whole transaction committed, so their order is complete.
      const fresh = await queryOne<PaymentRequestRow>(
        "SELECT * FROM payment_requests WHERE id = ?",
        [request.id],
      );
      if (fresh?.status === "paid") {
        return { ok: false, error: "This payment request has already been paid." };
      }
      if (!fresh?.order_id) {
        return { ok: false, error: "This payment could not be started. Try again." };
      }
      return { ok: true, orderId: fresh.order_id };
    }

    const statements = await chatOrderStatements({
      request,
      store,
      buyer,
      orderId: claimedId,
      settings,
      itemType,
      timestamp,
    });
    for (const statement of statements) {
      await tx.execute({ sql: statement.sql, args: statement.args ?? [] });
    }

    await tx.commit();
    return { ok: true, orderId: claimedId };
  } catch (error) {
    await tx.rollback().catch(() => {});
    console.error("[payments] a chat order could not be claimed", error);
    return { ok: false, error: "This payment could not be started. Try again." };
  }
}

/**
 * The order a chat payment settles into — created once, on the buyer's own
 * account, at the agreed amount.
 *
 * The line is a snapshot of what was agreed (with the listing recorded as
 * metadata), never a marketplace basket line: a negotiated transaction does not
 * draw down stock it never reserved, and it never re-prices the listing it
 * points at.
 */
async function ensureChatOrder(input: {
  request: PaymentRequestRow;
  store: StoreRow;
  buyer: { id: string; email: string; name: string };
  orderId: string;
}): Promise<void> {
  const { request, store, buyer, orderId } = input;

  const existing = await queryOne<OrderRow>("SELECT * FROM orders WHERE id = ?", [orderId]);
  if (existing) return;

  const settings: StoreSettingsRow = await getStoreSettings(store.id);
  const statements = await chatOrderStatements({
    request,
    store,
    buyer,
    orderId,
    settings,
    itemType: await chatItemType(request),
    timestamp: nowIso(),
  });
  await batch(statements);
}

/** The customer, order and line rows of one chat order, ready to be written. */
async function chatOrderStatements(input: {
  request: PaymentRequestRow;
  store: StoreRow;
  buyer: { id: string; email: string; name: string };
  orderId: string;
  settings: StoreSettingsRow;
  itemType: string;
  timestamp: string;
}): Promise<BatchStatement[]> {
  const { request, store, buyer, orderId, settings, itemType, timestamp } = input;
  const email = buyer.email.trim().toLowerCase();
  const title = request.context_title ?? request.description ?? "Agreed payment";

  const customer = await queryOne<{ id: string }>(
    "SELECT id FROM customers WHERE store_id = ? AND email = ?",
    [store.id, email],
  );
  const customerId = customer?.id ?? newId("cus");

  const statements: BatchStatement[] = [];

  if (!customer) {
    statements.push({
      sql: `INSERT INTO customers (id, store_id, user_id, email, name, orders_count, total_spent, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)`,
      args: [customerId, store.id, buyer.id, email, buyer.name || null, timestamp, timestamp],
    });
  }

  statements.push({
    sql: `INSERT INTO orders
            (id, order_number, store_id, customer_id, user_id, email, customer_name,
             currency, subtotal, discount_total, shipping_total, tax_total, total, status,
             payment_status, customer_note, shipping_address, access_token, source,
             fulfilment_method, estimated_delivery, receipt_code, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, 'pending', 'unpaid', ?, NULL, ?, ?, 'none', NULL, ?, ?, ?)`,
    args: [
      orderId,
      newOrderNumber(settings.order_prefix),
      store.id,
      customerId,
      buyer.id,
      email,
      buyer.name || null,
      request.currency,
      Number(request.amount), // subtotal
      Number(request.amount), // total
      request.description,
      randomCode(40),
      "chat",
      `RC-${randomHex(8)}`,
      timestamp,
      timestamp,
    ],
  });

  statements.push({
    sql: `INSERT INTO order_items
            (id, order_id, item_type, listing_id, variant_id, ticket_type_id, event_id, title,
             variant_name, unit_price, quantity, total, currency, metadata, fulfilment_status, created_at)
          VALUES (?, ?, ?, NULL, NULL, NULL, NULL, ?, NULL, ?, 1, ?, ?, ?, 'unfulfilled', ?)`,
    args: [
      newId("oitem"),
      orderId,
      itemType,
      title,
      Number(request.amount),
      Number(request.amount),
      request.currency,
      JSON.stringify({
        paymentRequestId: request.id,
        conversationId: request.conversation_id,
        listingId: request.listing_id,
        description: request.description,
      }),
      timestamp,
    ],
  });

  return statements;
}

/**
 * What the agreed payment is *for*, as the order line says it.
 *
 * The line speaks the same vocabulary as marketplace order lines — food stays
 * food, a rental stays a rental — so an order history reads the same however
 * the deal was made.
 */
async function chatItemType(request: PaymentRequestRow): Promise<string> {
  if (!request.listing_id) return "product";

  const listing = await queryOne<{ type: string }>("SELECT type FROM listings WHERE id = ?", [
    request.listing_id,
  ]);

  if (listing?.type !== "product") throw new Error("This product is no longer available.");
  return "product";
}

/* -------------------------------------------------------------------------- */
/* Settlement — after Paystack has been verified                              */
/* -------------------------------------------------------------------------- */

/**
 * Bring a payment request in line with a verified payment.
 *
 * Called after `verifyAndFulfilPayment` from every path money truth travels —
 * the webhook, the return page, an explicit verify — so the payment card in the
 * conversation tells the same story as the ledger. Idempotent: the request
 * moves to `paid` exactly once, and only a genuinely successful payment ever
 * moves it there.
 */
export async function syncPaymentRequestForPayment(reference: string): Promise<void> {
  const payment = await getPaymentByReference(reference);
  if (!payment) return;

  const request = await queryOne<PaymentRequestRow>(
    "SELECT * FROM payment_requests WHERE order_id = ? OR reference = ? ORDER BY created_at ASC LIMIT 1",
    [payment.order_id, reference],
  );
  if (!request) return;

  const timestamp = nowIso();

  if (payment.status === "success") {
    const claim = await execute(
      `UPDATE payment_requests SET status = 'paid', paid_at = COALESCE(paid_at, ?), updated_at = ?
        WHERE id = ? AND status != 'paid'`,
      [payment.paid_at ?? timestamp, timestamp, request.id],
    );
    // The claim is the gate: the seller hears "you've been paid" exactly once,
    // whichever of the webhook and the return page settles it.
    if (claim.rowsAffected > 0) {
      await emitPaymentRequestUpdate(request.id);
      await notifySellerPaymentReceived(request);
    }
    return;
  }

  if (payment.status === "failed") {
    const claim = await execute(
      `UPDATE payment_requests SET status = 'failed', updated_at = ?
        WHERE id = ? AND status IN ('awaiting_payment', 'processing')`,
      [timestamp, request.id],
    );
    if (claim.rowsAffected > 0) await emitPaymentRequestUpdate(request.id);
  }
}

/**
 * The seller's "you've been paid" for a settled payment request.
 *
 * Best-effort by design: the money is already claimed and the order already
 * fulfilled when this runs, so a mail failure must never touch either.
 */
async function notifySellerPaymentReceived(request: PaymentRequestRow): Promise<void> {
  try {
    const owner = await queryOne<{ email: string; name: string }>(
      `SELECT u.email, u.name FROM users u JOIN stores s ON s.user_id = u.id WHERE s.id = ?`,
      [request.store_id],
    );
    if (!owner) return;

    const buyer = await queryOne<{ name: string }>("SELECT name FROM users WHERE id = ?", [
      request.recipient_user_id,
    ]);

    await sendPaymentReceivedEmail({
      sellerEmail: owner.email,
      sellerName: owner.name,
      buyerName: buyer?.name ?? null,
      amountMinor: Number(request.amount),
      currency: request.currency,
      description: request.description,
      contextTitle: request.context_title,
      conversationId: request.conversation_id,
      paymentRequestId: request.id,
    });
  } catch (error) {
    console.error(`[mail] payment request ${request.id}: seller notice failed`, error);
  }
}

/**
 * Verify a chat payment's reference and settle both the order and the card.
 *
 * The same server-to-server verification as every payment on the platform —
 * amount included — with the request's card updated the moment it lands.
 */
export async function verifyAndSettlePaymentRequest(reference: string): Promise<void> {
  await verifyAndFulfilPayment(reference);
  await syncPaymentRequestForPayment(reference);
}
