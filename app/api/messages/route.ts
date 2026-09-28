/**
 * Sending a message, and opening a thread from a listing.
 *
 * Both entry points check who is asking: a send is only accepted from someone who
 * is party to the thread, and a thread is only ever opened with the store that
 * actually owns the listing.
 */

import { getCurrentUser } from "@/lib/auth";
import { queryOne } from "@/lib/db";
import { getListingDetail } from "@/lib/server/listings";
import {
  clearChatForUser,
  deleteChatForUser,
  deleteMessageForEveryone,
  editMessage,
  getThread,
  hideMessageForUser,
  listMessagesPage,
  markThreadRead,
  openThread,
  sendMessage,
} from "@/lib/server/messages";
import { toChatMessagesWithPayments } from "@/lib/server/payment-requests";
import {
  keyBelongsToFolder,
  messageMediaFolder,
  publicUrlForKey,
  MAX_FILE_BYTES,
} from "@/lib/storage";
import { ALLOWED_FILE_TYPES, ALLOWED_IMAGE_TYPES } from "@/lib/uploads";
import type { MessageAttachment } from "@/lib/types";

export const dynamic = "force-dynamic";

const MEDIA_TYPES = new Set<string>([...ALLOWED_IMAGE_TYPES, ...ALLOWED_FILE_TYPES]);

/**
 * Turn what the browser says it attached into what the server will store.
 *
 * The browser only ever sends storage **keys** it received from `/api/uploads`:
 * the URL is rebuilt here, and the key must sit in this sender's own media
 * namespace — so a message can never point at someone else's file, and an
 * upload that the backend never confirmed cannot appear to have succeeded.
 */
function readAttachments(
  raw: unknown,
  userId: string,
): { ok: true; attachments: MessageAttachment[] } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, attachments: [] };
  if (!Array.isArray(raw)) return { ok: false, error: "Attachments must be a list." };
  if (raw.length > 6) return { ok: false, error: "Attach up to 6 files per message." };

  const attachments: MessageAttachment[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) {
      return { ok: false, error: "One of the attachments could not be read." };
    }

    const { key, fileName, contentType, size } = entry as Record<string, unknown>;

    if (typeof key !== "string" || !keyBelongsToFolder(key, messageMediaFolder(userId))) {
      return { ok: false, error: "One of the attachments is not yours to send." };
    }

    const type = typeof contentType === "string" ? contentType.toLowerCase() : "";
    if (!MEDIA_TYPES.has(type)) {
      return { ok: false, error: "That file type cannot be sent in a message." };
    }

    const bytes = typeof size === "number" && Number.isFinite(size) ? size : 0;
    if (bytes <= 0 || bytes > MAX_FILE_BYTES) {
      return { ok: false, error: "That file is too large to send." };
    }

    attachments.push({
      key,
      // Rebuilt server-side. The client's URL is never trusted.
      url: publicUrlForKey(key),
      fileName: typeof fileName === "string" && fileName.trim() ? fileName.slice(0, 200) : "file",
      contentType: type,
      size: bytes,
    });
  }

  return { ok: true, attachments };
}

/**
 * GET — one page of history for a thread the caller is party to.
 *
 * Opening the conversation, scrolling up for older words, and filling a gap
 * after a reconnect are the same request with a different cursor. Realtime
 * arrives on the stream; this is only for what is already written.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in to read messages." }, { status: 401 });

  const url = new URL(request.url);
  const conversationId = url.searchParams.get("conversationId");
  if (!conversationId) {
    return Response.json({ error: "No conversation given." }, { status: 400 });
  }

  // Membership is decided by the server — an id from the client proves nothing.
  const thread = await getThread(conversationId, user.id);
  if (!thread) return Response.json({ error: "That conversation is not yours." }, { status: 403 });

  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 40, 1), 100);
  const { messages, hasMore } = await listMessagesPage(conversationId, {
    viewerId: user.id,
    beforeId: url.searchParams.get("before"),
    afterId: url.searchParams.get("after"),
    limit,
  });

  return Response.json({ messages: await toChatMessagesWithPayments(messages), hasMore });
}

/** POST — send a message into a thread the caller is party to. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in to send a message." }, { status: 401 });

  let payload: {
    conversationId?: string;
    body?: string;
    listingId?: string;
    storeId?: string;
    subject?: string;
    attachments?: unknown;
  };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return Response.json({ error: "Unreadable request." }, { status: 400 });
  }

  const attachmentResult = readAttachments(payload.attachments, user.id);
  if (!attachmentResult.ok) {
    return Response.json({ error: attachmentResult.error }, { status: 400 });
  }
  const attachments = attachmentResult.attachments;

  // Opening a thread: about a listing, or about the shop itself. Either way it
  // is idempotent — the same question lands in the same thread.
  if ((payload.listingId || payload.storeId) && !payload.conversationId) {
    let storeId: string;
    let listingId: string | null = null;
    let subject: string | null = null;

    if (payload.listingId) {
      const listing = await getListingDetail(payload.listingId);
      if (!listing) return Response.json({ error: "That listing no longer exists." }, { status: 404 });
      storeId = listing.storeId;
      listingId = listing.id;
      subject = listing.title;
    } else if (payload.storeId) {
      const store = await queryOne<{ id: string; name: string }>(
        "SELECT id, name FROM stores WHERE id = ?",
        [payload.storeId],
      );
      if (!store) return Response.json({ error: "That shop no longer exists." }, { status: 404 });
      storeId = store.id;
      subject = typeof payload.subject === "string" ? payload.subject.slice(0, 200) : null;
    } else {
      return Response.json({ error: "That shop no longer exists." }, { status: 404 });
    }

    let conversation;
    try {
      conversation = await openThread({
        storeId,
        listingId,
        buyerUserId: user.id,
        buyerName: user.name,
        buyerEmail: user.email,
        subject,
      });
    } catch (error) {
      // The one refusal here is messaging your own shop — report it plainly.
      return Response.json(
        { error: error instanceof Error ? error.message : "That conversation could not be opened." },
        { status: 400 },
      );
    }

    const body = payload.body?.trim() ?? "";
    if (body || attachments.length > 0) {
      const message = await sendMessage({
        conversationId: conversation.id,
        senderUserId: user.id,
        body,
        attachments,
      });
      return Response.json({
        conversationId: conversation.id,
        message: { id: message.id, createdAt: message.created_at },
      });
    }

    return Response.json({ conversationId: conversation.id });
  }

  const conversationId = payload.conversationId;
  const body = payload.body?.trim() ?? "";

  if (!conversationId || (body.length === 0 && attachments.length === 0)) {
    return Response.json({ error: "Nothing to send." }, { status: 400 });
  }

  const thread = await getThread(conversationId, user.id);
  if (!thread) return Response.json({ error: "That conversation is not yours." }, { status: 403 });

  try {
    const message = await sendMessage({
      conversationId,
      senderUserId: user.id,
      body,
      attachments,
    });
    return Response.json({
      message: {
        id: message.id,
        createdAt: message.created_at,
        attachments,
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Message could not be sent." },
      { status: 400 },
    );
  }
}

/**
 * PATCH — the lifecycle of messages and of one person's view of a thread.
 *
 * One verb, one action field, one place where every action's authority is
 * decided by the server:
 *
 *   read          — mark the thread's incoming messages as read
 *   edit          — change my own message's words, in place
 *   delete        — `scope: "me"` hides one message in my view;
 *                   `scope: "everyone"` removes the sender's message for both
 *   clear-chat    — clear the history from my own view (the thread stays)
 *   delete-chat   — remove the thread from my own chat list
 *
 * Nothing here trusts the client: who owns the message, who owns the
 * conversation and what each person may do are read from the database on
 * every call, and a UI that hides a button enforces nothing.
 */
export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });

  let payload: {
    action?: string;
    conversationId?: string;
    messageId?: string;
    scope?: string;
    body?: string;
  };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return Response.json({ error: "Unreadable request." }, { status: 400 });
  }

  const action = payload.action ?? "read";

  if (action === "read") {
    if (!payload.conversationId) {
      return Response.json({ error: "No conversation given." }, { status: 400 });
    }

    const thread = await getThread(payload.conversationId, user.id);
    if (!thread) return Response.json({ error: "That conversation is not yours." }, { status: 403 });

    await markThreadRead(payload.conversationId, user.id);
    return Response.json({ ok: true });
  }

  if (action === "edit") {
    if (!payload.messageId || typeof payload.body !== "string") {
      return Response.json({ error: "Nothing to edit." }, { status: 400 });
    }
    const result = await editMessage({
      messageId: payload.messageId,
      actorId: user.id,
      body: payload.body,
    });
    return result.ok
      ? Response.json({ ok: true, message: result.message })
      : Response.json({ error: result.error }, { status: result.status });
  }

  if (action === "delete") {
    if (!payload.messageId) {
      return Response.json({ error: "No message given." }, { status: 400 });
    }
    const result =
      payload.scope === "everyone"
        ? await deleteMessageForEveryone({ messageId: payload.messageId, actorId: user.id })
        : await hideMessageForUser({ messageId: payload.messageId, actorId: user.id });
    return result.ok
      ? Response.json({ ok: true, message: result.message ?? null, at: result.at ?? null })
      : Response.json({ error: result.error }, { status: result.status });
  }

  if (action === "clear-chat" || action === "delete-chat") {
    if (!payload.conversationId) {
      return Response.json({ error: "No conversation given." }, { status: 400 });
    }
    const result =
      action === "clear-chat"
        ? await clearChatForUser({ conversationId: payload.conversationId, actorId: user.id })
        : await deleteChatForUser({ conversationId: payload.conversationId, actorId: user.id });
    return result.ok
      ? Response.json({ ok: true, at: result.at ?? null })
      : Response.json({ error: result.error }, { status: result.status });
  }

  return Response.json({ error: "Unknown action." }, { status: 400 });
}
