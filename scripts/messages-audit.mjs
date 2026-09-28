/**
 * Messaging audit — the complete two-account lifecycle, over HTTP, against the
 * live database and the real storage driver.
 *
 * This is the verification suite behind the messaging system audit. It creates
 * three real accounts through the platform's own passwordless signup (dev has
 * no mailbox, so OTP codes are read from the `verification` table), then runs
 * the entire conversation lifecycle from both sides and asserts the exact
 * expected behaviour — including every authorization refusal:
 *
 *   - signed-out access is refused (401)
 *   - a conversation id proves nothing: an outsider is refused everywhere (403)
 *   - self-messaging is impossible at the API
 *   - conversation creation is idempotent and per-listing (multi-product)
 *   - messages persist with the right sender, order and timestamps
 *   - editing is the sender's alone
 *   - delete-for-me is per-viewer; delete-for-everyone is the sender's alone
 *   - clear-chat and delete-chat are per-viewer and never shared
 *   - read receipts move only when the other side actually reads
 *   - attachments are namespaced to the uploader and cannot be spoofed
 *   - realtime events reach the right audience (message, update, removal)
 *
 * Everything it creates is deleted at the end (including on failure).
 *
 *   node scripts/messages-audit.mjs [baseUrl]
 */

import { createClient } from "@libsql/client";
import { loadEnv, resolveDatabase, projectRoot } from "./load-env.mjs";
import { rm } from "node:fs/promises";
import path from "node:path";

const BASE = process.argv[2] ?? "http://127.0.0.1:5000";
loadEnv();
const { url, authToken, isRemote } = resolveDatabase();
const db = createClient(authToken ? { url, authToken } : { url });

const stamp = Date.now().toString(36);
const failures = [];
let checked = 0;

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

async function patch(pathname, body, headers = {}) {
  const response = await fetch(`${BASE}${pathname}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", origin: BASE, ...headers },
    body: JSON.stringify(body),
    redirect: "manual",
  });
  return { response, text: await response.text() };
}

async function getJson(pathname, cookie) {
  const response = await fetch(`${BASE}${pathname}`, {
    headers: cookie ? { cookie } : {},
    redirect: "manual",
  });
  const json = await response.json().catch(() => ({}));
  return { status: response.status, json };
}

async function getPage(pathname, cookie) {
  const response = await fetch(`${BASE}${pathname}`, {
    headers: cookie ? { cookie } : {},
    redirect: "manual",
  });
  return { status: response.status, html: await response.text() };
}

function check(label, condition, detail = "") {
  checked += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}

/** Register → send code → read it from the database → verify → session cookie. */
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
  const sessionCookie = setCookie
    .map((value) => value.split(";")[0])
    .find((value) => value.includes("better-auth.session_token"));
  if (!sessionCookie) throw new Error(`no session cookie for ${email}`);

  const user = await db.execute({ sql: "SELECT id FROM users WHERE email = ?", args: [email] });
  return { userId: String(user.rows[0].id), cookie: sessionCookie, email };
}

/**
 * Open the live stream and collect every frame into `seen`.
 *
 * `ready` resolves once the server has confirmed the subscription (its `ready`
 * frame), so a caller can safely trigger the action it wants to observe — the
 * listener is registered before anything can be missed. Never leaves a reader
 * behind: call `abort()` when done.
 */
function openStream(cookie, timeoutMs = 20000) {
  const controller = new AbortController();
  const seen = [];
  let resolveReady = () => {};
  const ready = new Promise((resolve) => {
    resolveReady = resolve;
  });
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  void (async () => {
    try {
      const live = await fetch(`${BASE}/api/messages/stream`, {
        headers: { cookie, accept: "text/event-stream" },
        signal: controller.signal,
      });
      const reader = live.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let frame;
        while ((frame = buffer.indexOf("\n\n")) !== -1) {
          const raw = buffer.slice(0, frame);
          buffer = buffer.slice(frame + 2);
          const eventLine = raw.split("\n").find((line) => line.startsWith("event: "));
          const dataLine = raw.split("\n").find((line) => line.startsWith("data: "));
          const entry = {
            event: eventLine ? eventLine.slice(7).trim() : "message",
            data: dataLine ? JSON.parse(dataLine.slice(6)) : null,
          };
          seen.push(entry);
          resolveReady(entry);
        }
      }
    } catch {
      // Abort or a dropped stream — judged by what was seen.
    } finally {
      clearTimeout(timer);
      resolveReady(null);
    }
  })();

  return {
    ready,
    seen,
    abort: () => controller.abort(),
  };
}

/** Poll the collected frames until one satisfies `predicate` (or time runs out). */
async function expectEvent(stream, predicate, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const hit = stream.seen.find((entry) => predicate(entry));
    if (hit) return hit;
    if (Date.now() > deadline) return null;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

const sellerEmail = `audit-seller-${stamp}@example.com`;
const buyerEmail = `audit-buyer-${stamp}@example.com`;
const outsiderEmail = `audit-outsider-${stamp}@example.com`;
const handle = `audit${stamp}`;
const storeId = `str_audit_${stamp}`;
const listingA = `lst_audit_a_${stamp}`;
const listingB = `lst_audit_b_${stamp}`;
const now = new Date().toISOString();

let seller = null;
let buyer = null;
let outsider = null;
const uploadedKeys = [];

try {
  // --- 1. Three real accounts, one real shop ----------------------------
  seller = await signUp("Audit Seller", sellerEmail);
  buyer = await signUp("Audit Buyer", buyerEmail);
  outsider = await signUp("Audit Outsider", outsiderEmail);

  await write([
    {
      sql: `INSERT INTO stores (id, user_id, slug, name, tagline, currency, country, is_published, created_at, updated_at)
            VALUES (?, ?, ?, 'Audit Shop', 'Messaging audit', 'NGN', 'Nigeria', 1, ?, ?)`,
      args: [storeId, seller.userId, handle, now, now],
    },
    { sql: "INSERT INTO store_settings (store_id, updated_at) VALUES (?, ?)", args: [storeId, now] },
    {
      sql: `INSERT INTO categories (id, store_id, name, slug, kind, position, created_at)
            VALUES (?, ?, 'Lamps', 'lamps', 'product', 0, ?)`,
      args: [`cat_audit_${stamp}`, storeId, now],
    },
    ...[listingA, listingB].map((id, index) => ({
      sql: `INSERT INTO listings
              (id, store_id, category_id, type, fulfilment, title, slug, description, currency, price,
               track_inventory, stock, status, published_at, created_at, updated_at)
            VALUES (?, ?, ?, 'physical', 'shipping', ?, ?, 'Audit listing.', 'NGN', 100000, 0, 5, 'active', ?, ?, ?)`,
      args: [
        id,
        storeId,
        `cat_audit_${stamp}`,
        index === 0 ? "Audit Lamp Alpha" : "Audit Lamp Beta",
        `audit-lamp-${index}`,
        now,
        now,
        now,
      ],
    })),
    {
      sql: `INSERT INTO listing_images (id, listing_id, image_url, position, created_at)
            VALUES (?, ?, '/api/files/public/audit/placeholder.png', 0, ?)`,
      args: [`lim_audit_${stamp}`, listingA, now],
    },
  ]);

  // --- 2. Authentication: signed-out gets nothing ----------------------
  let r = await fetch(`${BASE}/api/messages?conversationId=cnv_x`, { redirect: "manual" });
  check("signed-out history is refused (401)", r.status === 401, `status ${r.status}`);
  r = (await post("/api/messages", { conversationId: "cnv_x", body: "hi" })).response;
  check("signed-out send is refused (401)", r.status === 401, `status ${r.status}`);
  r = (await patch("/api/messages", { action: "read", conversationId: "cnv_x" })).response;
  check("signed-out mutation is refused (401)", r.status === 401, `status ${r.status}`);
  r = await fetch(`${BASE}/api/messages/stream`, { redirect: "manual" });
  check("signed-out stream is refused (401)", r.status === 401, `status ${r.status}`);

  // --- 3. Self-messaging is impossible ---------------------------------
  r = (await post("/api/messages", { storeId, listingId: null, subject: "me" }, { cookie: seller.cookie })).response;
  check("messaging your own shop is refused (400)", r.status === 400, `status ${r.status}`);

  // --- 4. Conversation creation ----------------------------------------
  // Product-initiated: the listing decides the store — the server re-resolves it.
  let open = await post(
    "/api/messages",
    { storeId: "str_bogus_does_not_exist", listingId: listingA },
    { cookie: buyer.cookie },
  );
  let opened = JSON.parse(open.text);
  check(
    "listing decides the store (spoofed storeId ignored)",
    open.response.status === 200 && Boolean(opened.conversationId),
    open.text.slice(0, 120),
  );
  const threadA = opened.conversationId;

  // Idempotent: the same buyer + listing lands in the same thread.
  open = await post("/api/messages", { storeId, listingId: listingA }, { cookie: buyer.cookie });
  opened = JSON.parse(open.text);
  check("re-opening returns the same conversation", opened.conversationId === threadA);

  // A second product is a second thread — context is never overwritten.
  open = await post("/api/messages", { storeId, listingId: listingB }, { cookie: buyer.cookie });
  opened = JSON.parse(open.text);
  const threadB = opened.conversationId;
  check("a different product opens a different conversation", Boolean(threadB) && threadB !== threadA);

  const rowA = await db.execute({
    sql: "SELECT store_id, listing_id, buyer_user_id FROM conversations WHERE id = ?",
    args: [threadA],
  });
  check(
    "conversation stores the real participants and product",
    rowA.rows.length === 1 &&
      String(rowA.rows[0].store_id) === storeId &&
      String(rowA.rows[0].listing_id) === listingA &&
      String(rowA.rows[0].buyer_user_id) === buyer.userId,
    JSON.stringify(rowA.rows[0] ?? null),
  );

  // --- 5. Sending and persistence --------------------------------------
  const first = await post("/api/messages", { conversationId: threadA, body: "Hello from the buyer" }, { cookie: buyer.cookie });
  const firstId = JSON.parse(first.text).message?.id;
  check("a message sends and confirms", first.response.status === 200 && Boolean(firstId), first.text.slice(0, 120));

  const longBody = "line one\nline two — émoji 🚀 and <b>markup</b> & \"quotes\" https://example.com/x?y=1 ".repeat(30);
  const payloads = [
    longBody,
    "short",
    "multi\nline\nmessage",
    "🎉🚀✨",
    "1234567890",
    "!@#$%^&*()_+-=[]{};':\",.<>/?\\|`~",
  ];
  const sentIds = [];
  for (const body of payloads) {
    const out = await post("/api/messages", { conversationId: threadA, body }, { cookie: buyer.cookie });
    sentIds.push(JSON.parse(out.text).message?.id ?? null);
  }
  check("every message confirms exactly once", sentIds.every(Boolean) && new Set(sentIds).size === sentIds.length, String(sentIds));

  let bad = await post("/api/messages", { conversationId: threadA, body: "   " }, { cookie: buyer.cookie });
  check("an empty message is refused (400)", bad.response.status === 400, `status ${bad.response.status}`);
  bad = await post("/api/messages", { conversationId: threadA, body: "x".repeat(4001) }, { cookie: buyer.cookie });
  check("an oversized message is refused (400)", bad.response.status === 400, `status ${bad.response.status}`);

  // Rapid consecutive sends — all persisted, correct sender, in order.
  const burstIds = [];
  for (let i = 0; i < 5; i += 1) {
    const out = await post("/api/messages", { conversationId: threadA, body: `burst ${i}` }, { cookie: buyer.cookie });
    burstIds.push(JSON.parse(out.text).message?.id);
  }
  check("rapid sends are all distinct", new Set(burstIds).size === 5, String(burstIds));

  let history = await getJson(`/api/messages?conversationId=${threadA}&limit=100`, buyer.cookie);
  const rows = history.json.messages ?? [];
  check("history is oldest-first", rows.every((m, i, all) => i === 0 || all[i - 1].createdAt <= m.createdAt));
  check("the sender is recorded server-side", rows.every((m) => m.senderUserId === buyer.userId));
  check("every body persisted", rows.some((m) => m.body === "multi\nline\nmessage") && rows.some((m) => m.body.includes("émoji")));

  // --- 6. Read receipts are real ---------------------------------------
  const unreadBefore = await getJson(`/api/messages?conversationId=${threadA}&limit=100`, seller.cookie);
  check(
    "the recipient sees unread messages",
    (unreadBefore.json.messages ?? []).some((m) => m.senderUserId === buyer.userId && m.readAt === null),
  );
  await patch("/api/messages", { action: "read", conversationId: threadA }, { cookie: seller.cookie });
  const afterRead = await getJson(`/api/messages?conversationId=${threadA}&limit=100`, buyer.cookie);
  check(
    "reading stamps read_at on the sender's messages",
    (afterRead.json.messages ?? []).filter((m) => m.senderUserId === buyer.userId).every((m) => m.readAt !== null),
  );

  // --- 7. Edit ---------------------------------------------------------
  const target = rows.find((m) => m.body === "short");
  let edited = await patch("/api/messages", { action: "edit", messageId: target.id, body: "short (edited)" }, { cookie: buyer.cookie });
  check("the sender can edit", edited.response.status === 200, edited.text.slice(0, 120));
  let refreshed = await getJson(`/api/messages?conversationId=${threadA}&limit=100`, seller.cookie);
  const editedRow = (refreshed.json.messages ?? []).find((m) => m.id === target.id);
  check("the edit persists and is stamped", editedRow?.body === "short (edited)" && Boolean(editedRow?.editedAt), JSON.stringify(editedRow).slice(0, 160));

  edited = await patch("/api/messages", { action: "edit", messageId: target.id, body: "hijacked" }, { cookie: seller.cookie });
  check("the recipient cannot edit (403)", edited.response.status === 403, `status ${edited.response.status}`);
  edited = await patch("/api/messages", { action: "edit", messageId: target.id, body: "hijacked" }, { cookie: outsider.cookie });
  check("an outsider cannot edit (403)", edited.response.status === 403, `status ${edited.response.status}`);
  refreshed = await getJson(`/api/messages?conversationId=${threadA}&limit=100`, buyer.cookie);
  check(
    "the refused edits changed nothing",
    (refreshed.json.messages ?? []).find((m) => m.id === target.id)?.body === "short (edited)",
  );

  // --- 8. Delete for me -----------------------------------------------
  const forMe = rows.find((m) => m.body === "1234567890");
  let gone = await patch("/api/messages", { action: "delete", messageId: forMe.id, scope: "me" }, { cookie: buyer.cookie });
  check("delete-for-me succeeds", gone.response.status === 200, gone.text.slice(0, 120));
  refreshed = await getJson(`/api/messages?conversationId=${threadA}&limit=100`, buyer.cookie);
  check("it is gone from the actor's view", !(refreshed.json.messages ?? []).some((m) => m.id === forMe.id));
  refreshed = await getJson(`/api/messages?conversationId=${threadA}&limit=100`, seller.cookie);
  check("it remains for the other side", (refreshed.json.messages ?? []).some((m) => m.id === forMe.id));
  const keptRow = await db.execute({ sql: "SELECT body FROM messages WHERE id = ?", args: [forMe.id] });
  check("the shared row is untouched", keptRow.rows.length === 1 && String(keptRow.rows[0].body) === "1234567890");

  // --- 9. Delete for everyone -----------------------------------------
  const forAll = rows.find((m) => m.body === "multi\nline\nmessage");
  let refused = await patch("/api/messages", { action: "delete", messageId: forAll.id, scope: "everyone" }, { cookie: seller.cookie });
  check("the recipient cannot delete for everyone (403)", refused.response.status === 403, `status ${refused.response.status}`);
  refused = await patch("/api/messages", { action: "delete", messageId: forAll.id, scope: "everyone" }, { cookie: outsider.cookie });
  check("an outsider cannot delete for everyone (403)", refused.response.status === 403, `status ${refused.response.status}`);

  let deleted = await patch("/api/messages", { action: "delete", messageId: forAll.id, scope: "everyone" }, { cookie: buyer.cookie });
  check("the sender can delete for everyone", deleted.response.status === 200, deleted.text.slice(0, 120));
  for (const who of [buyer.cookie, seller.cookie]) {
    refreshed = await getJson(`/api/messages?conversationId=${threadA}&limit=100`, who);
    const tomb = (refreshed.json.messages ?? []).find((m) => m.id === forAll.id);
    check("both sides see the tombstone, words gone", Boolean(tomb?.deletedAt) && tomb.body === "" && tomb.attachments.length === 0, JSON.stringify(tomb ?? null).slice(0, 120));
  }
  const tombRow = await db.execute({ sql: "SELECT body, deleted_for_everyone_at FROM messages WHERE id = ?", args: [forAll.id] });
  check(
    "the row stays as a tombstone",
    tombRow.rows.length === 1 && tombRow.rows[0].deleted_for_everyone_at !== null,
    JSON.stringify(tombRow.rows[0] ?? null),
  );

  // --- 10. Attachments -------------------------------------------------
  // A tiny real PNG through the real upload endpoint.
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
  const form = new FormData();
  form.append("file", new Blob([png], { type: "image/png" }), "audit.png");
  form.append("kind", "image");
  form.append("folder", "messages");
  form.append("purpose", "message");
  form.append("visibility", "public");
  let up = await fetch(`${BASE}/api/uploads`, { method: "POST", body: form, headers: { cookie: buyer.cookie, origin: BASE }, redirect: "manual" });
  const uploaded = await up.json().catch(() => ({}));
  check("an authenticated upload succeeds", up.status === 200 && Boolean(uploaded.key), JSON.stringify(uploaded).slice(0, 160));
  check(
    "the key is namespaced to the uploader",
    String(uploaded.key ?? "").startsWith(`public/msg-${buyer.userId}/`) || String(uploaded.key ?? "").startsWith(`public/msg-${buyer.userId.toLowerCase()}/`),
    String(uploaded.key),
  );
  if (uploaded.key) uploadedKeys.push(uploaded.key);

  up = await fetch(`${BASE}/api/uploads`, { method: "POST", body: form, redirect: "manual" });
  check("signed-out upload is refused (401)", up.status === 401, `status ${up.status}`);

  // Sending media: the sender's own key travels; anyone else's is refused.
  const withMedia = await post(
    "/api/messages",
    {
      conversationId: threadA,
      body: "",
      attachments: [
        { key: uploaded.key, fileName: "audit.png", contentType: "image/png", size: png.length },
      ],
    },
    { cookie: buyer.cookie },
  );
  check("a message with the sender's own media sends", withMedia.response.status === 200, withMedia.text.slice(0, 120));

  const spoofed = await post(
    "/api/messages",
    {
      conversationId: threadA,
      body: "",
      attachments: [
        { key: `public/msg-${seller.userId}/2026/09/steal.png`, fileName: "steal.png", contentType: "image/png", size: 10 },
      ],
    },
    { cookie: buyer.cookie },
  );
  check("another account's media namespace is refused (400)", spoofed.response.status === 400, `status ${spoofed.response.status}`);

  const badType = await post(
    "/api/messages",
    {
      conversationId: threadA,
      body: "",
      attachments: [
        { key: uploaded.key, fileName: "audit.svg", contentType: "image/svg+xml", size: 10 },
      ],
    },
    { cookie: buyer.cookie },
  );
  check("a disallowed media type is refused (400)", badType.response.status === 400, `status ${badType.response.status}`);

  if (uploaded.key) {
    const served = await fetch(`${BASE}/api/files/${uploaded.key}`, { redirect: "manual" });
    check("the stored media is served", served.status === 200, `status ${served.status}`);
  }
  const priv = await fetch(`${BASE}/api/files/private/anything/secret.pdf`, { redirect: "manual" });
  check("private objects are unreachable (404)", priv.status === 404, `status ${priv.status}`);

  // --- 11. Outsiders get nothing --------------------------------------
  const allRefusals = [
    ["outsider history (403)", await getJson(`/api/messages?conversationId=${threadA}`, outsider.cookie), 403],
    ["outsider send (403)", await post("/api/messages", { conversationId: threadA, body: "intrusion" }, { cookie: outsider.cookie }), 403],
    ["outsider read (403)", await patch("/api/messages", { action: "read", conversationId: threadA }, { cookie: outsider.cookie }), 403],
    ["outsider clear (403)", await patch("/api/messages", { action: "clear-chat", conversationId: threadA }, { cookie: outsider.cookie }), 403],
    ["outsider delete-chat (403)", await patch("/api/messages", { action: "delete-chat", conversationId: threadA }, { cookie: outsider.cookie }), 403],
    ["outsider delete-me (403)", await patch("/api/messages", { action: "delete", messageId: target.id, scope: "me" }, { cookie: outsider.cookie }), 403],
  ];
  for (const [label, result, expected] of allRefusals) {
    const status = result.response?.status ?? result.status;
    check(label, status === expected, `status ${status}`);
  }
  const outsiderView = await getPage(`/messages/${threadA}`, outsider.cookie);
  check("the conversation page is closed to outsiders (404)", outsiderView.status === 404, `status ${outsiderView.status}`);
  const strangerView = await getPage(`/messages/${threadA}`);
  check("the conversation page needs an account", [307, 401, 404].includes(strangerView.status), `status ${strangerView.status}`);

  // --- 12. Clear chat vs delete chat ----------------------------------
  // Clear: my history leaves my view; theirs is untouched; the thread stays.
  let cleared = await patch("/api/messages", { action: "clear-chat", conversationId: threadA }, { cookie: buyer.cookie });
  check("clear-chat succeeds", cleared.response.status === 200, cleared.text.slice(0, 120));
  let mineNow = await getJson(`/api/messages?conversationId=${threadA}&limit=100`, buyer.cookie);
  check("the actor's history is cleared", (mineNow.json.messages ?? []).length === 0, `${(mineNow.json.messages ?? []).length} left`);
  let theirsNow = await getJson(`/api/messages?conversationId=${threadA}&limit=100`, seller.cookie);
  check("the other side's history is untouched", (theirsNow.json.messages ?? []).length > 0, `${(theirsNow.json.messages ?? []).length} left`);

  // New activity after the clear is visible again to the clearer.
  await post("/api/messages", { conversationId: threadA, body: "after the clear" }, { cookie: seller.cookie });
  mineNow = await getJson(`/api/messages?conversationId=${threadA}&limit=100`, buyer.cookie);
  check(
    "new messages after a clear are visible to the clearer",
    (mineNow.json.messages ?? []).some((m) => m.body === "after the clear"),
  );

  // Delete chat: leaves my list only. Theirs keeps it.
  let deletedChat = await patch("/api/messages", { action: "delete-chat", conversationId: threadA }, { cookie: buyer.cookie });
  check("delete-chat succeeds", deletedChat.response.status === 200, deletedChat.text.slice(0, 120));
  let sellerList = await getPage("/messages", seller.cookie);
  check("the other side's chat list keeps the thread", sellerList.html.includes(threadA), "thread missing from seller list");
  const buyerRows = await db.execute({
    sql: "SELECT deleted_at FROM conversation_user_states WHERE conversation_id = ? AND user_id = ?",
    args: [threadA, buyer.userId],
  });
  check(
    "delete-chat is per-viewer state, not destruction",
    buyerRows.rows.length === 1 && buyerRows.rows[0].deleted_at !== null,
    JSON.stringify(buyerRows.rows[0] ?? null),
  );

  // New activity brings the thread back to the deleter's list.
  await post("/api/messages", { conversationId: threadA, body: "the thread lives on" }, { cookie: seller.cookie });
  let buyerList = await getPage("/messages", buyer.cookie);
  check("new activity resurfaces the thread for the deleter", buyerList.html.includes(threadA), "thread missing from buyer list");

  // --- 13. Realtime: the right events reach the right audience ---------
  const sellerWatch = openStream(seller.cookie);
  await sellerWatch.ready;
  await post("/api/messages", { conversationId: threadA, body: "realtime ping" }, { cookie: buyer.cookie });
  const live = await expectEvent(sellerWatch, (e) => e.event === "message" && e.data?.body === "realtime ping");
  check("a new message is pushed to the recipient", Boolean(live), JSON.stringify(sellerWatch.seen.slice(-2)).slice(0, 160));
  check(
    "the pushed message carries the real sender and conversation",
    Boolean(live) && live.data.senderUserId === buyer.userId && live.data.conversationId === threadA,
  );

  const pingRow = (await getJson(`/api/messages?conversationId=${threadA}&limit=100`, buyer.cookie)).json.messages?.find((m) => m.body === "realtime ping");
  await patch("/api/messages", { action: "edit", messageId: pingRow.id, body: "realtime pong" }, { cookie: buyer.cookie });
  const editEvent = await expectEvent(sellerWatch, (e) => e.event === "message-updated" && e.data?.body === "realtime pong");
  check("an edit is pushed to the other side", Boolean(editEvent));

  await patch("/api/messages", { action: "delete", messageId: pingRow.id, scope: "everyone" }, { cookie: buyer.cookie });
  const removed = await expectEvent(
    sellerWatch,
    (e) => e.event === "message-updated" && e.data?.id === pingRow.id && Boolean(e.data?.deletedAt),
  );
  check("a delete-for-everyone is pushed to the other side", Boolean(removed));
  sellerWatch.abort();

  const buyerWatch = openStream(buyer.cookie);
  await buyerWatch.ready;
  const threadBMsg = await post("/api/messages", { conversationId: threadB, body: "hide me" }, { cookie: buyer.cookie });
  const hideId = JSON.parse(threadBMsg.text).message?.id;
  await patch("/api/messages", { action: "delete", messageId: hideId, scope: "me" }, { cookie: buyer.cookie });
  const selfRemoval = await expectEvent(
    buyerWatch,
    (e) => e.event === "message-removed" && e.data?.conversationId === threadB && e.data?.messageId === hideId,
  );
  check("a delete-for-me is pushed to the actor's own streams", Boolean(selfRemoval));
  check(
    "a delete-for-me is never pushed to the other side",
    !sellerWatch.seen.some((e) => e.event === "message-removed"),
  );
  buyerWatch.abort();

  // --- 14. Two sends at exactly the same time -------------------------
  const [race1, race2] = await Promise.all([
    post("/api/messages", { conversationId: threadA, body: "race from buyer" }, { cookie: buyer.cookie }),
    post("/api/messages", { conversationId: threadA, body: "race from seller" }, { cookie: seller.cookie }),
  ]);
  check("simultaneous sends both persist", race1.response.status === 200 && race2.response.status === 200);
  const raceRows = (await getJson(`/api/messages?conversationId=${threadA}&limit=100`, buyer.cookie)).json.messages ?? [];
  check(
    "both racing messages are present",
    raceRows.some((m) => m.body === "race from buyer") && raceRows.some((m) => m.body === "race from seller"),
  );

  // --- 15. Refresh semantics: everything is server state ---------------
  const finalPage = await getPage(`/messages/${threadA}`, seller.cookie);
  check("the thread page renders its real history", finalPage.status === 200 && finalPage.html.includes("race from seller"), `status ${finalPage.status}`);
  check(
    "the header shows the real counterpart",
    finalPage.html.includes("Audit Buyer") || finalPage.html.includes("audit-buyer"),
  );
  check("edited state is shown", finalPage.html.includes("Edited"));
  check("the tombstone is shown", finalPage.html.includes("Message deleted"));
} catch (error) {
  failures.push(`threw: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
} finally {
  // Cleanup (leave the database and storage tidy on failure too).
  const rows = await db
    .execute({ sql: "SELECT id FROM users WHERE email IN (?, ?, ?)", args: [sellerEmail, buyerEmail, outsiderEmail] })
    .then((result) => result.rows.map((row) => String(row.id)))
    .catch(() => []);

  const statements = [
    {
      sql: "DELETE FROM message_user_states WHERE message_id IN (SELECT id FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE store_id = ?))",
      args: [storeId],
    },
    { sql: "DELETE FROM conversation_user_states WHERE conversation_id IN (SELECT id FROM conversations WHERE store_id = ?)", args: [storeId] },
    { sql: "DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE store_id = ?)", args: [storeId] },
    { sql: "DELETE FROM conversations WHERE store_id = ?", args: [storeId] },
    { sql: "DELETE FROM listing_images WHERE listing_id IN (SELECT id FROM listings WHERE store_id = ?)", args: [storeId] },
    { sql: "DELETE FROM listings WHERE store_id = ?", args: [storeId] },
    { sql: "DELETE FROM categories WHERE store_id = ?", args: [storeId] },
    { sql: "DELETE FROM store_settings WHERE store_id = ?", args: [storeId] },
    { sql: "DELETE FROM stores WHERE id = ?", args: [storeId] },
  ];
  for (const userId of [...rows, seller?.userId, buyer?.userId, outsider?.userId].filter(Boolean)) {
    statements.push(
      { sql: "DELETE FROM verification WHERE identifier LIKE ?", args: [`%${userId}%`] },
      { sql: "DELETE FROM sessions WHERE user_id = ?", args: [userId] },
      { sql: 'DELETE FROM account WHERE "userId" = ?', args: [userId] },
      { sql: "DELETE FROM users WHERE id = ?", args: [userId] },
    );
  }
  statements.push(
    { sql: "DELETE FROM verification WHERE identifier LIKE ?", args: [`%${sellerEmail}%`] },
    { sql: "DELETE FROM verification WHERE identifier LIKE ?", args: [`%${buyerEmail}%`] },
    { sql: "DELETE FROM verification WHERE identifier LIKE ?", args: [`%${outsiderEmail}%`] },
  );
  await write(statements).catch(() => {});

  // The one uploaded object: removed from local storage when that driver is in
  // use (R2 objects are left to bucket lifecycle rules — the test object is tiny).
  for (const key of uploadedKeys) {
    await rm(path.join(projectRoot, "storage", key), { force: true }).catch(() => {});
  }

  db.close();
}

console.log(`checked ${checked} messaging assertions`);
if (failures.length > 0) {
  console.error(`\n${failures.length} failure(s):`);
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}
console.log("the whole messaging lifecycle holds");
