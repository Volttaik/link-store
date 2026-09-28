"use client";

import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";

import { AuthProvider } from "@/components/auth/AuthProvider";

/**
 * Theme handling and the authentication overlay.
 *
 * HeroUI v3 needs no context provider — components are self-contained. What the
 * app does provide is colour mode (`next-themes` writes both the `dark` class
 * and the `data-theme` attribute on <html>, which is exactly what HeroUI's
 * stylesheet keys its light/dark variables off) and the auth overlay, mounted
 * once here so any screen can open it in place.
 */
export function Providers({
  children,
  googleEnabled,
}: {
  children: ReactNode;
  /** Whether Google is configured; the button is hidden when it is not. */
  googleEnabled: boolean;
}) {
  return (
    <ThemeProvider
      attribute={["class", "data-theme"]}
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
    >
      <AuthProvider googleEnabled={googleEnabled}>{children}</AuthProvider>
    </ThemeProvider>
  );
}
