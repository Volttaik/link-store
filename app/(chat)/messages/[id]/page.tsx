import { Conversation } from "@/components/chat/Conversation";
import { requireUser } from "@/lib/auth";
import { getThread, listMessagesPage, markThreadRead } from "@/lib/server/messages";
import { toChatMessagesWithPayments } from "@/lib/server/payment-requests";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * The conversation, in the chat system's own surface.
 *
 * The server loads one page of history — the latest words, not the whole
 * archive — and the real thread; everything after that is live. The
 * conversation component takes it from there: reading marks itself read,
 * older pages come when they are scrolled for, and the exchange moves by
 * event, never by refresh.
 */
export default async function MessageThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/messages/${id}`);

  const thread = await getThread(id, user.id);
  if (!thread) notFound();

  const { messages, hasMore } = await listMessagesPage(id, { limit: 40, viewerId: user.id });

  // Read means read: only mark when there is genuinely something unread here.
  const hasUnread = messages.some(
    (message) => message.sender_user_id !== user.id && message.read_at === null,
  );
  if (hasUnread) await markThreadRead(id, user.id);

  return (
    <Conversation
      initialHasMore={hasMore}
      initialMessages={await toChatMessagesWithPayments(messages)}
      key={thread.id}
      thread={thread}
      viewerId={user.id}
    />
  );
}
