/**
 * Turning an engine failure into a sentence a person can act on.
 *
 * The engine's own messages describe its internals ("invalid otp", "rate limit
 * exceeded"). They are useful for deciding *what* went wrong, never for saying
 * it, so each case is mapped to LINK STORE's own copy and anything unrecognised
 * falls back to a line the caller chooses.
 */

export function readAuthError(error: unknown, fallback: string): string {
  const raw =
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : typeof error === "string"
        ? error
        : "";
  const message = raw.toLowerCase();

  if (!message) return fallback;

  if (message.includes("attempt") || message.includes("too many")) {
    return "Too many attempts. Ask for a new code and try again.";
  }
  if (message.includes("expired")) {
    return "That code has expired. Ask for a new one.";
  }
  if (message.includes("otp") || message.includes("code")) {
    return "That code is not correct. Check the six digits and try again.";
  }
  if (message.includes("rate") || message.includes("slow down") || message.includes("429")) {
    return "Just a moment. Wait a few seconds before asking again.";
  }
  if (message.includes("oauth") || message.includes("google") || message.includes("provider")) {
    return "Google sign-in could not be completed. Try again, or use an email code.";
  }
  if (message.includes("session")) {
    return "Your session has expired. Sign in again to continue.";
  }
  if (message.includes("email")) {
    return "Check that email address and try again.";
  }

  return fallback;
}
