/**
 * The browser's handle on the authentication engine.
 *
 * Used only to *ask* the engine for something — create an account, sign in,
 * send or check a code, start Google, sign out. Every screen that calls it is
 * ours.
 */

import { createAuthClient } from "better-auth/react";
import {
  emailOTPClient,
  inferAdditionalFields,
  usernameClient,
} from "better-auth/client/plugins";

import type { auth } from "./server";

export const authClient = createAuthClient({
  plugins: [
    usernameClient(),
    emailOTPClient(),
    // Teaches the client about the account fields LINK STORE adds (role, phone),
    // so typed reads of the current user work in the browser too.
    inferAdditionalFields<typeof auth>(),
  ],
});

export type AuthUser = typeof authClient.$Infer.Session.user;
