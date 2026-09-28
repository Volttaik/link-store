/** One-off prototype database inventory: what is actually in the database now. */
import { createClient } from "@libsql/client";
import { loadEnv, resolveDatabase } from "./load-env.mjs";

loadEnv();
const { url, authToken } = resolveDatabase();
const db = createClient(authToken ? { url, authToken } : { url });

const tables = await db.execute(
  "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
);

const rows = [];
for (const row of tables.rows) {
  const name = String(row.name);
  const count = await db.execute(`SELECT COUNT(*) c FROM "${name}"`);
  rows.push([name, Number(count.rows[0].c)]);
}
rows.sort((a, b) => b[1] - a[1]);
const width = Math.max(...rows.map(([n]) => n.length));
for (const [name, count] of rows) console.log(`${name.padEnd(width)}  ${count}`);

console.log("\n--- users ---");
const users = await db.execute(
  "SELECT id, email, name, role, email_verified, created_at FROM users ORDER BY created_at",
);
for (const u of users.rows) {
  console.log(`${u.id}  ${u.email}  ${u.name}  role=${u.role} verified=${u.email_verified} ${u.created_at}`);
}

console.log("\n--- stores ---");
const stores = await db.execute(
  "SELECT id, user_id, slug, name, is_published, created_at FROM stores ORDER BY created_at",
);
for (const s of stores.rows) {
  console.log(`${s.id}  user=${s.user_id}  @${s.slug}  ${s.name}  published=${s.is_published}`);
}

console.log("\n--- listings by status/type ---");
const listings = await db.execute(
  "SELECT store_id, status, type, COUNT(*) c FROM listings GROUP BY store_id, status, type ORDER BY c DESC",
);
for (const l of listings.rows) console.log(`${l.store_id}  ${l.status}  ${l.type}  ${l.c}`);

console.log("\n--- orders ---");
const orders = await db.execute(
  "SELECT id, store_id, user_id, status, payment_status, total, created_at FROM orders ORDER BY created_at",
);
for (const o of orders.rows) {
  console.log(`${o.id}  store=${o.store_id}  user=${o.user_id}  ${o.status}/${o.payment_status}  ${o.total}`);
}

console.log("\n--- carts ---");
const carts = await db.execute("SELECT id, token, user_id, status, updated_at FROM carts ORDER BY updated_at");
for (const c of carts.rows) console.log(`${c.id}  token=${c.token}  user=${c.user_id}  ${c.status}`);

console.log("\n--- cart_items ---");
const ci = await db.execute("SELECT id, cart_id, listing_id, ticket_type_id, quantity FROM cart_items");
for (const c of ci.rows) console.log(`${c.id}  cart=${c.cart_id}  listing=${c.listing_id}  ticket_type=${c.ticket_type_id}  qty=${c.quantity}`);

db.close();
