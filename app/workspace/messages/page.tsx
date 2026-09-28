import { redirect } from "next/navigation";

/**
 * Messaging has grown into its own dedicated, full-screen system.
 *
 * The conversation list and the conversation now live together at `/messages`,
 * outside the workspace shell so the exchange can own the whole viewport. This
 * route stays only so older links into the workspace keep working; it hands off
 * to the chat system immediately.
 */
export default function WorkspaceMessagesRedirect() {
  redirect("/messages");
}
