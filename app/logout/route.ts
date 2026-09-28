/**
 * Sign out.
 *
 * The session row is deleted (so the cookie cannot be replayed) and the cookie
 * is cleared. It lives outside the `(market)` group so it is reachable from the
 * workspace too, without rendering a page in between.
 */

import { NextResponse } from "next/server";

import { SESSION_COOKIE, clearSession } from "@/lib/auth";
import { CART_COOKIE, ORDER_ACCESS_COOKIE } from "@/lib/server/commerce";

export const runtime = "nodejs";

/**
 * Drop the browser-side shopping identity along with the session.
 *
 * The account's own basket is stored server-side against its user id, so
 * signing back in restores it. Clearing the guest cart cookie here means the
 * next visitor on this browser — a guest, or a different account — starts from
 * a clean basket instead of inheriting this one's.
 */
function clearCartCookies(response: NextResponse): void {
  response.cookies.delete(CART_COOKIE);
  response.cookies.delete(ORDER_ACCESS_COOKIE);
}

export async function GET(request: Request) {
  await clearSession();
  const response = NextResponse.redirect(new URL("/", request.url));
  clearCartCookies(response);
  return response;
}

export async function POST(request: Request) {
  await clearSession();
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(SESSION_COOKIE);
  clearCartCookies(response);
  return response;
}
