"use client";

import { Button } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useAuth } from "@/components/auth/AuthProvider";
import { Icon } from "@/components/ui/Icon";
import type { ButtonSize, ButtonVariant } from "@/components/ui/controls";

/**
 * "Message the seller" — the buyer's way in to a conversation.
 *
 * The one entry point to messaging everywhere on the platform: about a listing
 * (when its seller turned messaging on), about a shop in general, about an
 * order, or about an event. Pressing it opens the thread server-side (or
 * returns the existing one, so a second press does not scatter the question
 * across two threads) and takes the buyer straight to it. A signed-out visitor
 * is asked to sign in first, and comes back to where they were.
 */
export function MessageSellerButton({
  storeId,
  listingId,
  subject,
  sellerName,
  label,
  variant = "secondary",
  size = "md",
  fullWidth = false,
}: {
  storeId: string;
  /** Set when the conversation is about a specific listing. */
  listingId?: string | null;
  /** What the conversation is about, when it opens. */
  subject?: string | null;
  sellerName: string;
  /** Overrides the default “Message {sellerName}”. */
  label?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}) {
  const router = useRouter();
  const auth = useAuth();
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setOpening(true);
    setError(null);

    try {
      const response = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId, listingId: listingId ?? null, subject: subject ?? null }),
      });

      if (response.status === 401) {
        // Sending a message needs an account: ask for one over this page
        // rather than sending the buyer somewhere else.
        setOpening(false);
        auth.open("sign-in", { next: `${window.location.pathname}${window.location.search}` });
        return;
      }

      const result = (await response.json()) as { conversationId?: string; error?: string };

      if (!response.ok || !result.conversationId) {
        setError(result.error ?? "That conversation could not be opened.");
        return;
      }

      router.push(`/messages/${result.conversationId}`);
    } catch {
      setError("That conversation could not be opened.");
    } finally {
      setOpening(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        fullWidth={fullWidth}
        isPending={opening}
        size={size}
        variant={variant}
        onPress={() => void open()}
      >
        <Icon name="message" size={15} />
        {label ?? `Message ${sellerName}`}
      </Button>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
