/**
 * Server-side configuration for external integrations.
 *
 * Nothing here is a secret value — only *whether* a secret exists. Client
 * components never import this module.
 */

import "server-only";

import { headers } from "next/headers";

function present(value: string | undefined): boolean {
  return Boolean(value && value.trim().length > 0);
}

function normalize(value: string | null | undefined): string {
  return value?.trim().replace(/\/+$/, "") ?? "";
}

/** First host in a possibly comma-separated runtime domain list. */
function firstHost(value: string | null | undefined): string {
  const host = value
    ?.split(",")[0]
    ?.trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "")
    ?? "";
  return host;
}

export const r2Config = {
  accountId: process.env.CLOUDFLARE_ACCOUNT_ID?.trim() ?? "",
  accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID?.trim() ?? "",
  secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY?.trim() ?? "",
  bucket: process.env.R2_BUCKET_NAME?.trim() ?? "",
  publicBaseUrl: process.env.R2_PUBLIC_BASE_URL?.trim().replace(/\/+$/, "") ?? "",
} as const;

/** Cloudflare R2 is the production storage target. */
export const isR2Configured = Boolean(
  r2Config.accountId &&
    r2Config.accessKeyId &&
    r2Config.secretAccessKey &&
    r2Config.bucket,
);

/**
 * Development fallback: files are written to `./storage` and served through a
 * server route. This keeps uploads genuinely working before R2 credentials are
 * supplied — it is a real driver, not a simulated one.
 */
export const storageDriver: "r2" | "local" = isR2Configured ? "r2" : "local";

export const paystackConfig = {
  secretKey: process.env.PAYSTACK_SECRET_KEY?.trim() ?? "",
  publicKey: process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY?.trim() ?? "",
} as const;

export const isPaystackConfigured = present(paystackConfig.secretKey);

export const resendConfig = {
  apiKey: process.env.RESEND_API_KEY?.trim() ?? "",
  from: process.env.RESEND_FROM_EMAIL?.trim() || "LINK STORE <onboarding@resend.dev>",
} as const;

/**
 * Transactional email is configured.
 *
 * When it is not, receipts are still recorded and the UI says the email could
 * not be sent — mail is never silently skipped.
 */
export const isEmailConfigured = present(resendConfig.apiKey);

/**
 * The app's canonical origin, resolved without ever mistaking localhost for a
 * real deployment.
 *
 * Order of explicitness: a configured production URL wins, then the auth
 * engine's own URL, then the runtime hostnames the process was started with
 * (`REPLIT_DOMAINS` today, the older singular `REPLIT_DEV_DOMAIN` before it).
 * Only when nothing says otherwise does it fall back to the local dev port —
 * so a deployment that hands the process a hostname never generates localhost
 * links or OAuth callbacks.
 */
function configuredAppUrl(): string {
  return (
    normalize(process.env.NEXT_PUBLIC_APP_URL) ||
    normalize(process.env.BETTER_AUTH_URL) ||
    (() => {
      const host = firstHost(process.env.REPLIT_DOMAINS) || firstHost(process.env.REPLIT_DEV_DOMAIN);
      return host ? `https://${host}` : "";
    })() ||
    "http://localhost:5000"
  );
}

/** Whether an explicit origin was configured (as opposed to inferred). */
const explicitAppUrl =
  normalize(process.env.NEXT_PUBLIC_APP_URL) || normalize(process.env.BETTER_AUTH_URL);

export const platformConfig = {
  appUrl: configuredAppUrl(),
  feePercent: Number.parseFloat(process.env.PLATFORM_FEE_PERCENT ?? "2.5") || 0,
} as const;

/**
 * The origin to use for absolute URLs generated *during a request* (email links,
 * payment callbacks).
 *
 * The request's own origin is the most truthful answer, so a preview hostname
 * the process did not know about at boot still produces correct links. An
 * explicit configured URL still wins, because a proxy may present a host the
 * app should not advertise.
 */
export async function requestBaseUrl(): Promise<string> {
  if (explicitAppUrl) return explicitAppUrl;

  try {
    const h = await headers();
    const host = normalize(h.get("x-forwarded-host")) || normalize(h.get("host"));
    if (host) {
      const forwardedProto = h.get("x-forwarded-proto")?.split(",")[0]?.trim();
      const proto = forwardedProto || (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
      return `${proto}://${host}`;
    }
  } catch {
    // No request context (module scope, tests): fall through to the static value.
  }

  return platformConfig.appUrl;
}

export const sessionSecret =
  process.env.SESSION_SECRET?.trim() || "linkstore-development-session-secret";
