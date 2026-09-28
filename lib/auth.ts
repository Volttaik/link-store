/**
 * Authentication, as the rest of LINK STORE asks for it.
 *
 * The engine (`lib/auth/server.ts`) owns identities and sessions; this module is
 * the app's one doorway to them. Every guarded page and action calls
 * `requireUser` / `requireStore` / `requireAdmin` here, so authorization is
 * enforced on the server against the engine's own session record — never by
 * hiding something in the interface.
 */

import "server-only";

import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { SESSION_COOKIE, SECURE_SESSION_COOKIE } from "./auth/cookies";
import { auth } from "./auth/server";
import { execute, queryOne } from "./db";
import {
  GUEST_USER_STATE,
  accountUserState,
  workspaceUserState,
  type UserState,
} from "./user-state";
import type { SessionUser, StoreRow, UserRole } from "./types";

export { SESSION_COOKIE, SECURE_SESSION_COOKIE } from "./auth/cookies";
export type { UserState } from "./user-state";

/** Where a signed-out visitor is sent, remembering where they were headed. */
export function signInPath(returnTo?: string): string {
  return returnTo ? `/sign-in?next=${encodeURIComponent(returnTo)}` : "/sign-in";
}

/**
 * The current user, or null.
 *
 * Cached per request, so a layout and the page inside it can both ask without
 * repeating the lookup. An unreadable or invalid session resolves to "signed
 * out" rather than an error: a stale cookie is a normal thing to arrive with.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return null;

    const user = session.user as {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
      role?: string | null;
    };

    return {
      id: user.id,
      email: user.email,
      // An account created from an email code has no name to show yet.
      name: user.name?.trim() || user.email.split("@")[0],
      avatarUrl: user.image ?? null,
      role: user.role === "admin" ? "admin" : "user",
    };
  } catch {
    return null;
  }
});

/** Guard for protected pages. Redirects to sign-in, preserving the destination. */
export async function requireUser(returnTo?: string): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(signInPath(returnTo));
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser("/admin");
  if (user.role !== "admin") redirect("/workspace");
  return user;
}

/**
 * The store owned by this user.
 *
 * LINK STORE is one storefront per seller account (`/@handle`); the schema still
 * allows several stores per user, so this can grow without a data migration.
 */
export const getStoreForUser = cache(async (userId: string): Promise<StoreRow | null> => {
  return queryOne<StoreRow>(
    "SELECT * FROM stores WHERE user_id = ? ORDER BY created_at ASC LIMIT 1",
    [userId],
  );
});

export async function requireStore(): Promise<{ user: SessionUser; store: StoreRow }> {
  const user = await requireUser("/workspace");
  const store = await getStoreForUser(user.id);
  if (!store) redirect("/workspace/onboarding");
  return { user, store };
}

/**
 * The seller environment — the workspace — behind a guard.
 *
 * An account does not own a workspace until it creates one. A signed-in account
 * without a workspace that reaches a workspace-only route is sent to the
 * onboarding state that offers to create one; it is never silently handed an
 * empty workspace. `requireStore` is the historical name for the same guard and
 * resolves to the same store record (the workspace's public storefront).
 */
export const requireWorkspace = requireStore;

// ---------------------------------------------------------------------------
// User state — account vs. workspace, resolved from the session.
// ---------------------------------------------------------------------------

/**
 * Who is looking at the app, and which of the three states they are in:
 * `guest`, `account` (signed in, no workspace) or `workspace` (owns one).
 *
 * This is the one place the distinction is resolved from real data. The header,
 * profile menu and navigation are built from it — never from a hardcoded
 * assumption that every account is a seller. A workspace exists only when the
 * account actually created one; nothing here invents a default store.
 */
export const getUserState = cache(async (): Promise<UserState> => {
  const user = await getCurrentUser();
  if (!user) return GUEST_USER_STATE;

  const store = await getStoreForUser(user.id);
  const isAdmin = user.role === "admin";

  if (!store) return accountUserState({ isAdmin });
  return workspaceUserState({ id: store.id, slug: store.slug, isAdmin });
});

// ---------------------------------------------------------------------------
// Ownership predicates.
//
// Reliable answers to "does this account own this record?", resolved by joining
// every record back to its workspace's owner. Ownership is never taken from a URL
// parameter, the client, or a visible button — always from the relationship in
// the database. Use these across API routes, actions, and UI guards rather than
// re-deriving the join everywhere.
// ---------------------------------------------------------------------------

/** Does this account own the workspace (store) with this id? */
export async function ownsWorkspace(workspaceId: string, userId: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    "SELECT id FROM stores WHERE id = ? AND user_id = ?",
    [workspaceId, userId],
  );
  return Boolean(row);
}

/** A store is the workspace's public storefront — same owner check. */
export const ownsStore = ownsWorkspace;

/** Does this account own the workspace behind a listing of any type? */
export async function ownsListing(listingId: string, userId: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `SELECT l.id FROM listings l
       JOIN stores s ON s.id = l.store_id
      WHERE l.id = ? AND s.user_id = ?`,
    [listingId, userId],
  );
  return Boolean(row);
}

/** Products, services, food, digital and rentals are all listings. */
export const ownsProduct = ownsListing;
export const ownsService = ownsListing;

/** Does this account own the workspace behind an event? */
export async function ownsEvent(eventId: string, userId: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `SELECT e.id FROM events e
       JOIN stores s ON s.id = e.store_id
      WHERE e.id = ? AND s.user_id = ?`,
    [eventId, userId],
  );
  return Boolean(row);
}

/** Does this account own the workspace that issued a ticket? */
export async function ownsTicket(ticketId: string, userId: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `SELECT t.id FROM tickets t
       JOIN stores s ON s.id = t.store_id
      WHERE t.id = ? AND s.user_id = ?`,
    [ticketId, userId],
  );
  return Boolean(row);
}

/** Does this account own the workspace a seller-side order was placed against? */
export async function ownsOrder(orderId: string, userId: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `SELECT o.id FROM orders o
       JOIN stores s ON s.id = o.store_id
      WHERE o.id = ? AND s.user_id = ?`,
    [orderId, userId],
  );
  return Boolean(row);
}

/**
 * The account record behind the session, for the settings screens.
 *
 * Separate from `getCurrentUser` because it reads columns the authorization path
 * has no business carrying around.
 */
export const getUserProfile = cache(async (userId: string) => {
  return queryOne<{
    id: string;
    email: string;
    name: string;
    phone: string | null;
    avatar_url: string | null;
    role: UserRole;
    created_at: string;
    last_login_at: string | null;
    email_verified: number;
  }>(
    `SELECT id, email, name, phone, avatar_url, role, created_at, last_login_at, email_verified
       FROM users WHERE id = ?`,
    [userId],
  );
});

/**
 * End every session on an account.
 *
 * The engine's `sessions` table is the record of who is signed in, so clearing a
 * user's rows is exactly "sign this account out everywhere".
 */
export async function revokeAllSessions(userId: string): Promise<void> {
  await execute("DELETE FROM sessions WHERE user_id = ?", [userId]);
}

/** Ends the current session and drops the cookie. */
export async function clearSession(): Promise<void> {
  try {
    await auth.api.signOut({ headers: await headers() });
  } catch {
    // Already signed out, or the cookie was unreadable — either way the cookie
    // below is what the browser is left holding.
  }

  const store = await cookies();
  store.delete(SESSION_COOKIE);
  store.delete(SECURE_SESSION_COOKIE);
}

/**
 * Where a signed-in person lands after authentication.
 *
 * The account is a normal user account first. Signing in does not imply
 * becoming a seller, so nobody is funneled into creating a workspace: everyone
 * lands on the marketplace home unless a `next` destination was remembered (for
 * example, a link that asked them to create a workspace in the first place).
 * A workspace owner reaches their workspace from the menu — it is a capability
 * they can use, not the definition of the account.
 */
export async function postAuthDestination(userId: string, next?: string | null): Promise<string> {
  if (next && next.startsWith("/") && !next.startsWith("//")) return next;
  return "/";
}
