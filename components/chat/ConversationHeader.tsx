"use client";

/**
 * The conversation header — fixed, always.
 *
 * It sits in its own region above the scrolling thread, so the identity of who
 * you are messaging is never scrolled away: their picture, their full name in
 * confident type, which side of the trade they are on, and the product or shop
 * this exchange belongs to. A soft elevation separates it from the messages
 * below without drawing a line. It is part of the conversation, not a page
 * toolbar.
 *
 * The header also holds the conversation's own actions — clearing or deleting
 * one person's copy of the thread. They live behind one quiet control, and
 * both ask once more before they act: nothing here happens on a careless tap,
 * and neither action ever touches the other participant's conversation.
 */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { ChatAvatar } from "@/components/chat/ChatAvatar";
import { Icon } from "@/components/ui/Icon";
import type { ThreadSummary } from "@/lib/server/messages";

export function ConversationHeader({
  thread,
  onClearChat,
  onDeleteChat,
}: {
  thread: ThreadSummary;
  /** Clears the history from this viewer's own copy — the thread stays. */
  onClearChat: () => void;
  /** Removes the thread from this viewer's own chat list — and nothing more. */
  onDeleteChat: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirming, setConfirming] = useState<"clear" | "delete" | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // The menu is momentary: it closes on a click anywhere else.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
        setConfirming(null);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  const close = () => {
    setMenuOpen(false);
    setConfirming(null);
  };

  return (
    <header className="relative z-10 flex shrink-0 items-center gap-3 bg-background px-3 py-3 shadow-elev-1 sm:px-5">
      <Link
        aria-label="Back to conversations"
        className="flex size-10 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-secondary hover:text-foreground motion-safe:active:scale-95"
        href="/messages"
      >
        <Icon name="arrowLeft" size={18} />
      </Link>

      <ChatAvatar name={thread.counterpartName} size={46} src={thread.counterpartAvatar} />

      <div className="min-w-0 flex-1">
        <h1 className="text-[17px] leading-tight font-semibold tracking-tight text-foreground">
          {thread.counterpartName}
        </h1>
        <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted">
          <span className="shrink-0 rounded-full bg-surface-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted">
            {thread.asSeller ? "Buyer" : "Seller"}
          </span>
          <span className="truncate">
            {thread.listingTitle ??
              thread.subject ??
              (thread.asSeller ? "Your buyer" : "Your conversation")}
          </span>
        </p>
      </div>

      {thread.listingId ? (
        <Link
          aria-label={`Open ${thread.listingTitle ?? "the product"}`}
          className="flex max-w-[42%] shrink-0 items-center gap-2 rounded-full bg-surface px-2 py-1.5 no-underline shadow-elev-1 transition-transform hover:bg-surface-secondary motion-safe:active:scale-95"
          href={`/listing/${thread.listingId}`}
        >
          {thread.listingImageUrl ? (
            <img
              alt=""
              className="size-7 shrink-0 rounded-lg object-cover"
              loading="lazy"
              src={thread.listingImageUrl}
            />
          ) : null}
          <span className="hidden truncate text-[12px] font-medium text-foreground sm:block">
            {thread.listingTitle}
          </span>
          <Icon className="shrink-0 text-muted" name="externalLink" size={13} />
        </Link>
      ) : null}

      {/* The conversation's own actions — one quiet control. */}
      <div className="relative shrink-0" ref={menuRef}>
        <button
          aria-label="Conversation actions"
          className="flex size-10 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-secondary hover:text-foreground motion-safe:active:scale-95"
          onClick={() => {
            setMenuOpen((open) => !open);
            setConfirming(null);
          }}
          type="button"
        >
          <Icon name="more" size={17} />
        </button>

        {menuOpen ? (
          <div className="motion-safe:animate-chat-pop absolute top-12 right-0 z-20 w-60 overflow-hidden rounded-2xl bg-surface p-1 shadow-elev-float">
            {confirming === null ? (
              <>
                <button
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] text-foreground transition-colors hover:bg-surface-secondary"
                  onClick={() => setConfirming("clear")}
                  type="button"
                >
                  <Icon className="text-muted" name="refresh" size={15} />
                  Clear chat
                </button>
                <button
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] text-danger transition-colors hover:bg-surface-secondary"
                  onClick={() => setConfirming("delete")}
                  type="button"
                >
                  <Icon className="text-danger" name="trash" size={15} />
                  Delete chat
                </button>
              </>
            ) : (
              <div className="p-2.5">
                <p className="text-[13px] font-semibold text-foreground">
                  {confirming === "clear" ? "Clear this chat?" : "Delete this chat?"}
                </p>
                <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
                  {confirming === "clear"
                    ? "The messages disappear from your view only. The conversation stays, and their copy is untouched."
                    : "The conversation leaves your chat list only. Their copy is untouched."}
                </p>
                <div className="mt-2.5 flex gap-2">
                  <button
                    className="flex-1 rounded-xl bg-danger px-3 py-2 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90 motion-safe:active:scale-95"
                    onClick={() => {
                      close();
                      if (confirming === "clear") onClearChat();
                      else onDeleteChat();
                    }}
                    type="button"
                  >
                    {confirming === "clear" ? "Clear" : "Delete"}
                  </button>
                  <button
                    className="flex-1 rounded-xl bg-surface-secondary px-3 py-2 text-[12.5px] font-semibold text-foreground transition-colors hover:bg-surface-tertiary motion-safe:active:scale-95"
                    onClick={close}
                    type="button"
                  >
                    Keep
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </header>
  );
}
