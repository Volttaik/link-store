/**
 * Messaging — threads between a buyer and a store.
 *
 * A thread is always owned by two sides: the store (whose owner answers) and the
 * buyer who opened it. Every read here is scoped to one of those two, so a
 * conversation id arriving from the client is never trusted on its own.
 */

import "server-only";

import { emitChatEvent } from "./realtime";
import { sendAccountPush } from "./push";
import { sendMessageNotificationEmail } from "./email";
import { execute, query, queryOne } from "../db";
import { nowIso } from "../format";
import { newId } from "../ids";
import type { ChatMessageDto } from "../chat/types";
import type { ConversationRow, MessageAttachment, MessageRow } from "../types";

/** A thread as one side sees it: the other party, the listing, and the state. */
export type ThreadSummary = {
  id: string;
  listingId: string | null;
  listingTitle: string | null;
  listingImageUrl: string | null;
  /** The person on the other end, from this viewer's point of view. */
  counterpartName: string;
  counterpartEmail: string | null;
  /** Their picture — the shop's logo, or the buyer's profile picture. */
  counterpartAvatar: string | null;
  subject: string | null;
  lastMessage: string | null;
  lastMessageAt: string;
  lastFromMe: boolean;
  unread: number;
  /** True when the viewer is the seller side of this thread. */
  asSeller: boolean;
  /** The shop's currency — what a payment request in this thread settles in. */
  currency: string;
};

type ThreadRow = ConversationRow & {
  listing_title: string | null;
  listing_image_url: string | null;
  store_name: string;
  store_slug: string;
  store_logo_url: string | null;
  store_currency: string;
  owner_name: string | null;
  owner_email: string;
  buyer_avatar_url: string | null;
  last_body: string | null;
  last_sender: string | null;
  last_at: string | null;
  unread: number;
};

/**
 * Whether one message row (alias `m`) exists in one viewer's world.
 *
 * The two personal dimensions of message visibility, both per viewer:
 *   - removed for me — one person's `message_user_states` row hides it alone;
 *   - cleared up to a point — one person's `cleared_at` hides their own past.
 *
 * A removal for everyone is deliberately *not* a visibility filter: the row
 * stays as a tombstone both sides keep seeing in its place (the words are gone,
 * the quiet "Message deleted" remains), exactly as the schema records it.
 * Previews and unread counts use `MESSAGE_ALIVE` below to look past tombstones.
 *
 * Consumes two bound viewer ids, in order. Every read that shows messages goes
 * through this — there is no second, unfiltered path.
 */
const MESSAGE_VISIBLE = `
  NOT EXISTS (
    SELECT 1 FROM message_user_states ms
     WHERE ms.message_id = m.id AND ms.user_id = ? AND ms.deleted_at IS NOT NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM conversation_user_states cs
     WHERE cs.conversation_id = m.conversation_id AND cs.user_id = ?
       AND cs.cleared_at IS NOT NULL AND m.created_at <= cs.cleared_at
  )`;

/**
 * A message the viewer can see *and* that still has words: no tombstone.
 * What previews quote and what counts as unread — a deleted message is neither.
 * Consumes the same two bound viewer ids as `MESSAGE_VISIBLE`.
 */
const MESSAGE_ALIVE = `m.deleted_for_everyone_at IS NULL AND ${MESSAGE_VISIBLE}`;

/** The two viewer ids one use of `MESSAGE_VISIBLE` (or `MESSAGE_ALIVE`) consumes. */
const viewerSees = (userId: string): string[] => [userId, userId];

/**
 * Whether one conversation (alias `c`) belongs in one viewer's chat list.
 *
 * "Delete my chat" is a state on my view of the thread, never the thread: it
 * hides the conversation from my list, and any new activity after that point
 * brings it back — nothing of the other participant's was ever touched.
 * Consumes one bound viewer id.
 */
const CONVERSATION_LISTED = `
  NOT EXISTS (
    SELECT 1 FROM conversation_user_states cs
     WHERE cs.conversation_id = c.id AND cs.user_id = ?
       AND cs.deleted_at IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM messages m
          WHERE m.conversation_id = c.id AND m.created_at > cs.deleted_at
       )
  )`;

const THREAD_SELECT = `
  SELECT c.*,
         l.title         AS listing_title,
         (SELECT li.image_url FROM listing_images li
           WHERE li.listing_id = l.id
           ORDER BY li.position ASC, li.created_at ASC LIMIT 1) AS listing_image_url,
         s.name          AS store_name,
         s.slug          AS store_slug,
         s.logo_url      AS store_logo_url,
         s.currency      AS store_currency,
         u.name          AS owner_name,
         u.email         AS owner_email,
         bu.avatar_url   AS buyer_avatar_url,
         (SELECT m.body            FROM messages m WHERE m.conversation_id = c.id AND ${MESSAGE_ALIVE} ORDER BY m.created_at DESC LIMIT 1) AS last_body,
         (SELECT m.sender_user_id  FROM messages m WHERE m.conversation_id = c.id AND ${MESSAGE_ALIVE} ORDER BY m.created_at DESC LIMIT 1) AS last_sender,
         (SELECT m.created_at      FROM messages m WHERE m.conversation_id = c.id AND ${MESSAGE_ALIVE} ORDER BY m.created_at DESC LIMIT 1) AS last_at,
         (SELECT COUNT(*)          FROM messages m WHERE m.conversation_id = c.id AND ${MESSAGE_ALIVE}
            AND m.sender_user_id <> ? AND m.read_at IS NULL) AS unread
    FROM conversations c
    JOIN stores s ON s.id = c.store_id
    JOIN users  u ON u.id = s.user_id
    LEFT JOIN users bu ON bu.id = c.buyer_user_id
    LEFT JOIN listings l ON l.id = c.listing_id
`;

/**
 * The viewer ids `THREAD_SELECT` consumes before its WHERE clause:
 * last_body ×2, last_sender ×2, last_at ×2, unread ×3 — nine, all the viewer.
 */
const threadViewerArgs = (userId: string): string[] => Array(9).fill(userId);

function toSummary(row: ThreadRow, viewerId: string): ThreadSummary {
  const asSeller = row.owner_email != null && viewerId !== row.buyer_user_id;

  return {
    id: row.id,
    listingId: row.listing_id,
    listingTitle: row.listing_title,
    listingImageUrl: row.listing_image_url,
    counterpartName: asSeller ? (row.buyer_name ?? row.buyer_email ?? "Buyer") : row.store_name,
    counterpartEmail: asSeller ? row.buyer_email : row.owner_email,
    counterpartAvatar: asSeller ? row.buyer_avatar_url : row.store_logo_url,
    subject: row.subject,
    // The preview is the newest message the viewer can actually see — a
    // deleted or cleared-away message is never quoted as if it were there.
    // `null` means "nothing to show"; an empty body means "an attachment".
    lastMessage: row.last_body,
    lastMessageAt: row.last_at ?? "",
    lastFromMe: row.last_sender === viewerId,
    unread: row.unread,
    asSeller,
    currency: row.store_currency ?? "NGN",
  };
}

/** The two people a conversation belongs to — the only audience it ever has. */
export async function conversationParties(
  conversationId: string,
): Promise<{ buyerUserId: string; storeOwnerId: string } | null> {
  const row = await queryOne<{ buyer_user_id: string; owner_id: string }>(
    `SELECT c.buyer_user_id, s.user_id AS owner_id
       FROM conversations c
       JOIN stores s ON s.id = c.store_id
      WHERE c.id = ?`,
    [conversationId],
  );

  return row ? { buyerUserId: row.buyer_user_id, storeOwnerId: row.owner_id } : null;
}

/**
 * A stored row as every chat surface renders it.
 *
 * A payment card message carries its request's id here; the request's live
 * state is attached by `toChatMessagesWithPayments` (see
 * `lib/server/payment-requests`) — one batch read, never one query per message.
 */
export function toChatMessage(row: MessageRow): ChatMessageDto {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderUserId: row.sender_user_id,
    body: row.body,
    attachments: parseMessageAttachments(row.attachments),
    paymentRequestId: row.payment_request_id ?? null,
    paymentRequest: null,
    readAt: row.read_at,
    editedAt: row.edited_at,
    deletedAt: row.deleted_for_everyone_at,
    createdAt: row.created_at,
  };
}

/**
 * Every thread the user can see — as the seller of the store, or as the buyer who
 * opened it — most recently active first.
 */
export async function listThreads(userId: string, limit = 40): Promise<ThreadSummary[]> {
  const rows = await query<ThreadRow>(
    `${THREAD_SELECT}
      WHERE (c.buyer_user_id = ? OR s.user_id = ?)
        AND ${CONVERSATION_LISTED}
      ORDER BY COALESCE(last_at, c.last_message_at) DESC
      LIMIT ?`,
    [...threadViewerArgs(userId), userId, userId, userId, limit],
  );

  return rows.map((row) => toSummary(row, userId));
}

/** The number of unread messages across every thread the user is party to. */
export async function countUnreadThreads(userId: string): Promise<number> {
  const row = await queryOne<{ total: number }>(
    `SELECT COUNT(*) AS total
       FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
       JOIN stores s ON s.id = c.store_id
      WHERE m.read_at IS NULL
        AND m.sender_user_id <> ?
        AND (c.buyer_user_id = ? OR s.user_id = ?)
        AND ${MESSAGE_ALIVE}`,
    [userId, userId, userId, ...viewerSees(userId)],
  );

  return row?.total ?? 0;
}

/**
 * One thread, only if the user is a party to it.
 *
 * Returns null for anyone else, which is what keeps a guessed conversation id
 * from reading somebody else's messages.
 */
export async function getThread(
  conversationId: string,
  userId: string,
): Promise<ThreadSummary | null> {
  const row = await queryOne<ThreadRow>(
    `${THREAD_SELECT} WHERE c.id = ? AND (c.buyer_user_id = ? OR s.user_id = ?)`,
    [...threadViewerArgs(userId), conversationId, userId, userId],
  );

  return row ? toSummary(row, userId) : null;
}

/**
 * One page of a conversation's history.
 *
 * Three reads, one shape: the newest page to open on, older pages as the reader
 * scrolls up, and a gap fill after a reconnect. Always one page — a long
 * conversation is never pulled whole.
 */
export async function listMessagesPage(
  conversationId: string,
  options: { viewerId: string; beforeId?: string | null; afterId?: string | null; limit?: number },
): Promise<{ messages: MessageRow[]; hasMore: boolean }> {
  const limit = Math.min(Math.max(options.limit ?? 40, 1), 100);
  const anchorId = options.afterId ?? options.beforeId ?? null;
  const sees = viewerSees(options.viewerId);

  if (anchorId) {
    const anchor = await queryOne<MessageRow>(
      "SELECT * FROM messages WHERE id = ? AND conversation_id = ?",
      [anchorId, conversationId],
    );
    if (!anchor) return { messages: [], hasMore: false };

    if (options.afterId) {
      // Catching up forward, oldest first.
      const rows = await query<MessageRow>(
        `SELECT * FROM messages m
          WHERE m.conversation_id = ? AND ${MESSAGE_VISIBLE}
            AND (m.created_at > ? OR (m.created_at = ? AND m.id > ?))
          ORDER BY m.created_at ASC, m.id ASC
          LIMIT ?`,
        [conversationId, ...sees, anchor.created_at, anchor.created_at, anchor.id, limit + 1],
      );
      return { messages: rows.slice(0, limit), hasMore: rows.length > limit };
    }

    // History backward: newest of the older page first, flipped for the UI.
    const rows = await query<MessageRow>(
      `SELECT * FROM messages m
        WHERE m.conversation_id = ? AND ${MESSAGE_VISIBLE}
          AND (m.created_at < ? OR (m.created_at = ? AND m.id < ?))
        ORDER BY m.created_at DESC, m.id DESC
        LIMIT ?`,
      [conversationId, ...sees, anchor.created_at, anchor.created_at, anchor.id, limit + 1],
    );
    return { messages: rows.slice(0, limit).reverse(), hasMore: rows.length > limit };
  }

  const rows = await query<MessageRow>(
    `SELECT * FROM messages m
      WHERE m.conversation_id = ? AND ${MESSAGE_VISIBLE}
      ORDER BY m.created_at DESC, m.id DESC
      LIMIT ?`,
    [conversationId, ...sees, limit + 1],
  );
  return { messages: rows.slice(0, limit).reverse(), hasMore: rows.length > limit };
}

/**
 * Every message in the user's threads newer than a point in time.
 *
 * The stream's replay: when a connection comes back with the id of the last
 * event it saw, this is what it missed. Own messages are included on purpose —
 * the same person may have another tab open — and the UI de-duplicates by id.
 */
export async function listMessagesSince(userId: string, sinceIso: string): Promise<MessageRow[]> {
  return query<MessageRow>(
    `SELECT m.* FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
       JOIN stores s ON s.id = c.store_id
      WHERE m.created_at >= ?
        AND (c.buyer_user_id = ? OR s.user_id = ?)
        AND ${MESSAGE_VISIBLE}
      ORDER BY m.created_at ASC
      LIMIT 100`,
    [sinceIso, userId, userId, ...viewerSees(userId)],
  );
}

/**
 * Find or open the thread for this buyer, store and listing.
 *
 * Deliberately idempotent: a buyer pressing "Message the seller" twice lands in
 * the same thread rather than scattering their question across two.
 */
export async function openThread(input: {
  storeId: string;
  listingId: string | null;
  buyerUserId: string;
  buyerName: string | null;
  buyerEmail: string | null;
  subject?: string | null;
}): Promise<ConversationRow> {
  // A person cannot start a conversation with their own shop. Enforced here,
  // the one funnel every thread opens through, so it holds no matter which
  // surface asked.
  const store = await queryOne<{ user_id: string }>("SELECT user_id FROM stores WHERE id = ?", [
    input.storeId,
  ]);
  if (store && store.user_id === input.buyerUserId) {
    throw new Error("You cannot start a conversation with your own shop.");
  }

  const existing = await queryOne<ConversationRow>(
    input.listingId
      ? "SELECT * FROM conversations WHERE store_id = ? AND buyer_user_id = ? AND listing_id = ?"
      : "SELECT * FROM conversations WHERE store_id = ? AND buyer_user_id = ? AND listing_id IS NULL",
    input.listingId
      ? [input.storeId, input.buyerUserId, input.listingId]
      : [input.storeId, input.buyerUserId],
  );

  if (existing) return existing;

  const id = newId("cnv");
  await execute(
    `INSERT INTO conversations (id, store_id, listing_id, buyer_user_id, buyer_name, buyer_email, subject)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.storeId,
      input.listingId,
      input.buyerUserId,
      input.buyerName,
      input.buyerEmail,
      input.subject ?? null,
    ],
  );

  const created = await queryOne<ConversationRow>("SELECT * FROM conversations WHERE id = ?", [id]);
  if (!created) throw new Error("Conversation could not be created.");

  // Both sides hear about a brand-new thread at once, so the seller's list
  // learns of it without anyone coming to look.
  emitChatEvent({
    type: "conversation",
    audience: store ? [input.buyerUserId, store.user_id] : [input.buyerUserId],
    conversationId: id,
  });

  return created;
}

export async function sendMessage(input: {
  conversationId: string;
  senderUserId: string;
  body: string;
  /** Already-validated media from the sender's own upload namespace. */
  attachments?: MessageAttachment[];
}): Promise<MessageRow> {
  const body = input.body.trim();
  const attachments = input.attachments ?? [];

  if (body.length === 0 && attachments.length === 0) {
    throw new Error("A message cannot be empty.");
  }
  if (body.length > 4000) throw new Error("That message is too long.");
  if (attachments.length > 6) throw new Error("Attach up to 6 files per message.");

  // Who this conversation belongs to is decided here, never by the client: the
  // sender must be one of the two parties, and a conversation whose two sides
  // are the same person cannot be written to at all.
  const parties = await conversationParties(input.conversationId);
  if (!parties) throw new Error("That conversation is not yours.");
  if (parties.buyerUserId === parties.storeOwnerId) {
    throw new Error("You cannot message yourself.");
  }
  if (input.senderUserId !== parties.buyerUserId && input.senderUserId !== parties.storeOwnerId) {
    throw new Error("That conversation is not yours.");
  }

  const id = newId("msg");
  const at = nowIso();

  await execute(
    `INSERT INTO messages (id, conversation_id, sender_user_id, body, attachments)
     VALUES (?, ?, ?, ?, ?)`,
    [
      id,
      input.conversationId,
      input.senderUserId,
      body,
      attachments.length > 0 ? JSON.stringify(attachments) : null,
    ],
  );

  await execute("UPDATE conversations SET last_message_at = ? WHERE id = ?", [at, input.conversationId]);

  const created = await queryOne<MessageRow>("SELECT * FROM messages WHERE id = ?", [id]);
  if (!created) throw new Error("Message could not be saved.");

  // The moment it exists, it is an event — every open stream of both parties
  // hears it in the same beat, including the sender's other tabs.
  emitChatEvent({
    type: "message",
    audience: [parties.buyerUserId, parties.storeOwnerId],
    message: toChatMessage(created),
  });

  // A quiet thread waiting for someone earns an email; a live back-and-forth
  // never does. Fire-and-forget: chat must never wait on an inbox.
  await Promise.all([
    notifyOfWaitingMessage(created, parties).catch(() => {}),
    sendAccountPush(input.senderUserId === parties.buyerUserId ? parties.storeOwnerId : parties.buyerUserId, {
      title: "Rush Cart · New message", body: "You have a new message. Open Rush Cart to read it.",
      url: `/messages/${encodeURIComponent(input.conversationId)}`, tag: `rush-cart:message:${input.conversationId}`,
    }).catch(() => {}),
  ]);

  return created;
}

/**
 * Nudge the other side back to a conversation that is waiting for them.
 *
 * Two quietness rules, both about restraint: the message must be the only
 * unread one in the thread (nobody gets mailed into an active conversation),
 * and at most one notice per conversation per day (the delivery record's
 * dedupe key absorbs the rest). Recipients and names all come from the
 * database — the client decides nothing here.
 */
async function notifyOfWaitingMessage(
  message: MessageRow,
  parties: { buyerUserId: string; storeOwnerId: string },
): Promise<void> {
  const recipientId =
    message.sender_user_id === parties.buyerUserId ? parties.storeOwnerId : parties.buyerUserId;

  const unread = await queryOne<{ total: number }>(
    `SELECT COUNT(*) AS total FROM messages
      WHERE conversation_id = ? AND sender_user_id <> ? AND read_at IS NULL AND id <> ?`,
    [message.conversation_id, recipientId, message.id],
  );
  if (Number(unread?.total ?? 0) > 0) return;

  const recipient = await queryOne<{ email: string; name: string }>(
    "SELECT email, name FROM users WHERE id = ?",
    [recipientId],
  );
  const sender = await queryOne<{ name: string }>("SELECT name FROM users WHERE id = ?", [
    message.sender_user_id,
  ]);
  if (!recipient) return;

  const raw = message.body.trim() || "Sent you a file";
  const preview = raw.length > 140 ? `${raw.slice(0, 137)}…` : raw;

  await sendMessageNotificationEmail({
    to: recipient.email,
    name: recipient.name,
    fromName: sender?.name ?? "Someone",
    preview,
    conversationId: message.conversation_id,
    day: message.created_at.slice(0, 10),
  });
}

/** The attachments of a stored message, parsed defensively. */
export function parseMessageAttachments(json: string | null): MessageAttachment[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is MessageAttachment =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as MessageAttachment).key === "string" &&
        typeof (entry as MessageAttachment).url === "string",
    );
  } catch {
    return [];
  }
}

/**
 * Marks everything the other side has sent in this thread as read — and tells
 * them so. Read receipts here are real: they only ever move because somebody
 * actually read the thread, and the other side sees the tick change as it does.
 */
export async function markThreadRead(conversationId: string, userId: string): Promise<void> {
  const readAt = nowIso();
  await execute(
    "UPDATE messages SET read_at = ? WHERE conversation_id = ? AND sender_user_id <> ? AND read_at IS NULL",
    [readAt, conversationId, userId],
  );

  const parties = await conversationParties(conversationId);
  if (parties && parties.buyerUserId !== parties.storeOwnerId) {
    const counterpart = userId === parties.buyerUserId ? parties.storeOwnerId : parties.buyerUserId;
    emitChatEvent({
      type: "read",
      audience: [counterpart],
      conversationId,
      readerUserId: userId,
      readAt,
    });
  }
}

/** True when the user is the seller of the store this thread belongs to. */
export async function isThreadSeller(conversationId: string, userId: string): Promise<boolean> {
  const row = await queryOne<{ ok: number }>(
    `SELECT 1 AS ok FROM conversations c JOIN stores s ON s.id = c.store_id
      WHERE c.id = ? AND s.user_id = ?`,
    [conversationId, userId],
  );

  return Boolean(row);
}

/* ------------------------------------------------------------------------ */
/* Message actions — the lifecycle of a message after it exists              */
/* ------------------------------------------------------------------------ */

/**
 * Every action's outcome: either the new truth about the message, or the
 * reason it was refused — with the status the route should answer with.
 */
export type MessageActionResult =
  | { ok: true; message?: ChatMessageDto; at?: string }
  | { ok: false; error: string; status: number };

/** The two people a thread belongs to — and nobody else has any say here. */
function isParty(
  parties: { buyerUserId: string; storeOwnerId: string },
  userId: string,
): boolean {
  return userId === parties.buyerUserId || userId === parties.storeOwnerId;
}

/** The message and its thread's parties — the ground truth every decision below reads. */
async function actionableMessage(
  messageId: string,
): Promise<{ row: MessageRow; parties: { buyerUserId: string; storeOwnerId: string } } | null> {
  const row = await queryOne<MessageRow>("SELECT * FROM messages WHERE id = ?", [messageId]);
  if (!row) return null;
  const parties = await conversationParties(row.conversation_id);
  return parties ? { row, parties } : null;
}

/**
 * Edit a message — the sender's alone.
 *
 * Editing changes the words in place and stamps when; it never duplicates the
 * message, and it is refused for anyone who is not the sender — decided here,
 * from the stored row, never from anything the client claims.
 */
export async function editMessage(input: {
  messageId: string;
  actorId: string;
  body: string;
}): Promise<MessageActionResult> {
  const body = input.body.trim();
  if (body.length === 0) return { ok: false, error: "A message cannot be empty.", status: 400 };
  if (body.length > 4000) return { ok: false, error: "That message is too long.", status: 400 };

  const found = await actionableMessage(input.messageId);
  if (!found) return { ok: false, error: "That message no longer exists.", status: 404 };
  const { row, parties } = found;

  if (!isParty(parties, input.actorId)) {
    return { ok: false, error: "That conversation is not yours.", status: 403 };
  }
  if (row.sender_user_id !== input.actorId) {
    return { ok: false, error: "Only the sender can edit a message.", status: 403 };
  }
  if (row.deleted_for_everyone_at) {
    return { ok: false, error: "That message was deleted.", status: 400 };
  }

  const editedAt = nowIso();
  await execute("UPDATE messages SET body = ?, edited_at = ? WHERE id = ?", [
    body,
    editedAt,
    input.messageId,
  ]);

  const updated = await queryOne<MessageRow>("SELECT * FROM messages WHERE id = ?", [
    input.messageId,
  ]);
  if (!updated) return { ok: false, error: "That message no longer exists.", status: 404 };
  const message = toChatMessage(updated);

  // A shared change: both sides see the new words on the one stream, and both
  // lists re-read their preview. No polling, no second channel.
  emitChatEvent({
    type: "message-updated",
    audience: [parties.buyerUserId, parties.storeOwnerId],
    message,
  });
  emitChatEvent({
    type: "conversation",
    audience: [parties.buyerUserId, parties.storeOwnerId],
    conversationId: row.conversation_id,
  });

  return { ok: true, message };
}

/**
 * Delete a message for everyone — the sender's alone.
 *
 * The words leave the record entirely; the row stays as the tombstone both
 * sides see in its place. The backend decides who the sender is — a recipient
 * can never remove someone else's message from the shared conversation.
 */
export async function deleteMessageForEveryone(input: {
  messageId: string;
  actorId: string;
}): Promise<MessageActionResult> {
  const found = await actionableMessage(input.messageId);
  if (!found) return { ok: false, error: "That message no longer exists.", status: 404 };
  const { row, parties } = found;

  if (!isParty(parties, input.actorId)) {
    return { ok: false, error: "That conversation is not yours.", status: 403 };
  }
  if (row.sender_user_id !== input.actorId) {
    return { ok: false, error: "Only the sender can delete a message for everyone.", status: 403 };
  }
  if (row.deleted_for_everyone_at) return { ok: true, message: toChatMessage(row) };

  const deletedAt = nowIso();
  await execute(
    "UPDATE messages SET body = '', attachments = NULL, deleted_for_everyone_at = ? WHERE id = ?",
    [deletedAt, input.messageId],
  );

  const updated = await queryOne<MessageRow>("SELECT * FROM messages WHERE id = ?", [
    input.messageId,
  ]);
  if (!updated) return { ok: false, error: "That message no longer exists.", status: 404 };
  const message = toChatMessage(updated);

  emitChatEvent({
    type: "message-updated",
    audience: [parties.buyerUserId, parties.storeOwnerId],
    message,
  });
  emitChatEvent({
    type: "conversation",
    audience: [parties.buyerUserId, parties.storeOwnerId],
    conversationId: row.conversation_id,
  });

  return { ok: true, message };
}

/**
 * Delete a message for me — one person's view of it.
 *
 * A viewer-state row hides the message in this person's copy alone: the shared
 * message and the other participant's conversation are untouched. Anyone
 * party to the thread may hide any message from their own view.
 */
export async function hideMessageForUser(input: {
  messageId: string;
  actorId: string;
}): Promise<MessageActionResult> {
  const found = await actionableMessage(input.messageId);
  if (!found) return { ok: false, error: "That message no longer exists.", status: 404 };
  const { row, parties } = found;

  if (!isParty(parties, input.actorId)) {
    return { ok: false, error: "That conversation is not yours.", status: 403 };
  }

  const at = nowIso();
  await execute(
    `INSERT INTO message_user_states (message_id, user_id, deleted_at, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (message_id, user_id)
       DO UPDATE SET deleted_at = excluded.deleted_at, updated_at = excluded.updated_at`,
    [input.messageId, input.actorId, at, at],
  );

  // Only this viewer's world changed, so only their streams hear of it.
  emitChatEvent({
    type: "message-removed",
    audience: [input.actorId],
    conversationId: row.conversation_id,
    messageId: input.messageId,
    at,
  });
  emitChatEvent({ type: "conversation", audience: [input.actorId], conversationId: row.conversation_id });

  return { ok: true, at };
}

/**
 * Clear my chat — the history leaves my view, the conversation stays.
 *
 * `cleared_at` is a line in one viewer's own time: everything up to it is gone
 * from their copy and their preview, while the other participant's history is
 * untouched. This is not delete-for-everyone, and never becomes one.
 */
export async function clearChatForUser(input: {
  conversationId: string;
  actorId: string;
}): Promise<MessageActionResult> {
  const parties = await conversationParties(input.conversationId);
  if (!parties || !isParty(parties, input.actorId)) {
    return { ok: false, error: "That conversation is not yours.", status: 403 };
  }

  const at = nowIso();
  await execute(
    `INSERT INTO conversation_user_states (conversation_id, user_id, cleared_at, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (conversation_id, user_id)
       DO UPDATE SET cleared_at = excluded.cleared_at, updated_at = excluded.updated_at`,
    [input.conversationId, input.actorId, at, at],
  );

  emitChatEvent({
    type: "message-removed",
    audience: [input.actorId],
    conversationId: input.conversationId,
    messageId: null,
    at,
  });
  emitChatEvent({ type: "conversation", audience: [input.actorId], conversationId: input.conversationId });

  return { ok: true, at };
}

/**
 * Delete my chat — the conversation leaves my chat list, nothing more.
 *
 * The other participant keeps their conversation exactly as it is: this is a
 * state on one viewer's list, and new activity on the thread brings it back to
 * theirs. The shared conversation is never destroyed on one person's say-so.
 */
export async function deleteChatForUser(input: {
  conversationId: string;
  actorId: string;
}): Promise<MessageActionResult> {
  const parties = await conversationParties(input.conversationId);
  if (!parties || !isParty(parties, input.actorId)) {
    return { ok: false, error: "That conversation is not yours.", status: 403 };
  }

  const at = nowIso();
  await execute(
    `INSERT INTO conversation_user_states (conversation_id, user_id, deleted_at, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (conversation_id, user_id)
       DO UPDATE SET deleted_at = excluded.deleted_at, updated_at = excluded.updated_at`,
    [input.conversationId, input.actorId, at, at],
  );

  emitChatEvent({ type: "conversation", audience: [input.actorId], conversationId: input.conversationId });

  return { ok: true };
}
