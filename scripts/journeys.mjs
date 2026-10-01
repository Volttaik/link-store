import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync, rmSync } from 'node:fs';
import { createClient } from '@libsql/client';
import { hashPassword } from 'better-auth/crypto';

const dir = `.cache/http-audit-${process.pid}`;
mkdirSync(dir, { recursive: true });
const url = `file:./${dir}/test.db`;
const db = createClient({ url });
await db.executeMultiple(readFileSync('db/schema.sql', 'utf8'));
await db.executeMultiple(readFileSync('db/seed.sql', 'utf8'));
const now = new Date().toISOString();
const password = 'local-audit-password-only';
for (const id of ['seller', 'buyer', 'other']) {
  await db.execute({ sql: 'INSERT INTO users (id, email, name, email_verified, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)', args: [id, `${id}@example.org`, id, now, now] });
  await db.execute({ sql: 'INSERT INTO account (id, accountId, providerId, userId, password, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)', args: [`account-${id}`, id, 'credential', id, await hashPassword(password), now, now] });
}
await db.executeMultiple(`
INSERT INTO stores (id, user_id, slug, name, is_published, primary_category) VALUES ('store', 'seller', 'audit-store', 'Audit Store', 1, 'fashion');
UPDATE stores SET logo_url = '/brand/rush-cart-logo.png', banner_url = '/brand/rush-cart-logo.png', description = 'Thoughtful products from an independent shop.', tagline = 'Everyday, well chosen.' WHERE id = 'store';
INSERT INTO store_settings (store_id) VALUES ('store');
INSERT INTO listings (id, store_id, type, title, slug, category_id, price, stock, status) VALUES ('clothing', 'store', 'product', 'Audit Shirt', 'audit-shirt', 'cat_platform_clothing', 3000, 10, 'active');
INSERT INTO listings (id, store_id, type, title, slug, category_id, price, stock, status) VALUES ('electronics', 'store', 'product', 'Audit Headphones', 'audit-headphones', 'cat_platform_electronics', 4000, 10, 'active');
INSERT INTO listings (id, store_id, type, title, slug, category_id, price, stock, status) VALUES ('product', 'store', 'product', 'Audit Jacket', 'audit-jacket', 'cat_platform_fashion', 1000, 10, 'active');
INSERT INTO listings (id, store_id, type, title, slug, category_id, price, stock, status) VALUES ('beauty', 'store', 'product', 'Audit Cream', 'audit-cream', 'cat_platform_beauty', 2000, 10, 'active');
INSERT INTO listings (id, store_id, type, title, slug, price, stock, status) VALUES ('legacy', 'store', 'rental', 'Hidden Legacy Rental', 'hidden-legacy', 1000, 10, 'active');
UPDATE listings SET description = 'Soft cotton for everyday comfort' WHERE id = 'clothing';
UPDATE listings SET stock = 0, track_inventory = 1 WHERE id = 'electronics';
INSERT INTO listing_images (id, listing_id, image_url, position) VALUES ('photo', 'product', '/brand/rush-cart-logo.png', 0);
INSERT INTO events (id, store_id, title, slug, starts_at, status) VALUES ('event', 'store', 'Summer Edit', 'summer-edit', '2026-09-30T00:00:00.000Z', 'published');
INSERT INTO event_products (event_id, product_id) VALUES ('event', 'product'), ('event', 'beauty'), ('event', 'clothing'), ('event', 'electronics');
INSERT INTO carts (id, token, user_id) VALUES ('cart', 'buyer-cart-token', 'buyer');
INSERT INTO cart_items (id, cart_id, listing_id, quantity, unit_price) VALUES ('item', 'cart', 'product', 2, 1000);
`);
const base = 'http://localhost:5001';
let log = '';
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', '5001', '-H', '127.0.0.1'], {
  env: { ...process.env, NODE_ENV: 'production', TURSO_DATABASE_URL: url, TURSO_AUTH_TOKEN: '', RESEND_API_KEY: '', PAYSTACK_SECRET_KEY: '', CLOUDFLARE_ACCOUNT_ID: '', NEXT_PUBLIC_APP_URL: base, BETTER_AUTH_URL: base, SESSION_SECRET: 'local-audit-session-secret-not-production', BETTER_AUTH_SECRET: 'local-audit-session-secret-not-production', AUTH_RATE_LIMIT_DISABLED: 'false', REPLIT_DOMAINS: 'localhost:5001', REPLIT_DEV_DOMAIN: '', GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stdout.on('data', data => { log += data; }); server.stderr.on('data', data => { log += data; });
after(async () => { server.kill('SIGTERM'); await new Promise(resolve => server.once('exit', resolve)); db.close(); rmSync(dir, { recursive: true, force: true }); });
for (let attempt = 0; attempt < 80; attempt++) {
  try { if ((await fetch(`${base}/manifest.webmanifest`)).ok) break; } catch { /* Booting. */ }
  await new Promise(resolve => setTimeout(resolve, 250));
  if (attempt === 79) throw new Error(`Audit server did not start: ${log}`);
}
async function page(route, cookie = '') { const response = await fetch(`${base}${route}`, { headers: { cookie }, redirect: 'manual' }); return { status: response.status, html: await response.text(), headers: response.headers }; }
async function login(id) {
  const response = await fetch(`${base}/api/auth/sign-in/email`, { method: 'POST', headers: { 'Content-Type': 'application/json', origin: base }, body: JSON.stringify({ email: `${id}@example.org`, password }) });
  assert.equal(response.status, 200, await response.clone().text());
  return response.headers.getSetCookie().map(cookie => cookie.split(';')[0]).join('; ');
}
let buyerCookie, sellerCookie, otherCookie;
test('real password login returns account sessions', async () => { buyerCookie = await login('buyer'); sellerCookie = await login('seller'); otherCookie = await login('other'); assert.ok(buyerCookie.includes('session_token')); });
test('public product, store, collection, legal and auth pages render', async () => {
  for (const route of ['/', '/products', '/stores', '/people', '/events', '/@audit-store', '/listing/product', '/events/event', '/search?q=Jacket', '/cart', '/orders', '/settings', '/sign-in', '/sign-up', '/forgot-password', '/privacy', '/terms', '/cookies', '/faq', '/support']) {
    const result = await page(route); assert.ok([200, 307].includes(result.status), `${route}: ${result.status}`); if (result.status === 200) assert.ok(result.html.includes('Rush Cart'), route);
  }
});
test('category result state and data are aligned', async () => {
  const result = await page('/products?category=cat_platform_fashion'); assert.equal(result.status, 200);
  assert.ok(result.html.includes('Audit Jacket')); assert.ok(!result.html.includes('Audit Cream')); assert.ok(!result.html.includes('Hidden Legacy Rental')); assert.ok(result.html.includes('Fashion'));
});
test('product companion actions use the actual shop relationship for guest and buyer', async () => {
  for (const cookie of ['', buyerCookie]) {
    const result = await page('/listing/product', cookie);
    assert.equal(result.status, 200);
    assert.match(result.html, /Ask About This Product/);
    assert.match(result.html, /href="\/@audit-store"[^>]*>Open Shop/);
  }
});
test('multiple categories, descendants and empty selections filter correctly', async () => {
  for (const [id, included, excluded] of [['fashion', 'Audit Shirt', 'Audit Headphones'], ['electronics', 'Audit Headphones', 'Audit Jacket'], ['beauty', 'Audit Cream', 'Audit Shirt']]) {
    const result = await page(`/products?category=cat_platform_${id}`);
    assert.equal(result.status, 200); assert.ok(result.html.includes(included)); assert.ok(!result.html.includes(excluded));
  }
  assert.ok((await page('/products?category=cat_platform_digital')).html.includes('No products in Digital yet'));
});
test('shop search and real filters stay scoped for guests and signed-in users', async () => {
  for (const cookie of ['', buyerCookie, sellerCookie]) {
    for (const [query, included, excluded] of [['q=Jacket', 'product', 'beauty'], ['q=cotton', 'clothing', 'product'], ['min=15&max=25', 'beauty', 'clothing'], ['stock=1', 'product', 'electronics']]) {
      const result = await page(`/@audit-store?${query}`, cookie);
      assert.equal(result.status, 200);
      const catalogue = result.html.slice(result.html.indexOf('id="shop-catalogue"')).split('</section>')[0];
      assert.ok(catalogue.includes(`data-product-card="${included}"`), query);
      assert.ok(!catalogue.includes(`data-product-card="${excluded}"`), query);
    }
    assert.ok((await page('/@audit-store?q=no-match', cookie)).html.includes('No products match this selection'));
  }
});
test('Rush Cart identity and hero replace old customer-facing branding', async () => {
  const home = await page('/'); assert.match(home.html, /Get what you want/); assert.ok(!home.html.includes('Welcome to Rush Cart</text>'));
  for (const route of ['/', '/products', '/@audit-store', '/listing/product']) {
    const result = await page(route); assert.match(result.html, /<title>[^<]*Rush Cart/); assert.ok(!/LinkStore|Link Store/.test(result.html));
  }
  for (const route of ['/favicon.ico', '/icon.png', '/apple-icon.png', '/brand/rush-cart-icon.png']) assert.equal((await page(route)).status, 200);
});
test('removed commerce is inaccessible, including old listing detail', async () => {
  for (const route of ['/food', '/rentals', '/property', '/cars', '/cargo', '/services', '/tickets', '/tickets/checkout', '/workspace/food', '/workspace/services', '/workspace/rentals', '/workspace/tickets', '/listing/legacy']) { const result = await page(route, sellerCookie); assert.ok(result.status === 404 || (result.status === 200 && result.html.includes('NEXT_HTTP_ERROR_FALLBACK;404')), `${route}: must render Not Found, never retired commerce`); }
});
test('seller pages render and category creation is hydrated', async () => {
  for (const route of ['/workspace', '/workspace/listings', '/workspace/listings/product', '/workspace/listings/new?category=cat_platform_fashion', '/workspace/events', '/workspace/events/new', '/workspace/events/event', '/workspace/orders', '/workspace/customers', '/workspace/inventory', '/workspace/settings', '/workspace/finance']) assert.equal((await page(route, sellerCookie)).status, 200, route);
  const category = await page('/workspace/listings?category=cat_platform_fashion', sellerCookie); assert.ok(category.html.includes('Audit Jacket')); const resultsHtml = category.html.slice(category.html.indexOf('<article class="ls-card'));
  assert.ok(!resultsHtml.split('</main>')[0].includes('href="/workspace/listings/beauty"'));
  
   assert.ok(category.html.includes('/workspace/listings/new?category=cat_platform_fashion'));
  const create = await page('/workspace/listings/new?category=cat_platform_fashion', sellerCookie); assert.ok(create.html.includes('New Fashion product')); assert.ok(create.html.includes('defaultCategoryId'));
});
test('normal accounts cannot enter seller management; anonymous access is gated', async () => {
  const buyerPage = await page('/workspace/listings', buyerCookie);
  assert.ok(buyerPage.status === 307 || buyerPage.html.includes('NEXT_REDIRECT')); assert.ok(!buyerPage.html.includes('href="/workspace/listings/product"'));
  assert.equal((await page('/workspace')).status, 307);
  assert.equal((await page('/admin', buyerCookie)).status, 307);
});
test('HTTP cart isolation resists another account replaying the cart token', async () => {
  assert.ok((await page('/cart', `${buyerCookie}; ls_cart=buyer-cart-token`)).html.includes('Audit Jacket'));
  assert.ok(!(await page('/cart', `${otherCookie}; ls_cart=buyer-cart-token`)).html.includes('Audit Jacket'));
  assert.ok(!(await page('/cart', 'ls_cart=buyer-cart-token')).html.includes('Audit Jacket'));
});
test('logout invalidates actual session and clears account shopping cookies', async () => {
  const response = await fetch(`${base}/logout`, { method: 'POST', headers: { cookie: buyerCookie, origin: base } }); assert.equal(response.status, 200);
  const setCookies = response.headers.getSetCookie().join(';'); assert.ok(setCookies.includes('ls_cart=')); assert.ok(setCookies.includes('ls_orders='));
  assert.equal((await page('/workspace', buyerCookie)).status, 307);
  assert.ok(!(await page('/cart', `${buyerCookie}; ls_cart=buyer-cart-token`)).html.includes('Audit Jacket'));
  await new Promise(resolve => setTimeout(resolve, 11000));
  const signedInAgain = await login('buyer'); assert.ok((await page('/cart', signedInAgain)).html.includes('Audit Jacket'));
});
test('real browser selectors, consent and mobile/desktop geometry', async () => {
  const { auditBrowser } = await import('./browser-audit.mjs');
  await auditBrowser(base, sellerCookie, await login('buyer'));
});
test('production server logs contain no schema mismatch or runtime errors', () => { assert.ok(!/Database schema mismatch|TypeError:|SQLITE_ERROR|ReferenceError:/.test(log), log); });
