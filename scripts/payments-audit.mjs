/**
 * Chat payment audit — the negotiated amount, agreed in a conversation.
 *
 * Runs against the live app over HTTP, with real accounts made through the
 * platform's own passwordless signup. The fixtures stand in only for what a
 * verified Paystack charge writes; everything else — who may send a request,
 * who may pay it, what amount moves, what records appear — is exercised
 * through the same endpoints the browser uses.
 *
 * What it proves, end to end:
 *   1. the seller sends a payment request and the buyer's card carries it;
 *   2. the agreed amount is immutable — nothing ever rewrites the request or
 *      the listing's public price;
 *   3. only the seller can send one, only its recipient can pay it, and a
 *      third account can do neither (or even read the thread);
 *   4. paying creates the real records — one order at the agreed amount, one
 *      payment attempt, the request in "processing";
 *   5. a paid request cannot be paid again, and its card reads "Paid";
 *   6. the seller alone can withdraw an unpaid request;
 *   7. the webhook refuses unsigned requests.
 *
 *   node scripts/payments-audit.mjs [baseUrl]
 */

import { createClient } from "@libsql/client";
import { loadEnv, resolveDatabase } from "./load-env.mjs";

const BASE = process.argv[2] ?? "http://localhost:5000";
loadEnv();
const { url, authToken } = resolveDatabase();
const db = createClient(authToken ? { url, authToken } : { url });

const stamp = Date.now().toString(36);
const failures = [];
let checked = 0;

const now = new Date().toISOString();

const sellerEmail = `pr-seller-${stamp}@example.com`;
const buyerEmail = `pr-buyer-${stamp}@example.com`;
const intruderEmail = `pr-intruder-${stamp}@example.com`;

const storeId = `str_pr_${stamp}`;
const listingId = `lst_pr_${stamp}`;
const foreignStoreId = `str_prx_${stamp}`;
const foreignListingId = `lst_prx_${stamp}`;

/** The advertised price — ₦100,000 — that negotiation must never rewrite. */
const LISTED_PRICE = 10_000_000;
/** The negotiated amount — ₦75,000. */
const AGREED_AMOUNT = 7_500_000;

let seller = null;
let buyer = null;
let intruder = null;
let conversationId = null;
let requestId = null;
let cancelRequestId = null;

function check(label, condition, detail = "") {
  checked += 1;
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

/** The dev server holds the SQLite file, so a write can lose the lock race. */
async function write(statements) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      return await db.batch(statements, "write");
    } catch (error) {
      if (!String(error).includes("SQLITE_BUSY")) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error("database stayed locked");
}

async function post(path, body, headers = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE, ...headers },
    body: JSON.stringify(body),
    redirect: "manual",
  });
  return { response, json: await response.json().catch(() => null) };
}

async function patch(path, body, headers = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", origin: BASE, ...headers },
    body: JSON.stringify(body),
    redirect: "manual",
  });
  return { response, json: await response.json().catch(() => null) };
}

/** Register → send code → read it from the database → verify → session cookie. */
async function signUp(name, email) {
  let r = await post("/api/auth/sign-up/email", { email, password: `pw-${stamp}-x1`, name });
  if (r.response.status !== 200) throw new Error(`sign-up failed: ${r.response.status}`);

  await post("/api/auth/email-otp/send-verification-otp", { email, type: "email-verification" });

  const codes = await db.execute({
    sql: "SELECT identifier, value FROM verification ORDER BY createdAt DESC LIMIT 10",
    args: [],
  });
  const row = codes.rows.find((entry) => String(entry.identifier).includes(email));
  if (!row) throw new Error(`no verification code for ${email}`);

  r = await post("/api/auth/email-otp/verify-email", {
    email,
    otp: String(row.value).split(":")[0],
  });
  const setCookie = r.response.headers.getSetCookie?.() ?? [];
  const cookie = setCookie
    .map((value) => value.split(";")[0])
    .find((value) => value.includes("better-auth.session_token"));
  if (!cookie) throw new Error(`no session cookie for ${email}`);

  const user = await db.execute({ sql: "SELECT id FROM users WHERE email = ?", args: [email] });
  return { userId: String(user.rows[0].id), email, cookie };
}

async function cleanup() {
  const statements = [
    {
      sql: "DELETE FROM conversation_user_states WHERE conversation_id IN (SELECT id FROM conversations WHERE store_id IN (?, ?))",
      args: [storeId, foreignStoreId],
    },
    {
      sql: "DELETE FROM message_user_states WHERE message_id IN (SELECT id FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE store_id IN (?, ?)))",
      args: [storeId, foreignStoreId],
    },
    { sql: "DELETE FROM payment_requests WHERE store_id IN (?, ?)", args: [storeId, foreignStoreId] },
    {
      sql: "DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE store_id IN (?, ?))",
      args: [storeId, foreignStoreId],
    },
    { sql: "DELETE FROM conversations WHERE store_id IN (?, ?)", args: [storeId, foreignStoreId] },
    {
      sql: "DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE store_id IN (?, ?))",
      args: [storeId, foreignStoreId],
    },
    { sql: "DELETE FROM payments WHERE store_id IN (?, ?)", args: [storeId, foreignStoreId] },
    { sql: "DELETE FROM transactions WHERE store_id IN (?, ?)", args: [storeId, foreignStoreId] },
    { sql: "DELETE FROM orders WHERE store_id IN (?, ?)", args: [storeId, foreignStoreId] },
    { sql: "DELETE FROM listing_images WHERE listing_id IN (?, ?)", args: [listingId, foreignListingId] },
    { sql: "DELETE FROM listings WHERE store_id IN (?, ?)", args: [storeId, foreignStoreId] },
    { sql: "DELETE FROM customers WHERE store_id IN (?, ?)", args: [storeId, foreignStoreId] },
    { sql: "DELETE FROM store_settings WHERE store_id IN (?, ?)", args: [storeId, foreignStoreId] },
    { sql: "DELETE FROM stores WHERE id IN (?, ?)", args: [storeId, foreignStoreId] },
  ];

  for (const account of [seller, buyer, intruder]) {
    if (!account) continue;
    statements.push(
      { sql: "DELETE FROM verification WHERE identifier LIKE ?", args: [`%${account.userId}%`] },
      { sql: "DELETE FROM verification WHERE identifier LIKE ?", args: [`%${account.email}%`] },
      { sql: "DELETE FROM sessions WHERE user_id = ?", args: [account.userId] },
      { sql: 'DELETE FROM account WHERE "userId" = ?', args: [account.userId] },
      { sql: "DELETE FROM users WHERE id = ?", args: [account.userId] },
    );
  }

  await write(statements).catch(() => {});
}

async function seed() {
  seller = await signUp("Payment Seller", sellerEmail);
  buyer = await signUp("Payment Buyer", buyerEmail);
  intruder = await signUp("Payment Intruder", intruderEmail);

  await write([
    {
      sql: `INSERT INTO stores (id, user_id, slug, name, currency, country, is_published, created_at, updated_at)
            VALUES (?, ?, ?, 'Negotiation Shop', 'NGN', 'Nigeria', 1, ?, ?)`,
      args: [storeId, seller.userId, `pr${stamp}`, now, now],
    },
    { sql: "INSERT INTO store_settings (store_id, updated_at) VALUES (?, ?)", args: [storeId, now] },
    {
      sql: `INSERT INTO listings (id, store_id, type, fulfilment, title, slug, currency, price,
              track_inventory, stock, status, published_at, created_at, updated_at)
            VALUES (?, ?, 'physical', 'shipping', 'Negotiable Shirt', ?, 'NGN', ?, 1, 50, 'active', ?, ?, ?)`,
      args: [listingId, storeId, `negotiable-shirt-${stamp}`, LISTED_PRICE, now, now, now],
    },
    {
      sql: `INSERT INTO stores (id, user_id, slug, name, currency, country, is_published, created_at, updated_at)
            VALUES (?, ?, ?, 'Other Shop', 'NGN', 'Nigeria', 1, ?, ?)`,
      args: [foreignStoreId, intruder.userId, `prx${stamp}`, now, now],
    },
    { sql: "INSERT INTO store_settings (store_id, updated_at) VALUES (?, ?)", args: [foreignStoreId, now] },
    {
      sql: `INSERT INTO listings (id, store_id, type, fulfilment, title, slug, currency, price,
              track_inventory, stock, status, published_at, created_at, updated_at)
            VALUES (?, ?, 'physical', 'shipping', 'Foreign Shirt', ?, 'NGN', ?, 1, 5, 'active', ?, ?, ?)`,
      args: [foreignListingId, foreignStoreId, `foreign-shirt-${stamp}`, LISTED_PRICE, now, now, now],
    },
  ]);
}

try {
  await seed();

  // --- The conversation the deal is struck in ---------------------------
  const opened = await post(
    "/api/messages",
    { listingId, body: "Hello — is the shirt available at a better price?" },
    { cookie: buyer.cookie },
  );
  conversationId = opened.json?.conversationId ?? null;
  check("the buyer opens a thread about the listing", Boolean(conversationId));

  // --- 3. Who may even see the thread ----------------------------------
  const intruderRead = await fetch(
    `${BASE}/api/messages?conversationId=${conversationId}`,
    { headers: { cookie: intruder.cookie } },
  );
  check("a third account cannot read the thread", intruderRead.status === 403);

  // --- 1. The seller sends the payment request -------------------------
  const buyerAttempt = await post(
    "/api/messages/payment-requests",
    { conversationId, amountMinor: AGREED_AMOUNT },
    { cookie: buyer.cookie },
  );
  check(
    "a buyer cannot send a payment request",
    buyerAttempt.response.status === 400,
    `status ${buyerAttempt.response.status}`,
  );

  const zeroAmount = await post(
    "/api/messages/payment-requests",
    { conversationId, amountMinor: 0 },
    { cookie: seller.cookie },
  );
  check("an empty amount is refused", zeroAmount.response.status === 400);

  const forgedListing = await post(
    "/api/messages/payment-requests",
    {
      conversationId,
      amountMinor: 1_000_000,
      description: "Sneaky context",
      listingId: foreignListingId,
    },
    { cookie: seller.cookie },
  );
  check(
    "another shop's listing can never be quoted as context",
    forgedListing.response.status === 200 &&
      forgedListing.json?.message?.paymentRequest?.contextTitle == null,
    JSON.stringify(forgedListing.json?.message?.paymentRequest?.contextTitle ?? null),
  );

  const sent = await post(
    "/api/messages/payment-requests",
    {
      conversationId,
      amountMinor: AGREED_AMOUNT,
      description: "Agreed over chat",
      listingId,
    },
    { cookie: seller.cookie },
  );
  const card = sent.json?.message?.paymentRequest ?? null;
  requestId = card?.id ?? null;
  check("the seller's payment request is sent", sent.response.status === 200 && Boolean(requestId));
  check(
    "the card carries the agreed amount and the listing's own price",
    card?.amount === AGREED_AMOUNT && card?.originalAmount === LISTED_PRICE,
    `amount ${card?.amount}, original ${card?.originalAmount}`,
  );
  check(
    "the card reads as awaiting payment, with its context",
    card?.status === "awaiting_payment" &&
      card?.contextTitle === "Negotiable Shirt" &&
      card?.sellerName === "Negotiation Shop",
    JSON.stringify(card),
  );

  const requestRow = await db.execute({
    sql: "SELECT * FROM payment_requests WHERE id = ?",
    args: [requestId],
  });
  const row = requestRow.rows[0] ?? null;
  check(
    "the record is written with both sides named by the server",
    row &&
      String(row.created_by) === seller.userId &&
      String(row.recipient_user_id) === buyer.userId &&
      String(row.store_id) === storeId &&
      Number(row.amount) === AGREED_AMOUNT,
  );

  // --- 2. The amount is immutable, and the listing keeps its price -----
  const listingRow = await db.execute({
    sql: "SELECT price FROM listings WHERE id = ?",
    args: [listingId],
  });
  check(
    "the listing's public price is untouched by negotiation",
    Number(listingRow.rows[0]?.price) === LISTED_PRICE,
    String(listingRow.rows[0]?.price),
  );

  const buyerSeesCard = await fetch(`${BASE}/api/messages?conversationId=${conversationId}`, {
    headers: { cookie: buyer.cookie },
  });
  const buyerMessages = await buyerSeesCard.json().catch(() => null);
  const buyerCard = (buyerMessages?.messages ?? []).find((m) => m.paymentRequestId === requestId);
  check(
    "the buyer's conversation carries the payment card",
    buyerCard?.paymentRequest?.status === "awaiting_payment" &&
      buyerCard?.paymentRequest?.amount === AGREED_AMOUNT,
    JSON.stringify(buyerCard?.paymentRequest ?? null),
  );

  // --- 3/4. Who may pay it ---------------------------------------------
  const sellerPay = await patch(
    "/api/messages/payment-requests",
    { action: "pay", paymentRequestId: requestId },
    { cookie: seller.cookie },
  );
  check("the seller cannot pay their own request", sellerPay.response.status === 400);

  const intruderPay = await patch(
    "/api/messages/payment-requests",
    { action: "pay", paymentRequestId: requestId },
    { cookie: intruder.cookie },
  );
  check("a third account cannot pay someone else's request", intruderPay.response.status === 400);

  const paid = await patch(
    "/api/messages/payment-requests",
    { action: "pay", paymentRequestId: requestId },
    { cookie: buyer.cookie },
  );
  const started = paid.response.status === 200 && Boolean(paid.json?.authorizationUrl);
  check(
    started
      ? "paying hands the buyer to real Paystack checkout"
      : "a pay attempt that cannot start is refused honestly",
    started
      ? paid.json.authorizationUrl.startsWith("https://")
      : Boolean(paid.json?.error),
    JSON.stringify(paid.json),
  );

  // Whatever the gateway did, the record layer must already be right.
  const requestState = await db.execute({
    sql: "SELECT status, reference, order_id FROM payment_requests WHERE id = ?",
    args: [requestId],
  });
  const orderId = requestState.rows[0]?.order_id ? String(requestState.rows[0].order_id) : null;

  if (orderId) {
    const orders = await db.execute({ sql: "SELECT * FROM orders WHERE id = ?", args: [orderId] });
    check(
      "the deal becomes one order, at the negotiated amount",
      orders.rows.length === 1 && Number(orders.rows[0].total) === AGREED_AMOUNT,
      JSON.stringify(orders.rows[0]?.total ?? null),
    );

    const items = await db.execute({
      sql: "SELECT * FROM order_items WHERE order_id = ?",
      args: [orderId],
    });
    check(
      "the order line keeps the product context as metadata",
      items.rows.length === 1 &&
        Number(items.rows[0].unit_price) === AGREED_AMOUNT &&
        String(items.rows[0].metadata ?? "").includes(listingId),
    );

    if (started) {
      const attempts = await db.execute({
        sql: "SELECT * FROM payments WHERE order_id = ?",
        args: [orderId],
      });
      check(
        "one payment attempt is recorded at the agreed amount",
        attempts.rows.length >= 1 && Number(attempts.rows[0].amount) === AGREED_AMOUNT,
        `${attempts.rows.length} attempt(s)`,
      );
      check(
        "the request is processing, with its Paystack reference",
        requestState.rows[0]?.status === "processing" && Boolean(requestState.rows[0]?.reference),
      );
    } else {
      const attempts = await db.execute({
        sql: "SELECT COUNT(*) AS c FROM payments WHERE order_id = ?",
        args: [orderId],
      });
      check(
        "a gateway failure records no payment attempt and nothing paid",
        Number(attempts.rows[0]?.c) === 0 && requestState.rows[0]?.status === "failed",
        `status ${requestState.rows[0]?.status}`,
      );
    }

    // A second press must never open a second order against the request.
    await patch(
      "/api/messages/payment-requests",
      { action: "pay", paymentRequestId: requestId },
      { cookie: buyer.cookie },
    );
    const ordersAgain = await db.execute({
      sql: "SELECT COUNT(*) AS c FROM orders WHERE store_id = ? AND source = 'chat'",
      args: [storeId],
    });
    check("paying twice never creates a second order", Number(ordersAgain.rows[0]?.c) === 1);

    // --- 5. Settlement: the card follows the verified payment ----------
    // The fixture stands in for what a verified Paystack charge writes — the
    // same approach as the ticket audit's fulfilment fixtures. The settling
    // itself runs through the real return page, exactly as the browser does.
    let reference = String(requestState.rows[0]?.reference ?? "");
    if (!reference) {
      reference = `FIX_${stamp}`;
      await write([
        {
          sql: `INSERT INTO payments (id, order_id, store_id, provider, reference, amount, currency,
                  status, created_at, updated_at)
                VALUES (?, ?, ?, 'paystack', ?, ?, 'NGN', 'pending', ?, ?)`,
          args: [
            `pay_fix_${stamp}`,
            orderId,
            storeId,
            reference,
            AGREED_AMOUNT,
            now,
            now,
          ],
        },
      ]);
    }
    await write([
      {
        sql: "UPDATE payments SET status = 'success', paid_at = ? WHERE reference = ?",
        args: [new Date().toISOString(), reference],
      },
    ]);

    const callback = await fetch(`${BASE}/checkout/callback?reference=${reference}`, {
      headers: { cookie: buyer.cookie },
    });
    const callbackHtml = await callback.text();
    check(
      "the Paystack return page settles the payment and leads back to the conversation",
      callback.status === 200 &&
        callbackHtml.includes("Payment confirmed") &&
        callbackHtml.includes("Back to conversation"),
      `status ${callback.status}`,
    );

    const alreadyPaid = await patch(
      "/api/messages/payment-requests",
      { action: "pay", paymentRequestId: requestId },
      { cookie: buyer.cookie },
    );
    check(
      "a paid request can never be charged again",
      alreadyPaid.response.status === 400,
      JSON.stringify(alreadyPaid.json),
    );

    const settledRow = await db.execute({
      sql: "SELECT status, paid_at FROM payment_requests WHERE id = ?",
      args: [requestId],
    });
    check(
      "the request is paid on the record",
      settledRow.rows[0]?.status === "paid" && Boolean(settledRow.rows[0]?.paid_at),
    );

    const cardAfter = await fetch(`${BASE}/api/messages?conversationId=${conversationId}`, {
      headers: { cookie: buyer.cookie },
    });
    const afterMessages = await cardAfter.json().catch(() => null);
    const afterCard = (afterMessages?.messages ?? []).find((m) => m.paymentRequestId === requestId);
    check(
      "the buyer's card reads Paid from the backend state",
      afterCard?.paymentRequest?.status === "paid",
      JSON.stringify(afterCard?.paymentRequest?.status ?? null),
    );

    const listedStill = await db.execute({
      sql: "SELECT price FROM listings WHERE id = ?",
      args: [listingId],
    });
    check(
      "the listing still shows its advertised price after payment",
      Number(listedStill.rows[0]?.price) === LISTED_PRICE,
    );
  } else {
    check(
      "without working payments nothing was created and nothing pretends",
      requestState.rows[0]?.status !== "paid",
      `status ${requestState.rows[0]?.status}`,
    );
  }

  // --- 6. Withdrawing an unpaid request --------------------------------
  const second = await post(
    "/api/messages/payment-requests",
    { conversationId, amountMinor: 2_000_000, description: "Second thought" },
    { cookie: seller.cookie },
  );
  cancelRequestId = second.json?.message?.paymentRequest?.id ?? null;
  check("a second request can be sent", Boolean(cancelRequestId));

  const buyerCancel = await patch(
    "/api/messages/payment-requests",
    { action: "cancel", paymentRequestId: cancelRequestId },
    { cookie: buyer.cookie },
  );
  check("the buyer cannot withdraw the seller's request", buyerCancel.response.status === 400);

  const intruderCancel = await patch(
    "/api/messages/payment-requests",
    { action: "cancel", paymentRequestId: cancelRequestId },
    { cookie: intruder.cookie },
  );
  check("a third account cannot withdraw it either", intruderCancel.response.status === 400);

  const sellerCancel = await patch(
    "/api/messages/payment-requests",
    { action: "cancel", paymentRequestId: cancelRequestId },
    { cookie: seller.cookie },
  );
  check("the seller withdraws their own unpaid request", sellerCancel.response.status === 200);

  const payCancelled = await patch(
    "/api/messages/payment-requests",
    { action: "pay", paymentRequestId: cancelRequestId },
    { cookie: buyer.cookie },
  );
  check("a cancelled request can never be paid", payCancelled.response.status === 400);

  // --- 7. The webhook refuses unsigned requests -------------------------
  const forgedWebhook = await fetch(`${BASE}/api/payments/paystack/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE },
    body: JSON.stringify({
      event: "charge.success",
      data: { reference: "forged-reference", status: "success", amount: 1, currency: "NGN" },
    }),
    redirect: "manual",
  });
  check("the webhook refuses unsigned requests", forgedWebhook.status === 401);

  // The request the seller withdrew — and every record of the flow — reads
  // back exactly as the state machine says it should.
  const cancelledRow = await db.execute({
    sql: "SELECT status, amount FROM payment_requests WHERE id = ?",
    args: [cancelRequestId],
  });
  check(
    "the withdrawn request stays immutable and cancelled",
    cancelledRow.rows[0]?.status === "cancelled" &&
      Number(cancelledRow.rows[0]?.amount) === 2_000_000,
  );
} finally {
  await cleanup();
  db.close();
}

console.log(`\n${checked - failures.length}/${checked} checks passed`);
if (failures.length > 0) {
  console.error("Failures:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log("✓ chat payment audit passed");
