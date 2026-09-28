"use client";

/**
 * The message viewport.
 *
 * Where the conversation lives and how it moves: runs of messages grouped by
 * day, history that loads upward as the reader scrolls instead of pulling a
 * thousand rows at once, and scrolling that follows the conversation when the
 * reader is at the bottom but never yanks them down when they are reading
 * history — a quiet pill says there is more below instead.
 *
 * The viewport owns none of the data: it renders what it is given and asks for
 * older words when it needs them.
 *
 * It is also the only region of the chat that is ever allowed to move: the
 * header above it and the composer below it are fixed, and when the keyboard
 * opens it is this region — and only this region — that gives up height. Its
 * quiet ground (`ChatBackdrop`) is decorative and out of flow entirely.
 */

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

import { ChatBackdrop } from "@/components/chat/ChatBackdrop";
import { MessageGroup, buildGroups } from "@/components/chat/MessageGroup";
import type { MessageAction } from "@/components/chat/MessageActionsMenu";
import type { MessageModel } from "@/components/chat/MessageBubble";
import { formatDayLabel } from "@/lib/chat/media";

/** How close to the top counts as "reading history". */
const TOP_EDGE = 120;

/** How close to the bottom counts as "still following". */
const BOTTOM_EDGE = 80;

function DayDivider({ label }: { label: string }) {
  return (
    <div aria-hidden="true" className="flex w-full justify-center py-1.5">
      <span className="rounded-full bg-surface-secondary/70 px-2.5 py-0.5 text-[10.5px] font-medium text-muted">
        {label}
      </span>
    </div>
  );
}

/** Structure while more history is on its way — never a blocking spinner. */
function HistorySkeleton() {
  return (
    <div aria-hidden="true" className="flex w-full flex-col items-start gap-2 py-3">
      {[96, 148, 72].map((width, index) => (
        <span
          className={`h-8 animate-pulse rounded-[1.1rem] bg-surface-secondary/70 ${index === 1 ? "self-end" : ""}`}
          key={width}
          style={{ width }}
        />
      ))}
    </div>
  );
}

export function MessageViewport({
  messages,
  viewerId,
  counterpartName,
  counterpartAvatar,
  hasMore,
  loadingOlder,
  historyError,
  onLoadOlder,
  onRetry,
  onAction,
  context,
  children,
}: {
  messages: MessageModel[];
  viewerId: string;
  counterpartName: string;
  counterpartAvatar: string | null;
  hasMore: boolean;
  loadingOlder: boolean;
  /** Earlier words failed to load — the retry for that sits at the top. */
  historyError: boolean;
  onLoadOlder: () => void;
  onRetry: (key: string) => void;
  /** The real actions a message offers — opened by long press or right click. */
  onAction?: (action: MessageAction, message: MessageModel) => void;
  /** Product or shop context, at the head of the thread. */
  context?: React.ReactNode;
  /** The empty state for a fresh conversation. */
  children?: React.ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const atBottomRef = useRef(true);
  const settledRef = useRef(false);
  const prevFirstKey = useRef<string | null>(null);
  const prevLastKey = useRef<string | null>(null);
  const prevHeightRef = useRef(0);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;

    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_EDGE;

    if (el.scrollTop < TOP_EDGE && hasMore && !loadingOlder) onLoadOlder();
  }, [hasMore, loadingOlder, onLoadOlder]);

  // Older pages land on top without moving the reader: keep them exactly where
  // they were by restoring the distance from the bottom of what was added.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const firstKey = messages[0]?.key ?? null;
    if (prevFirstKey.current !== null && firstKey !== prevFirstKey.current) {
      el.scrollTop += el.scrollHeight - prevHeightRef.current;
    }
    prevFirstKey.current = firstKey;
    prevHeightRef.current = el.scrollHeight;
  }, [messages]);

  // Opening the conversation puts the latest words on screen — once. After
  // that, following is a choice the reader makes by being at the bottom.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || settledRef.current) return;
    settledRef.current = true;
    el.scrollTop = el.scrollHeight;
  }, []);

  // The region's height changes under the keyboard — and only this region.
  // Following the conversation means staying at the bottom through that
  // change, so the latest words stay reachable above the composer; reading
  // history means keeping the exact place, which an untouched scrollTop
  // already preserves. Nothing here ever moves the reader against their will.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      if (atBottomRef.current) el.scrollTop = el.scrollHeight;
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Media arrives after the words and grows the thread under the reader. While
  // the conversation is being followed, the latest message stays the point of
  // the surface — so each image that lands re-anchors the view. (Load events do
  // not bubble; they are caught in the capture phase.)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onLoaded = () => {
      if (atBottomRef.current) el.scrollTop = el.scrollHeight;
    };
    el.addEventListener("load", onLoaded, true);
    return () => el.removeEventListener("load", onLoaded, true);
  }, []);

  // Something arrived at the bottom: the conversation goes to it. Always.
  // The latest message is the point of the surface — a new word in it draws
  // the reader there even from up in the history, and one of their own sends
  // lands exactly where it was sent to. Smoothly, so the journey reads as the
  // conversation moving rather than the screen jumping.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const lastKey = messages[messages.length - 1]?.key ?? null;
    const appended = prevLastKey.current !== null && lastKey !== prevLastKey.current;
    prevLastKey.current = lastKey;
    if (!appended) return;

    atBottomRef.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // The day sections, then the runs within each day.
  const days: Array<{ label: string; messages: MessageModel[] }> = [];
  for (const message of messages) {
    const label = formatDayLabel(message.createdAt);
    const current = days[days.length - 1];
    if (current && current.label === label) current.messages.push(message);
    else days.push({ label, messages: [message] });
  }

  return (
    <div className="relative isolate flex min-h-0 flex-1 flex-col">
      <ChatBackdrop />

      {/*
       * The thread's outer margin, tuned to the screen it is on rather than one
       * value for all of them: a phone keeps a slim safe gutter so bubbles use
       * the width they have, a tablet steps it up, and a desktop gives the
       * exchange the comfortable framing it deserves. Bubbles hug these edges,
       * so this is the only spacing between a message and the side of the
       * conversation.
       */}
      <div
        className="no-scrollbar flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto overscroll-contain px-3 py-4 sm:px-4 lg:px-5"
        onScroll={handleScroll}
        ref={scrollRef}
      >
        {historyError ? (
          <div className="flex w-full items-center justify-center gap-2 py-2">
            <span className="text-[11px] text-muted">Earlier messages didn&rsquo;t load.</span>
            <button
              className="text-[11px] font-semibold text-accent underline-offset-2 hover:underline"
              onClick={onLoadOlder}
              type="button"
            >
              Try again
            </button>
          </div>
        ) : null}

        {loadingOlder ? <HistorySkeleton /> : null}

        {messages.length > 0 ? context : null}

        {!hasMore && messages.length > 0 ? <DayDivider label={days[0]?.label ?? ""} /> : null}

        {days.map((day, dayIndex) => (
          <div className="flex w-full flex-col gap-2.5" key={`${day.label}-${dayIndex}`}>
            {dayIndex > 0 || hasMore ? <DayDivider label={day.label} /> : null}
            {buildGroups(day.messages, viewerId).map((group) => (
              <MessageGroup
                counterpartAvatar={counterpartAvatar}
                counterpartName={counterpartName}
                group={group}
                key={group.key}
                onAction={onAction}
                onRetry={onRetry}
              />
            ))}
          </div>
        ))}

        {messages.length === 0 && !loadingOlder ? children : null}
      </div>
    </div>
  );
}
