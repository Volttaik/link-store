/**
 * The realtime fan-out.
 *
 * A message is an event the moment it is written: the repositories publish it
 * here, and every open stream hands it to the people it concerns. Nothing
 * anywhere polls for rows — there is no loop of "fetch, wait, fetch". The
 * conversation is simply live: a send in one request becomes a delivered event
 * in every other open tab in the same beat.
 *
 * The hub is in-process and the database is the single source of truth: events
 * are notifications, never data, so a dropped or missed event costs nothing —
 * the stream replays from the database on reconnect and the UI re-reads from
 * the server. Losing a listener can never lose a message.
 */

import "server-only";

import type { ChatRealtimeEvent } from "../chat/types";

type Listener = (event: ChatRealtimeEvent) => void;

const listeners = new Set<Listener>();

/** Attach to the hub. The returned function detaches — callers must always use it. */
export function onChatEvent(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Publish an event to every open stream. One bad listener never stops the rest. */
export function emitChatEvent(event: ChatRealtimeEvent): void {
  for (const listener of [...listeners]) {
    try {
      listener(event);
    } catch {
      // A broken stream is that stream's problem, not the sender's.
    }
  }
}
