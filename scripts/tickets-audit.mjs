/**
 * Ticket audit — individual tickets, the inventory, the trash, and QR validation.
 *
 * Runs against the live app over HTTP (server actions are invoked exactly as the
 * browser does, resolved from the server-reference manifest), with fixtures that
 * mirror what fulfilment writes when a payment is verified: one paid order, one
 * order line, and **one ticket row per admission**, each with its own code.
 *
 * What it proves, end to end:
 *   1. individual tickets — five admissions are five records with five codes;
 *   2. the inventory is the holder's own — another account sees nothing of it;
 *   3. search runs against the event, the type, the code and the order number;
 *   4. a live ticket cannot be trashed; a spent one can, and recovery returns the
 *      same row (never a copy);
 *   5. one account cannot trash another account's ticket;
 *   6. the door: the owning seller validates a code once, a second scan is
 *      refused, the other four tickets stay valid, another store's owner cannot
 *      verify at all, and a forged code matches nothing;
 *   7. buying tickets creates the order server-side and never fakes a payment;
 *   8. a ticket can never be added to the cart.
 *
 *   node scripts/tickets-audit.mjs [baseUrl]
 */

import { createClient } from "@libsql/client";
import { readFileSync } from "node:fs";
import path from "node:path";

import { loadEnv, projectRoot, resolveDatabase } from "./load-env.mjs";

const BASE = process.argv[2] ?? "http://localhost:5000";
loadEnv();
const { url, authToken } = resolveDatabase();
const db = createClient(authToken ? { url, authToken } : { url });

const stamp = Date.now().toString(36);
const failures = [];
let checked = 0;

const now = new Date().toISOString();
const past = new Date(Date.now() - 86_400_000).toISOString();

const seller1Email = `tk-seller1-${stamp}@example.com`;
const seller2Email = `tk-seller2-${stamp}@example.com`;
const buyerAEmail = `tk-buyer-a-${stamp}@example.com`;
const buyerBEmail = `tk-buyer-b-${stamp}@example.com`;

const store1 = `str_tk1_${stamp}`;
const store2 = `str_tk2_${stamp}`;
const event1 = `evt_tk1_${stamp}`;
const entryType = `tkt_tk_entry_${stamp}`;
const vipType = `tkt_tk_vip_${stamp}`;
const orderId = `ord_tk_${stamp}`;
const orderItemId = `oit_tk_${stamp}`;
const ticketCodes = Array.from({ length: 5 }, (_, index) => `LS-TK${stamp.slice(-4).toUpperCase()}${index + 1}`);
const ticketIds = ticketCodes.map((_, index) => `tix_tk_${index}_${stamp}`);

let seller1 = null;
let seller2 = null;
let buyerA = null;
let buyerB = null;

function check(label, condition, detail = "") {
  checked += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
  console.log(`${condition ? " ok " : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

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
  return { response, text: await response.text() };
}

/** Register → read the code from the database → verify → session cookie. */
async function signUp(name, email) {
  let r = await post("/api/auth/sign-up/email", { email, password: `pw-${stamp}-x1`, name });
  if (r.response.status !== 200) throw new Error(`sign-up failed: ${r.response.status} ${r.text}`);

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

/** A page render with an identity attached. */
async function getPage(pathname, cookie) {
  const response = await fetch(`${BASE}${pathname}`, {
    headers: cookie ? { cookie } : {},
    redirect: "manual",
  });
  return { status: response.status, html: await response.text() };
}

/** Every server action id, resolved from the manifest the dev server wrote. */
function loadActionIds() {
  const manifestPath = path.join(projectRoot, ".next", "server", "server-reference-manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const byName = new Map();
  for (const [id, entry] of Object.entries(manifest.node ?? {})) {
    for (const match of JSON.stringify(entry).matchAll(/"exportedName":"([^"]+)"/g)) {
      if (!byName.has(match[1])) byName.set(match[1], id);
    }
  }
  return byName;
}

/** Invoke a server action over HTTP, exactly as the browser's form does. */
async function callAction(actionId, args, cookie) {
  const response = await fetch(`${BASE}/tickets`, {
    method: "POST",
    headers: {
      "content-type": "text/plain;charset=UTF-8",
      accept: "text/x-component",
      "Next-Action": actionId,
      cookie,
      origin: BASE,
    },
    body: JSON.stringify(args),
    redirect: "manual",
  });

  const text = await response.text();
  // An action's own result is the *inner* one: `verifyTicketAction` returns an
  // `ok(...)` wrapper around `{ ok, reason }`, so the last `"ok"` in the payload
  // is the answer that matters.
  const okMatches = [...text.matchAll(/"ok":(true|false)/g)];
  const ok = okMatches.length > 0 ? okMatches[okMatches.length - 1][1] : null;
  const error =
    [...text.matchAll(/"error":"([^"]*)"/g)].at(-1)?.[1] ??
    [...text.matchAll(/"message":"([^"]*)"/g)].at(-1)?.[1] ??
    null;
  const reason = text.match(/"reason":"([^"]*)"/)?.[1] ?? null;
  const authorizationUrl = text.match(/"authorizationUrl":"([^"]+)"/)?.[1] ?? null;
  return { status: response.status, ok: ok === "true" ? true : ok === "false" ? false : null, error, reason, authorizationUrl, text };
}

async function seed() {
  seller1 = await signUp("Ticket Seller One", seller1Email);
  seller2 = await signUp("Ticket Seller Two", seller2Email);
  buyerA = await signUp("Ticket Buyer A", buyerAEmail);
  buyerB = await signUp("Ticket Buyer B", buyerBEmail);

  const startsAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
  const endsAt = new Date(Date.now() + 7 * 86_400_000 + 3 * 3_600_000).toISOString();
  const buyerAEmailAddress = buyerAEmail;

  await write([
    {
      sql: `INSERT INTO stores (id, user_id, slug, name, currency, country, is_published, created_at, updated_at)
            VALUES (?, ?, ?, 'Ticketing Shop', 'NGN', 'Nigeria', 1, ?, ?)`,
      args: [store1, seller1.userId, `tk1${stamp}`, now, now],
    },
    { sql: "INSERT INTO store_settings (store_id, updated_at) VALUES (?, ?)", args: [store1, now] },
    {
      sql: `INSERT INTO stores (id, user_id, slug, name, currency, country, is_published, created_at, updated_at)
            VALUES (?, ?, ?, 'Other Shop', 'NGN', 'Nigeria', 1, ?, ?)`,
      args: [store2, seller2.userId, `tk2${stamp}`, now, now],
    },
    { sql: "INSERT INTO store_settings (store_id, updated_at) VALUES (?, ?)", args: [store2, now] },
    {
      sql: `INSERT INTO events (id, store_id, title, slug, description, starts_at, ends_at, venue_name, city, status, created_at, updated_at)
            VALUES (?, ?, 'Audit Night ${stamp}', ?, 'Ticket audit event.', ?, ?, 'Audit Hall', 'Lagos', 'published', ?, ?)`,
      args: [event1, store1, `audit-night-${stamp}`, startsAt, endsAt, now, now],
    },
    {
      sql: `INSERT INTO ticket_types (id, event_id, name, description, price, currency, quantity_total, quantity_sold, max_per_order, is_active, position, created_at)
            VALUES (?, ?, 'Entry', 'General admission', 500000, 'NGN', 100, 5, 10, 1, 0, ?)`,
      args: [entryType, event1, now],
    },
    {
      sql: `INSERT INTO ticket_types (id, event_id, name, description, price, currency, quantity_total, quantity_sold, max_per_order, is_active, position, created_at)
            VALUES (?, ?, 'VIP', 'Front row', 1500000, 'NGN', 10, 0, 4, 1, 1, ?)`,
      args: [vipType, event1, now],
    },
    // A paid ticket order, written the way fulfilment writes it: one order, one
    // line of five, and one ticket row per admission.
    {
      sql: `INSERT INTO orders (id, order_number, store_id, customer_id, user_id, email, customer_name, currency,
              subtotal, discount_total, shipping_total, tax_total, total, status, payment_status, access_token,
              source, fulfilment_method, receipt_code, created_at, updated_at, paid_at)
            VALUES (?, ?, ?, NULL, ?, ?, 'Ticket Buyer A', 'NGN', 2500000, 0, 0, 0, 2500000, 'paid', 'paid',
              ?, 'tickets', 'none', ?, ?, ?, ?)`,
      args: [orderId, `TK-${stamp.toUpperCase()}`, store1, buyerA.userId, buyerAEmailAddress, `acctok${stamp}`, `RC-TK${stamp}`, now, now, now],
    },
    {
      sql: `INSERT INTO order_items (id, order_id, item_type, listing_id, variant_id, ticket_type_id, event_id, title,
              unit_price, quantity, total, currency, fulfilment_status, created_at)
            VALUES (?, ?, 'ticket', NULL, NULL, ?, ?, 'Audit Night · Entry', 500000, 5, 2500000, 'NGN', 'fulfilled', ?)`,
      args: [orderItemId, orderId, entryType, event1, now],
    },
    ...ticketCodes.map((code, index) => ({
      sql: `INSERT INTO tickets (id, order_id, order_item_id, event_id, ticket_type_id, store_id, code, holder_name, holder_email, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'Ticket Buyer A', ?, 'valid', ?)`,
      args: [ticketIds[index], orderId, orderItemId, event1, entryType, store1, code, buyerAEmailAddress, now],
    })),
  ]);
}

async function cleanup() {
  const statements = [
    { sql: "DELETE FROM tickets WHERE store_id IN (?, ?)", args: [store1, store2] },
    { sql: "DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE store_id IN (?, ?))", args: [store1, store2] },
    { sql: "DELETE FROM orders WHERE store_id IN (?, ?)", args: [store1, store2] },
    { sql: "DELETE FROM cart_items WHERE cart_id IN (SELECT id FROM carts WHERE user_id IN (?, ?, ?, ?))", args: [seller1?.userId, seller2?.userId, buyerA?.userId, buyerB?.userId].map((value) => value ?? "") },
    { sql: "DELETE FROM carts WHERE user_id IN (?, ?, ?, ?)", args: [seller1?.userId, seller2?.userId, buyerA?.userId, buyerB?.userId].map((value) => value ?? "") },
    { sql: "DELETE FROM ticket_types WHERE event_id IN (?, ?)", args: [event1, `${event1}_none`] },
    { sql: "DELETE FROM events WHERE id = ?", args: [event1] },
    { sql: "DELETE FROM listings WHERE store_id IN (?, ?)", args: [store1, store2] },
    { sql: "DELETE FROM customers WHERE store_id IN (?, ?)", args: [store1, store2] },
    { sql: "DELETE FROM store_settings WHERE store_id IN (?, ?)", args: [store1, store2] },
    { sql: "DELETE FROM stores WHERE id IN (?, ?)", args: [store1, store2] },
  ];

  for (const account of [seller1, seller2, buyerA, buyerB]) {
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

try {
  await seed();

  // Compile the surfaces that own these actions, so their ids are registered.
  await getPage("/tickets", buyerA.cookie);
  await getPage(`/events/${event1}`, buyerA.cookie);
  await getPage(`/workspace/events/${event1}/check-in`, seller1.cookie);
  await getPage("/listing/x", buyerA.cookie);

  const actions = loadActionIds();
  const need = (name) => {
    const id = actions.get(name);
    if (!id) throw new Error(`action ${name} is not in the server-reference manifest`);
    return id;
  };

  // --- 1. Individual tickets in the holder's inventory -------------------
  const inventoryA = await getPage("/tickets", buyerA.cookie);
  check("the inventory renders for the holder", inventoryA.status === 200, `status ${inventoryA.status}`);
  const shown = ticketCodes.filter((code) => inventoryA.html.includes(code));
  check("all five individual tickets are listed", shown.length === 5, `${shown.length}/5`);

  const dbCodes = await db.execute({
    sql: "SELECT DISTINCT code FROM tickets WHERE order_id = ?",
    args: [orderId],
  });
  check(
    "five admissions are five distinct ticket records",
    dbCodes.rows.length === 5 && new Set(dbCodes.rows.map((row) => String(row.code))).size === 5,
    `${dbCodes.rows.length} rows`,
  );

  // --- 2. Another account sees none of it --------------------------------
  const inventoryB = await getPage("/tickets", buyerB.cookie);
  check("another account sees no ticket of that order", !ticketCodes.some((code) => inventoryB.html.includes(code)));
  check("another account is told it has none", inventoryB.html.includes("No tickets yet"));
  const guestView = await getPage("/tickets", null);
  check("the inventory asks a guest to sign in", guestView.html.includes("Sign in to see your tickets"));

  // --- 3. Search is the database's ---------------------------------------
  const byEvent = await getPage("/tickets?q=Audit%20Night", buyerA.cookie);
  check("search finds tickets by event name", ticketCodes.every((code) => byEvent.html.includes(code)));
  const byType = await getPage("/tickets?q=Entry", buyerA.cookie);
  check("search finds tickets by ticket type", ticketCodes.every((code) => byType.html.includes(code)));
  const byCode = await getPage(`/tickets?q=${ticketCodes[2]}`, buyerA.cookie);
  check(
    "search finds one ticket by its code",
    byCode.html.includes(ticketCodes[2]) && !byCode.html.includes(ticketCodes[3]),
  );
  const byOrder = await getPage(`/tickets?q=TK-${stamp.toUpperCase()}`, buyerA.cookie);
  check("search finds tickets by order number", ticketCodes.every((code) => byOrder.html.includes(code)));
  const noMatch = await getPage("/tickets?q=nothing-matches-this", buyerA.cookie);
  check("a search with no matches says so", noMatch.html.includes("No tickets match that search"));

  // --- 4. A live ticket is not trashable; a spent one is ----------------
  const liveTrash = await callAction(need("trashTicketAction"), [ticketIds[0]], buyerA.cookie);
  check("a still-valid ticket is refused by the trash", liveTrash.ok === false && /still valid/i.test(liveTrash.error ?? ""), `${liveTrash.ok} ${liveTrash.error}`);
  check("the live ticket keeps its place", (await getPage("/tickets", buyerA.cookie)).html.includes(ticketCodes[0]));

  // The event has now happened — the same tickets are spent, and the page says so.
  await write([
    {
      sql: "UPDATE events SET starts_at = ?, ends_at = ? WHERE id = ?",
      args: [past, past, event1],
    },
  ]);

  const spentView = await getPage("/tickets", buyerA.cookie);
  check("a spent ticket offers Delete", spentView.html.includes(">Delete<"));

  const trashed = await callAction(need("trashTicketAction"), [ticketIds[0]], buyerA.cookie);
  check("a spent ticket can be trashed", trashed.ok === true, `${trashed.ok} ${trashed.error}`);

  const afterTrash = await getPage("/tickets", buyerA.cookie);
  check("a trashed ticket leaves the inventory", !afterTrash.html.includes(ticketCodes[0]));
  check("the other four tickets stay", ticketCodes.slice(1).every((code) => afterTrash.html.includes(code)));

  const trashView = await getPage("/tickets?trash=1", buyerA.cookie);
  check("the trash lists the trashed ticket", trashView.html.includes(ticketCodes[0]));
  check("the trash does not list the live ones", !trashView.html.includes(ticketCodes[3]));
  const trashSearch = await getPage(`/tickets?trash=1&q=${ticketCodes[0]}`, buyerA.cookie);
  check("the trash has its own working search", trashSearch.html.includes(ticketCodes[0]));
  const trashMiss = await getPage("/tickets?trash=1&q=zzz-nothing", buyerA.cookie);
  check("a trash search with no matches says so", trashMiss.html.includes("No tickets match that search"));

  const preserved = await db.execute({
    sql: "SELECT code, order_id, event_id, store_id, status, holder_email, deleted_at FROM tickets WHERE id = ?",
    args: [ticketIds[0]],
  });
  const preservedRow = preserved.rows[0];
  check(
    "trashing preserves every fact about the ticket",
    preservedRow &&
      String(preservedRow.code) === ticketCodes[0] &&
      String(preservedRow.order_id) === orderId &&
      String(preservedRow.event_id) === event1 &&
      String(preservedRow.holder_email) === buyerAEmail &&
      preservedRow.deleted_at !== null,
    JSON.stringify(preservedRow ?? null).slice(0, 200),
  );

  // --- 5. Recovery returns the same row ---------------------------------
  const restored = await callAction(need("restoreTicketAction"), [ticketIds[0]], buyerA.cookie);
  check("a trashed ticket can be recovered", restored.ok === true, `${restored.ok} ${restored.error}`);

  const afterRestore = await getPage("/tickets", buyerA.cookie);
  check("the recovered ticket is back in the inventory", afterRestore.html.includes(ticketCodes[0]));
  const trashAfterRestore = await getPage("/tickets?trash=1", buyerA.cookie);
  check("the trash is empty again", !trashAfterRestore.html.includes(ticketCodes[0]));

  const countAfter = await db.execute({
    sql: "SELECT COUNT(*) AS total FROM tickets WHERE order_id = ?",
    args: [orderId],
  });
  check("recovery duplicates nothing — still five tickets", Number(countAfter.rows[0].total) === 5);

  // --- 6. One account cannot trash another's ticket ---------------------
  const foreignTrash = await callAction(need("trashTicketAction"), [ticketIds[1]], buyerB.cookie);
  check("another account cannot trash that ticket", foreignTrash.ok === false && /not in your inventory/i.test(foreignTrash.error ?? ""), `${foreignTrash.ok} ${foreignTrash.error}`);
  const untouched = await db.execute({
    sql: "SELECT deleted_at FROM tickets WHERE id = ?",
    args: [ticketIds[1]],
  });
  check("the refused trashing changed nothing", untouched.rows[0]?.deleted_at === null);

  // --- 7. The door: server-side validation, exactly once ----------------
  // The event is back in the future: these are live admissions again, which is
  // the state the door actually sees.
  const futureStart = new Date(Date.now() + 7 * 86_400_000).toISOString();
  const futureEnd = new Date(Date.now() + 7 * 86_400_000 + 3 * 3_600_000).toISOString();
  await write([
    { sql: "UPDATE events SET starts_at = ?, ends_at = ? WHERE id = ?", args: [futureStart, futureEnd, event1] },
  ]);

  const wrongStore = await callAction(
    need("verifyTicketAction"),
    [{ eventId: event1, code: ticketCodes[0] }],
    seller2.cookie,
  );
  check(
    "another store's owner cannot verify this event's ticket",
    wrongStore.ok === false && /not in your store/i.test(wrongStore.error ?? ""),
    `${wrongStore.ok} ${wrongStore.error}`,
  );

  const firstScan = await callAction(
    need("verifyTicketAction"),
    [{ eventId: event1, code: ticketCodes[0] }],
    seller1.cookie,
  );
  check("the owning seller admits the ticket", firstScan.ok === true, `${firstScan.ok} ${firstScan.error}`);

  const secondScan = await callAction(
    need("verifyTicketAction"),
    [{ eventId: event1, code: ticketCodes[0] }],
    seller1.cookie,
  );
  check(
    "a second scan of the same ticket is refused",
    secondScan.ok === false && secondScan.reason === "already_used",
    `${secondScan.ok} ${secondScan.reason}`,
  );

  const forged = await callAction(
    need("verifyTicketAction"),
    [{ eventId: event1, code: "LS-00000000" }],
    seller1.cookie,
  );
  check("a forged code matches nothing", forged.ok === false && forged.reason === "not_found", `${forged.reason}`);

  const remainingValid = await db.execute({
    sql: "SELECT COUNT(*) AS total FROM tickets WHERE order_id = ? AND status = 'valid'",
    args: [orderId],
  });
  check("the other four tickets are untouched by that scan", Number(remainingValid.rows[0].total) === 4);

  const usedRow = await db.execute({
    sql: "SELECT status, checked_in_at FROM tickets WHERE id = ?",
    args: [ticketIds[0]],
  });
  check(
    "the used ticket is recorded as used, with a timestamp",
    String(usedRow.rows[0]?.status) === "used" && usedRow.rows[0]?.checked_in_at !== null,
  );

  const secondAdmission = await callAction(
    need("verifyTicketAction"),
    [{ eventId: event1, code: ticketCodes[1] }],
    seller1.cookie,
  );
  check("a different ticket from the same order still admits", secondAdmission.ok === true, `${secondAdmission.error}`);

  // --- 8. Buying tickets: its own flow, real server-side order ----------
  const purchase = await callAction(
    need("startTicketCheckoutAction"),
    [
      {
        eventId: event1,
        items: [{ ticketTypeId: entryType, quantity: 3 }],
        email: buyerAEmail,
        name: "Ticket Buyer A",
        phone: null,
        note: null,
      },
    ],
    buyerA.cookie,
  );

  // The payment attempt must be truthful in whichever state the gateway is
  // in: a real handoff to Paystack's checkout when the key works, an honest
  // refusal — "can't take payments" when no key is configured, the provider's
  // own error when one is rejected. What must never appear is a success the
  // server did not verify.
  const handedToGateway =
    purchase.ok === true && /^https:\/\/checkout\.paystack\.com\//.test(purchase.authorizationUrl ?? "");
  const refusedHonestly = purchase.ok === false && Boolean((purchase.error ?? "").trim());
  check(
    "a ticket purchase creates an order and never fakes a payment",
    handedToGateway || refusedHonestly,
    `${purchase.ok} ${purchase.error ?? purchase.text.slice(0, 300)}`,
  );

  const bought = await db.execute({
    sql: `SELECT o.id, o.total, o.fulfilment_method, o.payment_status, o.user_id, o.source,
                 (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS lines,
                 (SELECT COUNT(*) FROM tickets t WHERE t.order_id = o.id) AS tickets
            FROM orders o WHERE o.store_id = ? AND o.id != ? ORDER BY o.created_at DESC LIMIT 1`,
    args: [store1, orderId],
  });
  const boughtRow = bought.rows[0];
  check(
    "the order is priced server-side from the database",
    boughtRow && Number(boughtRow.total) === 3 * 500000,
    JSON.stringify(boughtRow ?? null).slice(0, 200),
  );
  check(
    "the order belongs to the buyer and needs no fulfilment",
    boughtRow && String(boughtRow.user_id) === buyerA.userId && String(boughtRow.fulfilment_method) === "none",
  );
  check("no ticket is issued before the payment is verified", Number(boughtRow?.tickets ?? -1) === 0);
  check("unpaid until Paystack confirms", String(boughtRow?.payment_status) !== "paid");

  const tooMany = await callAction(
    need("startTicketCheckoutAction"),
    [
      {
        eventId: event1,
        items: [{ ticketTypeId: vipType, quantity: 99 }],
        email: buyerAEmail,
        name: null,
        phone: null,
        note: null,
      },
    ],
    buyerA.cookie,
  );
  check(
    "a quantity beyond the per-order limit is refused server-side",
    tooMany.ok === false && /up to/i.test(tooMany.error ?? ""),
    `${tooMany.ok} ${tooMany.error}`,
  );

  const noTickets = await callAction(
    need("startTicketCheckoutAction"),
    [{ eventId: event1, items: [], email: buyerAEmail, name: null, phone: null, note: null }],
    buyerA.cookie,
  );
  check("an empty ticket purchase is refused", noTickets.ok === false, `${noTickets.ok} ${noTickets.error}`);

  // --- 9. Tickets never enter the cart ---------------------------------
  const cartTicket = await callAction(
    need("addToCartAction"),
    [{ ticketTypeId: entryType, quantity: 2 }],
    buyerA.cookie,
  );
  check(
    "adding a ticket to the cart is refused",
    cartTicket.ok === false && /not through the cart/i.test(cartTicket.error ?? ""),
    `${cartTicket.ok} ${cartTicket.error}`,
  );

  const cartRows = await db.execute({
    sql: `SELECT COUNT(*) AS total FROM cart_items ci
            JOIN carts c ON c.id = ci.cart_id
           WHERE c.user_id = ? AND ci.ticket_type_id IS NOT NULL`,
    args: [buyerA.userId],
  });
  check("no ticket line exists in the cart", Number(cartRows.rows[0].total) === 0);
} catch (error) {
  failures.push(`threw: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
} finally {
  await cleanup();
}

console.log(`\nchecked ${checked} ticket assertions`);
if (failures.length > 0) {
  console.error(`\n${failures.length} failure(s):`);
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}
console.log("the whole ticket lifecycle holds");
