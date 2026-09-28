"use client";

/**
 * The authentication overlay.
 *
 * Not a page: a blurred surface over whatever the person was already doing, so
 * signing in from a product page, a cart or a message never costs them their
 * place. HeroUI's dialog is the card; everything inside it is the shared
 * `AuthFlow`, so the overlay and a direct visit to /sign-in are the same screen.
 */

import { Modal } from "@heroui/react";
import { useRouter } from "next/navigation";

import { AUTH_TITLES, AuthFlow, type AuthStep } from "@/components/auth/AuthFlow";

export type { AuthStep };

export function AuthDialog({
  step,
  onStep,
  onClose,
  next = "",
  googleEnabled = false,
}: {
  /** The open step, or null when the overlay is closed. Owned by the provider,
   *  so every open starts from the step it was asked for. */
  step: AuthStep | null;
  onStep: (step: AuthStep) => void;
  onClose: () => void;
  /** Where to go once signed in. Empty means "stay right here, now signed in". */
  next?: string;
  googleEnabled?: boolean;
}) {
  const router = useRouter();

  function finish() {
    onClose();

    if (next && next.startsWith("/")) router.push(next);
    // Always re-fetch, even after navigating: the header, side menu and every
    // server-rendered surface must reflect the session that was just established
    // without the person having to reload. `push` to the page they were already
    // on does not re-run the layouts on its own, so this is what makes the new
    // identity appear immediately.
    router.refresh();
  }

  return (
    <Modal
      isOpen={Boolean(step)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Modal.Backdrop className="bg-foreground/35">
        <Modal.Container scroll="inside" size="sm">
          {/* The heading lives in the card itself, so the dialog is named
              directly rather than through a second, duplicated title. */}
          <Modal.Dialog aria-label={AUTH_TITLES[step?.kind ?? "sign-in"]}>
            <Modal.CloseTrigger />

            <Modal.Body>
              {step ? (
                <AuthFlow
                  googleEnabled={googleEnabled}
                  next={next}
                  onDone={finish}
                  onStep={onStep}
                  step={step}
                />
              ) : null}
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
