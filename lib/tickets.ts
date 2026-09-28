/**
 * Ticket QR codes.
 *
 * A ticket's QR carries one thing: the opaque ticket code. Nothing else. It
 * holds no name, no email, no event id, no price and no signature, because a QR
 * code is a public object — it gets photographed, screenshotted and posted. The
 * only thing it can do is *ask* the server about a code, and the server decides.
 *
 * That is what makes the check-in flow safe: the door scanner never trusts the
 * code it read, it posts it to a server action that re-checks the ticket's
 * store, event and state before it marks anything as redeemed.
 *
 * Generation runs server-side (never in the browser) so a code can be rendered
 * into a printable, scalable SVG without shipping a payload to the client.
 */

import "server-only";

import { toString as toSvg } from "qrcode";

/**
 * Prefixes for encoded payloads.
 *
 * They cost a few characters of QR capacity and buy two things: a code that no
 * other app's QR can be mistaken for, and a way to recognise — and strip — our
 * own payload when a scanner hands the raw decoded text back to us. Tickets and
 * receipts carry different prefixes, so one scanner can never confuse the two.
 */
const TICKET_PAYLOAD_PREFIX = "LINKSTORE:TICKET:";
const RECEIPT_PAYLOAD_PREFIX = "LINKSTORE:RECEIPT:";

/** The full string written into a ticket's QR code. */
export function ticketQrPayload(code: string): string {
  return `${TICKET_PAYLOAD_PREFIX}${code}`;
}

/** The full string written into a receipt's QR code. */
export function receiptQrPayload(code: string): string {
  return `${RECEIPT_PAYLOAD_PREFIX}${code}`;
}

/**
 * Turn whatever a scanner or a human typed into the code it refers to.
 *
 * Handles the raw code (`LS-1A2B3C4D`), a full QR payload, and the common case
 * of a phone's camera opening a URL that contains the code.
 */
function normaliseCode(raw: string, prefix: string): string {
  let value = raw.trim();
  if (!value) return "";

  if (value.toUpperCase().startsWith(prefix)) {
    value = value.slice(prefix.length);
  }

  // A scanned link keeps the code as its last path segment.
  const lastSegment = value.split("/").pop() ?? value;
  return lastSegment.trim().toUpperCase();
}

/** Turn a scan or a typed value into a ticket code. */
export function normaliseTicketCode(raw: string): string {
  return normaliseCode(raw, TICKET_PAYLOAD_PREFIX);
}

/** Turn a scan or a typed value into a receipt code. */
export function normaliseReceiptCode(raw: string): string {
  return normaliseCode(raw, RECEIPT_PAYLOAD_PREFIX);
}

/**
 * A QR code as an inline SVG string.
 *
 * `qrcode` draws an explicit white background and black modules, so the code
 * stays scannable in dark mode rather than inverting with the theme. The SVG has
 * a viewBox, so it scales to whatever the layout gives it without blurring.
 */
async function qrSvg(payload: string, size: number): Promise<string> {
  return toSvg(payload, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 1,
    width: size,
  });
}

/** A ticket's QR code. */
export async function ticketQrSvg(code: string, size = 320): Promise<string> {
  return qrSvg(ticketQrPayload(code), size);
}

/** A receipt's QR code — what a seller scans to verify an order. */
export async function receiptQrSvg(code: string, size = 320): Promise<string> {
  return qrSvg(receiptQrPayload(code), size);
}
