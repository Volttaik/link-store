"use client";

/**
 * The message actions menu.
 *
 * What a long press — or a right click, on a pointer — reveals beside a
 * message: the small set of real things a person can do with their words. It
 * is drawn in the platform's own language (a rounded surface, icon-forward
 * rows, one soft elevation) rather than the browser's generic menu, and it
 * adapts to who is asking: editing and delete-for-everyone belong to the
 * sender alone and are never even drawn for anyone else.
 *
 * Destructive actions never happen on one careless tap: they replace the menu
 * with one compact, plainly-worded confirmation before anything is done.
 *
 * The menu is a portal to the document body, positioned at the press point and
 * clamped inside the screen — the conversation's own motion and the keyboard
 * can never push it out of place.
 */

import { useState } from "react";
import { createPortal } from "react-dom";

import { Icon, type IconName } from "@/components/ui/Icon";
import type { MessageModel } from "@/lib/chat/types";

export type MessageAction = "edit" | "copy" | "delete-me" | "delete-everyone";

/** Where the menu opens, in viewport coordinates. */
export type MenuAnchor = { x: number; y: number };

type MenuItem = {
  action: MessageAction;
  icon: IconName;
  label: string;
  danger?: boolean;
  confirm?: { title: string; description: string; confirmLabel: string };
};

/** The actions this message offers this viewer — the permissions, reflected. */
function itemsFor(message: MessageModel, mine: boolean): MenuItem[] {
  const items: MenuItem[] = [];
  const gone = message.deletedAt !== null;
  const settled = message.id !== null;
  // A payment card is a record, not words: its text is the request's own and
  // neither copies nor edits as a message.
  const isPaymentCard = message.paymentRequest !== null;

  if (!gone && !isPaymentCard && message.body) {
    items.push({ action: "copy", icon: "copy", label: "Copy" });
  }
  if (!gone && !isPaymentCard && mine && settled) {
    items.push({ action: "edit", icon: "edit", label: "Edit" });
  }

  items.push({
    action: "delete-me",
    icon: "trash",
    label: "Delete for me",
    danger: true,
    confirm: {
      title: "Delete for me?",
      description: "The message disappears from your view only — everyone else keeps it.",
      confirmLabel: "Delete",
    },
  });

  if (!gone && mine && settled) {
    items.push({
      action: "delete-everyone",
      icon: "trash",
      label: "Delete for everyone",
      danger: true,
      confirm: {
        title: "Delete for everyone?",
        description: "The message is removed for both of you. This cannot be undone.",
        confirmLabel: "Delete",
      },
    });
  }

  return items;
}

export function MessageActionsMenu({
  message,
  mine,
  anchor,
  onAction,
  onClose,
}: {
  message: MessageModel;
  mine: boolean;
  anchor: MenuAnchor;
  onAction: (action: MessageAction, message: MessageModel) => void;
  onClose: () => void;
}) {
  const [confirming, setConfirming] = useState<MenuItem | null>(null);
  const items = itemsFor(message, mine);

  // Above the press point by default; below it when the top is too close.
  const below = anchor.y < 260;
  const x = Math.min(Math.max(anchor.x, 120), window.innerWidth - 120);

  const run = (item: MenuItem) => {
    if (item.confirm) {
      setConfirming(item);
      return;
    }
    onAction(item.action, message);
    onClose();
  };

  return createPortal(
    <>
      {/* The menu is momentary: a tap anywhere else puts it away. */}
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        onContextMenu={(event) => {
          event.preventDefault();
          onClose();
        }}
      />

      <div
        className={`motion-safe:animate-chat-pop fixed z-50 w-56 overflow-hidden rounded-2xl bg-surface p-1 shadow-elev-float ${
          below ? "" : ""
        }`}
        style={{
          left: x,
          top: below ? anchor.y + 12 : anchor.y - 12,
          transform: below ? "translateX(-50%)" : "translate(-50%, -100%)",
        }}
      >
        {confirming ? (
          <div className="p-2.5">
            <p className="text-[13px] font-semibold text-foreground">{confirming.confirm!.title}</p>
            <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
              {confirming.confirm!.description}
            </p>
            <div className="mt-2.5 flex gap-2">
              <button
                className="flex-1 rounded-xl bg-danger px-3 py-2 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90 motion-safe:active:scale-95"
                onClick={() => {
                  onAction(confirming.action, message);
                  onClose();
                }}
                type="button"
              >
                {confirming.confirm!.confirmLabel}
              </button>
              <button
                className="flex-1 rounded-xl bg-surface-secondary px-3 py-2 text-[12.5px] font-semibold text-foreground transition-colors hover:bg-surface-tertiary motion-safe:active:scale-95"
                onClick={onClose}
                type="button"
              >
                Keep
              </button>
            </div>
          </div>
        ) : (
          items.map((item) => (
            <button
              className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] transition-colors hover:bg-surface-secondary ${
                item.danger ? "text-danger" : "text-foreground"
              }`}
              key={item.action}
              onClick={() => run(item)}
              type="button"
            >
              <Icon className={item.danger ? "text-danger" : "text-muted"} name={item.icon} size={15} />
              {item.label}
            </button>
          ))
        )}
      </div>
    </>,
    document.body,
  );
}
