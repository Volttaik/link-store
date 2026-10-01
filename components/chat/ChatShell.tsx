"use client";

/**
 * The chat system's own shell.
 *
 * Chat is a small application inside the marketplace, not a page squeezed into
 * the dashboard. This shell owns the whole viewport: a conversation sidebar on
 * the left, the active conversation on the right. On a phone the two become one
 * column — the list, then the conversation — exactly how a messaging app moves.
 *
 * The sidebar is itself a small application with the same ownership rule as
 * the conversation:
 *
 *     ChatListApplication
 *       ├── ChatListHeader      fixed, never scrolls
 *       └── ConversationList    the only scrolling region
 *
 * The header is a sibling of the list, never inside it.
 *
 * The sidebar is live through the one shared stream: a new message reorders the
 * list, refreshes the preview and raises the unread state without a reload and
 * without polling. Leaving the chat system is a deliberate step of its own,
 * separate from moving between conversations.
 */

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { ChatListHeader } from "@/components/chat/ChatListHeader";
import { BrowserNotifications } from "@/components/layout/BrowserNotifications";
import { ConversationList } from "@/components/chat/ConversationList";
import { subscribeChat } from "@/lib/chat/realtime";
import type { ThreadSummary } from "@/lib/server/messages";
import type { SessionUser } from "@/lib/types";

export function ChatShell({
  user,
  threads: initialThreads,
  children,
}: {
  user: SessionUser;
  threads: ThreadSummary[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [threads, setThreads] = useState<ThreadSummary[]>(initialThreads);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Which conversation is open, straight from the URL so deep links and the
  // browser's own back button behave the way people expect.
  const activeId = pathname.startsWith("/messages/") ? pathname.slice("/messages/".length) : null;
  const activeIdRef = useRef<string | null>(activeId);
  useEffect(() => {
    activeIdRef.current = activeId;
    // Opening a conversation reads it: the badge falls the moment you arrive.
    if (activeId) {
      setThreads((current) =>
        current.map((thread) => (thread.id === activeId ? { ...thread, unread: 0 } : thread)),
      );
      // The matching browser notification is spent too — reading the thread
      // closes it, so no stale notice is left behind after it was handled.
      if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
        void navigator.serviceWorker
          .getRegistration("/")
          .then((worker) => {
            worker?.active?.postMessage({ closeTag: `rush-cart:message:${activeId}` });
          })
          .catch(() => {});
      }
    }
  }, [activeId]);

  // When the server re-renders the list (a brand-new conversation arrived, or a
  // reconnect brought news), take the fresh truth.
  useEffect(() => {
    setThreads(initialThreads);
  }, [initialThreads]);

  // One refresh covers any number of events that arrive together.
  const scheduleRefresh = () => {
    if (refreshTimer.current) return;
    refreshTimer.current = setTimeout(() => {
      refreshTimer.current = null;
      router.refresh();
    }, 500);
  };

  // Realtime. One stream, every conversation this person is part of.
  useEffect(() => {
    return subscribeChat({
      onMessage: (message) => {
        setThreads((current) => {
          const index = current.findIndex((thread) => thread.id === message.conversationId);

          // A conversation we have never seen: pull the real row once rather
          // than guessing at its shape.
          if (index === -1) {
            scheduleRefresh();
            return current;
          }

          const thread = current[index];
          const fromMe = message.senderUserId === user.id;
          const isActive = message.conversationId === activeIdRef.current;
          const updated: ThreadSummary = {
            ...thread,
            lastMessage: message.body.trim() || null,
            lastMessageAt: message.createdAt,
            lastFromMe: fromMe,
            unread: fromMe || isActive ? 0 : thread.unread + 1,
          };

          // The most recent conversation leads — with a smooth move, not a jump.
          const next = [...current];
          next.splice(index, 1);
          next.unshift(updated);
          return next;
        });
      },
      onConversation: scheduleRefresh,
      // A message changed in place (edited, or removed for everyone) or left
      // someone's own view — the previews are computed server-side from what
      // each person can actually see, so the list simply re-reads its state.
      onMessageUpdated: scheduleRefresh,
      onMessageRemoved: scheduleRefresh,
      onResync: scheduleRefresh,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, router]);

  useEffect(
    () => () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    },
    [],
  );

  // The same metric everywhere: unread *messages* — matching the header,
  // the side menu and the navigation badge, so no surface tells a different
  // story about how much is waiting.
  const unreadCount = threads.reduce((sum, thread) => sum + (thread.unread > 0 ? thread.unread : 0), 0);

  // Phone: one column at a time. Desktop: sidebar and conversation together.
  const onConversation = Boolean(activeId);

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden">
      <BrowserNotifications userId={user.id} />
      {/* ── Conversation sidebar ─────────────────────────────────────────── */}
      <aside
        className={`min-h-0 w-full shrink-0 flex-col bg-surface lg:flex lg:w-[21.5rem] ${
          onConversation ? "hidden lg:flex" : "flex"
        }`}
      >
        <ChatListHeader unreadCount={unreadCount} />

        <ConversationList activeId={activeId} threads={threads} />
      </aside>

      {/* ── Conversation / empty state ───────────────────────────────────── */}
      <main
        className={`min-h-0 flex-1 flex-col bg-background lg:flex ${
          onConversation ? "flex" : "hidden lg:flex"
        }`}
      >
        {children}
      </main>
    </div>
  );
}
