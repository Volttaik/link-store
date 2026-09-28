"use server";

/**
 * The account's way out — and its way back in when the password is lost.
 *
 * There is no sign-*in* action here on purpose: the engine's own endpoints do
 * that (a code, or Google), and the screens that call them are the ones in
 * `components/auth`. This file covers signing out and the complete password
 * reset flow: request a link, set a new password.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { clearSession, getCurrentUser, revokeAllSessions } from "@/lib/auth";
import { auth } from "@/lib/auth/server";

export async function signOutAction(): Promise<void> {
  await clearSession();
  redirect("/");
}

/**
 * Ends every session on the account, including this one.
 *
 * Used by the workspace security card, so it reports back rather than
 * redirecting — the caller decides what to say.
 */
export async function signOutEverywhereAction(): Promise<{
  ok: boolean;
  message: string;
}> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "You are not signed in." };

  await revokeAllSessions(user.id);
  await clearSession();
  revalidatePath("/workspace/settings");

  return { ok: true, message: "You are signed out on every device." };
}

/* -------------------------------------------------------------------------- */
/* Password reset                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Turning an engine failure into a sentence a person can act on.
 *
 * The engine speaks in codes (`INVALID_TOKEN`, `PASSWORD_TOO_SHORT`); the
 * screen speaks in consequences. Unrecognised failures fall back to a line that
 * still says what to do next.
 */
function readResetError(error: unknown, fallback: string): string {
  const raw =
    typeof error === "object" && error !== null
      ? [
          (error as { message?: unknown }).message,
          (error as { body?: { message?: unknown } }).body?.message,
          (error as { code?: unknown }).code,
        ]
          .filter(Boolean)
          .join(" ")
      : typeof error === "string"
        ? error
        : "";
  const message = raw.toLowerCase();

  if (!message) return fallback;

  if (message.includes("invalid") && message.includes("token")) {
    return "That reset link is no longer valid. It may have expired or already been used. Ask for a new one.";
  }
  if (message.includes("too short") || message.includes("password_too_short")) {
    return "Use at least 8 characters for your password.";
  }
  if (message.includes("too long") || message.includes("password_too_long")) {
    return "That password is too long. Use 200 characters or fewer.";
  }
  if (message.includes("rate") || message.includes("too many") || message.includes("429")) {
    return "Too many attempts. Wait a moment before asking for another link.";
  }
  return fallback;
}

export type ResetRequestResult = { ok: true } | { ok: false; error: string };

/**
 * Asks for a password-reset link.
 *
 * The answer is deliberately the same whether or not the address has an
 * account — the requester learns nothing about who has an account here. The
 * engine's reset link is single-use and expires in an hour.
 */
export async function requestPasswordResetAction(input: {
  email: string;
}): Promise<ResetRequestResult> {
  const email = input.email.trim().toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Enter a valid email address." };
  }

  try {
    await auth.api.requestPasswordReset({ body: { email } });
    return { ok: true };
  } catch {
    // The engine already answers "maybe" for unknown addresses; anything that
    // lands here is a real failure (mail could not be sent, engine down) — but
    // it must still not reveal whether the account exists.
    return { ok: true };
  }
}

export type ResetPasswordResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Sets a new password from a reset link.
 *
 * The token is consumed the moment the password is set, so a link works
 * exactly once; every other session on the account is revoked with the old
 * password. Validation runs here as well as in the form — the server is the
 * one that has to be right.
 */
export async function resetPasswordAction(input: {
  token: string;
  newPassword: string;
}): Promise<ResetPasswordResult> {
  const token = input.token.trim();
  const newPassword = input.newPassword;

  if (!token) {
    return { ok: false, error: "That reset link is incomplete. Ask for a new one." };
  }
  if (newPassword.length < 8) {
    return { ok: false, error: "Use at least 8 characters for your password." };
  }
  if (newPassword.length > 200) {
    return { ok: false, error: "That password is too long. Use 200 characters or fewer." };
  }

  try {
    await auth.api.resetPassword({ body: { token, newPassword } });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: readResetError(error, "The password could not be reset. Try again."),
    };
  }
}
