"use client";

/**
 * The password reset flow, drawn as card transformations.
 *
 * Two screens, one motion language. A lost password is a small journey —
 * ask, send, land on the link, choose a new password, done — and each step is
 * a state of the same card rather than a new page: the card settles its old
 * state away and rises the new one into place (`CardStage`), so sending,
 * succeeding and failing all feel like the platform working, not like a form
 * being replaced.
 *
 * The card itself is the platform's ordinary card: one solid surface, the
 * platform's radius, its soft shadow, the brand and the state's own visual at
 * the head and the action at the foot.
 *
 * The stages:
 *
 *   Ask for the link   idle → processing → sent (check your email)
 *   Use the link       idle → processing → success (password updated)
 *                      …or error (link expired / already used / incomplete)
 *
 * Validation failures stay in the form — the typed email and password are
 * never thrown away — and only a genuinely dead link transforms the card.
 */

import { Button } from "@heroui/react";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

import {
  requestPasswordResetAction,
  resetPasswordAction,
} from "@/app/actions/auth";
import { Field } from "@/components/ui/field";
import { BrandMark, Icon, Wordmark } from "@/components/ui/Icon";
import { OrbLoader } from "@/components/visual/OrbLoader";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The states every card on the platform moves between. */
type Stage = "idle" | "processing" | "success" | "error";

/**
 * The card: one surface, the same in every state.
 *
 * The brand names the screen, the status visual and the heading say what is
 * happening, the body holds the form or the words for this state, and the foot
 * holds what to press — so the whole card transforms as one object instead of
 * swapping panels.
 */
function ResetCard({
  title,
  description,
  status,
  children,
  actions,
}: {
  title: string;
  description: string;
  /** The state's own visual — its icon or its loader. */
  status: ReactNode;
  /** The form, or the words for this state. */
  children: ReactNode;
  /** The buttons and the ways onward. */
  actions: ReactNode;
}) {
  return (
    <article className="ls-card">
      <div className="flex flex-col gap-5 p-6 sm:p-7">
        <header className="flex flex-col gap-3">
          <span className="flex items-center gap-2">
            <BrandMark className="size-5" />
            <Wordmark className="text-[13px]" />
          </span>

          <span className="flex items-start gap-3">
            {status}
            <span className="flex min-w-0 flex-col gap-1.5">
              <h1 className="text-[17.5px] leading-tight font-semibold tracking-tight text-foreground">
                {title}
              </h1>
              <p className="text-[13px] leading-relaxed text-muted">{description}</p>
            </span>
          </span>
        </header>

        <div className="flex flex-col gap-4">{children}</div>

        <div className="flex flex-col items-stretch gap-2.5">{actions}</div>
      </div>
    </article>
  );
}

/**
 * The card transformation.
 *
 * A card that changes state should *move* between its states rather than be
 * replaced by a fresh one. The outgoing state settles away, the incoming one
 * rises into its place, and the states are the ones every flow shares —
 * `idle → processing → success / error`. Under `prefers-reduced-motion` the swap
 * is instant; the states themselves are unchanged.
 */
function CardStage({
  stage,
  stages,
  label,
}: {
  stage: Stage;
  stages: Partial<Record<Stage, ReactNode>>;
  /** Accessible name for the transforming region. */
  label: string;
}) {
  const [displayed, setDisplayed] = useState<Stage>(stage);
  const [phase, setPhase] = useState<"in" | "out">("in");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (stage === displayed) return;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduced) {
      setDisplayed(stage);
      setPhase("in");
      return;
    }

    // The outgoing state settles away first; the incoming one rises into its
    // place. One timer, cancelled on unmount or on a fast follow-up change.
    setPhase("out");
    timer.current = setTimeout(() => {
      setDisplayed(stage);
      setPhase("in");
    }, 210);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [stage, displayed]);

  return (
    <div
      aria-label={label}
      aria-live="polite"
      className={`ls-stage--${phase}`}
      data-stage={displayed}
      role="status"
    >
      {stages[displayed] ?? stages.idle ?? null}
    </div>
  );
}

/** The visual the card carries while the platform is doing its work. */
function WorkingStatus() {
  return <OrbLoader className="h-5 w-[3.75rem]" />;
}

/** The visual the card carries when something completed. */
function DoneStatus({ tone = "success" }: { tone?: "success" | "danger" }) {
  return (
    <span
      className={`flex size-11 items-center justify-center rounded-full ${
        tone === "danger" ? "bg-danger/10 text-danger" : "bg-iris/15 text-iris-deep"
      }`}
    >
      <Icon name={tone === "danger" ? "alert" : "checkCircle"} size={21} />
    </span>
  );
}

/** The visual the card carries at rest: the key, the thing being recovered. */
function IdleStatus() {
  return (
    <span className="flex size-11 items-center justify-center rounded-full bg-iris/15 text-iris-deep">
      <Icon name="key" size={21} />
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Forgot password — ask for the link                                          */
/* -------------------------------------------------------------------------- */

export function ForgotPasswordFlow() {
  const [stage, setStage] = useState<Stage>("idle");
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setFailure(null);

    const address = email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(address)) {
      setFieldError("Enter the email address on your account.");
      return;
    }
    setFieldError(null);

    setStage("processing");
    const result = await requestPasswordResetAction({ email: address });

    if (!result.ok) {
      // The form comes back with its input intact — a failure must never cost
      // the person what they typed.
      setStage("idle");
      setFailure(result.error);
      return;
    }

    setSentTo(address);
    setStage("success");
  }

  return (
    <CardStage
      label="Password reset"
      stage={stage}
      stages={{
        idle: (
          <form onSubmit={submit}>
            <ResetCard
              actions={
                <Button fullWidth size="lg" type="submit" variant="primary">
                  Send reset link
                </Button>
              }
              description="Enter the email on your account and we will send a link that sets a new password."
              status={<IdleStatus />}
              title="Reset your password"
            >
              {failure ? (
                <p className="rounded-xl bg-danger/10 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-danger">
                  {failure}
                </p>
              ) : null}

              <Field
                error={fieldError}
                inputProps={{ autoCapitalize: "none", autoComplete: "email", inputMode: "email" }}
                label="Email"
                name="email"
                onChange={(value: string) => {
                  setEmail(value);
                  if (fieldError) setFieldError(null);
                }}
                placeholder="you@example.com"
                type="email"
                value={email}
              />

              <p className="text-center text-[12.5px] text-muted">
                <Link
                  className="font-medium text-foreground no-underline transition-opacity hover:opacity-80"
                  href="/sign-in"
                >
                  Back to sign in
                </Link>
              </p>
            </ResetCard>
          </form>
        ),

        processing: (
          <ResetCard
            actions={<div className="h-2" />}
            description="One moment, the link is on its way."
            status={<WorkingStatus />}
            title="Sending your link"
          >
            <p className="text-[13.5px] leading-relaxed text-muted">
              Asking the platform for a fresh reset link for your account…
            </p>
          </ResetCard>
        ),

        success: (
          <ResetCard
            actions={
              <>
                <Button
                  fullWidth
                  size="lg"
                  variant="secondary"
                  onPress={() => {
                    setStage("idle");
                  }}
                >
                  Use a different address
                </Button>
                <Link
                  className="text-center text-[12.5px] font-medium text-muted no-underline transition-colors hover:text-foreground"
                  href="/sign-in"
                >
                  Back to sign in
                </Link>
              </>
            }
            description="If that address has an account, the reset link is already on its way."
            status={<DoneStatus />}
            title="Check your email"
          >
            <p className="text-[13.5px] leading-relaxed text-muted">
              We sent a reset link to{" "}
              <span className="font-medium text-foreground">{sentTo}</span>. It works once and
              expires in an hour.
            </p>
          </ResetCard>
        ),
      }}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Reset password — the link landed, choose a new password                     */
/* -------------------------------------------------------------------------- */

export function ResetPasswordFlow({
  token,
  linkInvalid = false,
}: {
  /** The single-use token from the reset link. Empty means the link is broken. */
  token: string;
  /** Set when the link itself already reported an error (expired, used). */
  linkInvalid?: boolean;
}) {
  const [stage, setStage] = useState<Stage>(linkInvalid || !token ? "error" : "idle");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setFailure(null);

    const problems: Record<string, string> = {};
    if (password.length < 8) problems.password = "Use at least 8 characters.";
    if (confirm !== password) problems.confirm = "The passwords do not match.";
    setFieldErrors(problems);
    if (Object.keys(problems).length > 0) return;

    setStage("processing");
    const result = await resetPasswordAction({ token, newPassword: password });

    if (!result.ok) {
      const deadLink = /link/i.test(result.error) && /valid|expired|used/i.test(result.error);
      if (deadLink) {
        // The link itself is spent — retrying cannot help, so the card
        // transforms to the state that says so and offers the way forward.
        setStage("error");
        setFailure(result.error);
        return;
      }
      // Anything else is retryable: keep the form and the typed password.
      setStage("idle");
      setFailure(result.error);
    }
  }

  return (
    <CardStage
      label="Choose a new password"
      stage={stage}
      stages={{
        idle: (
          <form onSubmit={submit}>
            <ResetCard
              actions={
                <Button fullWidth size="lg" type="submit" variant="primary">
                  Update password
                </Button>
              }
              description="Choose a new password for your account. Every other device will be signed out."
              status={<IdleStatus />}
              title="Set a new password"
            >
              {failure ? (
                <p className="rounded-xl bg-danger/10 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-danger">
                  {failure}
                </p>
              ) : null}

              <Field
                error={fieldErrors.password ?? null}
                inputProps={{ autoComplete: "new-password" }}
                label="New password"
                name="newPassword"
                onChange={(value: string) => {
                  setPassword(value);
                  setFieldErrors((current) => ({ ...current, password: "" }));
                }}
                placeholder="At least 8 characters"
                type="password"
                value={password}
              />

              <Field
                error={fieldErrors.confirm ?? null}
                inputProps={{ autoComplete: "new-password" }}
                label="Confirm password"
                name="confirmPassword"
                onChange={(value: string) => {
                  setConfirm(value);
                  setFieldErrors((current) => ({ ...current, confirm: "" }));
                }}
                placeholder="Repeat your password"
                type="password"
                value={confirm}
              />
            </ResetCard>
          </form>
        ),

        processing: (
          <ResetCard
            actions={<div className="h-2" />}
            description="One moment, your new password is being set."
            status={<WorkingStatus />}
            title="Updating your password"
          >
            <p className="text-[13.5px] leading-relaxed text-muted">
              Securing your account with its new password…
            </p>
          </ResetCard>
        ),

        success: (
          <ResetCard
            actions={
              <Button
                fullWidth
                size="lg"
                variant="primary"
                onPress={() => {
                  window.location.href = "/sign-in";
                }}
              >
                Sign in
              </Button>
            }
            description="Your account is ready with its new password."
            status={<DoneStatus />}
            title="Password updated"
          >
            <p className="text-[13.5px] leading-relaxed text-muted">
              You can sign in now. For your security, every other signed-in device was signed out.
            </p>
          </ResetCard>
        ),

        error: (
          <ResetCard
            actions={
              <>
                <Button
                  fullWidth
                  size="lg"
                  variant="primary"
                  onPress={() => {
                    window.location.href = "/forgot-password";
                  }}
                >
                  Ask for a new link
                </Button>
                <Link
                  className="text-center text-[12.5px] font-medium text-muted no-underline transition-colors hover:text-foreground"
                  href="/sign-in"
                >
                  Back to sign in
                </Link>
              </>
            }
            description="The link could not be used, so the password has not changed."
            status={<DoneStatus tone="danger" />}
            title="This link is no longer valid"
          >
            <p className="text-[13.5px] leading-relaxed text-muted">
              {failure ??
                "Reset links work once and expire after an hour. Ask for a fresh one and it will arrive in a minute."}
            </p>
          </ResetCard>
        ),
      }}
    />
  );
}
