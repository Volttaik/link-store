/**
 * Email system audit — end to end.
 *
 * Exercises every transactional email reachable through real flows (account
 * creation, sign-in codes, password reset, chat payment requests, messages)
 * and, for the money events that cannot be conjured without moving real money
 * (paid orders, tickets, refunds, payouts, event changes), fires the real
 * senders against real database rows through the development-only audit route
 * — so the exact rendered messages are produced by production code paths.
 *
 * Every composed message is captured to `.email-outbox/` by the mail layer in
 * development, and this script asserts on both the outbox and the
 * `email_deliveries` record:
 *
 *   1. the right event sent the right email to the right person;
 *   2. every link is a production link — never localhost;
 *   3. the LINK STORE mark and footer are present;
 *   4. no event can send twice (dedupe keys);
 *   5. a delivery failure is recorded and never touches the transaction.
 *
 * Usage:  node scripts/email-audit.mjs [base-url]
 */

import { createClient } from "@libsql/client";
import { mkdir, readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";

import { loadEnv, projectRoot, resolveDatabase } from "./load-env.mjs";

const BASE = process.argv[2] ?? "http://localhost:5000";
loadEnv();
const { url, authToken } = resolveDatabase();
const db = createClient(authToken ? { url, authToken } : { url });

const OUTBOX = path.join(projectRoot, ".email-outbox");
const PROD = "https://link-store.quizmi.space";

const stamp = Date.now().toString(36);
const failures = [];
let checked = 0;

const now = new Date().toISOString();

// Resend refuses reserved test domains (example.com and friends), so the audit
// addresses live on the app's own subdomain: unique per run, and with no mail
// exchanger behind it, nothing real is ever disturbed.
const sellerEmail = `em-seller-${stamp}@link-store.quizmi.space`;
const buyerEmail = `em-buyer-${stamp}@link-store.quizmi.space`;

const storeId = `str_em_${stamp}`;
const listingId = `lst_em_${stamp}`;
const STORE_NAME = "Email Audit Shop";
const foodOrderId = `ord_emf_${stamp}`;
const ticketOrderId = `ord_emt_${stamp}`;
const doneOrderId = `ord_emd_${stamp}`;
const cancelOrderId = `ord_emc_${stamp}`;
const refundOrderId = `ord_emr_${stamp}`;
const payoutId = `pay_em_${stamp}`;
const eventId = `evt_em_${stamp}`;

let seller = null;
let buyer = null;

function check(label, condition, detail = "") {
  checked += 1;
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

/** The dev server shares the database, so a write can lose a lock race. */
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

async function post(pathname, body, headers = {}) {
  const response = await fetch(`${BASE}${pathname}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE, ...headers },
    body: JSON.stringify(body),
    redirect: "manual",
  });
  return { response, json: await response.json().catch(() => null) };
}

async function patch(pathname, body, headers = {}) {
  const response = await fetch(`${BASE}${pathname}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", origin: BASE, ...headers },
    body: JSON.stringify(body),
    redirect: "manual",
  });
  return { response, json: await response.json().catch(() => null) };
}

/* --- The outbox: what was actually rendered and sent ---------------------- */

async function outboxEntries() {
  const files = await readdir(OUTBOX).catch(() => []);
  const entries = [];
  for (const file of files.filter((name) => name.endsWith(".json"))) {
    entries.push(JSON.parse(await readFile(path.join(OUTBOX, file), "utf8")));
  }
  return entries;
}

/** The most recent composed message of a kind — the one a flow just produced. */
function latest(entries, kind, to = null) {
  return (
    [...entries]
      .reverse()
      .find((entry) => entry.kind === kind && (to === null || entry.to === to)) ?? null
  );
}

function delivered(row) {
  return row !== null && row.outcome === "sent";
}

/* --- Account plumbing ----------------------------------------------------- */

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

/* --- Seeded commerce rows for the money emails ---------------------------- */

/** The storefront the chat and commerce rows live in — owned by the seller. */
async function seedStore() {
  await write([
    {
      sql: `INSERT INTO stores (id, user_id, slug, name, currency, country, is_published, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'NGN', 'Nigeria', 1, ?, ?)`,
      args: [storeId, seller.userId, `em${stamp}`, STORE_NAME, now, now],
    },
    { sql: "INSERT INTO store_settings (store_id, updated_at) VALUES (?, ?)", args: [storeId, now] },
    {
      sql: `INSERT INTO listings (id, store_id, type, fulfilment, title, slug, currency, price,
              track_inventory, stock, status, published_at, created_at, updated_at)
            VALUES (?, ?, 'event_ticket', 'none', 'Launch Night Ticket', ?, 'NGN', 500000, 0, 0, 'active', ?, ?, ?)`,
      args: [listingId, storeId, `launch-night-ticket-${stamp}`, now, now, now],
    },
  ]);
}

async function seedCommerce() {
  await write([
    {
      sql: `INSERT INTO customers (id, store_id, user_id, email, name, orders_count, total_spent, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)`,
      args: [`cus_em_${stamp}`, storeId, buyer.userId, buyerEmail, "Emma Buyer", now, now],
    },
    // The event and its ticket type — parents of the tickets below.
    {
      sql: `INSERT INTO events (id, store_id, title, slug, starts_at, venue_name, city, status, created_at, updated_at)
            VALUES (?, ?, 'LinkStore Launch Night', ?, ?, 'The Hall', 'Lagos', 'published', ?, ?)`,
      args: [eventId, storeId, `launch-night-${stamp}`, "2026-12-12T18:00:00.000Z", now, now],
    },
    {
      sql: `INSERT INTO ticket_types (id, event_id, name, price, quantity_total, max_per_order, is_active, position)
            VALUES (?, ?, 'General', 500000, 100, 5, 1, 0)`,
      args: [`tt_em_${stamp}`, eventId],
    },
    // A food order — the food wording test.
    {
      sql: `INSERT INTO orders (id, order_number, store_id, customer_id, user_id, email, customer_name,
              currency, subtotal, total, status, payment_status, access_token, source,
              fulfilment_method, estimated_delivery, receipt_code, created_at, updated_at, paid_at)
            VALUES (?, ?, ?, ?, ?, ?, 'Emma Buyer', 'NGN', 450000, 450000, 'paid', 'paid', ?, 'marketplace',
              'pickup', NULL, ?, ?, ?, ?)`,
      args: [foodOrderId, `LS-EMF-${stamp}`, storeId, `cus_em_${stamp}`, buyer.userId, buyerEmail, `emf-${stamp}`, `RCF-${stamp}`, now, now, now],
    },
    {
      sql: `INSERT INTO order_items (id, order_id, item_type, title, unit_price, quantity, total, currency, fulfilment_status, created_at)
            VALUES (?, ?, 'food', 'Jollof Rice & Chicken', 250000, 1, 250000, 'NGN', 'unfulfilled', ?)`,
      args: [`oitem_emf1_${stamp}`, foodOrderId, now],
    },
    {
      sql: `INSERT INTO order_items (id, order_id, item_type, title, unit_price, quantity, total, currency, fulfilment_status, created_at)
            VALUES (?, ?, 'food', 'Chapman', 100000, 2, 200000, 'NGN', 'unfulfilled', ?)`,
      args: [`oitem_emf2_${stamp}`, foodOrderId, now],
    },
    // A ticket order — five tickets, five holders' worth of codes.
    {
      sql: `INSERT INTO orders (id, order_number, store_id, customer_id, user_id, email, customer_name,
              currency, subtotal, total, status, payment_status, access_token, source,
              fulfilment_method, receipt_code, created_at, updated_at, paid_at)
            VALUES (?, ?, ?, ?, ?, ?, 'Emma Buyer', 'NGN', 2500000, 2500000, 'paid', 'paid', ?, 'marketplace',
              'none', ?, ?, ?, ?)`,
      args: [ticketOrderId, `LS-EMT-${stamp}`, storeId, `cus_em_${stamp}`, buyer.userId, buyerEmail, `emt-${stamp}`, `RCT-${stamp}`, now, now, now],
    },
    ...Array.from({ length: 5 }, (_, index) => ({
      sql: `INSERT INTO tickets (id, order_id, order_item_id, event_id, ticket_type_id, store_id, code,
              holder_name, holder_email, status, created_at)
            VALUES (?, ?, NULL, ?, ?, ?, ?, 'Emma Buyer', ?, 'valid', ?)`,
      args: [
        `tix_em${index}_${stamp}`,
        ticketOrderId,
        eventId,
        `tt_em_${stamp}`,
        storeId,
        `LS-EMTICKET${index}`,
        buyerEmail,
        now,
      ],
    })),
    // Orders for the state-change emails.
    ...["done", "cancel", "refund"].map((name) => ({
      sql: `INSERT INTO orders (id, order_number, store_id, customer_id, user_id, email, customer_name,
              currency, subtotal, total, status, payment_status, access_token, source,
              fulfilment_method, receipt_code, created_at, updated_at, paid_at)
            VALUES (?, ?, ?, ?, ?, ?, 'Emma Buyer', 'NGN', 120000, 120000, ?, 'paid', ?, 'marketplace',
              'delivery', ?, ?, ?, ?)`,
      args: [
        name === "done" ? doneOrderId : name === "cancel" ? cancelOrderId : refundOrderId,
        `LS-EM${name.toUpperCase()}-${stamp}`,
        storeId,
        `cus_em_${stamp}`,
        buyer.userId,
        buyerEmail,
        name === "cancel" ? "cancelled" : "paid",
        `em${name}-${stamp}`,
        `RCE-${name}-${stamp}`,
        now,
        now,
        now,
      ],
    })),
    // A payout request — with real bank details the email must mask.
    {
      sql: `INSERT INTO payouts (id, store_id, amount, currency, status, method, destination, requested_at, created_at, updated_at)
            VALUES (?, ?, 15000000, 'NGN', 'pending', 'bank_transfer', ?, ?, ?, ?)`,
      args: [
        payoutId,
        storeId,
        JSON.stringify({ bankName: "Test Bank", accountNumber: "0123456789", accountName: "Emma Buyer" }),
        now,
        now,
        now,
      ],
    },
  ]);
}

async function cleanup() {
  const statements = [
    { sql: "DELETE FROM tickets WHERE order_id IN (?, ?, ?, ?, ?)", args: [foodOrderId, ticketOrderId, doneOrderId, cancelOrderId, refundOrderId] },
    { sql: "DELETE FROM order_items WHERE order_id IN (?, ?, ?, ?, ?)", args: [foodOrderId, ticketOrderId, doneOrderId, cancelOrderId, refundOrderId] },
    { sql: "DELETE FROM payments WHERE store_id = ?", args: [storeId] },
    { sql: "DELETE FROM email_deliveries WHERE store_id = ? OR order_id IN (?, ?, ?, ?, ?)", args: [storeId, foodOrderId, ticketOrderId, doneOrderId, cancelOrderId, refundOrderId] },
    { sql: "DELETE FROM orders WHERE store_id = ?", args: [storeId] },
    { sql: "DELETE FROM payouts WHERE store_id = ?", args: [storeId] },
    { sql: "DELETE FROM transactions WHERE store_id = ?", args: [storeId] },
    { sql: "DELETE FROM ticket_types WHERE event_id = ?", args: [eventId] },
    { sql: "DELETE FROM events WHERE id = ?", args: [eventId] },
    { sql: "DELETE FROM customers WHERE store_id = ?", args: [storeId] },
    { sql: "DELETE FROM listings WHERE id = ?", args: [listingId] },
    { sql: "DELETE FROM store_settings WHERE store_id = ?", args: [storeId] },
    { sql: "DELETE FROM stores WHERE id = ?", args: [storeId] },
    { sql: "DELETE FROM conversation_user_states WHERE conversation_id IN (SELECT id FROM conversations WHERE store_id = ?)", args: [storeId] },
    { sql: "DELETE FROM message_user_states WHERE message_id IN (SELECT id FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE store_id = ?))", args: [storeId] },
    { sql: "DELETE FROM payment_requests WHERE store_id = ?", args: [storeId] },
    { sql: "DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE store_id = ?)", args: [storeId] },
    { sql: "DELETE FROM conversations WHERE store_id = ?", args: [storeId] },
    { sql: "DELETE FROM email_deliveries WHERE recipient IN (?, ?, 'broken-address-without-at')", args: [sellerEmail, buyerEmail] },
  ];

  for (const account of [seller, buyer]) {
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

/* --- The audit ------------------------------------------------------------ */

try {
  await rm(OUTBOX, { recursive: true, force: true });
  await mkdir(OUTBOX, { recursive: true });

  /* -- 1. Accounts -------------------------------------------------------- */
  console.log("\nAccount emails");
  seller = await signUp("Emma Seller", sellerEmail);
  buyer = await signUp("Emma Buyer", buyerEmail);
  await seedStore();

  let entries = await outboxEntries();

  const welcome = latest(entries, "welcome", buyerEmail);
  check("account creation sends a welcome email", delivered(welcome), welcome?.outcome ?? "missing");
  check("the welcome email greets by name", welcome?.html?.includes("Emma Buyer") === true);
  check("the welcome email carries the LINK STORE mark", welcome?.html?.includes(`${PROD}/brand/link-mark.png`) === true);
  check("the welcome email links to the workspace on the production host", welcome?.html?.includes(`${PROD}/workspace`) === true);

  const code = latest(entries, "auth", buyerEmail);
  check("sign-up sends a sign-in code email", delivered(code), code?.outcome ?? "missing");
  check("the code email carries the one-time code as text", /(\d\s*){6}/.test(code?.text ?? ""));
  check("the code email explains its expiry", /expires in \d+ minutes/.test(code?.text ?? ""));

  /* -- 2. Chat: messages and payment requests ----------------------------- */
  console.log("\nChat payment emails");
  const opened = await post(
    "/api/messages",
    { listingId: null, storeId, body: "Hi — is the launch ticket still available?" },
    { cookie: buyer.cookie },
  );
  const conversationId = opened.json?.conversationId ?? null;
  check("the buyer opens a thread", Boolean(conversationId), JSON.stringify(opened.json));

  entries = await outboxEntries();
  const sellerNudge = latest(entries, "message", sellerEmail);
  check("the seller is told a message is waiting", delivered(sellerNudge), sellerNudge?.outcome ?? "missing");
  check("the notice previews the message", sellerNudge?.text?.includes("launch ticket") === true);

  await post("/api/messages", { conversationId, body: "Yes — I can do five tickets." }, { cookie: seller.cookie });
  await post("/api/messages", { conversationId, body: "Shall I send a payment request?" }, { cookie: seller.cookie });

  entries = await outboxEntries();
  const buyerMessages = entries.filter((entry) => entry.kind === "message" && entry.to === buyerEmail);
  check(
    "a quiet thread earns one notice, never one per message",
    buyerMessages.length === 1,
    `${buyerMessages.length} notices`,
  );

  const request = await post(
    "/api/messages/payment-requests",
    { conversationId, amountMinor: 2500000, description: "Five launch tickets", listingId: null },
    { cookie: seller.cookie },
  );
  const requestId = request.json?.message?.paymentRequest?.id ?? null;
  check("the seller sends a payment request", Boolean(requestId), JSON.stringify(request.json));

  entries = await outboxEntries();
  const asked = latest(entries, "payment-request", buyerEmail);
  check("the buyer is emailed the payment request", delivered(asked), asked?.outcome ?? "missing");
  check("the request names who asked", (asked?.html ?? "").includes(STORE_NAME) === true);
  check("the request states the amount", (asked?.text ?? "").includes("25,000") === true);
  check("the request opens in the conversation on the production host", (asked?.html ?? "").includes(`${PROD}/messages/${conversationId}`));
  check("the request says nothing has been charged", (asked?.text ?? "").toLowerCase().includes("nothing has been charged"));

  const cancel = await patch(
    "/api/messages/payment-requests",
    { paymentRequestId: requestId, action: "cancel" },
    { cookie: seller.cookie },
  );
  check("the seller withdraws the request", cancel.response.status === 200, `status ${cancel.response.status}`);

  entries = await outboxEntries();
  const withdrawn = latest(entries, "payment-cancelled", buyerEmail);
  check("the buyer is told the request was cancelled", delivered(withdrawn), withdrawn?.outcome ?? "missing");

  await patch("/api/messages/payment-requests", { paymentRequestId: requestId, action: "cancel" }, { cookie: seller.cookie });
  entries = await outboxEntries();
  check(
    "a repeated cancel cannot send a second notice",
    entries.filter((entry) => entry.kind === "payment-cancelled").length === 1,
    `${entries.filter((entry) => entry.kind === "payment-cancelled").length} notices`,
  );

  /* -- 3. A delivery failure never touches the thread --------------------- */
  console.log("\nFailure isolation");
  await write([{ sql: "UPDATE users SET email = ? WHERE id = ?", args: ["broken-address-without-at", buyer.userId] }]);

  // A genuinely new thread: one thread per buyer and store, so this must be
  // opened against the listing — and the quiet-thread rule must see it quiet.
  const newThread = await post(
    "/api/messages",
    { listingId, body: "A fresh thread for the failure test." },
    { cookie: buyer.cookie },
  );
  const brokenThread = newThread.json?.conversationId ?? null;
  check("the failure test gets its own quiet thread", Boolean(brokenThread) && brokenThread !== conversationId);
  await post("/api/messages", { conversationId: brokenThread, body: "Are you there?" }, { cookie: seller.cookie });

  const stillThere = await db.execute({
    sql: "SELECT COUNT(*) AS total FROM messages WHERE conversation_id = ? AND sender_user_id = ?",
    args: [brokenThread, seller.userId],
  });
  check("the message itself is still delivered when mail fails", Number(stillThere.rows[0].total) >= 1);

  entries = await outboxEntries();
  const failed = entries.find((entry) => entry.kind === "message" && entry.outcome === "failed");
  check("the failed send is captured and reported, not swallowed", Boolean(failed), "no failed entry");

  await write([{ sql: "UPDATE users SET email = ? WHERE id = ?", args: [buyerEmail, buyer.userId] }]);

  /* -- 4. Password reset and change ---------------------------------------
     After the chat flows: a completed reset revokes every session, and the
     buyer's cookie above is spent by design. */
  console.log("\nSecurity emails");
  const forgot = await post("/api/auth/request-password-reset", { email: buyerEmail });
  check("a password reset can be requested", forgot.response.status === 200, `status ${forgot.response.status}`);

  entries = await outboxEntries();
  const reset = latest(entries, "password-reset", buyerEmail);
  check("the reset email arrives", delivered(reset), reset?.outcome ?? "missing");
  check("the reset link points at the production reset screen", (reset?.html ?? "").includes(`${PROD}/reset-password?token=`));
  check("the reset email is single-use and time-limited", /once|expires/i.test(reset?.text ?? ""));
  check("no reset email link is a localhost link", !(reset?.html ?? "").includes("localhost"));

  // The link is the credential — use exactly the token the email carried.
  const token = decodeURIComponent((reset?.html ?? "").match(/reset-password\?token=([^"&]+)/)?.[1] ?? "");
  const changed = await post("/api/auth/reset-password", { token, newPassword: `pw-${stamp}-x2` });
  check("the password can be reset with the emailed token", changed.response.status === 200, `status ${changed.response.status}`);

  entries = await outboxEntries();
  const notice = latest(entries, "password-changed", buyerEmail);
  check("a completed reset announces itself", delivered(notice), notice?.outcome ?? "missing");
  check("the change notice warns about unrecognised changes", /If (this|it) was not you/i.test(notice?.text ?? ""));

  /* -- 5. The money emails, against real rows ----------------------------- */
  console.log("\nOrder and money emails (dev audit route, real rows)");
  await seedCommerce();

  const fire = async (body) => {
    const r = await post("/api/dev/email-audit", body);
    return r;
  };

  const food = await fire({ event: "invoice", orderId: foodOrderId });
  check("the food order invoice sends", food.response.status === 200 && food.json?.sent === true, JSON.stringify(food.json));

  entries = await outboxEntries();
  const foodMail = latest(entries, "invoice", buyerEmail);
  check("a food order reads like a food order", foodMail?.subject?.startsWith("Your food order is confirmed") === true, foodMail?.subject ?? "missing");
  check("it lists what was bought", (foodMail?.text ?? "").includes("Jollof Rice & Chicken") && (foodMail?.text ?? "").includes("Chapman"));
  check("it states the total paid", (foodMail?.text ?? "").includes("Total paid") && (foodMail?.text ?? "").includes("4,500"));
  check("it confirms the payment", (foodMail?.html ?? "").includes("Paid"));
  check("its CTA is the production order page", (foodMail?.html ?? "").includes(`${PROD}/orders/emf-${stamp}`));

  const tickets = await fire({ event: "tickets", orderId: ticketOrderId });
  check("the ticket email sends", tickets.response.status === 200 && tickets.json?.sent === true, JSON.stringify(tickets.json));

  entries = await outboxEntries();
  const ticketMail = latest(entries, "tickets", buyerEmail);
  const codesInMail = (ticketMail?.text ?? "").match(/LS-EMTICKET\d/g) ?? [];
  check("five tickets are five tickets in the email", new Set(codesInMail).size === 5, `${new Set(codesInMail).size} codes`);
  check("the email numbers the tickets", (ticketMail?.html ?? "").includes("Ticket 5 of 5"));
  check("each ticket code is printable without images", (ticketMail?.text ?? "").includes("LS-EMTICKET4"));

  const completed = await fire({ event: "order-completed", orderId: doneOrderId });
  const completedAgain = await fire({ event: "order-completed", orderId: doneOrderId });
  check("the completion email sends", completed.response.status === 200, JSON.stringify(completed.json));

  entries = await outboxEntries();
  const doneMail = latest(entries, "order-completed", buyerEmail);
  check("completion says completed", doneMail?.subject?.startsWith("Your order is completed") === true, doneMail?.subject ?? "missing");
  check(
    "two triggers of the same completion send one email",
    entries.filter((entry) => entry.kind === "order-completed" && entry.outcome === "sent").length === 1 &&
      completedAgain.response.status === 200,
  );

  await fire({ event: "order-cancelled", orderId: cancelOrderId });
  entries = await outboxEntries();
  const cancelMail = latest(entries, "order-cancelled", buyerEmail);
  check("cancellation tells the buyer nothing was charged", (cancelMail?.text ?? "").includes("Nothing has been charged"));
  check("the cancellation subject is plain", cancelMail?.subject?.startsWith("Your order was cancelled") === true);

  await fire({ event: "refund", orderId: refundOrderId });
  entries = await outboxEntries();
  const refundMail = latest(entries, "refund", buyerEmail);
  const refundSellerMail = latest(entries, "refund-seller", sellerEmail);
  check("the buyer hears about the refund", delivered(refundMail), refundMail?.outcome ?? "missing");
  check("the seller hears about the same refund", delivered(refundSellerMail), refundSellerMail?.outcome ?? "missing");
  check("the refund says where the money goes", (refundMail?.text ?? "").includes("payment method"));

  await fire({ event: "seller-order", orderId: foodOrderId });
  entries = await outboxEntries();
  const sellerMail = latest(entries, "seller-order", sellerEmail);
  check("the seller hears about the new paid order", delivered(sellerMail), sellerMail?.outcome ?? "missing");
  check("the seller notice speaks food for food", sellerMail?.subject?.startsWith("New food order") === true, sellerMail?.subject ?? "missing");
  check("the seller notice goes to the seller alone", latest(entries, "seller-order", buyerEmail) === null);

  await fire({ event: "shipment-update", orderId: refundOrderId });
  entries = await outboxEntries();
  const shipMail = latest(entries, "update", buyerEmail);
  check("a shipping milestone updates the buyer", delivered(shipMail), shipMail?.outcome ?? "missing");
  check("the update never pretends at live GPS", (shipMail?.text ?? "").includes("does not use live GPS"));

  await fire({ event: "payout", payoutId });
  entries = await outboxEntries();
  const payoutMail = latest(entries, "payout", sellerEmail);
  check("a payout request confirms to the seller", delivered(payoutMail), payoutMail?.outcome ?? "missing");
  check("the payout email masks the account number", !(payoutMail?.html ?? "").includes("0123456789") && (payoutMail?.text ?? "").includes("••••6789"));
  check("the payout email claims no money has moved", /review/i.test(payoutMail?.text ?? ""));

  await fire({ event: "event-update", eventId });
  entries = await outboxEntries();
  const eventMail = latest(entries, "event-update", buyerEmail);
  check("ticket holders hear when the night moves", delivered(eventMail), eventMail?.outcome ?? "missing");
  check("the event notice names the event", eventMail?.subject?.includes("LinkStore Launch Night") === true);
  check("the event notice links the production event page", (eventMail?.html ?? "").includes(`${PROD}/events/${eventId}`));
  check(
    "five tickets in one name earn one notice, not five",
    entries.filter((entry) => entry.kind === "event-update").length === 1,
    `${entries.filter((entry) => entry.kind === "event-update").length} notices`,
  );

  /* -- 6. Platform-wide guarantees --------------------------------------- */
  console.log("\nPlatform-wide checks");
  entries = await outboxEntries();

  const localhostHits = entries.filter((entry) => `${entry.html}${entry.text}`.includes("localhost"));
  check("no email ever contains a localhost link", localhostHits.length === 0, `${localhostHits.length} emails`);

  const missingLogo = entries.filter((entry) => !entry.html.includes(`${PROD}/brand/link-mark.png`));
  check("every email wears the LINK STORE mark", missingLogo.length === 0, `${missingLogo.length} emails`);

  const missingFooter = entries.filter((entry) => !entry.html.includes("one link, everything you sell"));
  check("every email carries the shared footer", missingFooter.length === 0, `${missingFooter.length} emails`);

  const missingText = entries.filter((entry) => !entry.text || entry.text.trim().length === 0);
  check("every email has a plain-text counterpart", missingText.length === 0, `${missingText.length} emails`);

  const rows = await db.execute({
    sql: `SELECT dedupe_key, COUNT(*) AS n FROM email_deliveries
           WHERE dedupe_key IS NOT NULL AND status = 'sent'
           GROUP BY dedupe_key HAVING n > 1`,
    args: [],
  });
  check("no dedupe key ever sent twice", rows.rows.length === 0, `${rows.rows.length} duplicated keys`);

  const recorded = await db.execute({
    sql: "SELECT status, COUNT(*) AS n FROM email_deliveries WHERE recipient IN (?, ?) GROUP BY status",
    args: [sellerEmail, buyerEmail],
  });
  const summary = recorded.rows.map((row) => `${row.status}: ${row.n}`).join(", ");
  console.log(`\n  provider outcomes for this run — ${summary || "none"}`);
} finally {
  await cleanup();
  await db.close();
}

console.log(`\n${checked - failures.length}/${checked} checks passed`);
if (failures.length > 0) {
  console.log("\nFailures:");
  for (const failure of failures) console.log(`  ✗ ${failure}`);
  process.exitCode = 1;
} else {
  console.log("Email system audit passed.");
}
