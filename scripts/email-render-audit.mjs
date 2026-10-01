/**
 * Email render audit — verifies what the templates actually render, not merely
 * that they compile.
 *
 * Every supported transactional send is composed through the real `email.ts`
 * functions against a disposable database with the provider mocked (nothing
 * leaves this machine). Each captured HTML is rendered in headless Chromium at
 * desktop, tablet and mobile widths — with the inline CID logo resolved to the
 * real PNG bytes, exactly as a mail client would — and checked for: the logo
 * rendering at its true aspect, no horizontal overflow, usable buttons, no
 * clipped text, invoice rows lining up, and no internal/unsafe information in
 * the message body.
 *
 * Run: node scripts/email-render-audit.mjs
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import Module from 'node:module';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const dir = path.join(root, '.cache', `email-render-${process.pid}`);
mkdirSync(dir, { recursive: true });
process.env.TURSO_DATABASE_URL = `file:${dir}/test.db`;
process.env.TURSO_AUTH_TOKEN = '';
process.env.RESEND_API_KEY = 'mock-only';
process.env.RESEND_FROM_EMAIL = 'Rush Cart <orders@shop.example.org>';
process.env.RESEND_REPLY_TO_EMAIL = 'support@shop.example.org';
process.env.NEXT_PUBLIC_APP_URL = 'https://shop.example.org';
process.env.PAYSTACK_SECRET_KEY = 'mock-only';
process.env.NODE_ENV = 'production';

const require = createRequire(import.meta.url);
const load = Module._load;
Module._load = function (id, parent, ...rest) {
  if (id === 'server-only') return {};
  if (id === 'next/headers') return { headers: async () => new Headers() };
  if (id.startsWith('@/')) id = path.join(root, id.slice(2));
  return load.call(this, id, parent, ...rest);
};
require.extensions['.ts'] = (module, filename) => {
  const source = readFileSync(filename, 'utf8');
  module._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
};

const { db } = require('../lib/db.ts');
await db.executeMultiple(readFileSync('db/schema.sql', 'utf8'));
await db.executeMultiple(readFileSync('db/seed.sql', 'utf8'));
const email = require('../lib/server/email.ts');

const sent = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  assert.equal(String(url), 'https://api.resend.com/emails', 'the render audit never talks to a real provider');
  sent.push(JSON.parse(options.body));
  return new Response(JSON.stringify({ id: `mock-${sent.length}` }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

// --- Fixtures ----------------------------------------------------------------
const now = new Date().toISOString();
const sql = (statement, args = []) => db.execute({ sql: statement, args });
await sql('INSERT INTO users (id, email, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', ['seller', 'seller@example.org', 'Ada Seller', now, now]);
await sql('INSERT INTO users (id, email, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', ['buyer', 'buyer@example.org', 'Bola Buyer', now, now]);
await sql('INSERT INTO stores (id, user_id, slug, name, is_published, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)', ['store', 'seller', 'audit-store', 'Audit Store', now, now]);
await sql("INSERT INTO store_settings (store_id, updated_at) VALUES (?, ?)", ['store', now]);
for (const id of ['listing-1', 'listing-2']) await sql("INSERT INTO listings (id, store_id, type, title, slug, price, stock, status, category_id, created_at, updated_at) VALUES (?, 'store', 'product', ?, ?, 1000, 3, 'active', 'cat_platform_fashion', ?, ?)", [id, id, id, now, now]);
await sql('INSERT INTO orders (id, order_number, store_id, customer_id, user_id, email, customer_name, currency, subtotal, discount_total, shipping_total, tax_total, total, status, payment_status, discount_code, shipping_address, access_token, source, fulfilment_method, estimated_delivery, receipt_code, created_at, updated_at, paid_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ['order-1', 'RC-1001', 'store', null, 'buyer', 'buyer@example.org', 'Bola Buyer', 'NGN', 20000, 1000, 2000, 500, 21500, 'pending', 'paid', 'WELCOME10', '{"line1":"12 Market Street","city":"Lagos","country":"NG"}', 'tok_audit_1', 'cart', 'delivery', '3–5 days', 'RC-RECEIPT-1001', now, now, now]);
await sql('INSERT INTO order_items (id, order_id, item_type, listing_id, title, variant_name, unit_price, quantity, total, currency, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ['item-1', 'order-1', 'product', 'listing-1', 'Handwoven carry basket', 'Large', 12000, 1, 12000, 'NGN', now]);
await sql('INSERT INTO order_items (id, order_id, item_type, listing_id, title, variant_name, unit_price, quantity, total, currency, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ['item-2', 'order-1', 'product', 'listing-2', 'Indigo dye kit', null, 4000, 2, 8000, 'NGN', now]);
await sql('INSERT INTO listing_images (id, listing_id, image_url, position, created_at) VALUES (?, ?, ?, ?, ?)',
  ['img-1', 'listing-1', 'https://shop.example.org/media/basket.png', 0, now]);

// --- Compose every supported send --------------------------------------------
const orderRow = (await sql("SELECT * FROM orders WHERE id = 'order-1'")).rows[0];

const captures = [];
const record = async (name, promise) => {
  const before = sent.length;
  await promise;
  assert.ok(sent.length > before, `${name}: nothing was sent`);
  for (const message of sent.slice(before)) captures.push({ name, ...message });
};

await record('sign-in-code', email.sendSignInCodeEmail({ to: 'buyer@example.org', code: '482913', expiresInMinutes: 10 }));
await record('welcome', email.sendWelcomeEmail({ to: 'buyer@example.org', name: 'Bola' }));
await record('password-reset', email.sendPasswordResetEmail({ to: 'buyer@example.org', name: 'Bola', resetUrl: 'https://shop.example.org/reset-password?token=reset-token', expiresInMinutes: 60 }));
await record('password-changed', email.sendPasswordChangedEmail({ to: 'buyer@example.org', name: 'Bola' }));
await record('invoice', email.sendOrderInvoice('order-1'));
await record('shipment-update', email.sendShipmentUpdateEmail({ order: orderRow, statusLabel: 'Shipped', note: 'Left the workshop this morning.', location: 'Lagos', at: now, method: 'delivery' }));
await record('order-completed', email.sendOrderCompletedEmail({ order: orderRow, method: 'delivery', at: now }));
await record('payment-failed', email.sendPaymentFailedEmail({ to: 'buyer@example.org', name: 'Bola', orderNumber: 'RC-1001', amountMinor: 21500, currency: 'NGN', reason: 'The bank declined the charge.', ctaUrl: 'https://shop.example.org/orders/tok_audit_1', paymentId: 'pay-1', orderId: 'order-1', storeId: 'store' }));
await record('seller-order', email.sendSellerOrderEmail({ sellerEmail: 'seller@example.org', sellerName: 'Ada', orderId: 'order-1', storeId: 'store', orderNumber: 'RC-1001', customerName: 'Bola Buyer', itemSummary: 'Handwoven carry basket, Indigo dye kit × 2', amountMinor: 21500, currency: 'NGN', fulfilment: 'Delivery' }));
await record('payment-request', email.sendPaymentRequestEmail({ buyerEmail: 'buyer@example.org', buyerName: 'Bola', sellerName: 'Ada', amountMinor: 5000, currency: 'NGN', description: 'Custom stitching', contextTitle: 'Indigo dye kit', conversationId: 'thread-1', paymentRequestId: 'req-1' }));
await record('payment-received', email.sendPaymentReceivedEmail({ sellerEmail: 'seller@example.org', sellerName: 'Ada', buyerName: 'Bola', amountMinor: 5000, currency: 'NGN', description: 'Custom stitching', contextTitle: 'Indigo dye kit', conversationId: 'thread-1', paymentRequestId: 'req-1' }));
await record('payment-cancelled', email.sendPaymentRequestCancelledEmail({ buyerEmail: 'buyer@example.org', buyerName: 'Bola', sellerName: 'Ada', amountMinor: 5000, currency: 'NGN', conversationId: 'thread-1', paymentRequestId: 'req-1' }));
await record('payout', email.sendPayoutRequestedEmail({ sellerEmail: 'seller@example.org', sellerName: 'Ada', payoutId: 'payout-1', amountMinor: 150000, currency: 'NGN', bankName: 'Audit Bank', accountNumber: '0123456789' }));
await record('message', email.sendMessageNotificationEmail({ to: 'buyer@example.org', name: 'Bola', fromName: 'Ada', preview: 'Your basket is ready — shall I wrap it?', conversationId: 'thread-1', day: '2026-09-30' }));
await record('refund', email.sendRefundEmails({ order: orderRow }));
await record('order-cancelled', email.sendOrderCancelledEmail({ order: { ...orderRow, payment_status: 'failed' } }));

globalThis.fetch = originalFetch;

// --- Content safety: nothing internal may travel in a message ----------------
for (const message of captures) {
  for (const part of [message.html, message.text, message.subject]) {
    assert.ok(!/localhost|127\.0\.0\.1|\.r2\.dev|catbox|replit\.dev|vercel\.app/i.test(part), `${message.name}: internal/development reference leaked`);
    assert.ok(!/\/api\/|\/_next\//.test(part), `${message.name}: internal API path leaked`);
    assert.ok(!/storage_key|bucket|raw_payload|SELECT |INSERT INTO/i.test(part), `${message.name}: internal implementation detail leaked`);
    assert.ok(!/order-1|listing-1|item-1|pay-1|req-1|payout-1/.test(part), `${message.name}: database identifier leaked into content`);
  }
  assert.ok(message.html.includes('cid:rush-cart-logo'), `${message.name}: logo missing from HTML`);
  assert.ok(message.text.includes('Rush Cart'), `${message.name}: plain text has no branding`);
  assert.ok(message.attachments?.length === 1 && message.attachments[0].content_type === 'image/png' && message.attachments[0].content_id === 'rush-cart-logo', `${message.name}: logo attachment is not an inline PNG`);
}
console.log(`composed ${captures.length} transactional emails with fixture data`);

// --- Render every email in Chromium at three widths ---------------------------
const logoDataUri = `data:image/png;base64,${readFileSync('public/brand/rush-cart-logo.png').toString('base64')}`;
const pixel = 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==';
const outDir = path.join(root, '.email-outbox', 'render');
mkdirSync(outDir, { recursive: true });

const proc = spawn('/repl/tools/bin/chromium', ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--remote-debugging-port=0', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
try {
  const endpoint = await new Promise((resolve, reject) => {
    let log = ''; const timeout = setTimeout(() => reject(new Error('Chromium startup timed out')), 15000);
    proc.stderr.on('data', data => { log += data; const match = log.match(/DevTools listening on (ws:\/\/\S+)/); if (match) { clearTimeout(timeout); resolve(match[1]); } });
    proc.on('error', reject);
  });
  const socket = new (globalThis.WebSocket ?? require('next/dist/compiled/ws').WebSocket)(endpoint);
  await new Promise((resolve, reject) => { socket.on('open', resolve); socket.on('error', reject); });
  let id = 0; const pending = new Map();
  socket.on('message', data => { const response = JSON.parse(String(data)); if (!response.id) return; const entry = pending.get(response.id); if (!entry) return; pending.delete(response.id); response.error ? entry.reject(new Error(response.error.message)) : entry.resolve(response.result); });
  const { targetId } = await new Promise((resolve, reject) => { const requestId = ++id; pending.set(requestId, { resolve, reject }); socket.send(JSON.stringify({ id: requestId, method: 'Target.createTarget', params: { url: 'about:blank' } })); });
  const { sessionId } = await new Promise((resolve, reject) => { const requestId = ++id; pending.set(requestId, { resolve, reject }); socket.send(JSON.stringify({ id: requestId, method: 'Target.attachToTarget', params: { targetId, flatten: true } })); });
  const call = (method, params = {}) => new Promise((resolve, reject) => { const requestId = ++id; pending.set(requestId, { resolve, reject }); socket.send(JSON.stringify({ id: requestId, method, params, sessionId })); });
  await call('Page.enable'); await call('Runtime.enable');
  const evaluate = async expression => { const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text); return result.result.value; };

  for (const message of captures) {
    // Resolve the embedded logo exactly like a mail client resolves the CID
    // part, and neutralise remote fixture thumbnails the sandbox cannot fetch.
    const rendered = message.html
      .split('cid:rush-cart-logo').join(logoDataUri)
      .replace(/src="https:\/\/shop\.example\.org[^"]*"/g, `src="${pixel}"`);
    const file = path.join(outDir, `${captures.indexOf(message) + 1}-${message.name}.html`);
    writeFileSync(file, rendered);

    await call('Page.navigate', { url: `file://${file}` });
    await new Promise(resolve => setTimeout(resolve, 120));

    for (const width of [800, 600, 375]) {
      await call('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 });
      await new Promise(resolve => setTimeout(resolve, 60));
      const report = await evaluate(`(() => {
        const doc = document.documentElement;
        const logo = document.querySelector('img[alt="Rush Cart"]');
        const box = logo?.getBoundingClientRect();
        const imgs = [...document.querySelectorAll('img')];
        const buttons = [...document.querySelectorAll('a')].filter(a => parseFloat(getComputedStyle(a).paddingTop) >= 12);
        const clipped = [...document.querySelectorAll('p, td, h1, a, span')].filter(el => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== 'visible').map(el => el.tagName + ':' + el.textContent.trim().slice(0, 24));
        return {
          scroll: doc.scrollWidth, width: doc.clientWidth,
          logoVisible: !!logo && box.width > 0 && box.height > 0 && logo.complete && logo.naturalWidth > 0,
          logoRatio: box ? box.width / box.height : 0,
          brokenImages: imgs.filter(img => img.src.startsWith('data:') === false || !img.complete || img.naturalWidth === 0).length,
          buttons: buttons.map(b => b.getBoundingClientRect().height),
          clipped,
          hasTitle: !!document.querySelector('h1') && document.querySelector('h1').getBoundingClientRect().height > 0,
        };
      })()`);
      assert.ok(report.scroll <= report.width + 1, `${message.name}@${width}: horizontal overflow (${report.scroll} > ${report.width})`);
      assert.ok(report.logoVisible, `${message.name}@${width}: the Rush Cart logo does not render`);
      assert.ok(Math.abs(report.logoRatio - 1698 / 926) < 0.08, `${message.name}@${width}: logo distorted (ratio ${report.logoRatio.toFixed(2)})`);
      assert.equal(report.brokenImages, 0, `${message.name}@${width}: broken image`);
      assert.ok(report.hasTitle, `${message.name}@${width}: no headline`);
      for (const height of report.buttons) assert.ok(height >= 40 && height <= 60, `${message.name}@${width}: button height ${height}`);
      assert.deepEqual(report.clipped, [], `${message.name}@${width}: clipped text`);
    }

    // The invoice must read as a bill: aligned money column and every row.
    if (message.name === 'invoice') {
      const bill = await evaluate(`(() => {
        const cells = [...document.querySelectorAll('td')];
        const money = cells.filter(td => /^₦|NGN|[0-9.,]+$/.test(td.textContent.trim()) && getComputedStyle(td).textAlign === 'right').map(td => Math.round(td.getBoundingClientRect().right));
        const text = document.body.textContent;
        return { money, hasQty: /Qty/.test(text), hasTotal: /Total paid/.test(text), hasSubtotal: /Subtotal/.test(text), hasCustomer: /Billed to/.test(text), items: ['Handwoven carry basket', 'Indigo dye kit'].every(name => text.includes(name)) };
      })()`);
      assert.ok(bill.hasQty && bill.hasTotal && bill.hasSubtotal && bill.hasCustomer && bill.items, 'invoice is missing its table structure');
      const aligned = new Set(bill.money);
      assert.ok(aligned.size <= 2, `invoice money column is not aligned: ${bill.money.join(', ')}`);
    }
    // The verification code must be impossible to miss.
    if (message.name === 'sign-in-code') {
      const code = await evaluate(`(() => { const el = [...document.querySelectorAll('td')].filter(td => /4 ?8 ?2/.test(td.textContent)).at(-1); const box = el?.getBoundingClientRect(); return box ? { size: parseFloat(getComputedStyle(el).fontSize), w: box.width } : null; })()`);
      assert.ok(code && code.size >= 24, 'the sign-in code is not prominent');
      assert.ok(code.w >= 160, 'the sign-in code block is too small to find');
    }
    console.log(`rendered ${message.name} at 800/600/375 — logo, layout, buttons and overflow verified`);
  }
  socket.close();
} finally {
  proc.kill();
  db.close();
  rmSync(dir, { recursive: true, force: true });
}

console.log(`\nemail render audit passed — ${captures.length} emails verified at desktop, tablet and mobile widths`);
console.log(`rendered HTML kept in ${outDir}`);
