"use client";

/**
 * A way in, on a page of its own.
 *
 * Reached by a direct link — a bookmark, a redirect from a protected page, or a
 * Google callback that failed. It draws the same card the overlay draws, so a
 * link and the navigation bar lead to one screen; here it simply sits alone in
 * the middle of the page instead of over one.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AuthFlow, type AuthStep } from "@/components/auth/AuthFlow";

export function AuthLanding({
  step: initialStep,
  next = "",
  googleEnabled,
}: {
  step: AuthStep;
  next?: string;
  googleEnabled: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState<AuthStep>(initialStep);

  function finish() {
    // `replace`, so Back never returns to a form that has already been spent.
    router.replace(next && next.startsWith("/") ? next : "/auth/continue");
    // The just-established identity has to reach every server-rendered surface
    // immediately — the header, the menus, the account-specific data — without
    // anyone reloading the page.
    router.refresh();
  }

  return (
    <div className="w-full max-w-sm">
      <div className="rounded-3xl bg-overlay p-6 shadow-overlay sm:p-7">
        <AuthFlow
          googleEnabled={googleEnabled}
          next={next}
          onDone={finish}
          onStep={setStep}
          step={step}
        />
      </div>

      <p className="mt-5 text-center text-[12.5px]">
        <Link
          className="text-muted no-underline transition-colors hover:text-foreground"
          href="/"
        >
          Back to LINK STORE
        </Link>
      </p>
    </div>
  );
}
