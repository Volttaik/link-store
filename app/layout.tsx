import type { Metadata, Viewport } from "next";

import { isGoogleEnabled } from "@/lib/auth/server";

import { Providers } from "./providers";
import "./globals.css";

/**
 * The site's canonical origin — every share card, icon and sitemap URL is
 * resolved against it, so previews point at the real deployment and never at
 * whatever host happened to render the page.
 */
const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:5000";

const title = "LINK STORE · One link. Everything you sell.";
const description =
  "Link Store is a universal commerce platform. Sell products, food, services, events, tickets and digital files from one shareable storefront link.";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: title,
    template: "%s · LINK STORE",
  },
  description,
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
  // The LINK ICON, generated with the platform's own mark — the same glyph the
  // email shell wears (`scripts/generate-brand-assets.mjs`). Next serves these
  // file-convention icons at /icon.png, /apple-icon.png and /favicon.ico.
  icons: {
    icon: [{ url: "/icon.png", type: "image/png", sizes: "32x32" }],
    apple: [{ url: "/apple-icon.png", type: "image/png", sizes: "180x180" }],
  },
  appleWebApp: {
    capable: true,
    title: "LINK STORE",
    statusBarStyle: "default",
  },
  openGraph: {
    title,
    description:
      "Create a storefront link and sell products, food, services, events and digital products in one place.",
    url: appUrl,
    siteName: "LINK STORE",
    type: "website",
    locale: "en",
    images: [
      {
        url: "/brand/link-share.png",
        width: 800,
        height: 800,
        alt: "LINK STORE — the chain-link mark",
      },
    ],
  },
  twitter: {
    card: "summary",
    title,
    description,
    images: ["/brand/link-share.png"],
  },
  robots: { index: true, follow: true },
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
