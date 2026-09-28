/**
 * The live message channel.
 *
 * Events, not polls: the moment a message is written it is published to the
 * hub, and every open stream carries it straight to the people it concerns.
 * There is no loop of "fetch, wait, fetch" anywhere — the conversation is
 * simply live.
 *
 * The connection is per signed-in user and only ever carries events for
 * conversations they are party to. When a stream reconnects it brings the id of
 * the last event it saw; anything that happened in between is replayed from the
 * database (the source of truth), so a dropped connection costs nothing. The
 * channel is transport — the UI never shows any of this.
 */

import { getCurrentUser } from "@/lib/auth";
import { nowIso } from "@/lib/format";
import { onChatEvent } from "@/lib/server/realtime";
import { listMessagesSince } from "@/lib/server/messages";
import { toChatMessagesWithPayments } from "@/lib/server/payment-requests";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return new Response("Not signed in.", { status: 401 });
  }

  // The browser's own bookkeeping: on reconnect, the last id it received.
  const lastEventId = request.headers.get("Last-Event-ID");

  const encoder = new TextEncoder();
  let closed = false;
  let detach = () => {};

  const stream = new ReadableStream({
    async start(controller) {
      // A disconnect can land between the check and the write, so every write
      // goes through one guarded path: a dead stream is closed, never thrown
      // into — a browser closing a tab must not become a server error.
      const push = (chunk: Uint8Array) => {
        if (closed) return;
        try {
          controller.enqueue(chunk);
        } catch {
          closed = true;
          detach();
        }
      };

      const send = (id: string, event: string, data: unknown) => {
        push(encoder.encode(`id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      // Coming back from a disconnect? Replay what was missed — the events are
      // gone from memory by design, but never from the database.
      if (lastEventId) {
        try {
          const missed = await toChatMessagesWithPayments(await listMessagesSince(user.id, lastEventId));
          for (const message of missed) {
            send(message.createdAt, "message", message);
          }
        } catch {
          // A failed replay is not a failed stream: the UI re-reads from the
          // server when it hears the connection is back.
        }
      }

      detach = onChatEvent((event) => {
        if (!event.audience.includes(user.id)) return;

        switch (event.type) {
          case "message":
            send(event.message.createdAt, "message", event.message);
            break;
          case "read":
            send(event.readAt, "read", {
              conversationId: event.conversationId,
              readerUserId: event.readerUserId,
              readAt: event.readAt,
            });
            break;
          case "conversation":
            send(nowIso(), "conversation", { conversationId: event.conversationId });
            break;
          case "message-updated":
            // An edit, or a removal for everyone: the new truth about a
            // message both sides already have.
            send(nowIso(), "message-updated", event.message);
            break;
          case "message-removed":
            // One person's own view changed (delete for me / clear my chat).
            send(nowIso(), "message-removed", {
              conversationId: event.conversationId,
              messageId: event.messageId,
              at: event.at,
            });
            break;
        }
      });

      // Open immediately, so the client knows the channel is live rather than
      // waiting for the first event to prove it.
      send(nowIso(), "ready", { at: nowIso() });

      const close = () => {
        if (closed) return;
        closed = true;
        detach();
        try {
          controller.close();
        } catch {
          // Already closed by the client.
        }
      };

      request.signal.addEventListener("abort", close);
    },
    // The consumer going away (tab closed, navigation) cancels the stream —
    // detach then too, or the listener would outlive the reader.
    cancel() {
      closed = true;
      detach();
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream",
    },
  });
}
