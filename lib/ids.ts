/** Identifier helpers — short, prefixed, collision-safe, runtime-agnostic. */

const HEX = "0123456789abcdef";
const ALPHANUM = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous 0/O/1/I

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

/** Random lowercase hex string. */
export function randomHex(length = 16): string {
  const bytes = randomBytes(Math.ceil(length / 2));
  let out = "";
  for (const byte of bytes) out += HEX[byte >> 4] + HEX[byte & 15];
  return out.slice(0, length);
}

/** Random human-transcribable code (used for ticket and download tokens). */
export function randomCode(length = 10): string {
  const bytes = randomBytes(length);
  let out = "";
  for (const byte of bytes) out += ALPHANUM[byte % ALPHANUM.length];
  return out;
}

/** Prefixed primary key, e.g. `store_9f2c…`. */
export function newId(prefix: string): string {
  return `${prefix}_${randomHex(20)}`;
}

/**
 * Customer-facing order number. Sequential-looking and unique: the store's
 * prefix, the year, then random entropy — safe to display and to guess-proof.
 */
export function newOrderNumber(prefix = "LS"): string {
  const year = new Date().getUTCFullYear().toString().slice(-2);
  const safePrefix = prefix.replace(/[^A-Za-z0-9]/g, "").slice(0, 4) || "LS";
  return `${safePrefix.toUpperCase()}-${year}-${randomCode(6)}`;
}
