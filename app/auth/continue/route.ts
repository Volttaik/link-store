/**
 * Where authentication lands.
 *
 * One place decides what happens after someone is signed in — the code screen,
 * the Google callback and anything else that finishes an authentication all come
 * through here. Signing in does not imply becoming a seller, so nobody is
 * funneled into creating a workspace: everyone lands on the marketplace home
 * unless a `next` destination was remembered. Neither is ever asked to
 * authenticate twice.
 */

import { NextResponse } from "next/server";

import { getCurrentUser, postAuthDestination } from "@/lib/auth";
import { attachCartToUser, CART_COOKIE } from "@/lib/server/commerce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    const signIn = new URL("/sign-in", request.url);
    signIn.searchParams.set("reason", "expired");
    return NextResponse.redirect(signIn);
  }

  /*
   * A basket filled before signing in belongs to the account that just signed
   * in — the merge happens exactly once, here, where a finished authentication
   * is the only way through.
   */
  const cartToken =
    request.headers
      .get("cookie")
      ?.split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${CART_COOKIE}=`))
      ?.slice(CART_COOKIE.length + 1) ?? null;
  await attachCartToUser(cartToken ? decodeURIComponent(cartToken) : null, user.id);

  const url = new URL(request.url);
  const next = url.searchParams.get("next");
  return NextResponse.redirect(
    new URL(await postAuthDestination(user.id, next), request.url),
  );
}
