/**
 * Cart isolation verification.
 *
 * Proves the account-scoped cart fix end to end over HTTP against the live
 * database: a basket owned by Account A is invisible to Account B and to a
 * signed-out guest, even when the browser replays A's cart cookie. This is the
 * state leak behind "Account B sees Account A's cart" and the stale count that
 * used to appear in the logged-out header.
 *
 *   node scripts/_verify-cart-isolation.mjs [baseUrl]
 */

import { createClient } from "@libsql/client";

import { loadEnv, resolveDatabase } from "./load-env.mjs";

const BASE = process.argv[2] ?? "http://localhost:5000";
loadEnv();
const { url, authToken } = resolveDatabase();
const db = createClient(authToken ? { url, authToken } : { url });

const stamp = Date.now().toString(36);
const failures = [];
let checked = 0;

const storeId = `str_crt_${stamp}`;
const listingId = `lst_crt_${stamp}`;
const cartId = `cart_crt_${stamp}`;
const cartToken = `tokencrt${stamp}`;
const handle = `crt${stamp}`;
const buyerEmailA = `crt-a-${stamp}@example.com`;
const buyerEmailB = `crt-b-${stamp}@example.com`;
const now = new Date().toISOString();

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
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error("database stayed locked");
}

async function post(path, body) {
  const response = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE },
    body: JSON.stringify(body),
    redirect: "manual",
  });
  return { response, text: await response.text() };
}

/** Register → OTP from the database → the session cookie the app accepts. */
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
  return { userId: String(user.rows[0].id), cookie };
}

/** Render a page with an identity (session cookie) + optional cart cookie. */
async function render(path, sessionCookie, cartCookie) {
  const cookieHeader = [sessionCookie, cartCookie ? `ls_cart=${cartCookie}` : null]
    .filter(Boolean)
    .join("; ");
  const response = await fetch(`${BASE}${path}`, {
    headers: { cookie: cookieHeader },
    redirect: "manual",
  });
  const html = await response.text();
  return { status: response.status, html };
}

/** The header's cart count as the DOM reports it, or -1 if no badge. */
function headerCartCount(html) {
  const match = html.match(/aria-label="Cart, (\d+) item/);
  return match ? Number(match[1]) : -1;
}

let accountA = null;
let accountB = null;

async function seed() {
  accountA = await signUp("Cart A", buyerEmailA);
  accountB = await signUp("Cart B", buyerEmailB);

  await write([
    {
      sql: `INSERT INTO stores (id, user_id, slug, name, currency, country, is_published, created_at, updated_at)
            VALUES (?, ?, ?, 'Cart Test Shop', 'NGN', 'Nigeria', 1, ?, ?)`,
      args: [storeId, accountA.userId, handle, now, now],
    },
    { sql: "INSERT INTO store_settings (store_id, updated_at) VALUES (?, ?)", args: [storeId, now] },
    {
      sql: `INSERT INTO listings (id, store_id, type, fulfilment, title, slug, description, currency, price,
               track_inventory, stock, status, published_at, created_at, updated_at)
            VALUES (?, ?, 'physical', 'shipping', 'Cart Test Item', ?, 'Isolation test.', 'NGN', 1000,
              1, 9, 'active', ?, ?, ?)`,
      args: [listingId, storeId, `crt-item-${stamp}`, now, now, now],
    },
    {
      sql: `INSERT INTO carts (id, token, user_id, status, created_at, updated_at)
            VALUES (?, ?, ?, 'active', ?, ?)`,
      args: [cartId, cartToken, accountA.userId, now, now],
    },
    {
      sql: `INSERT INTO cart_items (id, cart_id, listing_id, variant_id, ticket_type_id, quantity, unit_price, currency, created_at, updated_at)
            VALUES (?, ?, ?, NULL, NULL, 2, 1000, 'NGN', ?, ?)`,
      args: [`citem_crt_${stamp}`, cartId, listingId, now, now],
    },
  ]);
}

async function cleanup() {
  const statements = [
    { sql: "DELETE FROM cart_items WHERE cart_id = ?", args: [cartId] },
    { sql: "DELETE FROM carts WHERE id = ?", args: [cartId] },
    { sql: "DELETE FROM listings WHERE id = ?", args: [listingId] },
    { sql: "DELETE FROM store_settings WHERE store_id = ?", args: [storeId] },
    { sql: "DELETE FROM stores WHERE id = ?", args: [storeId] },
  ];
  for (const account of [accountA, accountB]) {
    if (!account) continue;
    statements.push(
      { sql: "DELETE FROM verification WHERE identifier LIKE ?", args: [`%${account.userId}%`] },
      { sql: "DELETE FROM sessions WHERE user_id = ?", args: [account.userId] },
      { sql: 'DELETE FROM account WHERE "userId" = ?', args: [account.userId] },
      { sql: "DELETE FROM users WHERE id = ?", args: [account.userId] },
    );
    statements.push({
      sql: "DELETE FROM verification WHERE identifier LIKE ?",
      args: [`%${account === accountA ? buyerEmailA : buyerEmailB}%`],
    });
  }
  await write(statements).catch(() => {});
}

try {
  await seed();

  // 1. Account A, holding A's cart cookie, sees their own 2 items.
  const aView = await render("/cart", accountA.cookie, cartToken);
  check("Account A sees their own cart", aView.html.includes("Cart Test Item"), `status ${aView.status}`);
  check("Account A header shows 2 in cart", headerCartCount(aView.html) === 2, `count ${headerCartCount(aView.html)}`);

  // 2. Account B replaying A's cart cookie sees an empty cart — never A's.
  const bView = await render("/cart", accountB.cookie, cartToken);
  check("Account B does NOT see Account A's cart", !bView.html.includes("Cart Test Item"), `status ${bView.status}`);
  check("Account B sees an empty cart", bView.html.includes("Your cart is empty") || !bView.html.includes("Cart Test Item"), "");
  check("Account B header shows 0 in cart", headerCartCount(bView.html) === 0 || headerCartCount(bView.html) === -1, `count ${headerCartCount(bView.html)}`);

  // 3. A signed-out guest replaying A's cart cookie sees an empty cart too.
  //    (Check the cart page, not the homepage — the seeded item is a published
  //    product and legitimately appears in the public marketplace.)
  const guestView = await render("/cart", null, cartToken);
  check("Guest cart page is empty (not Account A's cart)", !guestView.html.includes("Cart Test Item"), `status ${guestView.status}`);
  check("Guest cart page says empty", guestView.html.includes("Your cart is empty"), `status ${guestView.status}`);
  const guestHome = await render("/", null, cartToken);
  check("Guest header shows 0 in cart (no stale count)", headerCartCount(guestHome.html) === 0 || headerCartCount(guestHome.html) === -1, `count ${headerCartCount(guestHome.html)}`);

  // The logged-out header must never carry a signed-in person's state. The
  // theme toggle is the control these counts used to leak onto, so it is the
  // one asserted by name: no message badge anywhere in a guest's header, and
  // the toggle is still only a theme control.
  check(
    "Logged-out header shows no unread-message badge",
    !/aria-label="Messages[,][^"]*"[^>]*>/.test(guestHome.html) && !/aria-label="Messages,[^"]*unread"/.test(guestHome.html),
  );
  check(
    "The theme toggle still only controls the theme",
    /aria-label="Switch to (dark|light) mode"/.test(guestHome.html),
  );
  check(
    "Logged-out header still offers the account controls",
    guestHome.html.includes("Create account") || guestHome.html.includes("Sign up"),
  );

  // 4. Account A still sees their cart after B and the guest looked.
  const aAgain = await render("/cart", accountA.cookie, cartToken);
  check("Account A's cart is intact afterward", aAgain.html.includes("Cart Test Item"), `status ${aAgain.status}`);
} catch (error) {
  failures.push(`threw: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
} finally {
  await cleanup();
}

console.log(`\nchecked ${checked} cart-isolation assertions`);
if (failures.length > 0) {
  console.error(`\n${failures.length} failure(s):`);
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}
console.log("cart isolation holds");
