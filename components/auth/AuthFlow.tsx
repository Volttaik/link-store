"use client";

/**
 * The authentication flow, drawn once.
 *
 * Which step is open, what it is called and which panel belongs to it lives
 * here rather than in any one frame. The overlay and a direct visit to
 * /sign-in both render this, so a person who signs in from the navigation bar
 * and a person who follows a link see the same screen.
 */

import { AuthCard } from "@/components/auth/AuthCard";
import { AuthNotice } from "@/components/auth/AuthNotice";
import { SignInPanel, SignUpPanel } from "@/components/auth/AuthPanels";
import { OtpForm } from "@/components/auth/OtpForm";

export type AuthStep =
  | { kind: "sign-in" }
  | { kind: "sign-up" }
  | {
      kind: "code";
      email: string;
      purpose: "sign-in" | "email-verification";
      notice: string;
      back: "sign-in" | "sign-up";
    };

type Heading = { title: string; description: string };

const HEADINGS: Record<AuthStep["kind"], Heading> = {
  "sign-in": {
    title: "Sign in to LINK STORE",
    description: "Use Google, or the email and password on your account.",
  },
  "sign-up": {
    title: "Create your account",
    description: "One account for buying, selling and everything in between.",
  },
  code: {
    title: "Check your email",
    description: "Enter the six-digit code we just sent you.",
  },
};

export const AUTH_TITLES: Record<AuthStep["kind"], string> = {
  "sign-in": HEADINGS["sign-in"].title,
  "sign-up": HEADINGS["sign-up"].title,
  code: HEADINGS.code.title,
};

/** The line under the card that swaps one screen for the other. */
function Switch({ prompt, action, onClick }: { prompt: string; action: string; onClick: () => void }) {
  return (
    <p>
      {prompt}{" "}
      <button
        className="bg-transparent p-0 font-medium text-foreground transition-opacity hover:opacity-80"
        onClick={onClick}
        type="button"
      >
        {action}
      </button>
    </p>
  );
}

export function AuthFlow({
  step,
  onStep,
  onDone,
  next = "",
  googleEnabled = false,
}: {
  step: AuthStep;
  onStep: (step: AuthStep) => void;
  /** Runs once the person is actually signed in. */
  onDone: () => void;
  /** Where to land afterwards. Empty means "right back where you were". */
  next?: string;
  googleEnabled?: boolean;
}) {
  const heading = HEADINGS[step.kind];

  return (
    <AuthCard
      description={heading.description}
      footer={
        step.kind === "sign-in" ? (
          <Switch
            action="Create one"
            onClick={() => onStep({ kind: "sign-up" })}
            prompt="New to LINK STORE?"
          />
        ) : step.kind === "sign-up" ? (
          <Switch
            action="Sign in"
            onClick={() => onStep({ kind: "sign-in" })}
            prompt="Already have an account?"
          />
        ) : undefined
      }
      title={heading.title}
    >
      {step.kind === "sign-in" ? (
        <SignInPanel
          googleEnabled={googleEnabled}
          next={next}
          onCode={(email, purpose, notice) =>
            onStep({ kind: "code", email, purpose, notice, back: "sign-in" })
          }
          onSignedIn={onDone}
        />
      ) : null}

      {step.kind === "sign-up" ? (
        <SignUpPanel
          googleEnabled={googleEnabled}
          next={next}
          onCode={(email, purpose, notice) =>
            onStep({ kind: "code", email, purpose, notice, back: "sign-up" })
          }
          onSignedIn={onDone}
        />
      ) : null}

      {step.kind === "code" ? (
        <div className="space-y-4">
          <AuthNotice tone="info">{step.notice}</AuthNotice>
          <OtpForm
            email={step.email}
            next={next}
            onChangeEmail={() => onStep({ kind: step.back })}
            onVerified={onDone}
            purpose={step.purpose}
          />
        </div>
      ) : null}
    </AuthCard>
  );
}
