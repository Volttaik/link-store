/**
 * Prototype reset — a clean, intentional state before the first serious test.
 *
 * This never touches the schema, the platform catalogue or real accounts. What it
 * removes is test noise, and only ever by an explicit rule:
 *
 *   * **Test identities** — accounts whose address is on `example.com` (every
 *     audit fixture uses one) and the debug account. A real buyer or seller never
 *     has one, so no real person is ever deleted.
 *   * **What those identities own** — their stores, listings, events, ticket
 *     types, messages, conversations and media references, deleted in dependency
 *     order rather than left to chance.
 *   * **Carts** — transient by definition: every active basket, plus the legacy
 *     ticket line the cart must never have carried.
 *   * **Analytics** — every row, because every row so far is test browsing. The
 *     dashboards then honestly show "no activity yet" instead of noise.
 *
 * It keeps: the schema, `schema_migrations`, the platform catalogue
 * (`categories`), the real accounts and their stores/listings, and the email
 * delivery log (a record of what the platform actually sent).
 *
 * It also reports — and, with `--apply`, removes — **orphaned local media**: a
 * file in `storage/` that no row references any more. Files that ARE referenced
 * are never touched, however old they are.
 *
 * `--all` is the **launch reset**: every account and every row of application
 * data goes — stores, listings, orders, payments, tickets, conversations,
 * payment requests, media references, email log — leaving a clean dataset for
 * first launch. What remains is exactly the infrastructure: the schema,
 * `schema_migrations`, the platform catalogue (`categories`), and every
 * configuration credential in the environment. R2 objects are deliberately
 * never touched from here: the bucket may be shared, so media cleanup there is
 * a separate, explicit decision.
 *
 *   node scripts/prototype-reset.mjs                  # inspect only
 *   node scripts/prototype-reset.mjs --apply          # clear the test noise
 *   node scripts/prototype-reset.mjs --all            # inspect the launch reset
 *   node scripts/prototype-reset.mjs --all --apply    # perform the launch reset
 */

import { readdir, rm, stat } from "node:fs/promises";
import path from "node:path";

import { createClient } from "@libsql/client";

import { loadEnv, projectRoot, resolveDatabase } from "./load-env.mjs";

loadEnv();
const apply = process.argv.includes("--apply");
/** The launch reset: every account and every row of application data goes. */
const all = process.argv.includes("--all");
const { url, authToken, isRemote } = resolveDatabase();
const db = createClient(authToken ? { url, authToken } : { url });

console.log(`→ ${isRemote ? "Turso (remote)" : url}${apply ? "" : "   [inspect only — pass --apply to change]"}\n`);

async function write(statements) {
  if (statements.length === 0) return;
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

async function count(sql, args = []) {
  const result = await db.execute({ sql, args });
  return Number(result.rows[0]?.c ?? 0);
}

/** Every account that is a fixture: by the rule above, or all of them under `--all`. */
const testUsers = (
  await db.execute(
    all
      ? `SELECT id, email, name FROM users ORDER BY created_at`
      : `SELECT id, email, name FROM users
          WHERE LOWER(email) LIKE '%@example.com%' OR LOWER(email) LIKE 'dbg-%'
          ORDER BY created_at`,
  )
).rows.map((row) => ({ id: String(row.id), email: String(row.email), name: String(row.name) }));

const testUserIds = testUsers.map((user) => user.id);
const placeholders = testUserIds.map(() => "?").join(", ");

console.log(all ? "Accounts to remove (launch reset — all):" : "Test identities to remove:");
for (const user of testUsers) console.log(`  - ${user.email}  (${user.name})`);
if (testUsers.length === 0) console.log("  (none)");

const keptUsers = (await db.execute("SELECT id, email, name FROM users ORDER BY created_at")).rows.filter(
  (row) => !testUserIds.includes(String(row.id)),
);
console.log("\nReal accounts kept:");
for (const user of keptUsers) console.log(`  - ${user.email}  (${user.name})`);
if (keptUsers.length === 0) console.log("  (none)");

// --- What the fixtures left behind ------------------------------------------
const testStores = testUserIds.length
  ? (
      await db.execute({
        sql: `SELECT id, name, slug FROM stores WHERE user_id IN (${placeholders})`,
        args: testUserIds,
      })
    ).rows.map((row) => String(row.id))
  : [];

const plan = {
  users: testUsers.length,
  stores: testStores.length,
  listings: testStores.length
    ? await count(`SELECT COUNT(*) c FROM listings WHERE store_id IN (${testStores.map(() => "?").join(", ")})`, testStores)
    : 0,
  events: testStores.length
    ? await count(`SELECT COUNT(*) c FROM events WHERE store_id IN (${testStores.map(() => "?").join(", ")})`, testStores)
    : 0,
  carts: await count("SELECT COUNT(*) c FROM carts"),
  cartItems: await count("SELECT COUNT(*) c FROM cart_items"),
  ticketCartLines: await count("SELECT COUNT(*) c FROM cart_items WHERE ticket_type_id IS NOT NULL"),
  analytics: await count("SELECT COUNT(*) c FROM analytics_events"),
  orders: await count("SELECT COUNT(*) c FROM orders"),
  tickets: await count("SELECT COUNT(*) c FROM tickets"),
};

console.log("\nTo clear:");
for (const [key, value] of Object.entries(plan)) console.log(`  ${key.padEnd(16)} ${value}`);

// --- Orphaned local media ---------------------------------------------------
/** Every storage key any row still points at. */
async function referencedKeys() {
  const keys = new Set();
  const add = (value) => {
    if (!value) return;
    const text = String(value);
    const key = text.startsWith("/api/files/") ? text.slice("/api/files/".length) : text;
    if (key.startsWith("public/")) keys.add(key);
  };

  for (const sql of [
    "SELECT image_url AS value FROM listing_images",
    "SELECT logo_url AS value FROM stores",
    "SELECT banner_url AS value FROM stores",
    "SELECT avatar_url AS value FROM users",
    "SELECT cover_image_url AS value FROM events",
    "SELECT storage_key AS value FROM digital_assets",
  ]) {
    for (const row of (await db.execute(sql)).rows) add(row.value);
  }

  for (const row of (await db.execute("SELECT attachments FROM messages WHERE attachments IS NOT NULL")).rows) {
    try {
      const parsed = JSON.parse(String(row.attachments));
      if (Array.isArray(parsed)) {
        for (const entry of parsed) add(entry?.key);
      }
    } catch {
      // An unreadable attachments value references nothing we can prove.
    }
  }

  return keys;
}

async function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

const storageRoot = path.join(projectRoot, "storage");
// Under `--all` every row goes, so every local file becomes orphaned by
// definition — no reference scan needed.
const referenced = all ? new Set() : await referencedKeys();
const files = await walk(storageRoot);
const orphans = [];

for (const file of files) {
  const key = path.relative(storageRoot, file).split(path.sep).join("/");
  if (!referenced.has(key)) orphans.push({ file, key, bytes: (await stat(file)).size });
}

console.log(`\nStorage: ${files.length} file(s), ${referenced.size} referenced key(s)`);
console.log(`Orphaned media (referenced by no row): ${orphans.length}`);
for (const orphan of orphans) console.log(`  - ${orphan.key}  ${orphan.bytes} bytes`);

if (!apply) {
  console.log("\nNothing was changed. Re-run with --apply to perform the reset.");
  db.close();
  process.exit(0);
}

// --- The reset --------------------------------------------------------------
const statements = [];

// Media references the fixtures left on surviving rows (a real store's listing
// image is left alone — only test-owned rows are removed).
if (testStores.length) {
  const storePlaceholders = testStores.map(() => "?").join(", ");
  statements.push(
    {
      sql: `DELETE FROM payment_requests WHERE store_id IN (${storePlaceholders})`,
      args: testStores,
    },
    { sql: `DELETE FROM payments WHERE store_id IN (${storePlaceholders})`, args: testStores },
    { sql: `DELETE FROM transactions WHERE store_id IN (${storePlaceholders})`, args: testStores },
    { sql: `DELETE FROM payouts WHERE store_id IN (${storePlaceholders})`, args: testStores },
    { sql: `DELETE FROM shipments WHERE store_id IN (${storePlaceholders})`, args: testStores },
    { sql: `DELETE FROM tickets WHERE store_id IN (${storePlaceholders})`, args: testStores },
    {
      sql: `DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE store_id IN (${storePlaceholders}))`,
      args: testStores,
    },
    { sql: `DELETE FROM orders WHERE store_id IN (${storePlaceholders})`, args: testStores },
    {
      sql: `DELETE FROM conversation_user_states WHERE conversation_id IN (SELECT id FROM conversations WHERE store_id IN (${storePlaceholders}))`,
      args: testStores,
    },
    {
      sql: `DELETE FROM message_user_states WHERE message_id IN (SELECT id FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE store_id IN (${storePlaceholders})))`,
      args: testStores,
    },
    {
      sql: `DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE store_id IN (${storePlaceholders}))`,
      args: testStores,
    },
    { sql: `DELETE FROM conversations WHERE store_id IN (${storePlaceholders})`, args: testStores },
    {
      sql: `DELETE FROM listing_images WHERE listing_id IN (SELECT id FROM listings WHERE store_id IN (${storePlaceholders}))`,
      args: testStores,
    },
    {
      sql: `DELETE FROM listing_variants WHERE listing_id IN (SELECT id FROM listings WHERE store_id IN (${storePlaceholders}))`,
      args: testStores,
    },
    {
      sql: `DELETE FROM digital_assets WHERE listing_id IN (SELECT id FROM listings WHERE store_id IN (${storePlaceholders}))`,
      args: testStores,
    },
    { sql: `DELETE FROM inventory_movements WHERE store_id IN (${storePlaceholders})`, args: testStores },
    { sql: `DELETE FROM ticket_types WHERE event_id IN (SELECT id FROM events WHERE store_id IN (${storePlaceholders}))`, args: testStores },
    { sql: `DELETE FROM events WHERE store_id IN (${storePlaceholders})`, args: testStores },
    { sql: `DELETE FROM listings WHERE store_id IN (${storePlaceholders})`, args: testStores },
    { sql: `DELETE FROM customers WHERE store_id IN (${storePlaceholders})`, args: testStores },
    { sql: `DELETE FROM reviews WHERE store_id IN (${storePlaceholders})`, args: testStores },
    { sql: `DELETE FROM discounts WHERE store_id IN (${storePlaceholders})`, args: testStores },
    { sql: `DELETE FROM store_settings WHERE store_id IN (${storePlaceholders})`, args: testStores },
    { sql: `DELETE FROM analytics_events WHERE store_id IN (${storePlaceholders})`, args: testStores },
    { sql: `DELETE FROM stores WHERE id IN (${storePlaceholders})`, args: testStores },
  );
}

// Transient baskets: every one, and the legacy ticket line the cart must never
// have carried. A cart is not a record — it is where a shopper is standing.
statements.push(
  { sql: "DELETE FROM cart_items", args: [] },
  { sql: "DELETE FROM carts", args: [] },
);

// Test browsing noise. Real activity will write real rows again.
statements.push({ sql: "DELETE FROM analytics_events", args: [] });

// The launch reset empties the record of what the platform sent, too: the whole
// dataset is test data, and a clean inbox log is part of a clean start.
if (all) statements.push({ sql: "DELETE FROM email_deliveries", args: [] });

if (testUserIds.length) {
  statements.push(
    { sql: `DELETE FROM sessions WHERE user_id IN (${placeholders})`, args: testUserIds },
    { sql: `DELETE FROM account WHERE "userId" IN (${placeholders})`, args: testUserIds },
    { sql: "DELETE FROM verification", args: [] },
    { sql: `DELETE FROM users WHERE id IN (${placeholders})`, args: testUserIds },
  );
}

await write(statements);

for (const orphan of orphans) {
  await rm(orphan.file, { force: true });
}

console.log(`\n✓ removed ${testUsers.length} test account(s)`);
console.log(`✓ cleared ${plan.carts} cart(s), ${plan.analytics} analytics row(s)`);
console.log(`✓ removed ${orphans.length} orphaned file(s)`);

const remaining = {
  users: await count("SELECT COUNT(*) c FROM users"),
  stores: await count("SELECT COUNT(*) c FROM stores"),
  listings: await count("SELECT COUNT(*) c FROM listings"),
  events: await count("SELECT COUNT(*) c FROM events"),
  carts: await count("SELECT COUNT(*) c FROM carts"),
  orders: await count("SELECT COUNT(*) c FROM orders"),
  tickets: await count("SELECT COUNT(*) c FROM tickets"),
  categories: await count("SELECT COUNT(*) c FROM categories"),
};

console.log("\nState after the reset:");
for (const [key, value] of Object.entries(remaining)) console.log(`  ${key.padEnd(12)} ${value}`);

db.close();
