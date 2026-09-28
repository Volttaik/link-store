"use client";

/**
 * Continue with Google.
 *
 * Our own control, in LINK STORE's button system — HeroUI's outline button at
 * the same height, radius and typography as every other button in the app. The
 * mark is Google's real four-colour letterform, drawn inline so it stays crisp
 * and needs no icon dependency. Better Auth runs the handshake; the person only
 * ever sees this button.
 *
 * It is always drawn. A way in that silently disappears when a deployment is
 * missing a key is worse than one that says so, so an unconfigured button
 * explains what is missing instead of quietly not being there.
 */

import { Button } from "@heroui/react";
import { useState } from "react";

import { authClient } from "@/lib/auth/client";
import { readAuthError } from "@/lib/auth/messages";

const NOT_CONFIGURED =
  "Google sign-in is not switched on for this deployment yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to enable it.";

/** Google's official mark. Colours are fixed by Google's brand rules. */
function GoogleMark() {
  return (
    <svg aria-hidden="true" height="17" viewBox="0 0 48 48" width="17">
      <path
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"
        fill="#EA4335"
      />
      <path
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65Z"
        fill="#4285F4"
      />
      <path
        d="M10.53 28.59A14.5 14.5 0 0 1 9.77 24c0-1.6.28-3.14.76-4.59l-7.97-6.19A23.94 23.94 0 0 0 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19Z"
        fill="#FBBC05"
      />
      <path
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.97 6.19C6.51 42.62 14.62 48 24 48Z"
        fill="#34A853"
      />
    </svg>
  );
}

export function GoogleAuthButton({
  label = "Continue with Google",
  onError,
  isDisabled = false,
  isConfigured = true,
  callbackURL = "/auth/continue",
}: {
  label?: string;
  onError: (message: string) => void;
  isDisabled?: boolean;
  /** False when the deployment has no Google credentials — the button says so. */
  isConfigured?: boolean;
  /**
   * Where Google returns to. The overlay sends people back to the page they
   * were using; a direct visit falls back to the route that decides between
   * onboarding and the workspace.
   */
  callbackURL?: string;
}) {
  const [pending, setPending] = useState(false);

  async function start() {
    if (!isConfigured) {
      onError(NOT_CONFIGURED);
      return;
    }

    setPending(true);

    const { error } = await authClient.signIn.social({
      provider: "google",
      callbackURL,
      errorCallbackURL: "/sign-in?error=google",
    });

    if (error) {
      setPending(false);
      onError(readAuthError(error, "Google sign-in could not start. Try again."));
    }
    // On success the browser is already being redirected to Google, so the
    // button stays pending until the page goes away.
  }

  return (
    <Button
      fullWidth
      isDisabled={isDisabled || pending}
      isPending={pending}
      onPress={start}
      size="lg"
      type="button"
      variant="outline"
    >
      <span className="flex items-center justify-center gap-2.5">
        <GoogleMark />
        {label}
      </span>
    </Button>
  );
}
