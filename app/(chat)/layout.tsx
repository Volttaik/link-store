import type { Metadata } from "next";

import { ChatApplication } from "@/components/chat/ChatApplication";

export const metadata: Metadata = {
  title: { default: "Messages", template: "%s · LINK STORE" },
};

export const dynamic = "force-dynamic";

/**
 * A dedicated, full-screen experience.
 *
 * The conversation owns the whole viewport. This layout is the architectural
 * boundary that lets it: the chat lives in its own `(chat)` route branch, so it
 * is wrapped only by the root layout — never by the workspace shell that brings
 * the platform header, side menu and bottom navigation. There is no overlay and
 * no z-index here; the shell is simply not in this tree.
 *
 * `ChatApplication` is the window that viewport lives in: it anchors the chat
 * to the visible viewport (so the mobile keyboard can shorten it without ever
 * moving the header), locks the document so the message viewport is the only
 * scroll container, and holds the three regions apart — header, message
 * viewport, composer.
 */
export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return <ChatApplication>{children}</ChatApplication>;
}
