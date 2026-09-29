/**
 * The engine's endpoint.
 *
 * Better Auth answers here: sending and checking codes, the Google handshake
 * and its callback, reading the session, and signing out. The app's own auth
 * screens call these routes; nothing user-facing is rendered from this file.
 *
 * With one deliberate closed door: the engine's bare credential sign-up
 * (`POST /sign-up/email`) is refused. An account is born only through the
 * verified registration handshake (`lib/auth/registration.ts`) — details in,
 * a code to the address, the code checked on the server, and only then does
 * that server-side step call the engine's own sign-up in-process. A direct
 * POST here would otherwise persist registration details into `users` before
 * any email is proven, which is exactly what the flow exists to prevent.
 */

import { NextResponse } from "next/server";
import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/lib/auth/server";

const engine = toNextJsHandler(auth);

export async function GET(request: Request) {
  return engine.GET(request);
}

export async function POST(request: Request) {
  const path = new URL(request.url).pathname.replace(/\/+$/, "");
  if (path.endsWith("/sign-up/email")) {
    return NextResponse.json(
      {
        message:
          "Accounts are created through the registration flow: enter your details, verify your email, and the account is created.",
      },
      { status: 403 },
    );
  }
  return engine.POST(request);
}
