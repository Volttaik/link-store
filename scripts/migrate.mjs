/**
 * Apply db/schema.sql to the configured libSQL database.
 *
 * Every statement in the schema is `CREATE ... IF NOT EXISTS`, so this is safe
 * and idempotent to re-run. Applied runs are recorded in `schema_migrations`
 * for auditability.
 *
 * Usage:  npm run db:migrate
 */

import { createClient } from "@libsql/client";
import { readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { loadEnv, projectRoot, resolveDatabase } from "./load-env.mjs";

loadEnv();

const { url, authToken, isRemote } = resolveDatabase();
if (isRemote && !process.argv.includes('--approved-remote')) throw new Error('Remote migration requires explicit approval.');

if (!isRemote) {
  mkdirSync(path.join(projectRoot, "data"), { recursive: true });
}

const client = createClient(authToken ? { url, authToken } : { url });

const schema = readFileSync(path.join(projectRoot, "db", "schema.sql"), "utf8");

console.log(`→ Applying schema to ${isRemote ? "Turso (remote)" : url}`);

/**
 * Baskets used to be bound to a single store (`carts.store_id`), which made a
 * mixed-store cart impossible. A cart is now one shopper's basket, so the
 * column is dropped and the table rebuilt when an older database still has it.
 *
 * Idempotent: it does nothing once the column is gone.
 */
async function unbindCartsFromStores() {
  const columns = await client.execute("PRAGMA table_info(carts)");
  if (!columns.rows.some((row) => row.name === "store_id")) return;

  console.log("→ Migrating carts: removing the single-store binding");

  // Foreign keys must be off while the referenced table is swapped out, and the
  // pragma cannot be changed inside a transaction.
  await client.execute("PRAGMA foreign_keys = OFF");
  await client.executeMultiple(`
    CREATE TABLE carts_rebuilt (
      id         TEXT PRIMARY KEY,
      token      TEXT NOT NULL UNIQUE,
      user_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
      status     TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    INSERT INTO carts_rebuilt (id, token, user_id, status, created_at, updated_at)
      SELECT id, token, user_id, status, created_at, updated_at FROM carts;
    DROP TABLE carts;
    ALTER TABLE carts_rebuilt RENAME TO carts;
    CREATE INDEX IF NOT EXISTS idx_carts_user ON carts(user_id, status);
  `);
  await client.execute("PRAGMA foreign_keys = ON");
  console.log("✓ carts migrated — every existing line was kept");
}

/**
 * Identity moves to the authentication engine.
 *
 * `users` stays the one identity table — the engine writes it with these
 * column names — so every existing row, and every foreign key pointing at it,
 * survives untouched. What changes:
 *   * passwords are retired (sign-in is an emailed code or Google), so the
 *     `password_hash` column is dropped rather than left as a half-used
 *     credential;
 *   * the engine needs `email_verified` to record whether an address has been
 *     proven;
 *   * the old custom `sessions` table has no `token` column and its rows are
 *     meaningless to the engine, so it is recreated empty. Everyone signs in
 *     again — once, with a code, and never again after that.
 *
 * Idempotent: it does nothing once the schema matches.
 */
async function upgradeIdentityToAuthEngine() {
  const userColumns = (await client.execute("PRAGMA table_info(users)")).rows.map(
    (row) => row.name,
  );
  if (userColumns.length === 0) return;

  // Columns the engine expects that an older `users` table will not have.
  // `email_verified` is not null with a default, so it can be added to a table
  // that already holds rows.
  for (const column of [
    { name: "email_verified", definition: "INTEGER NOT NULL DEFAULT 0" },
    { name: "username", definition: "TEXT" },
    { name: "displayUsername", definition: "TEXT" },
  ]) {
    if (userColumns.includes(column.name)) continue;
    await client.execute(`ALTER TABLE users ADD COLUMN ${column.name} ${column.definition}`);
    console.log(`→ users: added ${column.name}`);
  }

  if (userColumns.includes("password_hash")) {
    await client.execute("ALTER TABLE users DROP COLUMN password_hash");
    console.log("→ users: retired password_hash (sign-in is passwordless)");
  }

  const sessionColumns = (await client.execute("PRAGMA table_info(sessions)")).rows.map(
    (row) => row.name,
  );
  if (sessionColumns.length > 0 && !sessionColumns.includes("token")) {
    await client.execute("DROP TABLE sessions");
    console.log("→ sessions: replaced with the engine's table (old sessions ended)");
  }

  await realignUserTimestampTypes();
}

/**
 * `users.created_at` / `updated_at` must be declared the way the engine declares
 * them (`date`), because the engine validates the types of the columns it writes
 * and reports a schema mismatch when they differ. The values themselves are
 * unchanged ISO-8601 text, so nothing the app reads is affected.
 *
 * SQLite cannot change a column's declared type, so the table is rebuilt: every
 * row is copied, the name is restored, and the foreign keys other tables already
 * hold on `users` resolve again because the table is back under the same name.
 * Wrapped in a transaction, so a failure leaves the original table in place.
 */
async function realignUserTimestampTypes() {
  const info = await client.execute("PRAGMA table_info(users)");
  const created = info.rows.find((row) => row.name === "created_at");
  if (!created || String(created.type).toUpperCase() === "DATE") return;

  console.log("→ users: rebuilding so its timestamps are declared `date`, as the engine expects");

  await client.execute("PRAGMA foreign_keys = OFF");
  await client.executeMultiple(`
    BEGIN;
    CREATE TABLE users_rebuilt (
      id              TEXT PRIMARY KEY,
      email           TEXT NOT NULL UNIQUE,
      name            TEXT NOT NULL,
      email_verified  INTEGER NOT NULL DEFAULT 0,
      avatar_url      TEXT,
      phone           TEXT,
      role            TEXT NOT NULL DEFAULT 'user',
      last_login_at   TEXT,
      username        TEXT,
      displayUsername TEXT,
      created_at      date NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at      date NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    INSERT INTO users_rebuilt
      (id, email, name, email_verified, avatar_url, phone, role, last_login_at,
       username, displayUsername, created_at, updated_at)
      SELECT id, email, name, email_verified, avatar_url, phone, role, last_login_at,
             username, displayUsername, created_at, updated_at
        FROM users;
    DROP TABLE users;
    ALTER TABLE users_rebuilt RENAME TO users;
    CREATE UNIQUE INDEX IF NOT EXISTS users_username_uidx ON users(username);
    COMMIT;
  `);
  await client.execute("PRAGMA foreign_keys = ON");
  console.log("✓ users rebuilt — every account kept");
}

/**
 * Categories become a tree.
 *
 * The catalogue has always been hierarchical in intent — Fashion, Phones, Home
 * — but the table was flat, so nothing could say *what* a category was a
 * subcategory of, and a browse page could not tell a food category from a
 * product one. `parent_id` is what makes main category → subcategory real, and
 * with it a module can be handed only its own tree.
 *
 * Idempotent, and additive: existing rows keep their id, their name and their
 * `kind`, and `db/seed.sql` does the re-parenting. Nothing is deleted.
 */
async function introduceCategoryHierarchy() {
  const columns = (await client.execute("PRAGMA table_info(categories)")).rows.map(
    (row) => row.name,
  );
  if (columns.length === 0 || columns.includes("parent_id")) return;

  // SQLite can add a nullable column with a foreign key in place, so no rebuild
  // is needed and every existing category survives untouched.
  await client.execute(
    "ALTER TABLE categories ADD COLUMN parent_id TEXT REFERENCES categories(id) ON DELETE CASCADE",
  );
  await client.execute(
    "CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id, position)",
  );
  console.log("✓ categories: added parent_id — the catalogue is a tree now");
}

/**
 * Fulfilment, receipts and the ticket state machine.
 *
 * The order gains the three things a real fulfilment lifecycle needs: how the
 * buyer gets their goods (`fulfilment_method`), the delivery estimate as it
 * stood at purchase (`estimated_delivery`), and an opaque receipt code the
 * receipt's QR encodes. `tickets.status` becomes the full state machine
 * (valid|used|cancelled|refunded|expired|void) — the old `checked_in` value is
 * renamed to `used`, keeping its timestamp. Shipments and their timeline are
 * new tables (created by the schema below); paid orders of the past get one
 * backfilled from their recorded state so old orders still show a coherent
 * tracking view — recorded history, never invented movement.
 *
 * Idempotent: every step checks before it acts.
 */
async function introduceFulfilmentTracking() {
  const orderColumns = (await client.execute("PRAGMA table_info(orders)")).rows.map(
    (row) => row.name,
  );
  if (orderColumns.length === 0) return;

  for (const column of [
    { name: "fulfilment_method", definition: "TEXT NOT NULL DEFAULT 'delivery'" },
    { name: "estimated_delivery", definition: "TEXT" },
    { name: "receipt_code", definition: "TEXT" },
  ]) {
    if (orderColumns.includes(column.name)) continue;
    await client.execute(`ALTER TABLE orders ADD COLUMN ${column.name} ${column.definition}`);
    console.log(`→ orders: added ${column.name}`);
  }

  await client.execute(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_receipt_code ON orders(receipt_code)",
  );

  // Receipt codes for orders that predate them — opaque, unique, inert.
  await client.execute(
    `UPDATE orders SET receipt_code = 'RC-' || lower(hex(randomblob(8)))
      WHERE receipt_code IS NULL`,
  );

  // How each existing order reaches its buyer, from the items it actually holds.
  await client.execute(
    `UPDATE orders SET fulfilment_method = CASE
       WHEN EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = orders.id AND oi.item_type = 'ticket')
         AND NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = orders.id AND oi.item_type != 'ticket')
         THEN 'none'
       WHEN EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = orders.id AND oi.item_type = 'digital')
         AND NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = orders.id AND oi.item_type NOT IN ('digital', 'ticket'))
         THEN 'digital'
       ELSE 'delivery'
     END
     WHERE fulfilment_method = 'delivery'
       AND NOT EXISTS (SELECT 1 FROM shipments sp WHERE sp.order_id = orders.id)`,
  );

  const settingsColumns = (
    await client.execute("PRAGMA table_info(store_settings)")
  ).rows.map((row) => row.name);
  if (settingsColumns.length > 0) {
    for (const column of [
      { name: "delivery_estimate_min_days", definition: "INTEGER NOT NULL DEFAULT 3" },
      { name: "delivery_estimate_max_days", definition: "INTEGER NOT NULL DEFAULT 5" },
      { name: "pickup_location_name", definition: "TEXT" },
      { name: "pickup_address", definition: "TEXT" },
      { name: "pickup_hours", definition: "TEXT" },
      { name: "pickup_instructions", definition: "TEXT" },
    ]) {
      if (settingsColumns.includes(column.name)) continue;
      await client.execute(`ALTER TABLE store_settings ADD COLUMN ${column.name} ${column.definition}`);
      console.log(`→ store_settings: added ${column.name}`);
    }
  }

  // Seller-reported coordinates for the tracking map. Additive and nullable:
  // NULL means the place is text-only until a seller report resolves it.
  const shipmentColumns = (
    await client.execute("PRAGMA table_info(shipments)")
  ).rows.map((row) => row.name);

  if (shipmentColumns.length > 0) {
    for (const column of [
      { name: "current_location_at", definition: "TEXT" },
      { name: "origin_lat", definition: "REAL" },
      { name: "origin_lng", definition: "REAL" },
      { name: "destination_lat", definition: "REAL" },
      { name: "destination_lng", definition: "REAL" },
    ]) {
      if (shipmentColumns.includes(column.name)) continue;
      await client.execute(`ALTER TABLE shipments ADD COLUMN ${column.name} ${column.definition}`);
      console.log(`→ shipments: added ${column.name}`);
    }

    // A report time for places reported before the column existed.
    await client.execute(
      `UPDATE shipments SET current_location_at = updated_at
        WHERE current_location IS NOT NULL AND current_location_at IS NULL`,
    );
  }

  // Rich media in messages: the attachments JSON column, and the shop's chosen
  // design type. Additive and nullable — old rows read exactly as before.
  const messageColumns = (await client.execute("PRAGMA table_info(messages)")).rows.map(
    (row) => row.name,
  );
  if (messageColumns.length > 0 && !messageColumns.includes("attachments")) {
    await client.execute("ALTER TABLE messages ADD COLUMN attachments TEXT");
    console.log("→ messages: added attachments");
  }

  if (settingsColumns.length > 0 && !settingsColumns.includes("design_type")) {
    await client.execute("ALTER TABLE store_settings ADD COLUMN design_type TEXT");
    console.log("→ store_settings: added design_type");
  }

  // The ticket state machine: `checked_in` becomes `used` (same meaning, the
  // name the rest of the platform speaks).
  // Historical tables may remain on upgraded databases, but fresh product-only
  // databases deliberately have no ticket tables.
  if ((await client.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'tickets'")).rows.length) {
    await client.execute(`UPDATE tickets SET status = 'used' WHERE status = 'checked_in'`);
  }

  // Backfill shipments for paid orders of the past, from their recorded state.
  // A fulfilled order was delivered; anything still open is being prepared.
  const orphanOrders = await client.execute(
    `SELECT o.id, o.store_id, o.status, o.fulfilment_method, o.fulfilled_at, o.cancelled_at,
            o.shipping_address, o.created_at, s.address AS store_address, s.city AS store_city
       FROM orders o JOIN stores s ON s.id = o.store_id
      WHERE o.payment_status = 'paid'
        AND o.fulfilment_method IN ('delivery', 'pickup')
        AND NOT EXISTS (SELECT 1 FROM shipments sp WHERE sp.order_id = o.id)`,
  );

  for (const row of orphanOrders.rows) {
    const fulfilled = row.status === "fulfilled";
    const cancelled = row.status === "cancelled" || row.status === "refunded";
    const status = cancelled ? "cancelled" : fulfilled ? (row.fulfilment_method === "pickup" ? "picked_up" : "delivered") : "preparing";
    const now = new Date().toISOString();
    const shipmentId = `shp_mig_${Math.random().toString(36).slice(2, 12)}`;

    await client.execute({
      sql: `INSERT INTO shipments
              (id, order_id, store_id, method, status, origin, destination,
               shipped_at, delivered_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        shipmentId,
        row.id,
        row.store_id,
        row.fulfilment_method,
        status,
        [row.store_address, row.store_city].filter(Boolean).join(", ") || null,
        row.shipping_address || null,
        fulfilled ? (row.fulfilled_at ?? now) : null,
        fulfilled ? (row.fulfilled_at ?? now) : null,
        row.created_at,
        now,
      ],
    });

    await client.execute({
      sql: `INSERT INTO shipment_events (id, shipment_id, status, title, actor, created_at)
            VALUES (?, ?, ?, ?, 'system', ?)`,
      args: [
        `shev_mig_${Math.random().toString(36).slice(2, 12)}`,
        shipmentId,
        status,
        fulfilled ? (row.fulfilment_method === "pickup" ? "Collected" : "Delivered") : cancelled ? "Cancelled" : "Payment confirmed",
        row.created_at,
      ],
    });
  }

  if (orphanOrders.rows.length > 0) {
    console.log(`✓ shipments: backfilled ${orphanOrders.rows.length} from recorded order history`);
  }
}

/**
 * Real message actions: edit, delete for me, delete for everyone, delete my
 * chat, clear my chat.
 *
 * Shared state lives on `messages` itself (`edited_at`, and
 * `deleted_for_everyone_at` as the tombstone for a removal both sides see);
 * everything personal — one message hidden from one person, one thread deleted
 * or cleared for one person — lives in the per-user tables the schema creates.
 * Nothing here ever rewrites shared history: an edit stamps itself, a shared
 * delete tombstones the row, and the personal tables are pure viewer state.
 *
 * Idempotent: it does nothing once the columns are there.
 */
async function introduceMessageActions() {
  const messageColumns = (await client.execute("PRAGMA table_info(messages)")).rows.map(
    (row) => row.name,
  );
  if (messageColumns.length === 0) return;

  for (const column of [
    { name: "edited_at", definition: "TEXT" },
    { name: "deleted_for_everyone_at", definition: "TEXT" },
  ]) {
    if (messageColumns.includes(column.name)) continue;
    await client.execute(`ALTER TABLE messages ADD COLUMN ${column.name} ${column.definition}`);
    console.log(`→ messages: added ${column.name}`);
  }
}

/**
 * The ticket inventory: the holder's own trash.
 *
 * A ticket is never deleted because an event ended, and the platform never
 * deletes one at all. What a holder needs — and did not have — is the ability to
 * move a ticket that has become useless (used, expired, cancelled, refunded)
 * out of their normal inventory, keep every fact about it, and bring it back.
 * That is one nullable timestamp on the ticket itself, so no row is copied, no
 * identity is reissued and no purchase history is rewritten.
 *
 * Idempotent: it does nothing once the column exists.
 */
async function introduceTicketTrash() {
  const columns = (await client.execute("PRAGMA table_info(tickets)")).rows.map(
    (row) => row.name,
  );
  if (columns.length === 0 || columns.includes("deleted_at")) return;

  await client.execute("ALTER TABLE tickets ADD COLUMN deleted_at TEXT");
  await client.execute(
    "CREATE INDEX IF NOT EXISTS idx_tickets_holder ON tickets(store_id, deleted_at)",
  );
  console.log("✓ tickets: added deleted_at — a holder can trash and recover their own ticket");
}

/**
 * Chat payment requests.
 *
 * `payment_requests` is a new table (the schema creates it); what existing
 * databases need is the one column that gives a message its payment card:
 * `messages.payment_request_id`. It is nullable and additive, so every old
 * message reads exactly as before.
 *
 * Idempotent: it does nothing once the column is there.
 */
async function introduceChatPaymentRequests() {
  const columns = (await client.execute("PRAGMA table_info(messages)")).rows.map(
    (row) => row.name,
  );
  if (columns.length > 0 && !columns.includes("payment_request_id")) {
    await client.execute(
      "ALTER TABLE messages ADD COLUMN payment_request_id TEXT REFERENCES payment_requests(id) ON DELETE SET NULL",
    );
    console.log("✓ messages: added payment_request_id — a conversation can carry a payment card");
  }

  if (columns.length > 0) {
    await client.execute(
      "CREATE INDEX IF NOT EXISTS idx_messages_payment_request ON messages(payment_request_id)",
    );
  }
}

/**
 * Email idempotency — `email_deliveries.dedupe_key`.
 *
 * A transactional email that must reach its recipient exactly once carries a
 * key naming its event; a repeated trigger reads the key and sends nothing.
 * Nullable and additive, so every old delivery row reads exactly as before.
 *
 * Idempotent: it does nothing once the column is there. Runs before the schema,
 * because `db/schema.sql` declares the unique index on this column — an older
 * `email_deliveries` table must carry it by the time the schema is applied.
 */
async function introduceEmailDedupe() {
  const columns = (await client.execute("PRAGMA table_info(email_deliveries)")).rows.map(
    (row) => row.name,
  );
  if (columns.length > 0 && !columns.includes("dedupe_key")) {
    await client.execute("ALTER TABLE email_deliveries ADD COLUMN dedupe_key TEXT");
    console.log("✓ email_deliveries: added dedupe_key — one email per event, never a duplicate");
  }
}

try {
  await unbindCartsFromStores();
  await upgradeIdentityToAuthEngine();
  await introduceCategoryHierarchy();
  await introduceChatPaymentRequests();
  await introduceEmailDedupe();
  // Before the schema: `db/schema.sql` declares an index on the column this adds,
  // so an existing `tickets` table must already carry it by the time the schema
  // is applied. On a fresh database the table does not exist yet, the step is a
  // no-op, and the schema creates both the column and the index.
  await introduceTicketTrash();
  await client.executeMultiple(schema);
  // After the schema: the backfill writes into the shipment tables it creates.
  await introduceFulfilmentTracking();
  await introduceMessageActions();
  await introduceTicketTrash();

  await client.execute(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id         TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    )
  `);

  await client.execute({
    sql: "INSERT OR REPLACE INTO schema_migrations (id, applied_at) VALUES (?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))",
    args: [`schema_${Date.now()}`],
  });

  const tables = await client.execute(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  );

  console.log(`✓ Schema applied — ${tables.rows.length} tables:`);
  console.log(`  ${tables.rows.map((row) => row.name).join(", ")}`);
} catch (error) {
  console.error("✗ Migration failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  client.close();
}
