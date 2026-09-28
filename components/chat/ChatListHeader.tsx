/**
 * The chat list's header — fixed, always.
 *
 * The list application's one fixed region: the way out of the chat system, the
 * list's name, and how much is waiting. It sits *outside* the scrolling
 * conversation list — the same ownership rule as the conversation itself — so
 * it can never be scrolled away while the list moves underneath it.
 */

import Link from "next/link";

import { Icon } from "@/components/ui/Icon";

export function ChatListHeader({ unreadCount }: { unreadCount: number }) {
  return (
    <div className="flex items-center gap-2 px-4 pt-4 pb-2.5">
      {/* Out of the chat system, back to the platform — a step of its own. */}
      <Link
        aria-label="Leave chat"
        className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-secondary hover:text-foreground"
        href="/"
      >
        <Icon name="arrowLeft" size={16} />
      </Link>
      <h1 className="text-[17px] font-semibold tracking-tight text-foreground">Messages</h1>
      {unreadCount > 0 ? (
        <span className="ml-auto rounded-full bg-accent/12 px-2 py-0.5 text-[10.5px] font-medium text-accent">
          {unreadCount} unread
        </span>
      ) : null}
    </div>
  );
}
