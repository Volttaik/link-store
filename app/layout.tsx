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

const title = "Rush Cart";
const description =
  "Discover and sell products on Rush Cart. Explore stores, meet sellers and shop curated product collections.";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: title,
    template: "%s — Rush Cart",
  },
  description,
  applicationName: "Rush Cart",
  manifest: "/manifest.webmanifest",
  keywords: [
    "online store",
    "marketplace",
    "sell online",
    "storefront",
    "Nigeria",
  ],
  // The tab icon: the vector mark where the browser supports SVG favicons,
  // with the generated 32px PNG (and the 180px apple-touch icon) behind it.
  icons: {
    icon: [
      { url: "/brand/rush-cart-logo.svg", type: "image/svg+xml", sizes: "any" },
      { url: "/icon.png", type: "image/png", sizes: "32x32" },
    ],
    apple: [{ url: "/apple-icon.png", type: "image/png", sizes: "180x180" }],
  },
  appleWebApp: {
    capable: true,
    title: "Rush Cart",
    statusBarStyle: "default",
  },
  openGraph: {
    title,
    description:
      "Find what you love. Discover independent shops and curated product collections.",
    url: appUrl,
    siteName: "Rush Cart",
    type: "website",
    locale: "en",
    images: [
      {
        url: "/brand/rush-cart-logo.png",
        
        alt: "Rush Cart",
      },
    ],
  },
  twitter: {
    card: "summary",
    title,
    description,
    images: ["/brand/rush-cart-logo.png"],
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
