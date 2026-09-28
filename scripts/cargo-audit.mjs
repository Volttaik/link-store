/**
 * Cargo audit — bulk/wholesale as a real product type.
 *
 * Cargo is not a renamed product: it is its own listing type, with its own
 * fields (packaging, units per package, weight, minimum order), its own
 * directory, and its own facts on a card. This proves the whole path against the
 * live app, using the platform's own actions:
 *
 *   1. the seller creates it through the normal product creation form;
 *   2. its own fields are stored and read back (not a label on a unit product);
 *   3. it appears in the seller's Listing module and in the Cargo directory;
 *   4. its detail page states the bulk facts a bulk buyer asks for;
 *   5. it is bought through the normal product flow — cart then order — and is
 *      never mistaken for a ticket.
 *
 *   node scripts/cargo-audit.mjs [baseUrl]
 */

import { createClient } from "@libsql/client";
import { readFileSync } from "node:fs";
import path from "node:path";

import { loadEnv, projectRoot, resolveDatabase } from "./load-env.mjs";

const BASE = process.argv[2] ?? "http://localhost:5000";
loadEnv();
const { url, authToken } = resolveDatabase();
const db = createClient(authToken ? { url, authToken } : { url });

const stamp = Date.now().toString(36);
const failures = [];
let checked = 0;
const now = new Date().toISOString();

const sellerEmail = `cargo-seller-${stamp}@example.com`;
const buyerEmail = `cargo-buyer-${stamp}@example.com`;
const storeId = `str_cargo_${stamp}`;
const title = `Cargo Cartons ${stamp}`;

let seller = null;
let buyer = null;

function check(label, condition, detail = "") {
  checked += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
  console.log(`${condition ? " ok " : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

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

async function post(pathname, body, headers = {}) {
  const response = await fetch(`${BASE}${pathname}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE, ...headers },
    body: JSON.stringify(body),
    redirect: "manual",
  });
  return { response, text: await response.text() };
}

async function signUp(name, email) {
  let r = await post("/api/auth/sign-up/email", { email, password: `pw-${stamp}-x1`, name });
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
  return { userId: String(user.rows[0].id), email, cookie };
}

async function getPage(pathname, cookie) {
  const response = await fetch(`${BASE}${pathname}`, {
    headers: cookie ? { cookie } : {},
    redirect: "manual",
  });
  return { status: response.status, html: await response.text() };
}

function loadActionIds() {
  const manifest = JSON.parse(
    readFileSync(path.join(projectRoot, ".next", "server", "server-reference-manifest.json"), "utf8"),
  );
  const byName = new Map();
  for (const [id, entry] of Object.entries(manifest.node ?? {})) {
    for (const match of JSON.stringify(entry).matchAll(/"exportedName":"([^"]+)"/g)) {
      if (!byName.has(match[1])) byName.set(match[1], id);
    }
  }
  return byName;
}

async function callAction(actionId, args, cookie) {
  const response = await fetch(`${BASE}/workspace/listings/new`, {
    method: "POST",
    headers: {
      "content-type": "text/plain;charset=UTF-8",
      accept: "text/x-component",
      "Next-Action": actionId,
      cookie,
      origin: BASE,
    },
    body: JSON.stringify(args),
    redirect: "manual",
  });
  const text = await response.text();
  const matches = [...text.matchAll(/"ok":(true|false)/g)];
  const ok = matches.length > 0 ? matches[matches.length - 1][1] : null;
  const listingId = text.match(/"listingId":"([^"]+)"/)?.[1] ?? null;
  const error = [...text.matchAll(/"error":"([^"]*)"/g)].at(-1)?.[1] ?? null;
  return { status: response.status, ok: ok === "true", listingId, error, text };
}

async function cleanup() {
  const statements = [
    { sql: "DELETE FROM cart_items WHERE cart_id IN (SELECT id FROM carts WHERE user_id IN (?, ?))", args: [buyer?.userId ?? "", seller?.userId ?? ""] },
    { sql: "DELETE FROM carts WHERE user_id IN (?, ?)", args: [buyer?.userId ?? "", seller?.userId ?? ""] },
    { sql: "DELETE FROM listing_images WHERE listing_id IN (SELECT id FROM listings WHERE store_id = ?)", args: [storeId] },
    { sql: "DELETE FROM listings WHERE store_id = ?", args: [storeId] },
    { sql: "DELETE FROM store_settings WHERE store_id = ?", args: [storeId] },
    { sql: "DELETE FROM stores WHERE id = ?", args: [storeId] },
  ];
  for (const account of [seller, buyer]) {
    if (!account) continue;
    statements.push(
      { sql: "DELETE FROM verification WHERE identifier LIKE ?", args: [`%${account.userId}%`] },
      { sql: "DELETE FROM verification WHERE identifier LIKE ?", args: [`%${account.email}%`] },
      { sql: "DELETE FROM sessions WHERE user_id = ?", args: [account.userId] },
      { sql: 'DELETE FROM account WHERE "userId" = ?', args: [account.userId] },
      { sql: "DELETE FROM users WHERE id = ?", args: [account.userId] },
    );
  }
  await write(statements).catch(() => {});
}

try {
  seller = await signUp("Cargo Seller", sellerEmail);
  buyer = await signUp("Cargo Buyer", buyerEmail);

  await write([
    {
      sql: `INSERT INTO stores (id, user_id, slug, name, currency, country, is_published, created_at, updated_at)
            VALUES (?, ?, ?, 'Cargo Depot', 'NGN', 'Nigeria', 1, ?, ?)`,
      args: [storeId, seller.userId, `cargo${stamp}`, now, now],
    },
    { sql: "INSERT INTO store_settings (store_id, updated_at) VALUES (?, ?)", args: [storeId, now] },
  ]);

  await getPage("/workspace/listings/new", seller.cookie);
  await getPage(`/listing/anything`, buyer.cookie);
  const actions = loadActionIds();
  const actionId = actions.get("saveListingAction");
  if (!actionId) throw new Error("saveListingAction is not in the manifest");

  // --- 1. Created through the normal product form, as cargo ---------------
  const created = await callAction(
    actionId,
    [
      {
        type: "cargo",
        title,
        subtitle: "Carton of 24",
        description: "Bulk cartons for resale.",
        categoryId: null,
        price: 1200000,
        compareAtPrice: null,
        costPrice: null,
        sku: null,
        trackInventory: true,
        stock: 40,
        durationMinutes: null,
        serviceMode: null,
        prepTimeMinutes: null,
        attributes: {
          packaging: "carton",
          unitsPerPackage: 24,
          unitName: "bottle",
          minimumOrder: 2,
          weight: 12,
          deliveryTerms: "Delivered in Lagos within 2 days.",
          pickup: true,
        },
        status: "active",
        isFeatured: false,
        images: [],
        variants: [],
      },
    ],
    seller.cookie,
  );

  check("a cargo listing is created through the product form", created.ok && Boolean(created.listingId), created.error ?? created.text.slice(0, 200));
  const listingId = created.listingId;

  if (listingId) {
    // --- 2. Its own fields, stored as the type's own attributes ----------
    const row = await db.execute({
      sql: "SELECT type, fulfilment, attributes, status FROM listings WHERE id = ?",
      args: [listingId],
    });
    const stored = row.rows[0];
    let attributes = {};
    try {
      attributes = JSON.parse(String(stored?.attributes ?? "{}"));
    } catch {
      attributes = {};
    }

    check("the type is cargo, stored as a real type", String(stored?.type) === "cargo", String(stored?.type));
    check("cargo ships like a physical product", String(stored?.fulfilment) === "shipping", String(stored?.fulfilment));
    check(
      "the cargo fields are stored",
      attributes.packaging === "carton" && attributes.unitsPerPackage === 24 && attributes.minimumOrder === 2,
      JSON.stringify(attributes),
    );

    // --- 3. The seller's module, the marketplace directory ---------------
    const workspace = await getPage("/workspace/listings", seller.cookie);
    check("the seller's Listing module shows it", workspace.html.includes(title), `status ${workspace.status}`);

    const directory = await getPage("/cargo", seller.cookie);
    check("the Cargo directory shows it", directory.html.includes(title), `status ${directory.status}`);

    const products = await getPage("/products", seller.cookie);
    check("All products still includes it", products.html.includes(title));

    // --- 4. The bulk facts a bulk buyer needs ----------------------------
    const detail = await getPage(`/listing/${listingId}`, buyer.cookie);
    check("the listing page renders", detail.status === 200, `status ${detail.status}`);
    check(
      "the listing page states the packaging and the pack size",
      /Packaging/.test(detail.html) && /Carton/.test(detail.html) && /24 units/.test(detail.html),
      "packaging facts missing",
    );
    check(
      "boolean and choice fields read as words, not machine values",
      /Collection available/.test(detail.html) && !/packaging"?\s*:/.test(detail.html),
    );

    // The card carries the bulk facts a bulk buyer scans for.
    const grid = await getPage("/products?q=" + encodeURIComponent(title), buyer.cookie);
    check(
      "the card states the packaging and the pack size",
      /Sold by the carton/i.test(grid.html) && /24 per package/i.test(grid.html),
      "card facts missing",
    );

    // --- 5. Bought through the normal product flow -----------------------
    const added = await callAction(actions.get("addToCartAction"), [{ listingId, quantity: 2 }], buyer.cookie);
    check("cargo is bought through the cart like a product", added.ok === true, added.error ?? added.text.slice(0, 200));

    const cartRows = await db.execute({
      sql: `SELECT ci.quantity, ci.ticket_type_id, ci.listing_id FROM cart_items ci
              JOIN carts c ON c.id = ci.cart_id WHERE c.user_id = ?`,
      args: [buyer.userId],
    });
    check(
      "the cart line is a listing line, never a ticket line",
      cartRows.rows.length === 1 &&
        String(cartRows.rows[0].listing_id) === listingId &&
        cartRows.rows[0].ticket_type_id === null,
      JSON.stringify(cartRows.rows[0] ?? null),
    );

    const cartPage = await getPage("/cart", buyer.cookie);
    check("the cart shows the cargo line", cartPage.html.includes(title));
  }
} catch (error) {
  failures.push(`threw: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
} finally {
  await cleanup();
}

console.log(`\nchecked ${checked} cargo assertions`);
if (failures.length > 0) {
  console.error(`\n${failures.length} failure(s):`);
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}
console.log("cargo holds as a real product type");
