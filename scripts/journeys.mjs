/**
 * Journey tests — the real user flows of this pass, over HTTP, against live
 * database data.
 *
 * Covers, in order:
 *   1. Register → verify → signed in (the real OTP journey; dev has no mailbox,
 *      so the code is read from the `verification` table).
 *   2. Shop experience: only real sections, primary design type leads, the
 *      design type override in settings changes the lead section.
 *   3. Messaging: buyer opens a thread with a shop, both sides persist across
 *      refreshes, the thread renders as the full-screen experience.
 *   4. Marketplace browsing renders the rearrangement grid.
 *
 * Everything it creates is deleted at the end (including on failure).
 *
 *   node scripts/journeys.mjs [baseUrl]
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
  return { response, text: await response.text() };
}

/** Register → send code → read it from the database → verify → session cookie. */
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
  const sessionCookie = setCookie
    .map((value) => value.split(";")[0])
    .find((value) => value.includes("better-auth.session_token"));
  if (!sessionCookie) throw new Error(`no session cookie for ${email}`);

  const user = await db.execute({ sql: "SELECT id FROM users WHERE email = ?", args: [email] });
  return { userId: String(user.rows[0].id), cookie: sessionCookie };
}

function check(label, condition, detail = "") {
  checked += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}

async function getPage(path, cookie) {
  const response = await fetch(`${BASE}${path}`, {
    headers: cookie ? { cookie } : {},
    redirect: "manual",
  });
  return { status: response.status, html: await response.text() };
}

const sellerEmail = `journey-seller-${stamp}@example.com`;
const buyerEmail = `journey-buyer-${stamp}@example.com`;
const handle = `journey${stamp}`;
const storeId = `str_journey_${stamp}`;
const now = new Date().toISOString();

let seller = null;
let buyer = null;

try {
  // --- 1. Two real accounts, one real shop -------------------------------
  seller = await signUp("Journey Seller", sellerEmail);
  buyer = await signUp("Journey Buyer", buyerEmail);

  await write([
    {
      sql: `INSERT INTO stores (id, user_id, slug, name, tagline, currency, country, is_published, created_at, updated_at)
            VALUES (?, ?, ?, 'Journey Shop', 'Sections and messages', 'NGN', 'Nigeria', 1, ?, ?)`,
      args: [storeId, seller.userId, handle, now, now],
    },
    { sql: "INSERT INTO store_settings (store_id, updated_at) VALUES (?, ?)", args: [storeId, now] },
  ]);

  const catId = (name) => `cat_j_${name}_${stamp}`.toLowerCase();
  const listing = (id, type, title, categoryId) => ({
    sql: `INSERT INTO listings
            (id, store_id, category_id, type, fulfilment, title, slug, description, currency, price,
             track_inventory, stock, status, published_at, created_at, updated_at)
          VALUES (?, ?, ?, ?, 'shipping', ?, ?, 'Journey listing.', 'NGN', 100000, 0, 5, 'active', ?, ?, ?)`,
    args: [id, storeId, categoryId, type, title, `${id}`, now, now, now],
  });

  await write([
    {
      sql: `INSERT INTO categories (id, store_id, name, slug, kind, position, created_at) VALUES
            (?, ?, 'Meals', 'meals', 'food', 0, ?),
            (?, ?, 'Snacks', 'snacks', 'food', 1, ?),
            (?, ?, 'Lighting', 'lighting', 'product', 2, ?),
            (?, ?, 'Repairs', 'repairs', 'service', 3, ?)`,
      args: [
        catId("meals"), storeId, now,
        catId("snacks"), storeId, now,
        catId("lighting"), storeId, now,
        catId("repairs"), storeId, now,
      ],
    },
    listing(`lst_j_food_a_${stamp}`, "food", "Journey Jollof", catId("meals")),
    listing(`lst_j_food_b_${stamp}`, "food", "Journey Puff", catId("snacks")),
    listing(`lst_j_prod_${stamp}`, "physical", "Journey Lamp", catId("lighting")),
    listing(`lst_j_serv_${stamp}`, "service", "Journey Repairs", catId("repairs")),
    {
      sql: `INSERT INTO events (id, store_id, title, slug, description, starts_at, city, status, created_at, updated_at)
            VALUES (?, ?, 'Journey Night', ?, 'Journey event.', ?, 'Lagos', 'published', ?, ?)`,
      args: [`evt_j_${stamp}`, storeId, `journey-night-${stamp}`, new Date(Date.now() + 7 * 86400000).toISOString(), now, now],
    },
    {
      sql: `INSERT INTO ticket_types (id, event_id, name, price, currency, quantity_total, created_at)
            VALUES (?, ?, 'Entry', 500000, 'NGN', 20, ?)`,
      args: [`tkt_j_${stamp}`, `evt_j_${stamp}`, now],
    },
  ]);

  // --- 2. The shop experience -------------------------------------------
  let page = await getPage(`/@${handle}`);
  check("shop renders", page.status === 200, `status ${page.status}`);
  check("shop has the section selector", page.html.includes(`Sections of Journey Shop`));
  for (const label of ["Food", "Products", "Services", "Events"]) {
    check(`shop shows only real sections (${label})`, page.html.includes(`>${label}<span`));
  }
  check(
    "primary design type leads (Food first)",
    /aria-pressed="true"[^>]*>Food</.test(page.html),
    "the active chip is not Food",
  );
  check("cards are rearrangeable", page.html.includes("data-rearrange-key"));
  check(
    "welcome line names the section",
    page.html.includes("Welcome to the Food section of Journey Shop"),
  );

  // The owner steers the lead in settings; every visitor sees the change.
  await write([
    { sql: "UPDATE store_settings SET design_type = 'services' WHERE store_id = ?", args: [storeId] },
  ]);
  page = await getPage(`/@${handle}`);
  check(
    "manual design type override wins (Services leads)",
    /aria-pressed="true"[^>]*>Services</.test(page.html),
    "the active chip is not Services",
  );
  await write([
    { sql: "UPDATE store_settings SET design_type = NULL WHERE store_id = ?", args: [storeId] },
  ]);

  page = await getPage("/workspace/settings", seller.cookie);
  check("settings render signed-in", page.status === 200, `status ${page.status}`);
  check("settings expose Design Type", page.html.includes("Design type"));
  check("settings offer the auto option", page.html.includes("follow what I sell"));

  // --- 3. Messaging, both sides -----------------------------------------
  let r = await post("/api/messages", { storeId, listingId: null, subject: "Question about the shop" }, { cookie: buyer.cookie });
  let parsed = {};
  try {
    parsed = JSON.parse(r.text);
  } catch {
    // handled below
  }
  check("buyer can open a thread", r.response.status === 200 && Boolean(parsed.conversationId), r.text.slice(0, 160));
  const conversationId = parsed.conversationId;

  if (conversationId) {
    r = await post(
      "/api/messages",
      { conversationId, body: "Hello from the journey buyer" },
      { cookie: buyer.cookie },
    );
    check("buyer can send a message", r.response.status === 200, r.text.slice(0, 160));

    // Refresh the thread as the buyer — a message must survive navigation.
    page = await getPage(`/messages/${conversationId}`, buyer.cookie);
    check("thread is a full page", page.status === 200, `status ${page.status}`);
    check("sent message persists", page.html.includes("Hello from the journey buyer"));

    // The shop side sees it too, in the chat system's conversation sidebar.
    page = await getPage("/messages", seller.cookie);
    check("seller sees the thread", page.html.includes("Question about the shop"));
    check("seller sees unread state", page.html.includes("unread"));

    r = await post(
      "/api/messages",
      { conversationId, body: "Reply from the journey shop" },
      { cookie: seller.cookie },
    );
    check("seller can reply", r.response.status === 200, r.text.slice(0, 160));

    page = await getPage(`/messages/${conversationId}`, buyer.cookie);
    check("reply persists for the buyer", page.html.includes("Reply from the journey shop"));

    // Opening a thread twice must return the same thread (no scattering).
    r = await post("/api/messages", { storeId, listingId: null, subject: "Question about the shop" }, { cookie: buyer.cookie });
    try {
      parsed = JSON.parse(r.text);
    } catch {
      parsed = {};
    }
    check("re-opening returns the same thread", parsed.conversationId === conversationId);

    // --- History: one page at a time, in order, never the archive --------
    let history = await fetch(`${BASE}/api/messages?conversationId=${conversationId}`, {
      headers: { cookie: buyer.cookie },
    });
    let pageJson = {};
    try {
      pageJson = await history.json();
    } catch {
      // handled below
    }
    check(
      "history loads one page",
      history.status === 200 && Array.isArray(pageJson.messages),
      `status ${history.status}`,
    );
    check(
      "history is oldest-first and real",
      (pageJson.messages ?? []).length >= 2 &&
        pageJson.messages.every(
          (message, index, all) =>
            typeof message.id === "string" && (index === 0 || all[index - 1].createdAt <= message.createdAt),
        ),
    );

    const messages = pageJson.messages ?? [];
    const [firstMsg, secondMsg] = messages;
    if (secondMsg) {
      history = await fetch(
        `${BASE}/api/messages?conversationId=${conversationId}&before=${secondMsg.id}`,
        { headers: { cookie: buyer.cookie } },
      );
      const earlier = await history.json().catch(() => ({ messages: [] }));
      check(
        "older pages come back in order",
        history.status === 200 && earlier.messages.every((message) => message.createdAt <= secondMsg.createdAt),
      );
    }
    if (firstMsg) {
      history = await fetch(
        `${BASE}/api/messages?conversationId=${conversationId}&after=${firstMsg.id}`,
        { headers: { cookie: buyer.cookie } },
      );
      const after = await history.json().catch(() => ({ messages: [] }));
      check(
        "gap fill returns only what follows",
        after.messages.every((message) => message.id !== firstMsg.id && message.createdAt >= firstMsg.createdAt),
      );
    }

    // Several sends in quick succession: every one confirms, once, in order.
    const sentIds = [];
    for (const word of ["one", "two", "three"]) {
      const out = await post("/api/messages", { conversationId, body: `burst ${word}` }, { cookie: buyer.cookie });
      try {
        sentIds.push(JSON.parse(out.text).message.id);
      } catch {
        sentIds.push(null);
      }
    }
    check("quick sends all confirm", sentIds.every(Boolean), String(sentIds));
    check("quick sends are distinct", new Set(sentIds).size === 3, String(sentIds));

    // A conversation that is not yours is closed — the id proves nothing.
    const outsider = await fetch(`${BASE}/api/messages?conversationId=${conversationId}`, {
      headers: {},
    });
    check("history is not public", outsider.status === 401, `status ${outsider.status}`);
    const bogus = await fetch(`${BASE}/api/messages?conversationId=cnv_nope`, {
      headers: { cookie: buyer.cookie },
    });
    check("a foreign conversation is refused", bogus.status === 403, `status ${bogus.status}`);

    // --- Realtime: a reply is pushed down the stream ---------------------
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const live = await fetch(`${BASE}/api/messages/stream`, {
      headers: { cookie: buyer.cookie, accept: "text/event-stream" },
      signal: controller.signal,
    });
    check(
      "the live channel opens",
      live.status === 200 && (live.headers.get("content-type") ?? "").includes("text/event-stream"),
      `status ${live.status}`,
    );
    await post(
      "/api/messages",
      { conversationId, body: "live from the journey shop" },
      { cookie: seller.cookie },
    );
    const reader = live.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let sawLive = false;
    while (!sawLive) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      sawLive = buffer.includes("live from the journey shop");
    }
    clearTimeout(timer);
    controller.abort();
    check("a reply is pushed over the stream", sawLive, buffer.slice(0, 200));
  }

  // A seller cannot message their own shop — refused at the source.
  r = await post("/api/messages", { storeId, listingId: null, subject: "Talking to myself" }, { cookie: seller.cookie });
  check("self-messaging is impossible", r.response.status === 400, `status ${r.response.status}`);

  // A visitor who is not a party gets nothing.
  const anonymous = await getPage(`/workspace/messages${conversationId ? `/${conversationId}` : ""}`);
  check("threads are not public", anonymous.status === 307 || anonymous.status === 404, `status ${anonymous.status}`);

  // --- 4. Marketplace & discovery ---------------------------------------
  page = await getPage("/products");
  check("marketplace renders", page.status === 200, `status ${page.status}`);
  check("marketplace uses rearrangement", page.html.includes("data-rearrange-key"));

  page = await getPage(`/listing/${`lst_j_prod_${stamp}`}`);
  check("listing page offers messaging", page.html.includes("Message"), "no Message action");

  page = await getPage(`/@${handle}`, buyer.cookie);
  check("shop header offers messaging", /Message Journey Shop|>Message</.test(page.html), "no Message action");

  page = await getPage(`/?category=`);
  check("home renders", page.status === 200, `status ${page.status}`);
  check("home announces category shifts", page.html.includes('role="status"'));
} catch (error) {
  failures.push(`threw: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
} finally {
  // Cleanup (leave the server data tidy on failure too).
  const rows = await db
    .execute({ sql: "SELECT id FROM users WHERE email IN (?, ?)", args: [sellerEmail, buyerEmail] })
    .then((result) => result.rows.map((row) => String(row.id)))
    .catch(() => []);

  const statements = [
    { sql: "DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE store_id = ?)", args: [storeId] },
    { sql: "DELETE FROM conversations WHERE store_id = ?", args: [storeId] },
    { sql: "DELETE FROM ticket_types WHERE event_id IN (SELECT id FROM events WHERE store_id = ?)", args: [storeId] },
    { sql: "DELETE FROM events WHERE store_id = ?", args: [storeId] },
    { sql: "DELETE FROM listings WHERE store_id = ?", args: [storeId] },
    { sql: "DELETE FROM categories WHERE store_id = ?", args: [storeId] },
    { sql: "DELETE FROM store_settings WHERE store_id = ?", args: [storeId] },
    { sql: "DELETE FROM stores WHERE id = ?", args: [storeId] },
  ];
  for (const userId of [...rows, seller?.userId, buyer?.userId].filter(Boolean)) {
    statements.push(
      { sql: "DELETE FROM verification WHERE identifier LIKE ?", args: [`%${userId}%`] },
      { sql: "DELETE FROM sessions WHERE user_id = ?", args: [userId] },
      { sql: 'DELETE FROM account WHERE "userId" = ?', args: [userId] },
      { sql: "DELETE FROM users WHERE id = ?", args: [userId] },
    );
  }
  statements.push(
    { sql: "DELETE FROM verification WHERE identifier LIKE ?", args: [`%${sellerEmail}%`] },
    { sql: "DELETE FROM verification WHERE identifier LIKE ?", args: [`%${buyerEmail}%`] },
  );
  await write(statements).catch(() => {});
}

console.log(`checked ${checked} journey assertions`);
if (failures.length > 0) {
  console.error(`\n${failures.length} failure(s):`);
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}
console.log("all journeys hold together");
