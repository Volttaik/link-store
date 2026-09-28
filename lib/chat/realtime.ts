/**
 * The chat system's one and only realtime connection.
 *
 * Every surface — the conversation list, the open thread, the platform's unread
 * awareness — subscribes here, and one shared stream serves them all. No
 * component opens its own connection, so there are no duplicate subscriptions,
 * no duplicated events, and no leaks: a subscriber detaches when it unmounts,
 * and the stream closes itself when the last one leaves.
 *
 * The connection is completely invisible. There is no status, no indicator, no
 * "reconnecting" — events either arrive and the UI moves, or the browser
 * quietly restores the stream and `onResync` lets the surfaces re-read what
 * they may have missed. Nothing technical ever reaches the screen.
 */

import type { ChatMessageDto } from "./types";

type ChatEventHandlers = {
  /** A message arrived in one of this person's conversations. */
  onMessage?: (message: ChatMessageDto) => void;
  /** The other side read a thread — my ticks there have changed. */
  onRead?: (event: { conversationId: string; readerUserId: string; readAt: string }) => void;
  /** A conversation this person belongs to was created. */
  onConversation?: (event: { conversationId: string }) => void;
  /** A message changed in place — its words were edited, or it was removed for everyone. */
  onMessageUpdated?: (message: ChatMessageDto) => void;
  /**
   * A message left this person's own view — one message, or (with a null id)
   * the whole thread. Only the person who changed their own view hears this.
   * `at` is the moment their view changed, on the database's clock.
   */
  onMessageRemoved?: (event: { conversationId: string; messageId: string | null; at: string }) => void;
  /**
   * The stream came back after a gap. Facts that were pushed during the gap
   * (a read receipt, a new thread) may have been missed — re-read them once.
   */
  onResync?: () => void;
};

type Handlers = Set<ChatEventHandlers>;

const handlers: Handlers = new Set();
let source: EventSource | null = null;
let openedBefore = false;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryDelay = 1000;

function openStream() {
  if (source || typeof window === "undefined") return;

  const stream = new EventSource("/api/messages/stream");
  source = stream;

  stream.onopen = () => {
    retryDelay = 1000;
    if (openedBefore) {
      // A reconnect, not a first hello: quietly let surfaces catch up.
      for (const entry of [...handlers]) entry.onResync?.();
    }
    openedBefore = true;
  };

  stream.addEventListener("message", (event) => {
    let payload: ChatMessageDto;
    try {
      payload = JSON.parse((event as MessageEvent).data) as ChatMessageDto;
    } catch {
      return; // A malformed frame must never break the stream.
    }
    for (const entry of [...handlers]) entry.onMessage?.(payload);
  });

  stream.addEventListener("read", (event) => {
    try {
      const payload = JSON.parse((event as MessageEvent).data) as {
        conversationId: string;
        readerUserId: string;
        readAt: string;
      };
      for (const entry of [...handlers]) entry.onRead?.(payload);
    } catch {
      // Ignore a frame we cannot read.
    }
  });

  stream.addEventListener("conversation", (event) => {
    try {
      const payload = JSON.parse((event as MessageEvent).data) as { conversationId: string };
      for (const entry of [...handlers]) entry.onConversation?.(payload);
    } catch {
      // Ignore a frame we cannot read.
    }
  });

  stream.addEventListener("message-updated", (event) => {
    try {
      const payload = JSON.parse((event as MessageEvent).data) as ChatMessageDto;
      for (const entry of [...handlers]) entry.onMessageUpdated?.(payload);
    } catch {
      // Ignore a frame we cannot read.
    }
  });

  stream.addEventListener("message-removed", (event) => {
    try {
      const payload = JSON.parse((event as MessageEvent).data) as {
        conversationId: string;
        messageId: string | null;
        at: string;
      };
      if (!payload.at) payload.at = new Date().toISOString();
      for (const entry of [...handlers]) entry.onMessageRemoved?.(payload);
    } catch {
      // Ignore a frame we cannot read.
    }
  });

  // An error is the browser's business: EventSource restores the stream on its
  // own, and the replay plus `onResync` cover whatever happened meanwhile. A
  // *fatal* close (the server refused the connection) is reopened quietly on a
  // gentle backoff — never a hot loop, and never anything visible.
  stream.onerror = () => {
    if (stream.readyState === EventSource.CLOSED) {
      source = null;
      if (handlers.size > 0 && retryTimer === null) {
        retryTimer = setTimeout(() => {
          retryTimer = null;
          openStream();
        }, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 30_000);
      }
    }
  };
}

/** Subscribe to chat events. The returned function detaches — always call it. */
export function subscribeChat(chatHandlers: ChatEventHandlers): () => void {
  handlers.add(chatHandlers);
  openStream();

  return () => {
    handlers.delete(chatHandlers);
    if (handlers.size === 0) {
      if (source) {
        source.close();
        source = null;
      }
      if (retryTimer !== null) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
    }
  };
}
