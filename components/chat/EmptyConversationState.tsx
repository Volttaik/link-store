"use client";

/**
 * The quiet middle of the chat system.
 *
 * When no conversation is open, or one has only just begun, the surface does
 * not say "no data" — it says nothing much at all, in a shape that belongs to
 * the product. Two soft speech forms, one warm accent, a line or two of words.
 * Minimal on purpose.
 */

import { Icon } from "@/components/ui/Icon";

export function EmptyConversationState({
  title,
  description,
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="flex h-full min-h-0 w-full flex-col items-center justify-center gap-5 px-10 text-center">
      <div aria-hidden="true" className="relative">
        <span className="flex size-[4.5rem] items-center justify-center rounded-[1.6rem] rounded-bl-md bg-surface-secondary">
          <Icon name="message" size={26} className="text-muted" />
        </span>
        <span className="absolute -right-2.5 -bottom-2 flex size-8 items-center justify-center rounded-full bg-accent/15">
          <Icon name="sparkle" size={14} className="text-accent" />
        </span>
      </div>

      <div className="space-y-1.5">
        <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
          {title ?? "Your conversations"}
        </h2>
        <p className="max-w-xs text-[12.5px] leading-relaxed text-muted">
          {description ??
            "Pick a conversation from the list — or open a product and write to its seller. Everything about the item stays with the messages."}
        </p>
      </div>
    </div>
  );
}
