"use client";

/**
 * Signing in, and creating an account.
 *
 * The two are the same shape on purpose: Google first, a divider, then the
 * fields this screen actually needs, then one primary action. Nothing is marked
 * required and nothing is decorated — a field that must be filled is simply the
 * field, and a problem is said in the field's own error line. Switching between
 * the two is one line under the card, never a second navigation.
 */

import { Button } from "@heroui/react";

import { OrbLoader } from "@/components/visual/OrbLoader";
import { useState } from "react";

import { AuthDivider } from "@/components/auth/AuthDivider";
import { AuthNotice } from "@/components/auth/AuthNotice";
import { GoogleAuthButton } from "@/components/auth/GoogleAuthButton";
import { Field } from "@/components/ui/field";
import { authClient } from "@/lib/auth/client";
import { readAuthError } from "@/lib/auth/messages";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_PATTERN = /^[a-z0-9][a-z0-9_.-]*$/i;

/** The engine's words for "the details are wrong" or "confirm your email". */
function classify(error: unknown): { unverified: boolean; message: string } {
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : "";
  return { unverified: /verif/i.test(message), message: message.toLowerCase() };
}

/* -------------------------------------------------------------------------- */
/* Sign in                                                                    */
/* -------------------------------------------------------------------------- */

export function SignInPanel({
  onSignedIn,
  onCode,
  googleEnabled,
  next = "",
}: {
  onSignedIn: () => void;
  onCode: (email: string, purpose: "sign-in", notice: string) => void;
  googleEnabled: boolean;
  next?: string;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const busy = pending || sendingCode;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    const address = email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(address)) {
      setError("Enter the email address on your account.");
      return;
    }
    if (!password) {
      setError("Enter your password.");
      return;
    }

    setPending(true);
    const { error: signInError } = await authClient.signIn.email({
      email: address,
      password,
    });

    if (!signInError) {
      onSignedIn();
      return;
    }

    setPending(false);
    const { unverified, message } = classify(signInError);

    // An account that was never confirmed still has to be let in — with a code,
    // which is what confirms it.
    if (unverified) {
      setNotice("That account is not confirmed yet. Sending you a code…");
      const { error: sendError } = await authClient.emailOtp.sendVerificationOtp({
        email: address,
        type: "email-verification",
      });
      if (sendError) {
        setNotice(null);
        setError(readAuthError(sendError, "We could not send a code. Try again."));
        return;
      }
      onCode(address, "sign-in", "Finish setting up that account with the code we just sent you.");
      return;
    }

    if (message.includes("password") || message.includes("invalid")) {
      setError("That email and password do not match an account.");
      return;
    }

    setError(readAuthError(signInError, "We could not sign you in. Try again."));
  }

  async function useCodeInstead() {
    setError(null);
    const address = email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(address)) {
      setError("Enter your email address first, then we will send a code.");
      return;
    }

    setSendingCode(true);
    const { error: sendError } = await authClient.emailOtp.sendVerificationOtp({
      email: address,
      type: "sign-in",
    });
    setSendingCode(false);

    if (sendError) {
      setError(readAuthError(sendError, "We could not send a code. Try again."));
      return;
    }
    onCode(address, "sign-in", "Enter the six-digit code we just sent you.");
  }

  return (
    <div className="space-y-5">
      {error ? <AuthNotice>{error}</AuthNotice> : null}
      {!error && notice ? <AuthNotice tone="info">{notice}</AuthNotice> : null}

      <GoogleAuthButton
        callbackURL={next || "/auth/continue"}
        isConfigured={googleEnabled}
        isDisabled={busy}
        onError={setError}
      />

      <AuthDivider />

      <form className="space-y-4" noValidate onSubmit={submit}>
        <Field
          inputProps={{ autoCapitalize: "none", autoComplete: "email", inputMode: "email" }}
          label="Email"
          name="email"
          onChange={(value: string) => {
            setEmail(value);
            if (error) setError(null);
          }}
          placeholder="you@example.com"
          type="email"
          value={email}
        />

        <div className="flex flex-col gap-1.5">
          <Field
            inputProps={{ autoComplete: "current-password" }}
            label="Password"
            name="password"
            onChange={(value: string) => {
              setPassword(value);
              if (error) setError(null);
            }}
            placeholder="Your password"
            type="password"
            value={password}
          />
          {/* The way back in when the password is gone — always beside the
              field that needs remembering, never buried in a footer. */}
          <a
            className="self-end text-[12px] font-medium text-muted no-underline transition-colors hover:text-foreground"
            href="/forgot-password"
          >
            Forgot password?
          </a>
        </div>

        <Button fullWidth isDisabled={busy} isPending={pending} size="lg" type="submit" variant="primary">
          Sign in
        </Button>
      </form>

      <p className="text-center text-[12.5px] text-muted">
        <button
          className="inline-flex items-center justify-center gap-2 bg-transparent p-0 text-muted transition-colors hover:text-foreground disabled:opacity-60"
          disabled={busy}
          onClick={useCodeInstead}
          type="button"
        >
          {sendingCode ? <OrbLoader className="h-3.5 w-[2.6rem]" /> : null}
          {sendingCode ? "Sending a code…" : "Sign in with a code instead"}
        </button>
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Create account                                                             */
/* -------------------------------------------------------------------------- */

export function SignUpPanel({
  onCode,
  onSignedIn,
  googleEnabled,
  next = "",
}: {
  onCode: (email: string, purpose: "email-verification", notice: string) => void;
  onSignedIn: () => void;
  googleEnabled: boolean;
  next?: string;
}) {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const address = email.trim().toLowerCase();
    const handle = username.trim();
    const problems: Record<string, string> = {};

    if (!EMAIL_PATTERN.test(address)) problems.email = "Enter a valid email address.";
    if (handle.length < 3) problems.username = "Use at least 3 characters.";
    else if (handle.length > 30) problems.username = "That username is too long.";
    else if (!USERNAME_PATTERN.test(handle)) {
      problems.username = "Letters, numbers, dots, dashes and underscores only.";
    }
    if (password.length < 8) problems.password = "Use at least 8 characters.";
    if (confirm !== password) problems.confirm = "The passwords do not match.";

    setFieldErrors(problems);
    if (Object.keys(problems).length > 0) return;

    setPending(true);

    const { error: signUpError } = await authClient.signUp.email({
      email: address,
      password,
      username: handle,
      // The username is the account's name: it is what the workspace greets and
      // what a storefront shows.
      name: handle,
    });

    if (signUpError) {
      setPending(false);
      const { message } = classify(signUpError);

      if (message.includes("username")) {
        setFieldErrors({ username: "That username is taken. Try another." });
        return;
      }
      if (message.includes("exist") || message.includes("already")) {
        setFieldErrors({ email: "That email already has an account. Sign in instead." });
        return;
      }
      if (message.includes("password")) {
        setFieldErrors({ password: "Use at least 8 characters." });
        return;
      }

      setError(readAuthError(signUpError, "We could not create the account. Try again."));
      return;
    }

    // The account exists but is not usable until the address is proven.
    const { error: sendError } = await authClient.emailOtp.sendVerificationOtp({
      email: address,
      type: "email-verification",
    });

    setPending(false);

    if (sendError) {
      setError(
        readAuthError(
          sendError,
          "Your account was created, but the code could not be sent. Use “Sign in with a code” to try again.",
        ),
      );
      return;
    }

    onCode(address, "email-verification", `Almost there. Enter the code we sent to ${address}.`);
  }

  return (
    <div className="space-y-5">
      {error ? <AuthNotice>{error}</AuthNotice> : null}

      {/* An account created with Google is already confirmed, so this screen's
          one job — proving the address — is done before it starts. */}
      <GoogleAuthButton
        callbackURL={next || "/auth/continue"}
        isConfigured={googleEnabled}
        isDisabled={pending}
        label="Sign up with Google"
        onError={setError}
      />

      <AuthDivider />

      <form className="space-y-4" noValidate onSubmit={submit}>
        <Field
          error={fieldErrors.email ?? null}
          inputProps={{ autoCapitalize: "none", autoComplete: "email", inputMode: "email" }}
          label="Email"
          name="email"
          onChange={(value: string) => {
            setEmail(value);
            setFieldErrors((current) => ({ ...current, email: "" }));
          }}
          placeholder="you@example.com"
          type="email"
          value={email}
        />

        <Field
          description="Your seller name. It shows on your storefront."
          error={fieldErrors.username ?? null}
          inputProps={{ autoCapitalize: "none", autoComplete: "username" }}
          label="Username"
          name="username"
          onChange={(value: string) => {
            setUsername(value);
            setFieldErrors((current) => ({ ...current, username: "" }));
          }}
          placeholder="yourname"
          value={username}
        />

        <Field
          error={fieldErrors.password ?? null}
          inputProps={{ autoComplete: "new-password" }}
          label="Password"
          name="password"
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

        <Button fullWidth isDisabled={pending} isPending={pending} size="lg" type="submit" variant="primary">
          Create account
        </Button>
      </form>
    </div>
  );
}
