import { ChatShell } from "@/components/chat/ChatShell";
import { requireUser } from "@/lib/auth";
import { listThreads } from "@/lib/server/messages";

export const dynamic = "force-dynamic";

/**
 * The chat system's inner boundary.
 *
 * Everything under `/messages` is a small application: this layout loads the
 * conversations once and hands them to `ChatShell`, which draws its own sidebar
 * and its own conversation surface around whatever conversation is open. It is
 * wrapped only by the root layout (via `(chat)`), never by the marketplace
 * header, side menu or bottom navigation.
 */
export default async function MessagesLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("/messages");
  const threads = await listThreads(user.id);

  return (
    <ChatShell user={user} threads={threads}>
      {children}
    </ChatShell>
  );
}
