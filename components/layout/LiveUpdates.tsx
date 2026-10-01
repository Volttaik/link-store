"use client";

/**
 * Live message awareness for the platform outside chat.
 *
 * The chat system keeps one realtime connection per person; this listens on it
 * — never opening its own — and turns "something happened" into real state
 * everywhere else: unread badges, previews and the side menu all re-render from
 * the server's own rows via a debounced refresh. Never a client-side guess and
 * never a fake notification. Silent for guests.
 */
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { subscribeChat } from "@/lib/chat/realtime";

export function LiveUpdates({ enabled, userId }: { enabled: boolean; userId?: string }) {
  const router = useRouter();
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return;

    // One refresh covers any number of events that arrive together.
    const scheduleRefresh = () => {
      if (refreshTimer.current) return;
      refreshTimer.current = setTimeout(() => {
        refreshTimer.current = null;
        router.refresh();
      }, 600);
    };

    const detach = subscribeChat({
      onMessage: scheduleRefresh,
      onConversation: scheduleRefresh,
      onResync: scheduleRefresh,
    });

    return () => {
      detach();
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [enabled, userId, router]);

  return null;
}
