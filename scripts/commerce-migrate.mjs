import { createClient } from '@libsql/client';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { loadEnv, projectRoot, resolveDatabase } from './load-env.mjs';
loadEnv();
const { url, authToken, isRemote } = resolveDatabase();
if (isRemote && !process.argv.includes('--approved-remote')) throw new Error('Remote migration requires explicit approval.');
if (!isRemote && !path.resolve(url.slice(5)).startsWith(projectRoot + path.sep)) throw new Error('Database must be inside the project.');
const db = createClient(authToken ? { url, authToken } : { url });
try {
  await db.execute('CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  if ((await db.execute("SELECT id FROM schema_migrations WHERE id = 'products_collections_v1'")).rows.length) { console.log('Product migration already applied.'); }
  else {
    if (!isRemote) {
      mkdirSync(path.join(projectRoot, 'data', 'backups'), { recursive: true });
      const backup = path.join(projectRoot, 'data', 'backups', `before-products-${Date.now()}.db`);
      await db.execute({ sql: 'VACUUM INTO ?', args: [backup] });
      console.log('Local database backup created.');
    }
    // Remote migration is additive: old transaction and ticket tables are never dropped.
    await db.executeMultiple(readFileSync(path.join(projectRoot, 'db/schema.sql'), 'utf8'));
    await db.batch([
      { sql: "UPDATE listings SET type = 'product', fulfilment = CASE WHEN fulfilment = 'pickup' THEN 'pickup' ELSE 'shipping' END WHERE type IN ('physical', 'fashion', 'electronics', 'furniture', 'other')", args: [] },
      { sql: "UPDATE listings SET status = 'archived', published_at = NULL WHERE type != 'product'", args: [] },
      { sql: "DELETE FROM cart_items WHERE listing_id IN (SELECT id FROM listings WHERE type != 'product') OR ticket_type_id IS NOT NULL", args: [] },
      // Old attendance Events cannot silently become public collections.
      { sql: "UPDATE events SET status = 'draft' WHERE NOT EXISTS (SELECT 1 FROM event_products ep WHERE ep.event_id = events.id)", args: [] },
      { sql: "UPDATE listings SET category_id = NULL WHERE category_id IN (SELECT id FROM categories WHERE kind NOT IN ('product', 'general') OR slug IN ('vehicles', 'vehicle-parts', 'automotive', 'cargo'))", args: [] },
      { sql: "DELETE FROM categories WHERE kind NOT IN ('product', 'general') OR slug IN ('vehicles', 'vehicle-parts', 'automotive', 'cargo')", args: [] },
      { sql: "UPDATE categories SET kind = 'product' WHERE kind = 'general'", args: [] },
      { sql: "UPDATE categories SET parent_id = NULL WHERE parent_id = 'cat_main_products'", args: [] },
      { sql: "UPDATE listings SET category_id = NULL WHERE category_id = 'cat_main_products'", args: [] },
      { sql: "DELETE FROM categories WHERE id = 'cat_main_products'", args: [] },
      { sql: "UPDATE stores SET primary_category = NULL WHERE primary_category IN ('food', 'services', 'events', 'general')", args: [] },
      { sql: "UPDATE store_settings SET design_type = NULL WHERE design_type NOT IN ('products', 'events')", args: [] },
      { sql: "INSERT INTO schema_migrations (id, applied_at) VALUES ('products_collections_v1', ?)", args: [new Date().toISOString()] },
    ], 'write');
    await db.executeMultiple(readFileSync(path.join(projectRoot, 'db/seed.sql'), 'utf8'));
    await db.execute("UPDATE categories SET name = 'Fashion' WHERE id = 'cat_platform_fashion'");
    await db.execute("UPDATE categories SET name = 'Shoes', slug = 'shoes' WHERE id = 'cat_platform_shoes'");
    await db.execute("UPDATE categories SET name = 'Home', slug = 'home' WHERE id = 'cat_platform_home'");
    console.log('Products and collection Events migrated; historical purchases preserved.');
  }
  if (!(await db.execute("SELECT id FROM schema_migrations WHERE id = 'specific_product_categories_v2'")).rows.length) {
    // Reference data is additive. Keep historical category ids and product/order
    // relationships intact; read paths hide retired catch-alls until sellers recategorise.
    await db.executeMultiple(readFileSync(path.join(projectRoot, 'db/seed.sql'), 'utf8'));
    await db.batch([
      { sql: "UPDATE stores SET primary_category = NULL WHERE lower(primary_category) IN ('other', 'others', 'miscellaneous', 'misc')", args: [] },
      { sql: "INSERT INTO schema_migrations (id, applied_at) VALUES ('specific_product_categories_v2', ?)", args: [new Date().toISOString()] },
    ], 'write');
    console.log('Specific product categories added; historical products preserved.');
  }
} finally { db.close(); }
