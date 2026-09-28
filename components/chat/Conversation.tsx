"use client";

/**
 * The conversation surface.
 *
 * Owns the exchange itself: the messages, the ones still on their way, the
 * reads, the history below the fold — and the realtime that keeps it all
 * moving. Every state here reflects the backend: a send appears at once and is
 * confirmed by the server, a read receipt arrives when the other side actually
 * reads, and a failure is one message's problem with one message's retry.
 *
 * Nothing technical is visible. There is no connection to see — only words
 * arriving and leaving.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { ChatComposer } from "@/components/chat/ChatComposer";
import { ConversationHeader } from "@/components/chat/ConversationHeader";
import { EmptyConversationState } from "@/components/chat/EmptyConversationState";
import type { MessageAction } from "@/components/chat/MessageActionsMenu";
import { MessageViewport } from "@/components/chat/MessageViewport";
import type { MessageModel } from "@/components/chat/MessageBubble";
import {
  PaymentRequestSheet,
  type PaymentRequestDraft,
} from "@/components/chat/PaymentRequestSheet";
import { Icon } from "@/components/ui/Icon";
import { subscribeChat } from "@/lib/chat/realtime";
import type { ChatAttachment, ChatMessageDto } from "@/lib/chat/types";
import type { ThreadSummary } from "@/lib/server/messages";

/** The product that started this inquiry — shown where the conversation began. */
function ProductContext({ thread }: { thread: ThreadSummary }) {
  if (!thread.listingId) return null;

  return (
    <div className="flex justify-center pb-1">
      <Link
        className="group flex max-w-md items-center gap-2.5 rounded-[1.15rem] rounded-bl-md bg-surface px-2.5 py-2 pr-3.5 no-underline shadow-elev-1 transition-transform motion-safe:hover:-translate-y-0.5"
        href={`/listing/${thread.listingId}`}
      >
        {thread.listingImageUrl ? (
          <img
            alt={thread.listingTitle ?? "Product"}
            className="size-11 shrink-0 rounded-xl object-cover"
            loading="lazy"
            src={thread.listingImageUrl}
          />
        ) : (
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-surface-secondary">
            <Icon name="shop" size={16} className="text-muted" />
          </span>
        )}
        <span className="min-w-0">
          <span className="block text-[9.5px] font-semibold tracking-[0.11em] text-accent uppercase">
            About this product
          </span>
          <span className="block truncate text-[12.5px] font-medium text-foreground">
            {thread.listingTitle ?? "this listing"}
          </span>
        </span>
        <Icon className="shrink-0 text-muted" name="chevronRight" size={14} />
      </Link>
    </div>
  );
}

function toModel(message: ChatMessageDto): MessageModel {
  return { ...message, key: message.id };
}

/** Do these two attachments describe the same media? */
function sameAttachments(a: ChatAttachment[], b: ChatAttachment[]): boolean {
  return a.length === b.length && a.every((entry, index) => entry.key === b[index]?.key);
}

/**
 * The viewer-state facts that must never be undone by a late-arriving copy:
 * messages gone from this viewer's view, the shared tombstones, and the
 * clear-chat line. A response or replay that was already on the wire when one
 * of these happened can therefore never repaint what the database has already
 * removed.
 */
type ViewState = {
  /** Removed for me — gone from this view and staying gone. */
  hidden: Set<string>;
  /** Removed for everyone — id → when, so even a fresh copy shows the tombstone. */
  tombstones: Map<string, string>;
  /** My clear-chat line, on the database's clock. Nothing at or before it returns. */
  clearedAt: string | null;
};

/**
 * Add incoming messages without ever repeating one, losing a read receipt — or
 * disturbing the order of what is already on screen.
 *
 * A message I just sent comes back to me over the stream while its request is
 * still in flight. That echo adopts the message still on its way out — same
 * place in the list, same identity — so the words never appear twice and never
 * jump; the confirm that follows simply finds it settled. A message that is
 * genuinely new settles into its chronological place, so a copy delivered out
 * of order can never show older words after newer ones.
 */
function mergeMessages(
  current: MessageModel[],
  incoming: MessageModel[],
  view: ViewState,
): MessageModel[] {
  let next = current;
  const put = (index: number, message: MessageModel) => {
    next = [...next];
    next[index] = message;
  };

  for (const raw of incoming) {
    if (raw.id === null) continue;

    // A message this view already removed, or that lives at or before the
    // clear-chat line, can never come back — however late a copy arrives.
    if (view.hidden.has(raw.id)) continue;
    if (view.clearedAt && raw.createdAt <= view.clearedAt) continue;

    // The shared tombstone is the final truth about a message: even a stale
    // copy carrying the old words renders as the quiet removal.
    const tombstone = view.tombstones.get(raw.id);
    const message: MessageModel =
      tombstone && !raw.deletedAt
        ? { ...raw, body: "", attachments: [], deletedAt: tombstone }
        : raw;

    const known = next.findIndex((entry) => entry.id === message.id);
    if (known !== -1) {
      const existing = next[known];
      const merged = { ...existing };
      let changed = false;

      if (!existing.readAt && message.readAt) {
        merged.readAt = message.readAt;
        changed = true;
      }
      // A catch-up may carry newer truth about a message already on screen:
      // its words were edited, or it was removed for everyone while this tab
      // was away. The message updates in place — same row, same place.
      if (message.editedAt && message.editedAt !== existing.editedAt) {
        merged.body = message.body;
        merged.attachments = message.attachments;
        merged.editedAt = message.editedAt;
        changed = true;
      }
      if (message.deletedAt && !existing.deletedAt) {
        merged.body = "";
        merged.attachments = [];
        merged.deletedAt = message.deletedAt;
        changed = true;
      }

      if (changed) put(known, merged);
      continue;
    }

    const pendingIndex = next.findIndex(
      (entry) =>
        entry.id === null &&
        entry.senderUserId === message.senderUserId &&
        entry.body === message.body &&
        sameAttachments(entry.attachments, message.attachments) &&
        Math.abs(new Date(entry.createdAt).getTime() - new Date(message.createdAt).getTime()) < 20000,
    );
    if (pendingIndex !== -1) {
      // Adopt in place: the message keeps its row and its key.
      put(pendingIndex, { ...message, key: next[pendingIndex].key });
      continue;
    }

    // New to this view: settle into its chronological place rather than simply
    // appending — arrival order must never decide what is shown as "latest".
    next = [...next];
    let insertAt = next.length;
    for (let index = next.length - 1; index >= 0; index -= 1) {
      if (next[index].createdAt <= message.createdAt) {
        insertAt = index + 1;
        break;
      }
    }
    next.splice(insertAt, 0, message);
  }

  return next;
}

export function Conversation({
  thread,
  viewerId,
  initialMessages,
  initialHasMore,
}: {
  thread: ThreadSummary;
  viewerId: string;
  initialMessages: ChatMessageDto[];
  initialHasMore: boolean;
}) {
  const router = useRouter();

  const [messages, setMessages] = useState<MessageModel[]>(() => initialMessages.map(toModel));
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [historyError, setHistoryError] = useState(false);
  /** The message currently borrowed by the composer to be edited. */
  const [editing, setEditing] = useState<MessageModel | null>(null);
  /** The seller's payment-request sheet, opened from the composer's actions. */
  const [paymentSheetOpen, setPaymentSheetOpen] = useState(false);

  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  /** The viewer-state facts no late copy may ever undo. */
  const viewStateRef = useRef<ViewState>({ hidden: new Set(), tombstones: new Map(), clearedAt: null });

  /** Everything on screen is read the moment it is on screen — and so it is said. */
  const markRead = useCallback(() => {
    void fetch("/api/messages", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: thread.id }),
    });
  }, [thread.id]);

  useEffect(() => {
    markRead();
  }, [markRead]);

  /** Fill any gap a dropped connection may have left — once, never on a timer. */
  const resync = useCallback(async () => {
    const lastWithId = [...messagesRef.current].reverse().find((message) => message.id !== null);
    const suffix = lastWithId?.id ? `&after=${lastWithId.id}` : "";

    try {
      const response = await fetch(`/api/messages?conversationId=${thread.id}${suffix}`);
      if (!response.ok) return;
      const result = (await response.json()) as { messages: ChatMessageDto[] };
      setMessages((current) => mergeMessages(current, result.messages.map(toModel), viewStateRef.current));
    } catch {
      // A failed catch-up is not a broken conversation; the next event moves it.
    }
  }, [thread.id]);

  // One shared stream, this conversation's share of it.
  useEffect(() => {
    return subscribeChat({
      onMessage: (message) => {
        if (message.conversationId !== thread.id) return;
        setMessages((current) => mergeMessages(current, [toModel(message)], viewStateRef.current));
        markRead();
      },
      onRead: (event) => {
        if (event.conversationId !== thread.id) return;
        // The other side just read: every confirmed word of mine turns read.
        setMessages((current) =>
          current.map((message) =>
            message.id !== null && message.senderUserId === viewerId && !message.readAt
              ? { ...message, readAt: event.readAt }
              : message,
          ),
        );
      },
      onMessageUpdated: (message) => {
        if (message.conversationId !== thread.id) return;
        // An edit, a removal for everyone, or a payment card changing state:
        // the new truth, in place. The tombstone is remembered, so no stale
        // copy can repaint the words.
        if (message.deletedAt) viewStateRef.current.tombstones.set(message.id, message.deletedAt);
        setMessages((current) =>
          current.map((entry) =>
            entry.id === message.id
              ? {
                  ...entry,
                  body: message.deletedAt ? "" : message.body,
                  attachments: message.deletedAt ? [] : message.attachments,
                  editedAt: message.editedAt,
                  deletedAt: message.deletedAt,
                  paymentRequest: message.paymentRequest ?? entry.paymentRequest,
                }
              : entry,
          ),
        );
      },
      onMessageRemoved: (event) => {
        if (event.conversationId !== thread.id) return;
        // This viewer's own view changed: one message, or the whole thread.
        // Either way it is recorded first — in-flight copies lose their way back.
        if (event.messageId) {
          viewStateRef.current.hidden.add(event.messageId);
          setMessages((current) => current.filter((entry) => entry.id !== event.messageId));
          setEditing((current) => (current?.id === event.messageId ? null : current));
        } else {
          viewStateRef.current.clearedAt = event.at ?? new Date().toISOString();
          setMessages([]);
          setHasMore(false);
          setEditing(null);
        }
      },
      onResync: () => void resync(),
    });
  }, [thread.id, viewerId, markRead, resync]);

  /* ------------------------------------------------------------------ */
  /* History                                                              */
  /* ------------------------------------------------------------------ */

  const loadOlder = useCallback(async () => {
    if (!hasMore || loadingOlder) return;
    const firstWithId = messagesRef.current.find((message) => message.id !== null);
    if (!firstWithId?.id) return;

    setLoadingOlder(true);
    setHistoryError(false);
    try {
      const response = await fetch(
        `/api/messages?conversationId=${thread.id}&before=${firstWithId.id}&limit=40`,
      );
      if (!response.ok) throw new Error();
      const result = (await response.json()) as { messages: ChatMessageDto[]; hasMore: boolean };

      setMessages((current) => {
        const known = new Set(
          current.map((message) => ("id" in message ? message.id : null)).filter(Boolean),
        );
        const older = result.messages.map(toModel).filter((message) => !known.has(message.id));
        return [...older, ...current];
      });
      setHasMore(result.hasMore);
    } catch {
      // A local problem gets a local way out — the retry sits at the top.
      setHistoryError(true);
    } finally {
      setLoadingOlder(false);
    }
  }, [thread.id, hasMore, loadingOlder]);

  /* ------------------------------------------------------------------ */
  /* Sending                                                              */
  /* ------------------------------------------------------------------ */

  const deliver = useCallback(
    async (key: string, body: string, attachments: ChatAttachment[]) => {
      const fail = () =>
        setMessages((current) =>
          current.map((message) =>
            message.key === key && message.id === null ? { ...message, status: "failed" } : message,
          ),
        );

      try {
        const response = await fetch("/api/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId: thread.id, body, attachments }),
        });
        const result = (await response.json()) as {
          message?: { id: string; createdAt: string };
        };

        if (!response.ok || !result.message) {
          fail();
          return;
        }

        const id = result.message.id;
        setMessages((current) => {
          const target = current.find((message) => message.key === key);
          // Settled already — the stream's echo adopted this message while the
          // request was in flight. It keeps its place; nothing to move.
          if (target && target.id === id) return current;
          // This row settled as a *different* confirmed message: two identical
          // sends crossing in flight. Each keeps its own identity — no row is
          // ever dropped, so neither message can vanish from the view.
          if (target && target.id !== null) return current;
          // The same message exists elsewhere in the list (another tab's echo
          // that could not be adopted): drop the duplicate, keep the settled one.
          if (current.some((message) => message.id === id)) {
            return current.filter((message) => message.key !== key);
          }
          // The common case: the message on its way out becomes the confirmed
          // message, exactly where it already stands. No jump, no re-entrance.
          return current.map((message) =>
            message.key === key
              ? {
                  ...message,
                  id,
                  readAt: null,
                  createdAt: result.message!.createdAt,
                  status: undefined,
                }
              : message,
          );
        });
      } catch {
        fail();
      }
    },
    [thread.id, viewerId],
  );

  const send = useCallback(
    (body: string, attachments: ChatAttachment[]) => {
      const key = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setMessages((current) => [
        ...current,
        {
          key,
          id: null,
          conversationId: thread.id,
          senderUserId: viewerId,
          body,
          attachments,
          paymentRequestId: null,
          paymentRequest: null,
          readAt: null,
          editedAt: null,
          deletedAt: null,
          createdAt: new Date().toISOString(),
          status: "sending",
        },
      ]);
      void deliver(key, body, attachments);
    },
    [deliver, thread.id, viewerId],
  );

  const retry = useCallback(
    (key: string) => {
      const message = messagesRef.current.find((entry) => entry.key === key);
      if (!message || message.id !== null) return;

      setMessages((current) =>
        current.map((entry) => (entry.key === key ? { ...entry, status: "sending" } : entry)),
      );
      void deliver(key, message.body, message.attachments);
    },
    [deliver],
  );

  /* ------------------------------------------------------------------ */
  /* Payment requests                                                    */
  /* ------------------------------------------------------------------ */

  /**
   * Send a payment request into the thread — the seller's side, at the amount
   * they enter. The card that lands is the backend's record of the agreement,
   * and the stream's echo simply finds it already here.
   */
  const requestPayment = useCallback(
    async (draft: PaymentRequestDraft): Promise<string | null> => {
      try {
        const response = await fetch("/api/messages/payment-requests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId: thread.id,
            amountMinor: draft.amountMinor,
            description: draft.description,
            listingId: thread.listingId,
          }),
        });
        const result = (await response.json()) as {
          message?: ChatMessageDto;
          error?: string;
        };

        if (!response.ok || !result.message) {
          return result.error ?? "The payment request could not be sent.";
        }

        setMessages((current) =>
          mergeMessages(current, [toModel(result.message!)], viewStateRef.current),
        );
        setPaymentSheetOpen(false);
        return null;
      } catch {
        return "The payment request could not be sent.";
      }
    },
    [thread.id, thread.listingId],
  );

  /* ------------------------------------------------------------------ */
  /* Message actions                                                     */
  /* ------------------------------------------------------------------ */

  /** Edit — the same message, its words changed where it already stands. */
  const editMessage = useCallback(async (messageId: string, body: string) => {
    setEditing(null);
    try {
      const response = await fetch("/api/messages", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "edit", messageId, body }),
      });
      const result = (await response.json()) as { message?: ChatMessageDto };
      if (!response.ok || !result.message) return;

      const updated = result.message;
      setMessages((current) =>
        current.map((message) =>
          message.id === updated.id
            ? {
                ...message,
                body: updated.body,
                attachments: updated.attachments,
                editedAt: updated.editedAt,
              }
            : message,
        ),
      );
    } catch {
      // A failed edit leaves the message exactly as it was.
    }
  }, []);

  /** Delete for me — the message leaves my view; every other copy is untouched. */
  const deleteForMe = useCallback(async (messageId: string) => {
    // Recorded before the request: a copy already on the wire cannot bring it back.
    viewStateRef.current.hidden.add(messageId);
    try {
      const response = await fetch("/api/messages", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", messageId, scope: "me" }),
      });
      if (!response.ok) return;
      setMessages((current) => current.filter((message) => message.id !== messageId));
      setEditing((current) => (current?.id === messageId ? null : current));
    } catch {
      // Nothing changed anywhere — the message simply stays.
    }
  }, []);

  /** Delete for everyone — the words are gone from both sides, for good. */
  const deleteForEveryone = useCallback(async (messageId: string) => {
    try {
      const response = await fetch("/api/messages", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", messageId, scope: "everyone" }),
      });
      const result = (await response.json()) as { message?: ChatMessageDto | null };
      if (!response.ok || !result.message) return;

      const updated = result.message;
      if (updated.deletedAt) viewStateRef.current.tombstones.set(updated.id, updated.deletedAt);
      setMessages((current) =>
        current.map((message) =>
          message.id === updated.id
            ? { ...message, body: "", attachments: [], deletedAt: updated.deletedAt }
            : message,
        ),
      );
      setEditing((current) => (current?.id === messageId ? null : current));
    } catch {
      // Nothing was removed — and the stream will say so if it ever was.
    }
  }, []);

  /** Clear my chat — the history leaves my view; the thread and their copy stay. */
  const clearChat = useCallback(async () => {
    // The line is drawn at once, so anything already in flight can never
    // repaint the past; the server's own timestamp replaces it when it lands.
    viewStateRef.current.clearedAt = new Date().toISOString();
    try {
      const response = await fetch("/api/messages", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear-chat", conversationId: thread.id }),
      });
      if (!response.ok) {
        viewStateRef.current.clearedAt = null;
        return;
      }
      const result = (await response.json()) as { at?: string | null };
      if (result.at) viewStateRef.current.clearedAt = result.at;
      setMessages([]);
      setHasMore(false);
      setEditing(null);
    } catch {
      // Nothing changed — the conversation is still whole.
      viewStateRef.current.clearedAt = null;
    }
  }, [thread.id]);

  /** Delete my chat — it leaves my chat list; theirs is not mine to touch. */
  const deleteChat = useCallback(async () => {
    try {
      await fetch("/api/messages", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete-chat", conversationId: thread.id }),
      });
    } finally {
      // Away — back to the list, whether or not the request landed.
      router.push("/messages");
    }
  }, [thread.id, router]);

  /** What a long press chose. The backend re-decides every one of these. */
  const handleAction = useCallback(
    (action: MessageAction, message: MessageModel) => {
      if (message.id === null) return;
      switch (action) {
        case "edit":
          setEditing(message);
          break;
        case "copy":
          void navigator.clipboard?.writeText(message.body);
          break;
        case "delete-me":
          void deleteForMe(message.id);
          break;
        case "delete-everyone":
          void deleteForEveryone(message.id);
          break;
      }
    },
    [deleteForMe, deleteForEveryone],
  );

  return (
    /* The conversation's fixed regions and its one scrolling region: the
       header and the composer are siblings of the viewport, never inside it,
       so messages can only ever scroll between them. */
    <div className="motion-safe:animate-settle flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <ConversationHeader
        onClearChat={clearChat}
        onDeleteChat={deleteChat}
        thread={thread}
      />

      <MessageViewport
        context={<ProductContext thread={thread} />}
        counterpartAvatar={thread.counterpartAvatar}
        counterpartName={thread.counterpartName}
        hasMore={hasMore}
        historyError={historyError}
        loadingOlder={loadingOlder}
        messages={messages}
        onAction={handleAction}
        onLoadOlder={loadOlder}
        onRetry={retry}
        viewerId={viewerId}
      >
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <ProductContext thread={thread} />
          <EmptyConversationState
            description={
              thread.listingTitle
                ? `Ask ${thread.counterpartName} about ${thread.listingTitle} — they will answer right here.`
                : `This is the start of your conversation with ${thread.counterpartName}.`
            }
            title={`Say hello to ${thread.counterpartName}`}
          />
        </div>
      </MessageViewport>

      <ChatComposer
        canRequestPayment={thread.asSeller}
        counterpartName={thread.counterpartName}
        editing={editing ? { key: editing.key, body: editing.body } : null}
        onEditCancel={() => setEditing(null)}
        onEditConfirm={(body) => {
          if (editing?.id) void editMessage(editing.id, body);
        }}
        onRequestPayment={() => setPaymentSheetOpen(true)}
        onSend={send}
      />

      {paymentSheetOpen ? (
        <PaymentRequestSheet
          contextTitle={thread.listingTitle}
          counterpartName={thread.counterpartName}
          currency={thread.currency}
          onClose={() => setPaymentSheetOpen(false)}
          onSubmit={requestPayment}
        />
      ) : null}
    </div>
  );
}
