/**
 * Edge middleware.
 *
 * A *convenience* redirect only: it checks whether the engine's session cookie is
 * present, which costs nothing and avoids rendering a protected shell for a
 * visitor who is clearly signed out.
 *
 * It is deliberately NOT the security boundary. Middleware cannot reach the
 * database (the libSQL driver is not edge-compatible), so it cannot validate the
 * session. Every protected page and server action independently calls
 * `requireUser()` / `requireStore()` / `requireAdmin()`, which verify the session
 * against the engine and enforce ownership. Removing this file would not expose
 * any data — it would only make the redirect less tidy.
 */

import { NextResponse, type NextRequest } from "next/server";

import { isSessionCookieName } from "@/lib/auth/cookies";

const PROTECTED_PREFIXES = ["/workspace", "/admin"];

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (!isProtected) return NextResponse.next();

  const hasSession = request.cookies
    .getAll()
    .some((cookie) => isSessionCookieName(cookie.name) && cookie.value);
  if (hasSession) return NextResponse.next();

  const signInUrl = new URL("/sign-in", request.url);
  signInUrl.searchParams.set("next", `${pathname}${search}`);
  signInUrl.searchParams.set("reason", "expired");
  return NextResponse.redirect(signInUrl);
}

export const config = {
  // Skip static assets and the API surface entirely.
  matcher: ["/workspace/:path*", "/admin/:path*"],
};
