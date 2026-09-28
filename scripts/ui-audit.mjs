/**
 * UI geometry audit — real measurements from a real browser.
 *
 * The questions this answers cannot be settled by reading CSS: does the header
 * keep one geometry across authentication states, do cards keep their size when
 * a conditional action changes, does anything overflow sideways, do message
 * bubbles hug their own edges. It boots headless Chromium over the DevTools
 * Protocol, signs in real accounts (the platform's own OTP journey), seeds a
 * store with a listing, an event with tickets and a paid order containing real
 * tickets, then measures actual element boxes at phone, tablet and desktop
 * widths in the guest / account / workspace states.
 *
 * Everything it creates is deleted at the end (including on failure).
 *
 *   node --experimental-websocket scripts/ui-audit.mjs [baseUrl]
 */

import { spawn } from "node:child_process";

// Node only ships a global `WebSocket` from v22; on older runtimes the `ws`
// package already in the tree stands in, so the audit runs anywhere.
if (typeof globalThis.WebSocket === "undefined") {
  const wsModule = await import("ws");
  globalThis.WebSocket = wsModule.WebSocket ?? wsModule.default;
}

import { createClient } from "@libsql/client";

import { loadEnv, resolveDatabase } from "./load-env.mjs";

const BASE = process.argv[2] ?? "http://localhost:5000";
const CHROME = process.env.CHROME_PATH ?? "/repl/tools/bin/chromium";

loadEnv();
const { url, authToken } = resolveDatabase();
const db = createClient(authToken ? { url, authToken } : { url });

const stamp = Date.now().toString(36);
const failures = [];
let checked = 0;

const handle = `uiaudit${stamp}`;
const storeId = `str_uia_${stamp}`;
const listingId = `lst_uia_${stamp}`;
const eventId = `evt_uia_${stamp}`;
const ticketTypeId = `tkt_uia_${stamp}`;
const orderId = `ord_uia_${stamp}`;
const orderNumber = `LS-${stamp.toUpperCase()}`;
const accessToken = `acc_${stamp}`;
const receiptCode = `RCT-${stamp.toUpperCase()}`;
const buyerEmail = `uia-buyer-${stamp}@example.com`;
const sellerEmail = `uia-seller-${stamp}@example.com`;
const now = new Date().toISOString();

function check(label, condition, detail = "") {
  checked += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}

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

/** Register → OTP from the database → the session cookie the app accepts. */
async function signUp(name, email) {
  let r = await post("/api/auth/sign-up/email", {
    email,
    password: `pw-${stamp}-x1`,
    name,
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

/* ---------------------------------------------------------------------- */
/* Seed — one store, one listing, one event with tickets, one paid order    */
/* ---------------------------------------------------------------------- */

let buyer = null;
let seller = null;
let conversationId = null;

async function seed() {
  buyer = await signUp("Uia Buyer", buyerEmail);
  seller = await signUp("Uia Seller", sellerEmail);

  await write([
    {
      sql: `INSERT INTO stores (id, user_id, slug, name, tagline, currency, country, is_published, created_at, updated_at)
            VALUES (?, ?, ?, 'UI Audit Shop', 'Geometry checks', 'NGN', 'Nigeria', 1, ?, ?)`,
      args: [storeId, seller.userId, handle, now, now],
    },
    { sql: "INSERT INTO store_settings (store_id, updated_at) VALUES (?, ?)", args: [storeId, now] },
    {
      sql: `INSERT INTO listings
              (id, store_id, type, fulfilment, title, slug, description, currency, price,
               track_inventory, stock, status, published_at, created_at, updated_at)
            VALUES (?, ?, 'physical', 'shipping', 'UI Audit Lamp', ?, 'Seeded by ui-audit.', 'NGN', 120000,
              1, 8, 'active', ?, ?, ?)`,
      args: [listingId, storeId, `uia-lamp-${stamp}`, now, now, now],
    },
    {
      sql: `INSERT INTO events (id, store_id, title, slug, description, starts_at, city, status, created_at, updated_at)
            VALUES (?, ?, 'UI Audit Night', ?, 'Seeded by ui-audit.', ?, 'Lagos', 'published', ?, ?)`,
      args: [eventId, storeId, `uia-night-${stamp}`, new Date(Date.now() + 9 * 86_400_000).toISOString(), now, now],
    },
    {
      sql: `INSERT INTO ticket_types (id, event_id, name, price, currency, quantity_total, quantity_sold, created_at)
            VALUES (?, ?, 'Entry', 500000, 'NGN', 50, 1, ?)`,
      args: [ticketTypeId, eventId, now],
    },
    {
      sql: `INSERT INTO orders
              (id, order_number, store_id, user_id, email, customer_name, currency, subtotal, total,
               status, payment_status, access_token, receipt_code, created_at, updated_at, paid_at)
            VALUES (?, ?, ?, ?, ?, 'Uia Buyer', 'NGN', 500000, 500000, 'processing', 'paid', ?, ?, ?, ?, ?)`,
      args: [orderId, orderNumber, storeId, buyer.userId, buyerEmail, accessToken, receiptCode, now, now, now],
    },
    {
      sql: `INSERT INTO order_items
              (id, order_id, item_type, ticket_type_id, event_id, title, unit_price, quantity, total, currency, fulfilment_status, created_at)
            VALUES (?, ?, 'ticket', ?, ?, 'UI Audit Night — Entry', 500000, 1, 500000, 'NGN', 'fulfilled', ?)`,
      args: [`oi_uia_${stamp}`, orderId, ticketTypeId, eventId, now],
    },
    {
      sql: `INSERT INTO tickets (id, order_id, order_item_id, event_id, ticket_type_id, store_id, code, holder_name, holder_email, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'Uia Buyer', ?, 'valid', ?)`,
      args: [`tkt_a_${stamp}`, orderId, `oi_uia_${stamp}`, eventId, ticketTypeId, storeId, `TIXA-${stamp.toUpperCase()}`, buyerEmail, now],
    },
    {
      sql: `INSERT INTO tickets (id, order_id, order_item_id, event_id, ticket_type_id, store_id, code, holder_name, holder_email, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'Uia Buyer', ?, 'valid', ?)`,
      args: [`tkt_b_${stamp}`, orderId, `oi_uia_${stamp}`, eventId, ticketTypeId, storeId, `TIXB-${stamp.toUpperCase()}`, buyerEmail, now],
    },
    {
      sql: `INSERT INTO conversations (id, store_id, listing_id, buyer_user_id, buyer_name, buyer_email, subject, last_message_at, created_at)
            VALUES (?, ?, ?, ?, 'Uia Buyer', ?, 'Question about the lamp', ?, ?)`,
      args: [`cnv_uia_${stamp}`, storeId, listingId, buyer.userId, buyerEmail, now, now],
    },
    {
      sql: `INSERT INTO messages (id, conversation_id, sender_user_id, body, created_at)
            VALUES ('msg_uia_1', ?, ?, 'Hello — is the lamp still available?', ?)`,
      args: [`cnv_uia_${stamp}`, buyer.userId, now],
    },
    {
      sql: `INSERT INTO messages (id, conversation_id, sender_user_id, body, created_at)
            VALUES ('msg_uia_2', ?, ?, 'Yes, it is. Happy to help.', ?)`,
      args: [`cnv_uia_${stamp}`, seller.userId, now],
    },
    {
      sql: `INSERT INTO message_user_states (message_id, user_id) VALUES ('msg_uia_1', ?), ('msg_uia_2', ?)`,
      args: [buyer.userId, buyer.userId],
    },
    {
      sql: `INSERT INTO conversation_user_states (conversation_id, user_id, updated_at)
            VALUES (?, ?, ?), (?, ?, ?)`,
      args: [`cnv_uia_${stamp}`, buyer.userId, now, `cnv_uia_${stamp}`, seller.userId, now],
    },
  ]);

  conversationId = `cnv_uia_${stamp}`;
}

async function cleanup() {
  const statements = [
    { sql: "DELETE FROM message_user_states WHERE message_id LIKE 'msg_uia_%'", args: [] },
    { sql: "DELETE FROM messages WHERE conversation_id = ?", args: [conversationId] },
    { sql: "DELETE FROM conversation_user_states WHERE conversation_id = ?", args: [conversationId] },
    { sql: "DELETE FROM conversations WHERE id = ?", args: [conversationId] },
    { sql: "DELETE FROM tickets WHERE order_id = ?", args: [orderId] },
    { sql: "DELETE FROM order_items WHERE order_id = ?", args: [orderId] },
    { sql: "DELETE FROM orders WHERE id = ?", args: [orderId] },
    { sql: "DELETE FROM ticket_types WHERE event_id = ?", args: [eventId] },
    { sql: "DELETE FROM events WHERE id = ?", args: [eventId] },
    { sql: "DELETE FROM listings WHERE id = ?", args: [listingId] },
    { sql: "DELETE FROM store_settings WHERE store_id = ?", args: [storeId] },
    { sql: "DELETE FROM stores WHERE id = ?", args: [storeId] },
  ];
  for (const account of [buyer, seller]) {
    if (!account) continue;
    statements.push(
      { sql: "DELETE FROM verification WHERE identifier LIKE ?", args: [`%${account.userId}%`] },
      { sql: "DELETE FROM sessions WHERE user_id = ?", args: [account.userId] },
      { sql: 'DELETE FROM account WHERE "userId" = ?', args: [account.userId] },
      { sql: "DELETE FROM users WHERE id = ?", args: [account.userId] },
    );
  }
  statements.push(
    { sql: "DELETE FROM verification WHERE identifier LIKE ?", args: [`%${buyerEmail}%`] },
    { sql: "DELETE FROM verification WHERE identifier LIKE ?", args: [`%${sellerEmail}%`] },
  );
  await write(statements).catch(() => {});
}

/* ---------------------------------------------------------------------- */
/* CDP — one WebSocket, pages as flat sessions                             */
/* ---------------------------------------------------------------------- */

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener("message", (event) => {
      const payload = JSON.parse(event.data);
      if (payload.id && this.pending.has(payload.id)) {
        const { resolve, reject } = this.pending.get(payload.id);
        this.pending.delete(payload.id);
        if (payload.error) reject(new Error(payload.error.message));
        else resolve(payload.result);
      }
    });
  }

  static connect(url) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      ws.addEventListener("open", () => resolve(new Cdp(ws)));
      ws.addEventListener("error", reject);
    });
  }

  send(method, params = {}, sessionId) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
}

async function launchBrowser() {
  const proc = spawn(
    CHROME,
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--hide-scrollbars",
      "--remote-debugging-port=0",
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );

  const wsUrl = await new Promise((resolve, reject) => {
    let buffer = "";
    const timer = setTimeout(() => reject(new Error("chromium did not start")), 20000);
    proc.stderr.on("data", (chunk) => {
      buffer += chunk.toString();
      const match = buffer.match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
    proc.on("exit", () => {
      clearTimeout(timer);
      reject(new Error("chromium exited early"));
    });
  });

  return { proc, cdp: await Cdp.connect(wsUrl) };
}

/**
 * A browser page: viewport control, cookie-backed identities, navigation and
 * measurement — the whole vocabulary the scenarios below are written in.
 */
class Page {
  constructor(cdp, sessionId) {
    this.cdp = cdp;
    this.sessionId = sessionId;
    /** Where the last `goto` actually landed — redirects included. */
    this.url = "/";
  }

  static async open(cdp) {
    const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
    const page = new Page(cdp, sessionId);
    await page.send("Page.enable");
    await page.send("Runtime.enable");
    await page.send("Network.enable");
    return page;
  }

  send(method, params = {}) {
    return this.cdp.send(method, params, this.sessionId);
  }

  async setViewport(width, height = 900) {
    await this.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width < 768,
    });
  }

  async clearCookies() {
    await this.send("Network.clearBrowserCookies");
  }

  async setIdentity(cookie) {
    await this.clearCookies();
    if (!cookie) return;
    const [name, ...rest] = cookie.split("=");
    await this.send("Network.setCookie", {
      name,
      value: rest.join("="),
      url: BASE,
      path: "/",
    });
  }

  async goto(path) {
    await this.send("Page.navigate", { url: `${BASE}${path}` });
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const ready = await this.evaluate("document.readyState === 'complete'");
      if (ready) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    // Let animations and client components settle into their final geometry.
    await new Promise((resolve) => setTimeout(resolve, 500));
    this.url = await this.evaluate("location.pathname + location.search").catch(() => path);
    await this.warmLazyContent();
  }

  /**
   * Walk the page once so lazy images below the fold are actually requested.
   *
   * Cards use `loading="lazy"`, so at a phone width most of them have never
   * been fetched by the time the measurement runs. `img.complete` is then false
   * for a perfectly healthy image, and the image check reports a failure that
   * is about the audit's timing rather than the page. Scrolling the whole
   * document — twice, because a taller layout pushes the sentinel further down
   * — forces every request to start. The page is left at the top, so geometry
   * is measured from the same origin as before.
   */
  async warmLazyContent() {
    await this.evaluate(`(async () => {
      const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      for (let pass = 0; pass < 2; pass += 1) {
        const step = Math.max(240, Math.floor(window.innerHeight * 0.75));
        for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
          window.scrollTo(0, y);
          await pause(40);
        }
        await pause(80);
      }
      window.scrollTo(0, 0);
      await pause(80);
      return true;
    })()`);

    await this.loadAllImages();
  }

  /**
   * Make every image on the page actually load, then wait for the answers.
   *
   * `loading="lazy"` is a schedule, not a health check: an image in a
   * horizontal rail or one that appears after a re-layout may never be
   * requested by the time the measurement runs, and `complete === false` then
   * says nothing about the image itself. Forcing eager fetches first means the
   * check afterwards tests what it claims to test — a genuinely broken image
   * still reports `complete` with `naturalWidth === 0` and still fails.
   */
  async loadAllImages() {
    await this.evaluate(`(() => {
      for (const el of document.querySelectorAll("img")) el.loading = "eager";
      return true;
    })()`);
    // Give the newly requested images time to land. Settling on a quiet frame
    // beats a fixed sleep: a 134 KB photo over the dev server can take a moment.
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const pending = await this.evaluate(
        `[...document.querySelectorAll("img")].filter((el) => !el.complete).length`,
      );
      if (pending === 0) return;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  /**
   * Read a value out of the live page.
   *
   * A read can lose two races, and neither is a defect in the page: the
   * document can be replaced mid-expression (the dev server hot-reloads, a
   * page issues a client redirect), which surfaces either as an exception
   * ("Execution context was destroyed") or as a protocol error ("Inspected
   * target navigated or closed"). Both are retried, because a measurement that
   * dies of a reload tells us nothing about the layout.
   */
  async evaluate(expression) {
    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const result = await this.send("Runtime.evaluate", {
          expression,
          returnByValue: true,
          awaitPromise: true,
        });
        if (!result.exceptionDetails) return result.result.value;

        // `text` is often just "Uncaught" — the readable message lives on the
        // exception object, and the two names do not agree across CDP versions.
        const details = result.exceptionDetails;
        const description =
          details.exception?.description ??
          details.exception?.value ??
          details.exceptionDetails?.exception?.description;
        const text = [details.text, description ?? details.consoleMessage?.text]
          .filter(Boolean)
          .join(": ");
        lastError = new Error(text || "evaluation failed");
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }

      const transient =
        /context was destroyed|Cannot find context|Inspected target navigated|target closed|Execution context/i.test(
          lastError.message,
        );
      if (!transient) throw lastError;
      await new Promise((resolve) => setTimeout(resolve, 750));
    }
    throw lastError ?? new Error("evaluation failed");
  }
}

/* ---------------------------------------------------------------------- */
/* Measurement expressions                                                 */
/* ---------------------------------------------------------------------- */

/** Everything about a page's geometry that a diff between states can see. */
const MEASURE = `(() => {
  const out = { overflowX: false, scrollWidth: 0, clientWidth: 0, wide: [], header: null, buttons: [], cards: [], images: [] };
  const de = document.documentElement;
  out.scrollWidth = de.scrollWidth;
  out.clientWidth = de.clientWidth;
  out.overflowX = de.scrollWidth > de.clientWidth + 1;
  if (out.overflowX) {
    out.wide = [...document.querySelectorAll("body *")]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.right > de.clientWidth + 2 && getComputedStyle(el).position !== "fixed";
      })
      .slice(0, 6)
      .map((el) => ({
        tag: el.tagName,
        cls: String(el.className || "").slice(0, 70),
        right: Math.round(el.getBoundingClientRect().right),
      }));
  }
  const header = document.querySelector("header");
  if (header) {
    const r = header.getBoundingClientRect();
    out.header = { w: Math.round(r.width), h: Math.round(r.height) };
  }
  for (const el of document.querySelectorAll("button, a.button, [role=button]")) {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    out.buttons.push({
      label: (el.getAttribute("aria-label") || el.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 42),
      w: Math.round(r.width),
      h: Math.round(r.height),
      x: Math.round(r.x),
      y: Math.round(r.y),
    });
  }
  for (const el of document.querySelectorAll("article")) {
    const r = el.getBoundingClientRect();
    if (r.width < 1) continue;
    out.cards.push({
      label: (el.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 42),
      w: Math.round(r.width),
      h: Math.round(r.height),
      x: Math.round(r.x),
    });
  }
  for (const el of document.querySelectorAll("img")) {
    out.images.push({ src: (el.currentSrc || el.src || "").slice(0, 80), ok: el.complete && el.naturalWidth > 0 });
  }
  return out;
})()`;

/** Message bubbles relative to the conversation's own box. */
const MEASURE_BUBBLES = `(() => {
  const scrollers = [...document.querySelectorAll("[class*='overflow-y-auto']")]
    .filter((el) => el.getBoundingClientRect().height > 100);
  const scroller = scrollers.sort((a, b) => b.getBoundingClientRect().height - a.getBoundingClientRect().height)[0];
  if (!scroller) return null;
  const box = scroller.getBoundingClientRect();
  const bubbles = [...scroller.querySelectorAll("[class*='animate-chat-in']")]
    .slice(0, 12)
    .map((el) => {
      const r = el.getBoundingClientRect();
      return {
        left: Math.round(r.left - box.left),
        right: Math.round(box.right - r.right),
        w: Math.round(r.width),
      };
    });
  return { viewport: Math.round(box.width), bubbles };
})()`;

/** The header's own controls, matched by label, for state-vs-state diffs. */
const MEASURE_HEADER = `(() => {
  const header = document.querySelector("header");
  if (!header) return null;
  const r = header.getBoundingClientRect();
  const controls = [...header.querySelectorAll("button, a")].map((el) => {
    const b = el.getBoundingClientRect();
    return {
      label: (el.getAttribute("aria-label") || el.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 42),
      w: Math.round(b.width),
      h: Math.round(b.height),
      x: Math.round(b.x),
    };
  });
  return { h: Math.round(r.height), w: Math.round(r.width), controls };
})()`;

/* ---------------------------------------------------------------------- */
/* Scenarios                                                               */
/* ---------------------------------------------------------------------- */

const STATES = [
  { name: "guest", cookie: null },
  { name: "account", cookie: () => buyer.cookie },
  { name: "workspace", cookie: () => seller.cookie },
];

const WIDTHS = [360, 768, 1280];

function routes() {
  return [
    ["/", "home"],
    ["/products", "products"],
    [`/listing/${listingId}`, "listing detail"],
    ["/stores", "stores"],
    [`/@${handle}`, "storefront"],
    ["/events", "events"],
    [`/events/${eventId}`, "event detail"],
    ["/search?q=lamp", "search"],
    ["/cart", "cart"],
    ["/checkout", "checkout"],
    ["/orders", "orders"],
    [`/orders/${accessToken}`, "order + tickets"],
    ["/settings", "settings"],
    ["/login", "login"],
    ["/register", "register"],
    ["/messages", "messages list"],
    [`/messages/${conversationId}`, "conversation"],
    ["/workspace", "workspace"],
    ["/workspace/listings", "workspace listings"],
    ["/workspace/listings/new", "workspace new listing"],
    ["/workspace/events", "workspace events"],
    ["/workspace/events/new", "workspace new event"],
    ["/workspace/orders", "workspace orders"],
    ["/workspace/orders/verify", "workspace verify"],
    ["/workspace/analytics", "workspace analytics"],
    ["/workspace/settings", "workspace settings"],
    ["/workspace/onboarding", "workspace onboarding"],
    ["/workspace/messages", "workspace messages"],
  ];
}

async function auditHeader(page) {
  console.log("\n== header geometry ==");
  const rows = [];
  for (const state of STATES) {
    await page.setIdentity(typeof state.cookie === "function" ? state.cookie() : state.cookie);
    await page.goto("/");
    for (const width of [320, 360, 390, 640, 768, 1024, 1280, 1440]) {
      await page.setViewport(width, 900);
      await new Promise((resolve) => setTimeout(resolve, 150));
      const header = await page.evaluate(MEASURE_HEADER);
      rows.push({ width, state: state.name, ...header });
      check(
        `header height stable @${width} ${state.name}`,
        header.h === 56,
        `height ${header.h}`,
      );
      check(
        `no horizontal overflow in header @${width} ${state.name}`,
        header.w <= width + 1 && !(await page.evaluate(MEASURE)).overflowX,
        `header width ${header.w} viewport ${width}`,
      );
    }
    console.log(` measured ${state.name}`);
  }
  for (const row of rows) {
    const controls = row.controls
      .map((c) => `${c.label || "?"}[${c.w}x${c.h}@${c.x}]`)
      .join(" ");
    console.log(` ${String(row.width).padStart(4)} ${row.state.padEnd(9)} h=${row.h} ${controls}`);
  }

  // The header's own height may not change with authentication — at any width.
  for (const width of [320, 360, 390, 640, 768, 1024, 1280, 1440]) {
    const heights = new Set(rows.filter((r) => r.width === width).map((r) => r.h));
    check(`header height identical across auth states @${width}`, heights.size === 1, [...heights].join(","));
  }
}

async function auditRoutes(page) {
  console.log("\n== route geometry ==");
  for (const [path, label] of routes()) {
    for (const state of STATES) {
      const cookie = typeof state.cookie === "function" ? state.cookie() : state.cookie;
      await page.setIdentity(cookie);
      await page.setViewport(WIDTHS[0], 900);
      await page.goto(path);
      // Routes that redirect (a signed-in visitor at /login, an account with no
      // workspace at /workspace/…) are measured where they land; saying so in
      // the log keeps a redirect from looking like a missing page.
      if (page.url !== path) console.log(` → ${path} resolved to ${page.url} (${state.name})`);
      for (const width of WIDTHS) {
        await page.setViewport(width, 900);
        await new Promise((resolve) => setTimeout(resolve, 150));
        // A width change can reveal images the previous width never showed.
        await page.loadAllImages();
        const m = await page.evaluate(MEASURE);
        check(`${label} no sideways overflow @${width} ${state.name}`, !m.overflowX, JSON.stringify(m.wide));

        const broken = m.images.filter((img) => !img.ok);
        check(`${label} images render @${width} ${state.name}`, broken.length === 0, JSON.stringify(broken.slice(0, 2)));

        const stretched = m.buttons.filter((b) => b.w > 420 && b.h < 60);
        if (stretched.length > 0) {
          console.log(
            `  note ${label} @${width} ${state.name}: wide buttons ${JSON.stringify(stretched)}`,
          );
        }
      }
      console.log(` ${label} (${state.name})`);
    }
  }
}

/** Card geometry must not move when authentication changes the action. */
async function auditCardStability(page) {
  console.log("\n== card geometry across auth states ==");
  const targets = [
    [`/orders/${accessToken}`, "order + tickets"],
    [`/events/${eventId}`, "event detail"],
    [`/listing/${listingId}`, "listing detail"],
    ["/products", "products"],
  ];

  for (const [path, label] of targets) {
    const perState = {};
    for (const state of STATES) {
      await page.setIdentity(typeof state.cookie === "function" ? state.cookie() : state.cookie);
      await page.setViewport(WIDTHS[0], 900);
      await page.goto(path);
      for (const width of WIDTHS) {
        await page.setViewport(width, 900);
        await new Promise((resolve) => setTimeout(resolve, 150));
        const m = await page.evaluate(MEASURE);
        perState[`${state.name}@${width}`] = m.cards;
      }
    }
      // Compare card sizes state-to-state, matched by their content label.
      for (const width of WIDTHS) {
        for (const [a, b] of [
          ["guest", "account"],
          ["account", "workspace"],
        ]) {
          for (const cardA of perState[`${a}@${width}`] ?? []) {
            const cardB = (perState[`${b}@${width}`] ?? []).find((c) => c.label === cardA.label);
            if (!cardB) continue;
            const sameWidth = Math.abs(cardA.w - cardB.w) <= 1;
            const heightDrift = Math.abs(cardA.h - cardB.h);
            check(
              `${label} card stable (${a} → ${b}) @${width}`,
              sameWidth && heightDrift <= 24,
              `w ${cardA.w}→${cardB.w} h ${cardA.h}→${cardB.h} “${cardA.label.slice(0, 24)}”`,
            );
          }
        }
      }
  }
}

async function auditBubbles(page) {
  console.log("\n== message bubbles ==");
  for (const width of WIDTHS) {
    await page.setViewport(width, 900);
    await page.setIdentity(buyer.cookie);
    await page.goto(`/messages/${conversationId}`);
    const data = await page.evaluate(MEASURE_BUBBLES);
    if (!data) {
      check(`bubbles measurable @${width}`, false, "no conversation scroller found");
      continue;
    }
    console.log(` ${width}px viewport=${data.viewport}px ${JSON.stringify(data.bubbles)}`);
  }
}

/* ---------------------------------------------------------------------- */
/* Run                                                                     */
/* ---------------------------------------------------------------------- */

let browser = null;

/** Rows a previous timed-out run may have left behind — swept first so they
    can never pollute the measurements below. */
async function sweep() {
  const old = await db
    .execute({
      sql: "SELECT id, email FROM users WHERE email LIKE 'uia-%@example.com' OR email LIKE 'journey-%@example.com' OR email LIKE 'smoke%@example.com'",
      args: [],
    })
    .then((result) => result.rows)
    .catch(() => []);

  const statements = [
    { sql: "DELETE FROM message_user_states WHERE message_id LIKE 'msg_uia_%'", args: [] },
    { sql: "DELETE FROM messages WHERE conversation_id LIKE 'cnv_uia_%'", args: [] },
    { sql: "DELETE FROM conversation_user_states WHERE conversation_id LIKE 'cnv_uia_%'", args: [] },
    { sql: "DELETE FROM conversations WHERE id LIKE 'cnv_uia_%'", args: [] },
    { sql: "DELETE FROM tickets WHERE order_id LIKE 'ord_uia_%'", args: [] },
    { sql: "DELETE FROM order_items WHERE order_id LIKE 'ord_uia_%'", args: [] },
    { sql: "DELETE FROM orders WHERE id LIKE 'ord_uia_%'", args: [] },
    { sql: "DELETE FROM ticket_types WHERE event_id LIKE 'evt_uia_%'", args: [] },
    { sql: "DELETE FROM events WHERE id LIKE 'evt_uia_%'", args: [] },
    { sql: "DELETE FROM listings WHERE id LIKE 'lst_uia_%'", args: [] },
    { sql: "DELETE FROM store_settings WHERE store_id LIKE 'str_uia_%'", args: [] },
    { sql: "DELETE FROM stores WHERE id LIKE 'str_uia_%'", args: [] },
  ];
  for (const row of old) {
    statements.push(
      { sql: "DELETE FROM verification WHERE identifier LIKE ?", args: [`%${String(row.id)}%`] },
      { sql: "DELETE FROM sessions WHERE user_id = ?", args: [String(row.id)] },
      { sql: 'DELETE FROM account WHERE "userId" = ?', args: [String(row.id)] },
      { sql: "DELETE FROM users WHERE id = ?", args: [String(row.id)] },
    );
    statements.push({
      sql: "DELETE FROM verification WHERE identifier LIKE ?",
      args: [`%${String(row.email)}%`],
    });
  }
  await write(statements).catch(() => {});
}

try {
  await sweep();
  await seed();
  browser = await launchBrowser();
  const page = await Page.open(browser.cdp);

  await auditHeader(page);
  await auditRoutes(page);
  await auditCardStability(page);
  await auditBubbles(page);
} catch (error) {
  failures.push(`threw: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
} finally {
  if (browser) {
    try {
      await browser.proc.kill("SIGKILL");
    } catch {
      /* already gone */
    }
  }
  await cleanup();
}

console.log(`\nchecked ${checked} geometry assertions`);
if (failures.length > 0) {
  console.error(`\n${failures.length} failure(s):`);
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}
console.log("geometry holds across states");
