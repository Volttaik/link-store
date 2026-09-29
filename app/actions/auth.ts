"use server";

/**
 * The account's way out — and its way back in when the password is lost.
 *
 * There is no sign-*in* action here on purpose: the engine's own endpoints do
 * that (a code, or Google), and the screens that call them are the ones in
 * `components/auth`. This file covers signing out, the complete password reset
 * flow (request a link, set a new password), and the registration handshake —
 * start, resend, verify — that keeps an account out of existence until its
 * email has been proven (see `lib/auth/registration`).
 */

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { clearSession, getCurrentUser, revokeAllSessions } from "@/lib/auth";
import { auth } from "@/lib/auth/server";
import { CART_COOKIE, ORDER_ACCESS_COOKIE } from "@/lib/server/commerce";
import {
  resendRegistrationCode,
  startRegistration,
  verifyRegistration,
} from "@/lib/auth/registration";

/**
 * The browser-side shopping identity leaves with the session.
 *
 * The account's own basket is stored server-side against its user id, so
 * signing back in restores it — but the guest cart cookie belongs to whoever
 * was just using this browser, and must not be inherited by the next one.
 */
async function clearGuestCookies(): Promise<void> {
  const store = await cookies();
  store.delete(CART_COOKIE);
  store.delete(ORDER_ACCESS_COOKIE);
}

export async function signOutAction(): Promise<{ ok: true }> {
  await clearSession();
  await clearGuestCookies();
  // Every layout on the way out renders for a guest: the header, the menus and
  // every account-specific surface are revalidated, so the browser never needs
  // a manual refresh to see the signed-out state. No redirect from here — the
  // caller navigates in place, so signing out is a state change, not a reload.
  revalidatePath("/", "layout");
  return { ok: true };
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
  await clearGuestCookies();
  revalidatePath("/workspace/settings");
  revalidatePath("/", "layout");

  return { ok: true, message: "You are signed out on every device." };
}

/* -------------------------------------------------------------------------- */
/* Registration — held until the email is verified                             */
/* -------------------------------------------------------------------------- */

/**
 * The first step of creating an account: details in, a code to the address,
 * and nothing at all written to the account tables yet. The account exists
 * only after `verifyRegistrationAction` has checked the code on this server.
 */
export async function startRegistrationAction(input: {
  email: string;
  username: string;
  password: string;
  name?: string;
}): Promise<
  { ok: true; email: string } | { ok: false; error: string; field?: "email" | "username" | "password" }
> {
  return startRegistration({
    email: input.email,
    username: input.username,
    name: input.name ?? input.username,
    password: input.password,
  });
}

/** A fresh code for a registration already in flight. */
export async function resendRegistrationCodeAction(input: {
  email: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  return resendRegistrationCode(input.email);
}

/**
 * The only path to an account: the code checked here, server-side, and only
 * then is the registration activated — account created, address marked
 * verified, and the new account signed in.
 */
export async function verifyRegistrationAction(input: {
  email: string;
  otp: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  return verifyRegistration({ email: input.email, otp: input.otp });
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
