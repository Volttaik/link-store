import type { Metadata, Viewport } from "next";

import { isGoogleEnabled } from "@/lib/auth/server";

import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "LINK STORE · One link. Everything you sell.",
    template: "%s · LINK STORE",
  },
  description:
    "Link Store is a universal commerce platform. Sell products, food, services, events, tickets and digital files from one shareable storefront link.",
  applicationName: "LINK STORE",
  keywords: [
    "online store",
    "marketplace",
    "sell online",
    "storefront",
    "Nigeria",
    "digital products",
    "event tickets",
  ],
  openGraph: {
    title: "LINK STORE · One link. Everything you sell.",
    description:
      "Create a storefront link and sell products, food, services, events and digital products in one place.",
    siteName: "LINK STORE",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  /* Where the browser supports it, an on-screen keyboard resizes the content
     viewport rather than panning over it — so a full-screen surface (the chat,
     above all) shrinks around the keyboard instead of being pushed upward.
     Browsers that ignore this are still handled by `ChatApplication`, which
     follows the visual viewport directly. */
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#08090f" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        {/* Google is offered only once it is configured, so the provider is told
            rather than guessing. */}
        <Providers googleEnabled={isGoogleEnabled}>{children}</Providers>
      </body>
    </html>
  );
}
