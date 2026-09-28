import { EmptyConversationState } from "@/components/chat/EmptyConversationState";

export const metadata = { title: "Messages" };

/**
 * The quiet middle of the chat system: no conversation open yet.
 *
 * On a phone the sidebar covers this (the list is the whole screen); on a wide
 * screen it is what sits beside the list until a conversation is chosen.
 */
export default function ChatEmptyPage() {
  return <EmptyConversationState />;
}
