"use client";

/**
 * The email code.
 *
 * Six cells, one truth. The cells are a *face*: the real control is a single
 * input laid invisibly across all of them, which is what makes everything a
 * code arrives through actually work — pasting a whole code, the keyboard's
 * one-time-code autofill, and typing. Six separate one-character boxes break
 * all three on some browser or another; one input cannot.
 *
 * The face itself: raised white cells with their own depth, each digit landing
 * with a small pop, and the focused cell wearing the accent trio travelling
 * around its edge. No hairlines between cells, no bordered container — the
 * cells are objects sitting on the surface.
 *
 * The six digits verify themselves as soon as they are complete. Verification,
 * resending and expiry are all shown in place: the person never has to guess
 * whether anything happened.
 */

import { Button } from "@heroui/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { AuthNotice } from "@/components/auth/AuthNotice";
import { authClient } from "@/lib/auth/client";
import { readAuthError } from "@/lib/auth/messages";

const LENGTH = 6;
/** Matches the engine's own window for a code. */
const TTL_SECONDS = 10 * 60;
/** Long enough that a resend is deliberate rather than a reflex. */
const RESEND_SECONDS = 30;

function clock(total: number): string {
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function OtpForm({
  email,
  next = "",
  sentAt,
  purpose = "sign-in",
  onVerified,
  onChangeEmail,
}: {
  email: string;
  next?: string;
  /** When the code was sent, so a reload does not restart its clock. */
  sentAt?: number;
  /**
   * What the code is for: signing in, or confirming a brand-new address. The
   * engine keeps the two apart, so the screen has to say which one it is.
   */
  purpose?: "sign-in" | "email-verification";
  /** Called instead of navigating, when the code is entered in the overlay. */
  onVerified?: () => void;
  /** Swaps the “change email” link for a control that stays in place. */
  onChangeEmail?: () => void;
}) {
  const router = useRouter();
  const elapsed = () =>
    Number.isFinite(sentAt) ? Math.max(0, Math.floor((Date.now() - (sentAt as number)) / 1000)) : 0;

  const [code, setCode] = useState("");
  const [caret, setCaret] = useState(0);
  const [typing, setTyping] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [sending, setSending] = useState(false);
  const [expiresIn, setExpiresIn] = useState(() => Math.max(0, TTL_SECONDS - elapsed()));
  const [resendIn, setResendIn] = useState(() =>
    Math.max(0, RESEND_SECONDS - elapsed()),
  );

  const field = useRef<HTMLInputElement>(null);
  const submitted = useRef("");

  const complete = code.length === LENGTH;
  const expired = expiresIn <= 0;

  useEffect(() => {
    field.current?.focus();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setExpiresIn((value) => (value > 0 ? value - 1 : 0));
      setResendIn((value) => (value > 0 ? value - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  /** Normalises anything a clipboard or keyboard delivers into bare digits. */
  function write(raw: string) {
    const digits = raw.replace(/\D/g, "").slice(0, LENGTH);
    setCode(digits);
    setProblem(null);
    setCaret(digits.length);
  }

  /** The highlighted cell: wherever the caret is, capped at the last cell. */
  function syncCaret() {
    const position = field.current?.selectionStart ?? code.length;
    setCaret(Math.min(position, LENGTH - 1));
  }

  async function verify(value: string) {
    if (submitted.current === value) return;
    submitted.current = value;

    setVerifying(true);
    setProblem(null);

    const { error } =
      purpose === "email-verification"
        ? await authClient.emailOtp.verifyEmail({ email, otp: value })
        : await authClient.signIn.emailOtp({ email, otp: value });

    if (error) {
      submitted.current = "";
      setVerifying(false);
      setProblem(readAuthError(error, "That code is not correct. Try again."));
      setCode("");
      setCaret(0);
      field.current?.focus();
      return;
    }

    // Signed in. In the overlay the caller decides what happens next; on a page
    // `replace` is used, so Back never lands on an already-spent code.
    if (onVerified) {
      onVerified();
      return;
    }
    router.replace(next && next.startsWith("/") ? next : "/auth/continue");
  }

  // A complete code verifies itself — there is nothing else to press.
  useEffect(() => {
    if (complete && !verifying && !expired) void verify(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [complete, expired]);

  async function resend() {
    setSending(true);
    setProblem(null);
    setSent(null);

    const { error } = await authClient.emailOtp.sendVerificationOtp({
      email,
      type: purpose,
    });

    setSending(false);

    if (error) {
      setProblem(
        readAuthError(error, "We could not send another code. Try again shortly."),
      );
      return;
    }

    submitted.current = "";
    setCode("");
    setCaret(0);
    setExpiresIn(TTL_SECONDS);
    setResendIn(RESEND_SECONDS);
    // Keep the address bar honest: a later reload should measure from *this*
    // send, not from the one before it.
    const params = new URLSearchParams({ email, sent: String(Date.now()) });
    if (next) params.set("next", next);
    window.history.replaceState(null, "", `/verify?${params.toString()}`);
    setSent(`A new code is on its way to ${email}.`);
    field.current?.focus();
  }

  // Which cell wears the moving edge: the caret's cell, only while typing here.
  const activeCell = typing ? Math.min(caret, LENGTH - 1) : -1;

  return (
    <div className="space-y-4">
      {problem ? <AuthNotice>{problem}</AuthNotice> : null}
      {!problem && sent ? <AuthNotice tone="success">{sent}</AuthNotice> : null}
      {!problem && !sent && expired ? (
        <AuthNotice tone="warning">
          That code has expired. Ask for a new one to continue.
        </AuthNotice>
      ) : null}

      <div
        className="relative flex items-center justify-center"
        onClick={() => field.current?.focus()}
      >
        {/* The real control: one input across the whole run of cells, so paste,
            autofill and keyboards behave exactly as everyone expects. Its text
            is invisible — the cells below are what is seen. */}
        <input
          ref={field}
          aria-label={`Six digit code sent to ${email}`}
          autoComplete="one-time-code"
          className="absolute inset-0 z-10 h-full w-full rounded-xl bg-transparent text-transparent caret-transparent outline-none disabled:cursor-not-allowed"
          disabled={verifying}
          inputMode="numeric"
          maxLength={LENGTH}
          onBlur={() => setTyping(false)}
          onChange={(event) => write(event.target.value)}
          onClick={syncCaret}
          onFocus={(event) => {
            setTyping(true);
            // A focused field always reads as "the next digit lands here".
            event.target.setSelectionRange(event.target.value.length, event.target.value.length);
            syncCaret();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && complete && !verifying && !expired) {
              event.preventDefault();
              void verify(code);
            }
          }}
          onKeyUp={syncCaret}
          onPaste={(event) => {
            // A code copied from the email arrives in one go — possibly with
            // spaces or dashes around it.
            const text = event.clipboardData.getData("text");
            if (!/\d/.test(text)) return;
            event.preventDefault();
            write(text);
          }}
          onSelect={syncCaret}
          pattern="[0-9]*"
          type="text"
          value={code}
        />

        {/* The face: six objects on the surface. No shared border, no hairlines
            between them — depth instead of lines, and colour in motion on the
            cell being typed into. */}
        <div
          aria-hidden="true"
          className="flex w-full max-w-xs items-center gap-2 sm:max-w-sm sm:gap-2.5"
        >
          {Array.from({ length: LENGTH }, (_, index) => {
            const digit = code[index] ?? "";
            const active = index === activeCell;

            return (
              <span
                key={`${index}-${digit}`}
                className={`flex h-13 min-w-0 flex-1 items-center justify-center rounded-xl bg-surface text-[21px] font-semibold tabular-nums text-foreground transition-[transform,box-shadow,background-color] duration-150 ${
                  active ? "ls-edge motion-safe:scale-[1.04]" : "shadow-elev-1"
                } ${problem ? "bg-danger/10 shadow-none" : ""} ${
                  digit && !problem ? "motion-safe:animate-[ls-otp-land_0.22s_cubic-bezier(0.34,1.56,0.64,1)]" : ""
                } ${verifying ? "opacity-60" : ""}`}
              >
                {digit}
              </span>
            );
          })}
        </div>
      </div>

      <Button
        fullWidth
        isDisabled={!complete || expired}
        isPending={verifying}
        onPress={() => verify(code)}
        size="lg"
        type="button"
        variant="primary"
      >
        Verify
      </Button>

      <div className="flex items-center justify-between gap-3 pt-0.5 text-[12.5px]">
        <span className="text-muted">
          {expired ? "Code expired" : `Expires in ${clock(expiresIn)}`}
        </span>

        <span className="flex items-center gap-3">
          {onChangeEmail ? (
            <button
              className="bg-transparent p-0 text-muted transition-colors hover:text-foreground"
              onClick={onChangeEmail}
              type="button"
            >
              Change email
            </button>
          ) : (
            <Link
              className="text-muted no-underline transition-colors hover:text-foreground"
              href={`/sign-in?email=${encodeURIComponent(email)}${next ? `&next=${encodeURIComponent(next)}` : ""}`}
            >
              Change email
            </Link>
          )}

          <Button
            isDisabled={resendIn > 0 || sending}
            isPending={sending}
            onPress={resend}
            size="sm"
            type="button"
            variant="tertiary"
          >
            {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
          </Button>
        </span>
      </div>
    </div>
  );
}
