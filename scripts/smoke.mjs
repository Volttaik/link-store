/**
 * End-to-end smoke test.
 *
 * Creates a real account through the platform's own passwordless signup (the
 * OTP journey — the code is read from the `verification` table because dev has
 * no mailbox), promotes it to admin so the operator screens are reachable, then
 * seeds a store, listing and event directly in the libSQL database and requests
 * the app over HTTP with the real session cookie to prove the pages render live
 * database data. Everything it creates is deleted at the end (including on
 * failure).
 *
 *   node scripts/smoke.mjs [baseUrl]
 */

import { createClient } from "@libsql/client";
import { loadEnv, resolveDatabase } from "./load-env.mjs";

const BASE = process.argv[2] ?? "http://localhost:5000";
loadEnv();
const { url, authToken } = resolveDatabase();
const db = createClient(authToken ? { url, authToken } : { url });

const stamp = Date.now().toString(36);
const storeId = `str_smoke_${stamp}`;
const listingId = `lst_smoke_${stamp}`;
const eventId = `evt_smoke_${stamp}`;
const ticketId = `tkt_smoke_${stamp}`;
const pageId = `pag_smoke_${stamp}`;
const handle = `smoke${stamp}`;
const email = `${handle}@example.com`;
const now = new Date().toISOString();
const listingTitle = `Smoke Test Kettle ${stamp}`;
const eventTitle = `Smoke Test Meetup ${stamp}`;

const failures = [];
let checked = 0;
let userId = null;

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

/**
 * A fetch that survives a dev-server restart: in dev, Next can recycle on its
 * memory threshold and drop the connection mid-request. A connection-level
 * failure is transient here, so it is retried a few times before giving up.
 */
async function request(path, init) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      return await fetch(`${BASE}${path}`, init);
    } catch (error) {
      const transient = /fetch failed|ECONNRESET|ECONNREFUSED|socket hang up/i.test(String(error));
      if (!transient || attempt === 5) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }
  throw new Error("unreachable");
}

async function post(path, body, headers = {}) {
  const response = await request(path, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE, ...headers },
    body: JSON.stringify(body),
    redirect: "manual",
  });
  return { response, text: await response.text() };
}

/**
 * Register → send code → read it from the database → verify → session cookie.
 * The same real journey the platform uses, so the cookie below is a credential
 * the app actually accepts.
 */
async function signUp() {
  let r = await post("/api/auth/sign-up/email", {
    email,
    password: `pw-${stamp}-x1`,
    name: "Smoke Tester",
  });
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
  return { userId: String(user.rows[0].id), cookie };
}

async function seed() {
  const account = await signUp();
  userId = account.userId;

  // The operator screens require the admin role; the account is real, only its
  // role is raised so the smoke test can reach /admin.
  await write([
    { sql: "UPDATE users SET role = 'admin' WHERE id = ?", args: [userId] },
    {
      sql: `INSERT INTO stores (id, user_id, slug, name, tagline, currency, country, is_published, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'Smoke test storefront', 'NGN', 'Nigeria', 1, ?, ?)`,
      args: [storeId, userId, handle, `Smoke Store ${stamp}`, now, now],
    },
    { sql: "INSERT INTO store_settings (store_id, updated_at) VALUES (?, ?)", args: [storeId, now] },
    {
      sql: `INSERT INTO listings
              (id, store_id, type, fulfilment, title, slug, description, currency, price,
               track_inventory, stock, status, published_at, created_at, updated_at)
            VALUES (?, ?, 'physical', 'shipping', ?, ?, 'Created by the smoke test.', 'NGN', 2500000,
               1, 4, 'active', ?, ?, ?)`,
      args: [listingId, storeId, listingTitle, `smoke-kettle-${stamp}`, now, now, now],
    },
    {
      sql: `INSERT INTO events
              (id, store_id, title, slug, description, starts_at, city, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'Created by the smoke test.', ?, 'Lagos', 'published', ?, ?)`,
      args: [
        eventId,
        storeId,
        eventTitle,
        `smoke-meetup-${stamp}`,
        new Date(Date.now() + 7 * 86_400_000).toISOString(),
        now,
        now,
      ],
    },
    {
      sql: `INSERT INTO ticket_types
              (id, event_id, name, price, currency, quantity_total, created_at)
            VALUES (?, ?, 'General admission', 1500000, 'NGN', 50, ?)`,
      args: [ticketId, eventId, now],
    },
    {
      sql: `INSERT INTO analytics_events (id, store_id, listing_id, event_type, created_at)
            VALUES (?, ?, ?, 'store_view', ?)`,
      args: [pageId, storeId, listingId, now],
    },
  ]);

  return account.cookie;
}

async function cleanup() {
  const statements = [
    { sql: "DELETE FROM analytics_events WHERE store_id = ?", args: [storeId] },
    { sql: "DELETE FROM ticket_types WHERE event_id = ?", args: [eventId] },
    { sql: "DELETE FROM events WHERE store_id = ?", args: [storeId] },
    { sql: "DELETE FROM listings WHERE store_id = ?", args: [storeId] },
    { sql: "DELETE FROM store_settings WHERE store_id = ?", args: [storeId] },
    { sql: "DELETE FROM stores WHERE id = ?", args: [storeId] },
  ];
  if (userId) {
    statements.push(
      { sql: "DELETE FROM verification WHERE identifier LIKE ?", args: [`%${userId}%`] },
      { sql: "DELETE FROM sessions WHERE user_id = ?", args: [userId] },
      { sql: 'DELETE FROM account WHERE "userId" = ?', args: [userId] },
      { sql: "DELETE FROM users WHERE id = ?", args: [userId] },
    );
  }
  statements.push({ sql: "DELETE FROM verification WHERE identifier LIKE ?", args: [`%${email}%`] });
  await write(statements).catch(() => {});
}

async function check(path, { mustContain, expect = 200, anonymous = false } = {}, cookie) {
  checked += 1;
  const response = await request(path, {
    headers: anonymous || !cookie ? {} : { cookie },
    redirect: "manual",
  });

  if (response.status !== expect) {
    failures.push(`${path} → expected ${expect}, got ${response.status}`);
    return;
  }

  if (mustContain) {
    const html = await response.text();
    for (const needle of mustContain) {
      if (!html.includes(needle)) failures.push(`${path} → page is missing ${JSON.stringify(needle)}`);
    }
  }
}

let cookie = null;

try {
  cookie = await seed();

  // The workspace must see the seeded data through its own queries.
  await check("/workspace", { mustContain: [listingTitle] }, cookie);
  await check("/workspace/listings", { mustContain: [listingTitle] }, cookie);
  await check(`/workspace/listings/${listingId}`, { mustContain: [listingTitle] }, cookie);
  await check("/workspace/events", { mustContain: [eventTitle] }, cookie);
  await check(`/workspace/events/${eventId}`, { mustContain: [eventTitle] }, cookie);
  await check("/workspace/finance", {}, cookie);
  await check("/workspace/finance?tab=transactions", {}, cookie);
  await check("/workspace/finance?tab=payments", {}, cookie);
  await check("/workspace/finance?tab=payouts", {}, cookie);
  await check("/workspace/analytics", {}, cookie);
  await check("/workspace/analytics?tab=sales", {}, cookie);
  await check("/workspace/analytics?tab=products", {}, cookie);
  await check("/workspace/analytics?tab=traffic", {}, cookie);
  await check("/workspace/analytics?tab=customers", {}, cookie);
  await check("/workspace/categories", {}, cookie);
  await check("/workspace/discounts", {}, cookie);
  await check("/workspace/reviews", {}, cookie);
  await check("/workspace/inventory", { mustContain: [listingTitle] }, cookie);
  await check("/workspace/customers", {}, cookie);
  await check("/workspace/orders", {}, cookie);
  await check("/workspace/settings", {}, cookie);
  await check("/workspace/settings?tab=payments", {}, cookie);
  await check("/workspace/settings?tab=profile", {}, cookie);
  await check("/workspace/settings?tab=security", {}, cookie);

  // Public storefront + discovery must reflect the same rows.
  await check(`/@${handle}`, { mustContain: [listingTitle] }, cookie);
  await check(`/listing/${listingId}`, { mustContain: [listingTitle] }, cookie);
  await check(`/events/${eventId}`, { mustContain: [eventTitle] }, cookie);
  await check(`/search?q=smoke`, { mustContain: [listingTitle] }, cookie);

  // Admin pages (the signed-up account was promoted to admin).
  await check("/admin", {}, cookie);
  await check("/admin/stores", { mustContain: [handle] }, cookie);
  await check("/admin/users", { mustContain: [email] }, cookie);

  // Authorization: no session cookie means no workspace, no admin.
  await check("/workspace", { expect: 307, anonymous: true });
  await check("/admin", { expect: 307, anonymous: true });
} catch (error) {
  failures.push(`threw: ${error instanceof Error ? error.message : String(error)}`);
} finally {
  await cleanup();
}

console.log(`checked ${checked} routes`);
if (failures.length > 0) {
  console.error(`\n${failures.length} failure(s):`);
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}
console.log("all routes rendered with live database data");
