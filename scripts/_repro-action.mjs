/**
 * Temporary repro: real account -> real store -> invoke saveListingAction over
 * HTTP with the Next-Action header, exactly as the browser does.
 *
 *   node scripts/_repro-action.mjs <actionId>
 */

import { createClient } from "@libsql/client";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const BASE = "http://localhost:5000";
const db = createClient({ url: process.env.TURSO_DATABASE_URL || "file:./data/linkstore.db" });
const stamp = Date.now().toString(36);
const email = `repro${stamp}@example.com`;
const password = "repro-password-123";
const storeId = `str_repro_${stamp}`;

/** Resolve an action id from the manifest once the page that owns it has compiled. */
function resolveActionId(name) {
  const manifest = JSON.parse(
    readFileSync("./.next/server/server-reference-manifest.json", "utf8"),
  );
  for (const [id, entry] of Object.entries(manifest.node)) {
    const names = [...JSON.stringify(entry).matchAll(/"exportedName":"([^"]+)"/g)].map(
      (match) => match[1],
    );
    if (names.includes(name)) return id;
  }
  throw new Error(`action ${name} is not in the manifest`);
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

async function post(path, body, headers = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE, ...headers },
    body: JSON.stringify(body),
    redirect: "manual",
  });
  const text = await response.text();
  return { response, text };
}

// 1. Sign up (no session — the address still has to be proven).
let r = await post("/api/auth/sign-up/email", { email, password, name: "Repro Seller" });
console.log(`sign-up            ${r.response.status} ${r.text.slice(0, 160)}`);

// 2. Send the verification code.
r = await post("/api/auth/email-otp/send-verification-otp", {
  email,
  type: "email-verification",
});
console.log(`send-otp           ${r.response.status} ${r.text.slice(0, 200)}`);

// 3. Read the code straight out of the database (dev has no real mailbox).
const codes = await db.execute({
  sql: "SELECT identifier, value FROM verification ORDER BY createdAt DESC LIMIT 5",
  args: [],
});
console.log("verification rows:", codes.rows.map((row) => [row.identifier, row.value]));
const row = codes.rows.find((entry) => String(entry.identifier).includes(email));
if (!row) throw new Error("no verification row for the repro account");

// 4. Verify the code — this is what actually opens the session.
// Stored as `<otp>:<attempts>`, so only the code itself is submitted.
r = await post("/api/auth/email-otp/verify-email", {
  email,
  otp: String(row.value).split(":")[0],
});
console.log(`verify-email       ${r.response.status} ${r.text.slice(0, 160)}`);

const setCookie = r.response.headers.getSetCookie?.() ?? [];
console.log("cookies:", setCookie.map((value) => value.split(";")[0]));
const sessionCookie = setCookie
  .map((value) => value.split(";")[0])
  .find((value) => value.includes("better-auth.session_token"));
if (!sessionCookie) throw new Error("no session cookie returned");

const user = await db.execute({
  sql: "SELECT id FROM users WHERE email = ?",
  args: [email],
});
const userId = String(user.rows[0].id);

// 5. Give the seller a store, as onboarding would.
const now = new Date().toISOString();
await write([
  {
    sql: `INSERT INTO stores (id, user_id, slug, name, currency, country, is_published, created_at, updated_at)
          VALUES (?, ?, ?, 'Repro Store', 'NGN', 'Nigeria', 1, ?, ?)`,
    args: [storeId, userId, `repro${stamp}`, now, now],
  },
  { sql: `INSERT INTO store_settings (store_id, updated_at) VALUES (?, ?)`, args: [storeId, now] },
]);
console.log(`user ${userId}  store ${storeId}`);

// Compile the workspace page so its server-action ids are registered.
const page = await fetch(`${BASE}/workspace/listings`, { headers: { cookie: sessionCookie } });
console.log(`workspace/listings ${page.status}`);
const actionId = process.argv[2] ?? resolveActionId("saveListingAction");
console.log(`action id          ${actionId}`);

// 6. Invoke the action the way the form does, across the payload shapes the
// editor can actually produce.
const base = {
  type: "physical",
  title: `Repro Kettle ${stamp}`,
  subtitle: null,
  description: "Created by the repro script.",
  categoryId: null,
  price: 250000,
  compareAtPrice: null,
  costPrice: null,
  sku: null,
  trackInventory: true,
  stock: 3,
  durationMinutes: null,
  serviceMode: null,
  prepTimeMinutes: null,
  attributes: { currency: "NGN" },
  status: "draft",
  isFeatured: false,
  images: [],
  variants: [],
};

// `"$undefined"` is React's Flight token, so this reproduces the exact object
// the editor builds for a non-service, non-rental listing.
const variants = [
  ["plain physical", { ...base }],
  [
    "physical + undefined attrs",
    {
      ...base,
      title: `Repro A ${stamp}`,
      attributes: {
        currency: "NGN",
        serviceChat: "$undefined",
        orderViaChat: "$undefined",
        rentUnit: "$undefined",
        deposit: "$undefined",
      },
    },
  ],
  [
    "rental",
    {
      ...base,
      title: `Repro B ${stamp}`,
      type: "rental",
      trackInventory: false,
      attributes: {
        currency: "NGN",
        orderViaChat: true,
        rentUnit: "month",
        deposit: "$undefined",
      },
    },
  ],
  [
    "service",
    {
      ...base,
      title: `Repro C ${stamp}`,
      type: "service",
      trackInventory: false,
      durationMinutes: 60,
      serviceMode: "either",
      attributes: { currency: "NGN", serviceChat: true, orderViaChat: true },
    },
  ],
  [
    "digital + active",
    { ...base, title: `Repro D ${stamp}`, type: "digital", status: "active" },
  ],
  [
    "with image + featured",
    {
      ...base,
      title: `Repro E ${stamp}`,
      isFeatured: true,
      images: [{ url: "https://example.invalid/a.jpg", key: "public/x/a.jpg", alt: null }],
    },
  ],
  [
    "with variant",
    {
      ...base,
      title: `Repro F ${stamp}`,
      variants: [{ name: "Large", sku: null, price: 260000, stock: 2 }],
    },
  ],
  ["event ticket", { ...base, title: `Repro G ${stamp}`, type: "event_ticket" }],
];

for (const [label, payload] of variants) {
  const response = await fetch(`${BASE}/workspace/listings`, {
    method: "POST",
    headers: {
      "content-type": "text/plain;charset=UTF-8",
      accept: "text/x-component",
      "Next-Action": actionId,
      cookie: sessionCookie,
      origin: BASE,
    },
    body: JSON.stringify([payload]),
    redirect: "manual",
  });

  const body = await response.text();
  const result = body.match(/"ok":(true|false)/)?.[0] ?? "-";
  const error = body.match(/"error":"([^"]+)"/)?.[1] ?? "";
  console.log(`
${label.padEnd(30)} ${response.status}  ${result}  ${error}`);
  if (response.status !== 200) console.log(body.slice(0, 600));
}

console.log("\n--- server log tail ---");
try {
  console.log(execSync("tail -30 /tmp/dev.log").toString());
} catch {
  console.log("(no log)");
}

// Cleanup (leave the server data tidy on failure too).
await write([
  { sql: "DELETE FROM listings WHERE store_id = ?", args: [storeId] },
  { sql: "DELETE FROM store_settings WHERE store_id = ?", args: [storeId] },
  { sql: "DELETE FROM stores WHERE id = ?", args: [storeId] },
  { sql: "DELETE FROM verification WHERE identifier LIKE ?", args: [`%${email}%`] },
  { sql: "DELETE FROM sessions WHERE user_id = ?", args: [userId] },
  { sql: 'DELETE FROM account WHERE "userId" = ?', args: [userId] },
  { sql: "DELETE FROM users WHERE id = ?", args: [userId] },
]);
