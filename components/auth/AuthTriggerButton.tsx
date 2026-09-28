"use client";

/**
 * A button that opens the authentication overlay where it stands.
 *
 * Used by the navigation bars and anything else that offers "log in" — the
 * person stays on the page they are on, which is the whole point of the
 * overlay. HeroUI's button, so it matches every other button in the app.
 */

import { Button } from "@heroui/react";

import { useAuth } from "@/components/auth/AuthProvider";
import type { ButtonVariant } from "@/components/ui/controls";

export function AuthTriggerButton({
  label,
  /**
   * A shorter label for the narrowest screens, where the full one would push
   * the header wider than the phone. The control keeps one predictable size;
   * only its words change, and the full label returns at `sm`.
   */
  mobileLabel,
  mode = "sign-in",
  variant = "primary",
  size = "md",
  fullWidth = false,
  className,
  /** Runs after the overlay opens — used to close a drawer it was triggered from. */
  after,
}: {
  label: string;
  mobileLabel?: string;
  mode?: "sign-in" | "sign-up";
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  fullWidth?: boolean;
  className?: string;
  after?: () => void;
}) {
  const { open } = useAuth();

  return (
    <Button
      className={className}
      fullWidth={fullWidth}
      onPress={() => {
        after?.();
        open(mode);
      }}
      size={size}
      variant={variant}
    >
      {mobileLabel ? (
        <>
          <span className="sm:hidden">{mobileLabel}</span>
          <span className="hidden sm:inline">{label}</span>
        </>
      ) : (
        label
      )}
    </Button>
  );
}
