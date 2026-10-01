import "server-only";
import { toString as toSvg } from "qrcode";
const PREFIX = "RUSHCART:RECEIPT:";
const LEGACY_PREFIX = "LINKSTORE:RECEIPT:"; // Already-issued receipts remain valid.
export function receiptQrPayload(code: string): string { return `${PREFIX}${code}`; }
export function normaliseReceiptCode(raw: string): string {
  let value = raw.trim();
  for (const prefix of [PREFIX, LEGACY_PREFIX]) if (value.toUpperCase().startsWith(prefix)) { value = value.slice(prefix.length); break; }
  return (value.split("/").pop() ?? value).trim().toUpperCase();
}
export async function receiptQrSvg(code: string, size = 320): Promise<string> { return toSvg(receiptQrPayload(code), { type: "svg", errorCorrectionLevel: "M", margin: 1, width: size }); }
