"use client";

/**
 * The conversation list.
 *
 * A custom browse surface: who, what was last said, when, what product it is
 * about, and whether it needs you. It is live — a new message reorders the list
 * and raises the unread state in place — and the rearrangement is animated, so
 * a conversation rising to the top is felt rather than announced. Nothing here
 * refreshes the page.
 */

import Link from "next/link";
import { useLayoutEffect, useMemo, useRef, useState } from "react";

import { ChatAvatar } from "@/components/chat/ChatAvatar";
import { Icon } from "@/components/ui/Icon";
import { formatRelative } from "@/lib/format";
import type { ThreadSummary } from "@/lib/server/messages";

/** The preview line: my words are marked, an attachment-only message is named. */
function Preview({ thread }: { thread: ThreadSummary }) {
  // An attachment-only message has no words but was still said; a thread
  // cleared or newly opened has nothing to show yet at all.
  const text =
    thread.lastMessage?.trim() || (thread.lastMessageAt ? "Sent an attachment" : "No messages yet");
  return (
    <p className={`min-w-0 flex-1 truncate text-[12.5px] ${thread.unread > 0 ? "font-medium text-foreground" : "text-muted"}`}>
      {thread.lastFromMe ? <span className="text-muted/80">You: </span> : null}
      {text}
    </p>
  );
}

function ConversationItem({
  thread,
  active,
  onClick,
}: {
  thread: ThreadSummary;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      className={`relative flex items-center gap-2.5 rounded-2xl px-2.5 py-2.5 no-underline transition-colors ${
        active ? "bg-surface-secondary/80" : "hover:bg-surface-secondary/45"
      }`}
      data-thread-id={thread.id}
      href={`/messages/${thread.id}`}
      onClick={onClick}
    >
      <ChatAvatar name={thread.counterpartName} size={44} src={thread.counterpartAvatar} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p
            className={`truncate text-[13.5px] text-foreground ${
              thread.unread > 0 ? "font-semibold" : "font-medium"
            }`}
          >
            {thread.counterpartName}
          </p>
          <span className="shrink-0 rounded-full bg-surface-secondary px-1.5 py-0.5 text-[9.5px] font-medium text-muted">
            {thread.asSeller ? "Buyer" : "Seller"}
          </span>
          <span className="ml-auto shrink-0 text-[10.5px] text-muted">
            {thread.lastMessageAt ? formatRelative(thread.lastMessageAt) : ""}
          </span>
        </div>

        {thread.listingTitle || thread.subject ? (
          <p className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-accent">
            <Icon name="shop" size={10} className="shrink-0" />
            <span className="truncate">{thread.listingTitle ?? thread.subject}</span>
          </p>
        ) : null}

        <div className="mt-0.5 flex items-center gap-2">
          <Preview thread={thread} />
          {thread.unread > 0 ? (
            <span
              aria-label={`${thread.unread} unread`}
              className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-accent px-1 text-[9px] font-semibold text-accent-foreground tabular-nums"
            >
              {thread.unread > 9 ? "9+" : thread.unread}
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

export function ConversationList({
  threads,
  activeId,
  onNavigate,
}: {
  threads: ThreadSummary[];
  activeId: string | null;
  onNavigate?: () => void;
}) {
  const [query, setQuery] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const positionsRef = useRef(new Map<string, number>());

  // Search narrows by who they are, what was said, or the product in question.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter((thread) =>
      [thread.counterpartName, thread.lastMessage, thread.listingTitle, thread.subject]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(q)),
    );
  }, [threads, query]);

  // When a new message lifts a conversation toward the top, it *moves* there:
  // measure where each row was, let React commit the new order, then ease the
  // difference. The list never jumps, and nothing reloads.
  useLayoutEffect(() => {
    const container = listRef.current;
    if (!container) return;

    const rows = container.querySelectorAll<HTMLElement>("[data-thread-id]");
    const next = new Map<string, number>();

    for (const row of rows) {
      const id = row.dataset.threadId!;
      const top = row.getBoundingClientRect().top;
      const previous = positionsRef.current.get(id);
      next.set(id, top);

      if (previous !== undefined && Math.abs(previous - top) > 1) {
        row.style.transition = "none";
        row.style.transform = `translateY(${previous - top}px)`;
        requestAnimationFrame(() => {
          row.style.transition = "transform 320ms cubic-bezier(0.16, 1, 0.3, 1)";
          row.style.transform = "translateY(0)";
        });
      }
    }

    positionsRef.current = next;
  }, [filtered]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Search */}
      <div className="px-3 pb-2">
        <div className="flex items-center gap-2 rounded-full bg-surface-secondary/70 px-3 py-2 transition-shadow focus-within:shadow-elev-1">
          <Icon name="search" size={15} className="shrink-0 text-muted" />
          <input
            aria-label="Search conversations"
            className="w-full bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search conversations"
            type="text"
            value={query}
          />
          {query ? (
            <button
              aria-label="Clear search"
              className="shrink-0 text-muted transition-colors hover:text-foreground"
              onClick={() => setQuery("")}
              type="button"
            >
              <Icon name="x" size={13} />
            </button>
          ) : null}
        </div>
      </div>

      {/* The list */}
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-2.5 pb-3" ref={listRef}>
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2.5 px-7 pt-12 text-center">
            <span className="flex size-12 items-center justify-center rounded-[1.1rem] rounded-bl-md bg-surface-secondary">
              <Icon name={query ? "search" : "message"} size={19} className="text-muted" />
            </span>
            <p className="text-[13px] font-medium text-foreground">
              {query ? "Nothing matches that" : "No conversations yet"}
            </p>
            <p className="text-[11.5px] leading-relaxed text-muted">
              {query
                ? "Try a different name, message or product."
                : "When you write to a store, or a buyer asks about your shop, the conversation appears here."}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {filtered.map((thread) => (
              <ConversationItem
                active={thread.id === activeId}
                key={thread.id}
                onClick={onNavigate}
                thread={thread}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
