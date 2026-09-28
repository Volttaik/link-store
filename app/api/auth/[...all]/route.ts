/**
 * The engine's endpoint.
 *
 * Better Auth answers here: sending and checking codes, the Google handshake
 * and its callback, reading the session, and signing out. The app's own auth
 * screens call these routes; nothing user-facing is rendered from this file.
 */

import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/lib/auth/server";

export const { GET, POST } = toNextJsHandler(auth);
