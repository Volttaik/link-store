"use client";

/**
 * A run of consecutive messages from one sender.
 *
 * The interface understands that words sent close together belong together:
 * one avatar for the run, no name repeated, the time and the read state stated
 * once at the end. This is what makes a conversation read like a conversation
 * instead of a log.
 */

import { ChatAvatar } from "@/components/chat/ChatAvatar";
import { MessageBubble, type MessageModel } from "@/components/chat/MessageBubble";
import type { MessageAction } from "@/components/chat/MessageActionsMenu";

/** Messages sent within this many minutes of each other form one run. */
const GROUP_WINDOW_MS = 5 * 60 * 1000;

export type MessageGroupModel = {
  key: string;
  mine: boolean;
  senderUserId: string;
  messages: MessageModel[];
};

/**
 * Collect the flat list of messages into runs: same sender, close in time.
 * A run breaks on a sender change or on a gap in time; a message still on its
 * way out continues its sender's run at the bottom.
 */
export function buildGroups(messages: MessageModel[], viewerId: string): MessageGroupModel[] {
  const groups: MessageGroupModel[] = [];

  for (const message of messages) {
    const previous = groups[groups.length - 1];
    const lastOfPrevious = previous?.messages[previous.messages.length - 1];
    const continues =
      previous &&
      previous.senderUserId === message.senderUserId &&
      new Date(message.createdAt).getTime() - new Date(lastOfPrevious.createdAt).getTime() <=
        GROUP_WINDOW_MS;

    if (continues) {
      previous.messages.push(message);
    } else {
      groups.push({
        key: message.key,
        mine: message.senderUserId === viewerId,
        senderUserId: message.senderUserId,
        messages: [message],
      });
    }
  }

  return groups;
}

export function MessageGroup({
  group,
  counterpartName,
  counterpartAvatar,
  onRetry,
  onAction,
}: {
  group: MessageGroupModel;
  counterpartName: string;
  counterpartAvatar: string | null;
  onRetry?: (key: string) => void;
  onAction?: (action: MessageAction, message: MessageModel) => void;
}) {
  // The footer states the run's edit once — so an edit anywhere in the run is
  // always visible, not only when the edited message happens to be the last.
  const runEdited = group.messages.some((message) => message.editedAt !== null && message.deletedAt === null);

  return (
    <div className={`flex w-full items-end gap-2.5 ${group.mine ? "flex-row-reverse" : "flex-row"}`}>
      {/*
       * The avatar lives at the end of a run — once, not on every message — and
       * only on the other side's runs. An own run carries no invisible
       * counterweight any more: that spacer held every sent message a full
       * avatar's width away from its edge, which is what made the two sides look
       * pushed toward the middle. With it gone, a sent bubble sits at its own
       * margin and a received one keeps the avatar that identifies it, so the
       * exchange reads the way a messaging app should.
       */}
      {group.mine ? null : (
        <ChatAvatar className="mb-6" name={counterpartName} size={32} src={counterpartAvatar} />
      )}

      {/* Every message is a normal flow block in this column: one message,
          one row of height — the spacing makes sure of it. */}
      <div className={`flex min-w-0 flex-1 flex-col gap-1 ${group.mine ? "items-end" : "items-start"}`}>
        {group.messages.map((message, index) => (
          <MessageBubble
            key={message.key}
            message={message}
            mine={group.mine}
            onAction={onAction}
            onRetry={onRetry}
            runEdited={runEdited}
            showStatus={index === group.messages.length - 1}
            tail={index === group.messages.length - 1}
          />
        ))}
      </div>
    </div>
  );
}
