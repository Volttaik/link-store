/**
 * Registration, held until the address is proven.
 *
 * The rule this module exists for: **no verified email = no account.** A
 * registration is not written to `users` (or anywhere the engine reads at sign
 * in) until the six-digit code sent to the address has been checked here, on
 * the server. Until then it lives only in `pending_registrations` — a staging
 * table no session, sign-in or storefront ever reads.
 *
 * So the flow is exactly:
 *
 *   enter details → code to the email → verify → account created & signed in
 *
 * What sits in the staging table is deliberately not the raw password: it is
 * encrypted at rest (AES-256-GCM under a key derived from the server's own
 * session secret), used once at activation to create the account through the
 * engine's own sign-up, and dropped with the row the moment the registration is
 * consumed. The code itself is never stored either — only a keyed hash of it,
 * compared in constant time, with an expiry and a bounded number of attempts.
 *
 * The account that appears at the end is the engine's own, created through
 * `auth.api.signUpEmail`, so identities, password hashes, the username plugin
 * and the welcome email all behave exactly as they always have.
 */

import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";

import { execute, queryOne } from "../db";
import { sessionSecret } from "../env";
import { nowIso } from "../format";
import { sendSignInCodeEmail } from "../server/email";
import { auth } from "./server";

/** The code is six digits and lives for ten minutes — same as every code here. */
const OTP_TTL_SECONDS = 10 * 60;
/** Five wrong tries and the code is dead: a new one must be asked for. */
const MAX_ATTEMPTS = 5;
/** A new code no faster than this, so the mailbox cannot be flooded. */
const RESEND_COOLDOWN_SECONDS = 30;
/** Pending registrations are forgotten after this long, verified or not. */
const PENDING_RETENTION_DAYS = 7;

export type StartRegistrationResult =
  | { ok: true; email: string }
  | { ok: false; error: string; field?: "email" | "username" | "password" };

export type VerifyRegistrationResult =
  | { ok: true }
  | { ok: false; error: string };

type PendingRow = {
  id: string;
  email: string;
  username: string;
  name: string;
  password_encrypted: string;
  otp_hash: string;
  attempts: number;
  expires_at: string;
  consumed_at: string | null;
  created_at: string;
  updated_at: string;
};

/* -------------------------------------------------------------------------- */
/* The staging table                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Created once per process, and declared in `db/schema.sql` + `scripts/migrate.mjs`
 * as well — an idempotent `CREATE TABLE IF NOT EXISTS` at first use means a
 * deployment never has to remember a migration step before registration works.
 */
let tableReady: Promise<void> | null = null;

function ensurePendingTable(): Promise<void> {
  tableReady ??= execute(
    `CREATE TABLE IF NOT EXISTS pending_registrations (
       id                 TEXT PRIMARY KEY,
       email              TEXT NOT NULL UNIQUE,
       username           TEXT NOT NULL,
       name               TEXT NOT NULL,
       password_encrypted TEXT NOT NULL,
       otp_hash           TEXT NOT NULL,
       attempts           INTEGER NOT NULL DEFAULT 0,
       expires_at         TEXT NOT NULL,
       consumed_at        TEXT,
       created_at         TEXT NOT NULL,
       updated_at         TEXT NOT NULL
     )`,
  ).then(() => undefined);
  return tableReady;
}

/* -------------------------------------------------------------------------- */
/* Secrets: the code's hash and the password's seal                            */
/* -------------------------------------------------------------------------- */

const encKey = createHash("sha256")
  .update(`linkstore:pending-registration:${sessionSecret}`)
  .digest();

/** Only a keyed hash of the code is ever stored. */
function hashOtp(otp: string): string {
  return createHash("sha256").update(`${sessionSecret}:otp:${otp}`).digest("hex");
}

function otpMatches(stored: string, otp: string): boolean {
  const a = Buffer.from(stored, "hex");
  const b = Buffer.from(hashOtp(otp), "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The password, sealed for the short wait between form and verification. */
function sealPassword(password: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encKey, iv);
  const sealed = Buffer.concat([cipher.update(password, "utf8"), cipher.final()]);
  return [iv.toString("base64"), cipher.getAuthTag().toString("base64"), sealed.toString("base64")].join(
    ".",
  );
}

function openPassword(sealed: string): string {
  const [iv, tag, data] = sealed.split(".").map((part) => Buffer.from(part, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", encKey, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

/* -------------------------------------------------------------------------- */
/* Shared helpers                                                             */
/* -------------------------------------------------------------------------- */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_PATTERN = /^[a-z0-9][a-z0-9_.-]*$/i;

function makeOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** Sent through the platform's own code email — the same message as always. */
async function mailCode(email: string, otp: string): Promise<void> {
  const result = await sendSignInCodeEmail({
    to: email,
    code: otp,
    expiresInMinutes: OTP_TTL_SECONDS / 60,
  });
  if (!result.ok) {
    throw new Error(result.error || "The code could not be sent.");
  }
}

/** Forget registrations no one completed. Cheap, and runs with every call. */
async function purgeStale(): Promise<void> {
  const cutoff = new Date(Date.now() - PENDING_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await execute("DELETE FROM pending_registrations WHERE updated_at < ?", [cutoff]);
}

/* -------------------------------------------------------------------------- */
/* Start: details in, code out — and nothing in the account tables yet         */
/* -------------------------------------------------------------------------- */

export async function startRegistration(input: {
  email: string;
  username: string;
  name: string;
  password: string;
}): Promise<StartRegistrationResult> {
  await ensurePendingTable();

  const email = input.email.trim().toLowerCase();
  const username = input.username.trim();
  const name = input.name.trim() || username;

  if (!EMAIL_PATTERN.test(email)) {
    return { ok: false, field: "email", error: "Enter a valid email address." };
  }
  if (username.length < 3 || username.length > 30 || !USERNAME_PATTERN.test(username)) {
    return {
      ok: false,
      field: "username",
      error: "Use 3–30 characters: letters, numbers, dots, dashes and underscores only.",
    };
  }
  if (input.password.length < 8) {
    return { ok: false, field: "password", error: "Use at least 8 characters." };
  }
  if (input.password.length > 200) {
    return { ok: false, field: "password", error: "That password is too long. Use 200 characters or fewer." };
  }

  // An address that already holds an account is never registered twice — the
  // person is told to sign in instead. A username already in use is refused the
  // same way, ahead of the engine's own uniqueness check at activation.
  const existing = await queryOne<{ id: string; username: string | null }>(
    "SELECT id, username FROM users WHERE email = ? OR (username IS NOT NULL AND username = ?) LIMIT 1",
    [email, username],
  );
  if (existing?.id) {
    if (existing.username === username) {
      return { ok: false, field: "username", error: "That username is taken. Try another." };
    }
    return { ok: false, field: "email", error: "That email already has an account. Sign in instead." };
  }

  await purgeStale();

  const now = nowIso();
  const otp = makeOtp();
  const expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000).toISOString();

  // A repeated attempt at the same address replaces the pending registration —
  // the newest details and the newest code win, and still only one code is
  // ever live for the address.
  const pending = await queryOne<PendingRow>(
    "SELECT * FROM pending_registrations WHERE email = ?",
    [email],
  );

  if (
    pending &&
    Date.now() - new Date(pending.updated_at).getTime() < RESEND_COOLDOWN_SECONDS * 1000
  ) {
    return {
      ok: false,
      field: "email",
      error: "We just sent a code to that address. Wait a moment before asking for another.",
    };
  }

  await execute(
    `INSERT INTO pending_registrations
       (id, email, username, name, password_encrypted, otp_hash, attempts, expires_at, consumed_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, NULL, ?, ?)
     ON CONFLICT(email) DO UPDATE SET
       username = excluded.username,
       name = excluded.name,
       password_encrypted = excluded.password_encrypted,
       otp_hash = excluded.otp_hash,
       attempts = 0,
       expires_at = excluded.expires_at,
       consumed_at = NULL,
       updated_at = excluded.updated_at`,
    [
      randomBytes(16).toString("hex"),
      email,
      username,
      name,
      sealPassword(input.password),
      hashOtp(otp),
      expiresAt,
      now,
      now,
    ],
  );

  try {
    await mailCode(email, otp);
  } catch (error) {
    // The registration stays pending — the code can be asked for again — but
    // the form must hear that nothing arrived.
    return {
      ok: false,
      field: "email",
      error: error instanceof Error ? error.message : "The code could not be sent. Try again.",
    };
  }

  return { ok: true, email };
}

/* -------------------------------------------------------------------------- */
/* Resend: a fresh code for a registration already in flight                   */
/* -------------------------------------------------------------------------- */

export async function resendRegistrationCode(email: string): Promise<VerifyRegistrationResult> {
  await ensurePendingTable();

  const address = email.trim().toLowerCase();
  const pending = await queryOne<PendingRow>(
    "SELECT * FROM pending_registrations WHERE email = ? AND consumed_at IS NULL",
    [address],
  );

  if (!pending) {
    return { ok: false, error: "That registration is no longer waiting. Start again." };
  }
  if (
    Date.now() - new Date(pending.updated_at).getTime() < RESEND_COOLDOWN_SECONDS * 1000
  ) {
    return { ok: false, error: "We just sent a code. Wait a moment before asking for another." };
  }

  const otp = makeOtp();
  const now = nowIso();

  await execute(
    `UPDATE pending_registrations
        SET otp_hash = ?, attempts = 0, expires_at = ?, updated_at = ?
      WHERE id = ? AND consumed_at IS NULL`,
    [hashOtp(otp), new Date(Date.now() + OTP_TTL_SECONDS * 1000).toISOString(), now, pending.id],
  );

  try {
    await mailCode(address, otp);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "The code could not be sent. Try again.",
    };
  }

  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* Verify: the only moment an account is allowed to exist                      */
/* -------------------------------------------------------------------------- */

/**
 * The code is checked, and only then is the registration consumed and the
 * account created — atomically enough that a repeated or racing verification
 * finds nothing left to activate:
 *
 * 1. the pending row must exist, be unconsumed, be unexpired and carry the
 *    right code (bounded attempts, constant-time compare);
 * 2. one conditional update marks it consumed — a second concurrent
 *    verification changes zero rows and is told the code is spent;
 * 3. the account is created through the engine itself, the flag is set here on
 *    the server (never trusted from the client), and the new account is signed
 *    in through the engine's own sign-in.
 */
export async function verifyRegistration(input: {
  email: string;
  otp: string;
}): Promise<VerifyRegistrationResult> {
  await ensurePendingTable();

  const email = input.email.trim().toLowerCase();
  const otp = input.otp.replace(/\D/g, "");

  const pending = await queryOne<PendingRow>(
    "SELECT * FROM pending_registrations WHERE email = ?",
    [email],
  );

  if (!pending || pending.consumed_at) {
    return { ok: false, error: "That code is no longer valid. Start again." };
  }
  if (new Date(pending.expires_at).getTime() < Date.now()) {
    return { ok: false, error: "That code has expired. Ask for a new one to continue." };
  }
  if (pending.attempts >= MAX_ATTEMPTS) {
    await execute("DELETE FROM pending_registrations WHERE id = ?", [pending.id]);
    return { ok: false, error: "Too many wrong tries. Ask for a new code to continue." };
  }
  if (!otpMatches(pending.otp_hash, otp)) {
    const attempts = pending.attempts + 1;
    if (attempts >= MAX_ATTEMPTS) {
      await execute("DELETE FROM pending_registrations WHERE id = ?", [pending.id]);
    } else {
      await execute("UPDATE pending_registrations SET attempts = ?, updated_at = ? WHERE id = ?", [
        attempts,
        nowIso(),
        pending.id,
      ]);
    }
    return { ok: false, error: "That code is not correct. Try again." };
  }

  // One winner only: whoever marks the registration consumed gets to create
  // the account. A racing verification changes no row and stops here.
  const claimed = await execute(
    "UPDATE pending_registrations SET consumed_at = ?, updated_at = ? WHERE id = ? AND consumed_at IS NULL",
    [nowIso(), nowIso(), pending.id],
  );
  if (claimed.rowsAffected !== 1) {
    return { ok: false, error: "That code was already used. Start again." };
  }

  const password = openPassword(pending.password_encrypted);

  let userId: string;
  try {
    const created = await auth.api.signUpEmail({
      body: {
        email,
        password,
        name: pending.name,
        username: pending.username,
      },
    });
    userId = created.user.id;
  } catch {
    await execute("DELETE FROM pending_registrations WHERE id = ?", [pending.id]);
    return {
      ok: false,
      error: "That email or username is no longer available. Start again with different details.",
    };
  }

  // The address is proven — by the code checked above, on this server. The
  // engine's own flag is set from that conclusion and nothing else. The update
  // must land on a real row: if an account slipped in between the staging table
  // and this moment (a Google sign-up on the same address, say), the engine
  // answers a sign-up for an existing email with a *synthetic* user rather than
  // an error — so a zero-row update here is how that race is caught, and the
  // registration is refused instead of pretending an account was created.
  const activated = await execute(
    "UPDATE users SET email_verified = 1, updated_at = ? WHERE id = ?",
    [nowIso(), userId],
  );
  if (activated.rowsAffected !== 1) {
    await execute("DELETE FROM pending_registrations WHERE id = ?", [pending.id]);
    return {
      ok: false,
      error: "That email or username is no longer available. Start again with different details.",
    };
  }

  try {
    // Straight into the account, as the flow has always ended: the form, the
    // code, then signed in. The engine opens the session.
    await auth.api.signInEmail({ body: { email, password } });
  } catch {
    // The account exists and is verified; signing in can be repeated from the
    // sign-in screen. Never leave the person with a broken half-state.
  }

  await execute("DELETE FROM pending_registrations WHERE id = ?", [pending.id]);
  return { ok: true };
}
