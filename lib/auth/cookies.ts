/**
 * The session cookie's names.
 *
 * Kept in its own module with no server imports so the edge middleware can read
 * them too. The engine sets the cookie; these constants only let the rest of the
 * app recognise it — one place, so a rename can never leave a stale copy behind.
 * The `__Secure-` variant is the one served over HTTPS.
 */

export const SESSION_COOKIE = "better-auth.session_token";
export const SECURE_SESSION_COOKIE = "__Secure-better-auth.session_token";

export function isSessionCookieName(name: string): boolean {
  return name === SESSION_COOKIE || name === SECURE_SESSION_COOKIE;
}
