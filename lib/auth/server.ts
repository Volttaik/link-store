/**
 * The authentication engine.
 *
 * Better Auth owns everything that is *authentication*: identities, sessions,
 * accounts, OAuth, one-time codes and the security rules around them. Nothing
 * in this file draws a screen. The interface lives in `components/auth/*` and
 * the routes beside it, built from the same HeroUI system as the rest of LINK
 * STORE — so the engine stays invisible to the person signing in.
 *
 * It speaks to the database through the app's own libSQL client (`lib/db.ts`),
 * so there is one connection, one database, and one identity table. Better Auth
 * does not get a second user store to keep in step.
 */

import "server-only";


import { LibsqlDialect } from "kysely-libsql";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { emailOTP, username } from "better-auth/plugins";

import { db, execute } from "../db";
import { platformConfig, requestBaseUrl, sessionSecret } from "../env";
import { nowIso } from "../format";
import {
  sendPasswordChangedEmail,
  sendPasswordResetEmail,
  sendSignInCodeEmail,
  sendWelcomeEmail,
} from "../server/email";

const OTP_TTL_SECONDS = 10 * 60;

/**
 * Every origin the browser may start or finish an authentication request from.
 *
 * This list is what stops a stranger's page from posting a sign-up or a sign-in
 * to this server, so it has to name the origins the app is genuinely served
 * from — and a hosted preview is one of them. A preview hostname is handed to
 * the process at runtime and changes with the workspace, so a hard-coded
 * `localhost` alone left the form dead: the engine answered
 * `403 Invalid origin` for the very page the seller was looking at.
 *
 * So three sources, in order of explicitness:
 *
 * 1. the configured app URL — production, and any custom domain;
 * 2. localhost and 127.0.0.1 on the app's port, for local development;
 * 3. the hostnames this process was actually started with (Replit sets
 *    `REPLIT_DOMAINS`; older runners set the singular `REPLIT_DEV_DOMAIN`), each
 *    trusted exactly, plus its parent domain as a wildcard — so tomorrow's
 *    workspace URL still works without anyone editing this file.
 */
function trustedOrigins(): string[] {
  const origins = new Set<string>([
    platformConfig.appUrl,
    "http://localhost:5000",
    "http://127.0.0.1:5000",
  ]);

  const runtimeDomains = [process.env.REPLIT_DOMAINS, process.env.REPLIT_DEV_DOMAIN]
    .filter((value): value is string => Boolean(value))
    .flatMap((value) => value.split(","))
    .map((value) => value.trim().replace(/^https?:\/\//, "").replace(/\/+$/, ""))
    .filter(Boolean);

  for (const domain of runtimeDomains) {
    origins.add(`https://${domain}`);
    origins.add(`http://${domain}`);

    // `abc-00-xyz.janeway.replit.dev` → also trust `*.janeway.replit.dev`.
    const parent = domain.split(".").slice(1).join(".");
    if (parent) origins.add(`https://*.${parent}`);
  }

  return [...origins];
}

/** `ada.obi@example.com` → `Ada Obi`, so a new account is never nameless. */
function displayNameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "";
  const words = local
    .split(/[._\-+]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1));
  return words.join(" ") || "New seller";
}

/**
 * Kysely over the app's existing libSQL client.
 *
 * The engine needs a query builder rather than raw SQL, so it gets a thin
 * dialect wrapped around the same client the rest of the app uses. The shape
 * matters: handed a finished Kysely instance the engine cannot read its dialect
 * (Kysely keeps it private) and reports "could not determine database type",
 * which also stops its schema migration from running. Given the dialect and the
 * type explicitly, it knows it is talking to SQLite and can introspect.
 */
const authDb = {
  dialect: new LibsqlDialect({ client: db }),
  type: "sqlite" as const,
};

const googleCredentials = {
  clientId: process.env.GOOGLE_CLIENT_ID?.trim() ?? "",
  clientSecret: process.env.GOOGLE_CLIENT_SECRET?.trim() ?? "",
};

/**
 * Google is offered only once it is configured.
 *
 * A button that leads to a broken OAuth handshake is worse than no button, so
 * the interface asks this flag before drawing one.
 */
export const isGoogleEnabled = Boolean(
  googleCredentials.clientId && googleCredentials.clientSecret,
);

export const auth = betterAuth({
  appName: "Rush Cart",
  baseURL: platformConfig.appUrl,
  secret: process.env.BETTER_AUTH_SECRET?.trim() || sessionSecret,
  database: authDb,

  // Where the browser is allowed to start or finish an auth request.
  trustedOrigins: trustedOrigins(),

  /*
   * A password, a code, or Google.
   *
   * The password is what people expect to type on the way back in. Creating an
   * account still proves the address: signing up does not open a session, it
   * sends a code, and the account is live once that code is entered.
   */
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 200,
    requireEmailVerification: true,
    autoSignIn: false,

    /*
     * Password reset, end to end.
     *
     * The engine issues a single-use, time-limited token and hands it here;
     * the message is composed in Rush Cart's own shell and the link points at
     * the platform's own reset screen (`/reset-password?token=…`) rather than
     * the engine's bare callback, so the person who clicked it lands in the
     * product instead of on a redirect hop.
     *
     * The reset link is good for one hour and works exactly once — the engine
     * consumes it the moment the password is set, so a used or forwarded link
     * fails cleanly instead of opening the account again.
     */
    resetPasswordTokenExpiresIn: 60 * 60,
    async sendResetPassword({ user, token }) {
      // Built from the request's own origin, so a reset link never points at a
      // stale or localhost address regardless of how the process was started.
      const resetUrl = `${await requestBaseUrl()}/reset-password?token=${encodeURIComponent(token)}`;

      // A failed send must surface as a failed request: the person is waiting
      // for a link that would never arrive.
      const result = await sendPasswordResetEmail({
        to: user.email,
        name: user.name?.trim() || "there",
        resetUrl,
        expiresInMinutes: 60,
      });

      if (!result.ok) {
        throw new Error(result.error || "The reset link could not be sent.");
      }
    },

    /*
     * The password changed. Say so.
     *
     * This is the message that tells an account owner someone else got in
     * while there is still time to act — so it is sent the moment the reset
     * completes, and it never blocks the reset itself.
     */
    async onPasswordReset({ user }) {
      await sendPasswordChangedEmail({
        to: user.email,
        name: user.name?.trim() || "there",
      }).catch(() => {
        /* The password is already changed; the notice is best-effort. */
      });
    },

    // A password reset is a security event: every existing session dies with
    // the old password, so a stolen cookie cannot outlive the fix.
    revokeSessionsOnPasswordReset: true,
  },

  /*
   * One identity table, mapped onto the one the platform already had.
   *
   * The engine writes its own columns (`users`, `sessions`) using the names
   * Rush Cart has always used, so every `stores.user_id`, every order, cart and
   * conversation keeps pointing at the same row it always did — no copy, no
   * second user store to keep in step, no rewritten foreign keys. Better Auth
   * still owns the table: it creates the schema, its value shapes (ISO timestamps,
   * 0/1 booleans) are the ones stored, and it is the only thing that writes
   * there for authentication.
   */
  user: {
    modelName: "users",
    fields: {
      createdAt: "created_at",
      updatedAt: "updated_at",
      emailVerified: "email_verified",
      image: "avatar_url",
    },
    additionalFields: {
      // Who someone is inside Rush Cart. Server-owned: a client cannot set it.
      role: {
        type: "string",
        required: false,
        defaultValue: "user",
        input: false,
      },
      phone: { type: "string", required: false, input: false },
      // A string, shown as-is: SQLite has no date type to round-trip through.
      last_login_at: { type: "string", required: false, input: false },
    },
  },

  session: {
    modelName: "sessions",
    fields: {
      userId: "user_id",
      expiresAt: "expires_at",
      createdAt: "created_at",
      updatedAt: "updated_at",
      ipAddress: "ip",
      userAgent: "user_agent",
    },
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: false },
  },

  /*
   * A Google sign-in on an address that already has an account joins that
   * account instead of creating a second one. Google verifies the address it
   * returns, which is what makes the link safe.
   */
  account: {
    accountLinking: { enabled: true, trustedProviders: ["google"] },
  },

  /*
   * Brute-force protection, stated explicitly instead of inherited silently.
   *
   * Better Auth's own defaults stay in force — 3 sign-in/sign-up attempts per
   * 10 seconds, 3 mail sends per minute — and they are the right protection for
   * a public deployment. `AUTH_RATE_LIMIT_DISABLED=true` turns the limiter off
   * for a local prototype session (and for the audit suites, which create
   * accounts faster than any person ever would); it is off only when that
   * variable is literally set, so a real deployment is protected by default.
   */
  rateLimit: {
    enabled: process.env.AUTH_RATE_LIMIT_DISABLED !== "true",
  },

  /*
   * Entering the code to confirm an address also signs you in. That is the end
   * of creating an account: the form, then the code, then you are in — with the
   * password you chose still in place, because confirming an address is not the
   * same act as signing in with a code.
   *
   * The code itself is sent by the sign-up screen through the email OTP plugin,
   * so exactly one code goes out and its delivery failure can be reported on the
   * form rather than swallowed inside sign-up.
   */
  emailVerification: { autoSignInAfterVerification: true },

  socialProviders: isGoogleEnabled
    ? {
        google: {
          clientId: googleCredentials.clientId,
          clientSecret: googleCredentials.clientSecret,
          prompt: "select_account",
        },
      }
    : {},

  databaseHooks: {
    user: {
      create: {
        // An account created from an email code arrives with no name, and a
        // nameless seller reads as a broken account everywhere it appears.
        before: async (user: { email: string; name?: string | null }) => ({
          data: {
            ...user,
            name: user.name?.trim() || displayNameFromEmail(user.email),
          },
        }),
        // Welcome, once. Best-effort: a greeting must never stand between a
        // person and their account.
        after: async (user: { email: string; name?: string | null }) => {
          await sendWelcomeEmail({
            to: user.email,
            name: user.name?.trim() || displayNameFromEmail(user.email),
          }).catch(() => {});
        },
      },
    },
    session: {
      create: {
        // The account's own record of when it was last used. Written after the
        // session exists, so a failed sign-in never stamps it.
        after: async (session: { userId: string }) => {
          await execute("UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?", [
            nowIso(),
            nowIso(),
            session.userId,
          ]);
        },
      },
    },
  },

  plugins: [
    /*
     * A username, so an account has a name that is not its email address — it
     * becomes the seller's display name and can be used to sign in.
     */
    username({
      minUsernameLength: 3,
      maxUsernameLength: 30,
      usernameValidator: (value: string) => /^[a-z0-9][a-z0-9_.-]*$/i.test(value),
    }),
    emailOTP({
      otpLength: 6,
      expiresIn: OTP_TTL_SECONDS,
      // A code can only *sign in* to an account that already exists — it must
      // never conjure one up. With this off, the engine's own sign-in-with-code
      // endpoint refuses to create a user, so the only way an account is ever
      // born is the verified registration handshake (or Google): no verified
      // email, no account.
      disableSignUp: true,
      async sendVerificationOTP({ email, otp }) {
        // A failed send must surface as a failed request, not a silent no-op:
        // the person is waiting for a code that would never arrive.
        const result = await sendSignInCodeEmail({
          to: email,
          code: otp,
          expiresInMinutes: OTP_TTL_SECONDS / 60,
        });

        if (!result.ok) {
          throw new Error(result.error || "The code could not be sent.");
        }
      },
    }),
    // Must stay last: lets server-side calls set the session cookie.
    nextCookies(),
  ],
});
