import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import Module from 'node:module';
import { readFileSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

// No environment loading: never inherit a real provider or database target.
const root = process.cwd();
const dir = path.join(root, '.cache', `platform-test-${process.pid}`);
mkdirSync(dir, { recursive: true });
process.env.TURSO_DATABASE_URL = `file:${dir}/test.db`;
process.env.TURSO_AUTH_TOKEN = '';
process.env.RESEND_API_KEY = 'mock-only';
process.env.RESEND_FROM_EMAIL = 'Rush Cart <orders@shop.example.org>';
process.env.NEXT_PUBLIC_APP_URL = 'https://shop.example.org';
process.env.PAYSTACK_SECRET_KEY = 'mock-only';
process.env.NODE_ENV = 'production';
const webpush = requireWebPush();
function requireWebPush() { return createRequire(import.meta.url)('web-push'); }
const vapid = webpush.generateVAPIDKeys();
process.env.VAPID_PUBLIC_KEY = vapid.publicKey;
process.env.VAPID_PRIVATE_KEY = vapid.privateKey;
process.env.VAPID_SUBJECT = 'mailto:support@example.org';
const require = createRequire(import.meta.url);
const load = Module._load;
Module._load = function(id, parent, ...rest) {
  if (id === 'server-only') return {};
  if (id === 'next/headers') return { headers: async () => new Headers() };
  if (id === '@/components/ui/Icon') return { isIconName: () => false };
  if (id.startsWith('@/')) id = path.join(root, id.slice(2));
  return load.call(this, id, parent, ...rest);
};
require.extensions['.ts'] = (module, filename) => {
  const source = readFileSync(filename, 'utf8');
  module._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
};
const { db, queryOne } = require('../lib/db.ts');
await db.executeMultiple(readFileSync('db/schema.sql', 'utf8'));
await db.executeMultiple(readFileSync('db/seed.sql', 'utf8'));
const commerce = require('../lib/server/commerce.ts');
const events = require('../lib/server/events.ts');
const email = require('../lib/server/email.ts');
const safety = require('../lib/email-safety.ts');
const templates = require('../lib/server/email-templates.ts');
const requests = require('../lib/server/payment-requests.ts');
const listings = require('../lib/server/listings.ts');
const receipts = require('../lib/receipts.ts');
const sent = [];
const originalFetch = globalThis.fetch;
const verifiedPayments = new Map();
globalThis.fetch = async (url, options) => {
  if (String(url).startsWith('https://api.paystack.co/transaction/verify/')) {
    const reference = decodeURIComponent(String(url).split('/').pop());
    assert.ok(verifiedPayments.has(reference), 'Only explicitly mocked payments may be verified');
    return new Response(JSON.stringify({ status: true, data: { reference, currency: 'NGN', paid_at: now, ...verifiedPayments.get(reference) } }), { status: 200 });
  }
  assert.equal(url, 'https://api.resend.com/emails', 'No unmocked external provider calls allowed');
  const body = JSON.parse(options.body); sent.push({ body, headers: options.headers });
  return new Response(JSON.stringify({ id: `mock-${sent.length}` }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
const now = new Date().toISOString();
for (const id of ['seller', 'buyer', 'other']) await db.execute({ sql: 'INSERT INTO users (id, email, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', args: [id, `${id}@example.org`, id, now, now] });
for (const [id, owner] of [['store', 'seller'], ['foreign', 'other']]) {
  await db.execute({ sql: 'INSERT INTO stores (id, user_id, slug, name, is_published, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)', args: [id, owner, id, id, now, now] });
  await db.execute({ sql: 'INSERT INTO store_settings (store_id, updated_at) VALUES (?, ?)', args: [id, now] });
}
for (const [id, store, type] of [['product', 'store', 'product'], ['foreign-product', 'foreign', 'product'], ['removed', 'store', 'rental']]) await db.execute({ sql: "INSERT INTO listings (id, store_id, type, title, slug, price, stock, status, category_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1000, 3, 'active', 'cat_platform_fashion', ?, ?)", args: [id, store, type, id, id, now, now] });

const input = { title: 'Summer edit', status: 'published', productIds: ['product'] };
test('email URL guard rejects local, preview, storage, API, unsafe schemes', () => {
  for (const url of ['http://localhost:5000', 'https://127.0.0.1', 'https://10.0.0.1', 'https://preview.vercel.app', 'https://x.replit.dev', 'https://x.r2.dev', 'https://files.catbox.moe/logo.png', 'https://shop.example.org/api/auth/reset', '/orders', 'javascript:alert(1)']) assert.equal(safety.isProductionEmailUrl(url), false, url);
  assert.equal(safety.isProductionEmailUrl('https://shop.example.org/orders/token'), true);
});
test('email shell escapes dynamic headings and row values and embeds CID', () => {
  const html = templates.brandShell({ title: '<script>alert(1)</script>', preheader: '<b>hi</b>', body: templates.emailRows([{ label: '<img>', value: 'A & B' }]) });
  assert.ok(!html.includes('<script>')); assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('A &amp; B')); assert.ok(html.includes('src="cid:rush-cart-logo"'));
  assert.ok(!html.includes('catbox')); assert.ok(templates.brandText(['hello']).includes('Rush Cart'));
});
test('email send uses actual PNG inline attachment, text and provider idempotency', async () => {
  const result = await email.sendEmail({ to: 'buyer@example.org', subject: 'Rush Cart test', html: templates.brandShell({ title: 'Receipt', preheader: 'Paid', body: templates.emailButton('Order', 'https://shop.example.org/orders/token') }), text: templates.brandText(['Receipt']), meta: { dedupeKey: 'test-receipt', kind: 'invoice' } });
  assert.equal(result.ok, true);
  const message = sent.at(-1); assert.equal(message.body.from, process.env.RESEND_FROM_EMAIL);
  assert.equal(message.body.attachments[0].content_id, 'rush-cart-logo');
  assert.deepEqual(Buffer.from(message.body.attachments[0].content, 'base64'), readFileSync('public/brand/rush-cart-logo.png'));
  assert.ok(message.headers['Idempotency-Key']); assert.ok(message.body.text);
  const before = sent.length; await email.sendEmail({ to: 'buyer@example.org', subject: 'Rush Cart test', html: '', text: '', meta: { dedupeKey: 'test-receipt' } }); assert.equal(sent.length, before);
});
test('unsafe email URL blocks provider delivery', async () => {
  const before = sent.length;
  const result = await email.sendEmail({ to: 'buyer@example.org', subject: 'Reset', html: '<a href="http://localhost:5000/reset">Reset</a>', text: 'Reset' });
  assert.equal(result.ok, false); assert.equal(sent.length, before);
});
test('all account and chat templates use branded HTML/text and safe links', async () => {
  const methods = [
    () => email.sendSignInCodeEmail({ to: 'buyer@example.org', code: '123456', expiresInMinutes: 10 }),
    () => email.sendWelcomeEmail({ to: 'buyer@example.org', name: 'Buyer' }),
    () => email.sendPasswordResetEmail({ to: 'buyer@example.org', name: 'Buyer', resetUrl: 'https://shop.example.org/reset-password?token=abc', expiresInMinutes: 60 }),
    () => email.sendPasswordChangedEmail({ to: 'buyer@example.org', name: 'Buyer' }),
    () => email.sendMessageNotificationEmail({ to: 'buyer@example.org', name: 'Buyer', fromName: 'Seller', preview: '<img src=x onerror=alert(1)>', conversationId: 'thread', day: '2026-09-30' }),
  ];
  for (const send of methods) { assert.equal((await send()).ok, true); const { body } = sent.at(-1); assert.ok(body.html.includes('cid:rush-cart-logo')); assert.ok(body.text.includes('Rush Cart')); assert.equal(safety.emailSafetyError(body, process.env.NEXT_PUBLIC_APP_URL), null); }
  assert.ok(!sent.at(-1).body.html.includes('<img src=x'));
});
test('collections validate ownership and publication and preserve underlying products', async () => {
  assert.equal((await events.createEvent('store', { ...input, productIds: ['foreign-product'] })).ok, false);
  assert.equal((await events.createEvent('store', { ...input, productIds: ['removed'] })).ok, false);
  assert.equal((await events.createEvent('store', { ...input, productIds: [] })).ok, false);
  const result = await events.createEvent('store', input); assert.equal(result.ok, true);
  assert.equal((await events.getEventDetail(result.eventId)).products[0].id, 'product');
  assert.equal((await events.updateEvent(result.eventId, 'foreign', input)).ok, false);
  assert.equal((await events.updateEvent(result.eventId, 'store', { ...input, status: 'draft', productIds: [] })).ok, true);
  assert.ok(await queryOne('SELECT id FROM listings WHERE id = ?', ['product']));
  assert.equal((await events.getEventDetail(result.eventId)).productIds.length, 0);
  await events.deleteEvent({ eventId: result.eventId, storeId: 'store' });
});
test('database rejects cross-store Event links', async () => {
  const result = await events.createEvent('store', { ...input, status: 'draft', productIds: [] });
  await assert.rejects(db.execute({ sql: 'INSERT INTO event_products (event_id, product_id) VALUES (?, ?)', args: [result.eventId, 'foreign-product'] }));
});
let cart;
test('cart ownership isolation, quantity validation, persistence and removal', async () => {
  const result = await commerce.addToCart({ listingId: 'product', quantity: 2, cartToken: null, userId: 'buyer' }); assert.equal(result.ok, true); cart = result;
  assert.equal((await commerce.resolveActiveCart(result.cartToken, 'buyer')).id, result.cartId);
  assert.equal(await commerce.resolveActiveCart(result.cartToken, 'other'), null);
  assert.equal(await commerce.resolveActiveCart(result.cartToken, null), null);
  assert.equal((await commerce.addToCart({ listingId: 'product', quantity: 2, cartToken: result.cartToken, userId: 'buyer' })).ok, false);
  for (const quantity of [NaN, 1.5, -1, 51]) assert.equal((await commerce.addToCart({ listingId: 'product', quantity, cartToken: result.cartToken, userId: 'buyer' })).ok, false);
  assert.equal((await commerce.addToCart({ listingId: 'removed', quantity: 1, cartToken: null, userId: 'buyer' })).ok, false);
  const view = await commerce.getCartView(result.cartId);
  assert.equal(view.itemCount, 2); assert.equal((await commerce.updateCartItem(result.cartId, view.items[0].id, 1)).ok, true);
  assert.equal((await commerce.updateCartItem(result.cartId, view.items[0].id, NaN)).ok, false);
  assert.equal((await commerce.getCartView(result.cartId)).itemCount, 1);
});
test('checkout rejects other account cart and computes price from server', async () => {
  const customer = { email: 'buyer@example.org', name: 'Buyer' };
  assert.equal((await commerce.createOrderFromCart({ cartId: cart.cartId, userId: 'other', customer })).ok, false);
  const order = await commerce.createOrderFromCart({ cartId: cart.cartId, userId: 'buyer', customer }); assert.equal(order.ok, true);
  assert.equal(order.order.total, 1000); assert.equal(order.order.payment_status, 'unpaid');
  assert.equal((await commerce.getCartView(cart.cartId)).itemCount, 1, 'Starting checkout preserves the basket');
  cart.orderId = order.order.id;
  assert.equal((await queryOne('SELECT stock FROM listings WHERE id = ?', ['product'])).stock, 3);
});
test('verified settlement changes stock, cart and ledger exactly once and generates a branded receipt', async () => {
  const reference = 'settlement-success';
  await commerce.recordPaymentIntent({ orderId: cart.orderId, storeId: 'store', reference, amount: 1000, currency: 'NGN', authorizationUrl: 'https://checkout.paystack.com/mock' });
  verifiedPayments.set(reference, { status: 'success', amount: 1000 });
  const result = await commerce.verifyAndFulfilPayment(reference); assert.equal(result.status, 'success');
  assert.equal((await queryOne('SELECT stock FROM listings WHERE id = ?', ['product'])).stock, 2);
  assert.equal((await commerce.getCartView(cart.cartId)).itemCount, 0);
  assert.equal((await queryOne('SELECT payment_status FROM orders WHERE id = ?', [cart.orderId])).payment_status, 'paid');
  const count = (await queryOne('SELECT COUNT(*) AS total FROM transactions WHERE order_id = ?', [cart.orderId])).total;
  assert.equal((await commerce.verifyAndFulfilPayment(reference)).status, 'already');
  assert.equal((await queryOne('SELECT COUNT(*) AS total FROM transactions WHERE order_id = ?', [cart.orderId])).total, count);
  const receipt = sent.find(message => message.body.subject.startsWith('Your order is confirmed'));
  assert.ok(receipt); assert.ok(receipt.body.html.includes('cid:rush-cart-logo')); assert.ok(receipt.body.html.includes('product'));
});
test('failed, pending and mismatched payments never fulfil or empty the basket', async () => {
  for (const [reference, status, amount] of [['failure', 'failed', 1000], ['pending', 'pending', 1000], ['mismatch', 'success', 999]]) {
    const add = await commerce.addToCart({ listingId: 'product', quantity: 1, cartToken: null, userId: 'other' });
    const order = await commerce.createOrderFromCart({ cartId: add.cartId, userId: 'other', customer: { email: 'other@example.org' } });
    assert.equal(order.ok, true);
    await commerce.recordPaymentIntent({ orderId: order.order.id, storeId: 'store', reference, amount: order.order.total, currency: 'NGN', authorizationUrl: 'https://checkout.paystack.com/mock' });
    verifiedPayments.set(reference, { status, amount });
    assert.equal((await commerce.verifyAndFulfilPayment(reference)).ok, false);
    assert.notEqual((await queryOne('SELECT payment_status FROM orders WHERE id = ?', [order.order.id])).payment_status, 'paid');
    assert.ok((await commerce.getCartView(add.cartId)).itemCount > 0);
    // Reset only this fixture's basket so the next test has the same server total.
    for (const item of (await commerce.getCartView(add.cartId)).items) await commerce.removeCartItem(add.cartId, item.id);
  }
  assert.equal((await queryOne('SELECT stock FROM listings WHERE id = ?', ['product'])).stock, 2);
});
test('seller cannot fake payment/refund or fulfil an unpaid order', async () => {
  const unpaid = await queryOne("SELECT id FROM orders WHERE payment_status = 'failed' LIMIT 1");
  for (const status of ['paid', 'refunded', 'fulfilled', 'invalid']) assert.equal((await commerce.setOrderStatus({ orderId: unpaid.id, storeId: 'store', status })).ok, false);
});

test('discovery excludes removed commerce and category values are canonical', async () => {
  const products = await listings.listListings({ storeId: 'store', status: 'active', categoryId: 'cat_platform_fashion' });
  assert.deepEqual(products.map(product => product.id), ['product']);
});
test('payment requests reject foreign/removed context and unauthorised actors', async () => {
  await db.execute({ sql: "INSERT INTO conversations (id, store_id, listing_id, buyer_user_id) VALUES ('thread', 'store', 'product', 'buyer')", args: [] });
  const base = { actorId: 'seller', conversationId: 'thread', amountMinor: 1000 };
  assert.equal((await requests.createPaymentRequest({ ...base, actorId: 'other' })).ok, false);
  assert.equal((await requests.createPaymentRequest({ ...base, listingId: 'foreign-product' })).ok, false);
  assert.equal((await requests.createPaymentRequest({ ...base, listingId: 'removed' })).ok, false);
  const request = await requests.createPaymentRequest(base); assert.equal(request.ok, true);
  const id = request.message.paymentRequestId;
  assert.equal(request.message.paymentRequest.listingId, 'product');
  assert.equal((await requests.startPaymentRequestCheckout({ actorId: 'other', paymentRequestId: id })).ok, false);
  await db.execute({ sql: "UPDATE payment_requests SET status = 'paid' WHERE id = ?", args: [id] });
  assert.equal((await requests.startPaymentRequestCheckout({ actorId: 'buyer', paymentRequestId: id })).ok, false);
  assert.equal((await requests.cancelPaymentRequest({ actorId: 'seller', paymentRequestId: id })).ok, false);
});
test('new receipts use Rush Cart prefix; legacy issued receipts remain valid', () => {
  assert.equal(receipts.receiptQrPayload('RC-123'), 'RUSHCART:RECEIPT:RC-123');
  assert.equal(receipts.normaliseReceiptCode('LINKSTORE:RECEIPT:RC-123'), 'RC-123');
});
test('canonical definitions match database reference data and expose no catch-all', async () => {
  const { PRODUCT_CATEGORY_DEFINITIONS, isGenericCategory } = require('../lib/categories.ts');
  const stores = require('../lib/server/stores.ts');
  const categories = await stores.listPlatformCategories();
  assert.equal(categories.length, PRODUCT_CATEGORY_DEFINITIONS.length);
  for (const definition of PRODUCT_CATEGORY_DEFINITIONS) {
    const row = categories.find(category => category.id === `cat_platform_${definition.slug}`);
    assert.equal(row?.name, definition.name);
    assert.equal(row?.parent_id, definition.parent ? `cat_platform_${definition.parent}` : null);
    assert.equal(isGenericCategory(row?.name), false);
  }
});
test('retired catch-alls stay safe to read but cannot be selected or recreated', async () => {
  const stores = require('../lib/server/stores.ts');
  const categories = require('../lib/server/categories.ts');
  await db.execute("INSERT INTO categories (id, name, slug, kind) VALUES ('retired', 'Other', 'other', 'product')");
  await db.execute("UPDATE listings SET category_id = 'retired' WHERE id = 'foreign-product'");
  assert.equal((await listings.getListingDetail('foreign-product')).categoryName, null);
  assert.ok(!(await stores.listAvailableCategories('store')).some(category => category.id === 'retired'));
  assert.ok(!(await categories.listCategoryOptions('store', 'product')).some(category => category.id === 'retired'));
  const base = { type: 'product', title: 'Specific product', price: 1000, stock: 1, trackInventory: true, status: 'draft', isFeatured: false, images: [], variants: [] };
  assert.equal((await listings.createListing('store', { ...base, categoryId: 'retired' })).ok, false);
  for (const name of ['Other', 'Others', 'O-T-H-E-R', 'Miscellaneous']) assert.equal((await stores.createCategory({ storeId: 'store', userId: 'seller', name })).ok, false);
  assert.deepEqual(await listings.listListings({ categoryIds: await categories.categorySubtreeIdList('invalid'), status: 'active' }), []);
  const created = await listings.createListing('store', { ...base, categoryId: 'cat_platform_digital' });
  assert.equal(created.ok, true);
  assert.equal((await listings.updateListing(created.listingId, 'store', { ...base, categoryId: 'cat_platform_books', status: 'active', images: [{ url: 'https://shop.example.org/product.png', key: null }] })).ok, true);
  assert.equal((await listings.getListingDetail(created.listingId)).categoryName, 'Books & stationery');
  assert.equal((await listings.deleteListing({ listingId: created.listingId, storeId: 'store', userId: 'seller' })).ok, true);
});
test('shop creation and editing are logo-led and preserve unused legacy covers', async () => {
  const stores = require('../lib/server/stores.ts');
  await db.execute("INSERT INTO users (id, email, name) VALUES ('new-owner', 'new-owner@example.org', 'New Owner')");
  const created = await stores.createStore({ userId: 'new-owner', name: 'Logo Shop', slug: 'logo-shop', logoUrl: '/brand/rush-cart-logo.png', description: 'Carefully chosen products', primaryCategory: 'fashion' });
  assert.equal(created.ok, true);
  assert.equal(created.store.logo_url, '/brand/rush-cart-logo.png');
  assert.equal(created.store.banner_url, null);
  await db.execute({ sql: 'UPDATE stores SET banner_url = ? WHERE id = ?', args: ['/legacy-cover.jpg', created.store.id] });
  const edited = await stores.updateStore(created.store.id, 'new-owner', { name: 'Refined Logo Shop', description: 'Updated shop story', logoUrl: '/updated-logo.png' });
  assert.equal(edited.ok, true); assert.equal(edited.store.name, 'Refined Logo Shop'); assert.equal(edited.store.logo_url, '/updated-logo.png');
  assert.equal(edited.store.banner_url, '/legacy-cover.jpg', 'Legacy data remains untouched');
  for (const file of ['components/workspace/StoreOnboardingForm.tsx', 'components/workspace/SettingsForms.tsx', 'components/cards/ShopCard.tsx', 'app/(market)/[handle]/page.tsx', 'app/actions/store.ts', 'lib/server/discovery.ts']) assert.ok(!/banner_url|bannerUrl|Shop cover|Upload cover/.test(readFileSync(file, 'utf8')), file);
});
test('product lifecycle preserves saved currency, photos, category and stable option identities', async () => {
  const input = { type: 'product', title: 'Lifecycle product', description: 'Original description', price: 1234, stock: 4, trackInventory: true, status: 'active', categoryId: 'cat_platform_fashion', isFeatured: false, images: [{ url: 'https://shop.example.org/photo.png', key: 'photo' }], variants: [{ name: 'Blue', price: 1500, stock: 4 }] };
  assert.equal((await listings.createListing('store', { ...input, categoryId: null })).ok, false);
  assert.equal((await listings.createListing('store', { ...input, images: [] })).ok, false);
  const created = await listings.createListing('store', input); assert.equal(created.ok, true);
  const before = await listings.getListingDetail(created.listingId);
  assert.equal(before.currency, 'NGN'); assert.equal(before.price, 1234); assert.equal(before.images[0].storage_key, 'photo');
  await db.execute("UPDATE stores SET currency = 'USD' WHERE id = 'store'");
  const edited = { ...input, title: 'Updated product', description: 'Updated description', categoryId: 'cat_platform_electronics', price: 2345, variants: [{ id: before.variants[0].id, name: 'Blue updated', stock: 3, price: 1600 }] };
  assert.equal((await listings.updateListing(created.listingId, 'foreign', edited)).ok, false);
  assert.equal((await listings.updateListing(created.listingId, 'store', edited)).ok, true);
  const after = await listings.getListingDetail(created.listingId);
  assert.equal(after.currency, 'NGN'); assert.equal(after.categoryId, 'cat_platform_electronics'); assert.equal(after.price, 2345);
  assert.equal(after.description, 'Updated description'); assert.equal(after.title, 'Updated product'); assert.equal(after.stock, 3);
  assert.equal(after.variants[0].id, before.variants[0].id); assert.equal(after.images[0].image_url, input.images[0].url);
  assert.equal(after.storeId, 'store'); assert.equal(after.status, 'active');
  const draft = await listings.createListing('store', { ...input, title: 'Incomplete draft', status: 'draft', images: [] });
  assert.equal(draft.ok, true); assert.equal((await listings.setListingStatus({ listingId: draft.listingId, storeId: 'store', status: 'active' })).ok, false);
  await db.execute("UPDATE stores SET currency = 'NGN' WHERE id = 'store'");
});
test('push rejects unsafe endpoints and subscriptions cascade on logout', async () => {
  const push = require('../lib/server/push.ts');
  const subscription = { endpoint: 'https://fcm.googleapis.com/fcm/send/test', keys: { p256dh: 'a'.repeat(87), auth: 'b'.repeat(22) } };
  assert.equal(push.validPushSubscription(subscription), true);
  for (const endpoint of ['http://fcm.googleapis.com/test', 'https://localhost/test', 'https://127.0.0.1/test', 'https://fcm.googleapis.com.evil.org/test', 'https://user:pass@fcm.googleapis.com/test']) assert.equal(push.validPushSubscription({ ...subscription, endpoint }), false);
  await db.execute({ sql: "INSERT INTO sessions (id, token, user_id, expires_at) VALUES ('push-session', 'push-token', 'buyer', ?)", args: [new Date(Date.now() + 3600000).toISOString()] });
  await push.savePushSubscription('buyer', 'push-session', subscription);
  assert.equal((await queryOne('SELECT user_id FROM push_subscriptions WHERE endpoint = ?', [subscription.endpoint])).user_id, 'buyer');
  const originalSend = webpush.sendNotification;
  const deliveries = [];
  webpush.sendNotification = async (subscription, payload) => { deliveries.push({ subscription, data: JSON.parse(payload) }); return { statusCode: 201, body: '', headers: {} }; };
  try {
    assert.deepEqual(await push.sendAccountPush('other', { title: 'Rush Cart', body: 'Update', url: '/orders', tag: 'test' }), { sent: 0, failed: 0 });
    assert.deepEqual(await push.sendAccountPush('buyer', { title: 'Rush Cart', body: 'Update', url: '/orders', tag: 'test' }), { sent: 1, failed: 0 });
    assert.equal(deliveries[0].data.userId, 'buyer'); assert.equal(deliveries[0].data.url, '/orders');
    await db.execute("UPDATE sessions SET expires_at = '2000-01-01T00:00:00.000Z' WHERE id = 'push-session'");
    assert.deepEqual(await push.sendAccountPush('buyer', { title: 'Rush Cart', body: 'Update', url: '/orders', tag: 'test' }), { sent: 0, failed: 0 });
    await db.execute({ sql: "UPDATE sessions SET expires_at = ? WHERE id = 'push-session'", args: [new Date(Date.now() + 3600000).toISOString()] });
    webpush.sendNotification = async () => { throw { statusCode: 410 }; };
    assert.deepEqual(await push.sendAccountPush('buyer', { title: 'Rush Cart', body: 'Update', url: '/orders', tag: 'test' }), { sent: 0, failed: 1 });
    assert.equal(await queryOne('SELECT endpoint FROM push_subscriptions WHERE endpoint = ?', [subscription.endpoint]), null);
    await push.savePushSubscription('buyer', 'push-session', subscription);
  } finally { webpush.sendNotification = originalSend; }
  await db.execute("DELETE FROM sessions WHERE id = 'push-session'");
  assert.equal(await queryOne('SELECT endpoint FROM push_subscriptions WHERE endpoint = ?', [subscription.endpoint]), null);
});

after(() => { db.close(); globalThis.fetch = originalFetch; Module._load = load; rmSync(dir, { recursive: true, force: true }); });
