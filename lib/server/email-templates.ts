/**
 * The Rush Cart transactional email design system.
 *
 * One system, every message: a quiet brand lockup, one card of white paper on a
 * neutral ground, a single strong hierarchy, hairline structure instead of
 * boxes-within-boxes, one clear action, and a professional footer. The
 * templates follow how real production transactional mail is built — semantic
 * tables, inline styles, generous spacing, a real item table for invoices —
 * rather than pasting application UI into a message.
 *
 * The actual checked-in PNG logo is embedded with Resend's documented inline
 * attachment mechanism (`content_id: rush-cart-logo`, sent with its real
 * `image/png` type so every client renders the `cid:` reference). No external
 * logo URL, relative web path or expiring storage URL is used. A text wordmark
 * sits beside the mark so the message stays identifiable where images are
 * blocked.
 *
 * Everything is table-based and inline-styled on purpose: that is the only
 * layout that survives Outlook, Gmail and Apple Mail with the same result. The
 * one `<style>` block holds a small-screen query only, and every rule in it has
 * an inline fallback.
 */

import { escapeEmailHtml } from "../email-safety";
import { platformConfig } from "../env";

/** The accent trio, as the hex values the platform's OKLab tokens resolve to. */
const BRAND = {
  iris: "#bcaef9",
  irisDeep: "#554695",
  irisSoft: "#efebfd",
  milk: "#f7e6c3",
  ink: "#1f1d2d",
  snow: "#fafafd",
  background: "#f4f4f8",
  text: "#3f3d52",
  muted: "#6e6b82",
  hairline: "#e7e5f0",
} as const;

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";
const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";

/** Inline attachment identifier, matched by the delivery payload. */
function logo(): string {
  return "cid:rush-cart-logo";
}

/**
 * The brand lockup: the embedded mark with a text wordmark beside it. The mark
 * carries explicit dimensions in its true aspect (1698×926 → 88×48) so no
 * client can squash it, and the wordmark keeps the brand readable where images
 * are blocked.
 */
function brandLockup(): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td style="padding-right:12px;vertical-align:middle">
        <img alt="Rush Cart" src="${logo()}" width="88" height="48" style="display:block;width:88px;height:48px;border:0;outline:none;text-decoration:none" />
      </td>
      <td style="vertical-align:middle;font-family:${FONT};font-size:17px;font-weight:700;letter-spacing:-0.01em;color:${BRAND.ink};line-height:1">
        Rush&nbsp;<span style="color:${BRAND.irisDeep}">Cart</span>
      </td>
    </tr>
  </table>`;
}

/**
 * The accent trio as one hairline at the top of the card — the platform's
 * identity at the edge, three flat segments. Restrained on purpose: colour
 * arrives once, then the message is all business.
 */
function accentRule(): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px">
    <tr>
      <td width="33%" height="3" style="height:3px;background:${BRAND.iris};font-size:0;line-height:0">&nbsp;</td>
      <td width="34%" height="3" style="height:3px;background:${BRAND.irisDeep};font-size:0;line-height:0">&nbsp;</td>
      <td width="33%" height="3" style="height:3px;background:${BRAND.milk};font-size:0;line-height:0">&nbsp;</td>
    </tr>
  </table>`;
}

/** A primary action. One per message — a call to action is a singular thing. */
export function emailButton(label: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" class="rc-button" style="margin:26px 0 6px">
    <tr>
      <td style="border-radius:8px;background:${BRAND.irisDeep}">
        <a href="${escapeEmailHtml(url)}" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:15px;font-weight:600;line-height:1.2;color:#ffffff;text-decoration:none;border-radius:8px">${escapeEmailHtml(label)}</a>
      </td>
    </tr>
  </table>`;
}

/**
 * The reliable fallback under the button: the same destination as readable
 * text, so a client that strips buttons still gets the user where they need to
 * go. Used mainly for the one link that grants access (reset, order).
 */
export function emailLink(label: string, url: string): string {
  return `<p style="margin:12px 0 0;font-family:${FONT};font-size:13px;line-height:1.6;color:${BRAND.muted}">
    ${escapeEmailHtml(label)}:<br>
    <a href="${escapeEmailHtml(url)}" style="color:${BRAND.irisDeep};word-break:break-all">${escapeEmailHtml(url)}</a>
  </p>`;
}

/**
 * The highlighted code block — a one-time code, an order number. Mono-spaced,
 * generous, and never an image: the code must survive being read as plain text
 * or copied out of a client that blocks styling.
 */
export function emailCode(code: string, { spaced = false }: { spaced?: boolean } = {}): string {
  const shown = spaced ? code.split("").join(" ") : code;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0 22px;border:1px solid ${BRAND.hairline};border-radius:8px;background:${BRAND.irisSoft}">
    <tr>
      <td class="rc-code" style="padding:22px 16px;text-align:center;font-family:${MONO};font-size:30px;font-weight:700;letter-spacing:.22em;color:${BRAND.ink};line-height:1.2">
        ${escapeEmailHtml(shown)}
      </td>
    </tr>
  </table>`;
}

/**
 * Label/value rows — order facts, an event's date and venue. Hairline
 * separators, muted labels, firm values. A `strong` row (the money total) is
 * given a rule of its own and a heavier value.
 */
export function emailRows(rows: Array<{ label: string; value: string; strong?: boolean }>): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0;border-collapse:collapse">
    ${rows
      .map(
        (row) => `<tr>
      <td style="padding:9px 0;${row.strong ? `border-top:1px solid ${BRAND.ink};` : ""}font-family:${FONT};font-size:14px;color:${BRAND.muted};vertical-align:top">${escapeEmailHtml(row.label)}</td>
      <td style="padding:9px 0;${row.strong ? `border-top:1px solid ${BRAND.ink};` : ""}text-align:right;font-family:${FONT};font-size:${row.strong ? "16px" : "14px"};font-weight:${row.strong ? "700" : "600"};color:${BRAND.ink};vertical-align:top">${escapeEmailHtml(row.value)}</td>
    </tr>`,
      )
      .join("")}
  </table>`;
}

/**
 * The invoice's item table — a genuine table a person can read as a bill:
 * a header row, one row per line bought, quantities, unit prices and line
 * totals, with hairline separators and money aligned in its own column.
 */
export function emailItemsTable(
  items: Array<{
    title: string;
    detail?: string | null;
    image?: string | null;
    quantity: number;
    unitPrice: string;
    amount: string;
  }>,
): string {
  const cell = `font-family:${FONT};font-size:14px;color:${BRAND.text};padding:12px 0;border-top:1px solid ${BRAND.hairline};vertical-align:top`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;border-collapse:collapse">
    <tr>
      <td style="font-family:${FONT};font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:${BRAND.muted};padding:0 8px 8px 0">Item</td>
      <td width="52" style="font-family:${FONT};font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:${BRAND.muted};padding:0 8px 8px 0;text-align:center">Qty</td>
      <td width="92" style="font-family:${FONT};font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:${BRAND.muted};padding:0 0 8px 8px;text-align:right">Total</td>
    </tr>
    ${items
      .map(
        (item) => `<tr>
      <td style="${cell};padding-right:8px">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr>
            ${
              item.image
                ? `<td width="44" style="padding-right:12px;vertical-align:top">
                    <img alt="" src="${escapeEmailHtml(item.image)}" width="44" height="44" style="display:block;width:44px;height:44px;border-radius:6px;object-fit:cover;border:0" />
                  </td>`
                : ""
            }
            <td style="vertical-align:top">
              <p style="margin:0;font-family:${FONT};font-size:14px;font-weight:600;color:${BRAND.ink};line-height:1.4;word-break:break-word">${escapeEmailHtml(item.title)}</p>
              ${item.detail ? `<p style="margin:2px 0 0;font-family:${FONT};font-size:13px;color:${BRAND.muted};line-height:1.4">${escapeEmailHtml(item.detail)}</p>` : ""}
            </td>
          </tr>
        </table>
      </td>
      <td style="${cell};text-align:center;font-variant-numeric:tabular-nums">${item.quantity}</td>
      <td style="${cell};text-align:right;font-weight:600;color:${BRAND.ink};font-variant-numeric:tabular-nums">${escapeEmailHtml(item.amount)}</td>
    </tr>`,
      )
      .join("")}
  </table>`;
}

/** Quiet explanatory copy. */
export function emailParagraph(text: string): string {
  return `<p style="margin:0 0 14px;font-family:${FONT};font-size:15px;line-height:1.65;color:${BRAND.text}">${text}</p>`;
}

/** A light panel for content that stands alone — a seller note, a quoted message. */
export function emailPanel(inner: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0;border:1px solid ${BRAND.hairline};border-radius:8px;background:${BRAND.snow}">
    <tr>
      <td style="padding:16px 18px">${inner}</td>
    </tr>
  </table>`;
}

/**
 * The shell every message lives in.
 *
 * Three layers: the ground (a quiet neutral field), the card (one sheet of
 * white paper with the accent hairline, the message and its action), and the
 * footer (who sent this and why). The brand lockup sits above the card, so the
 * message is identifiable even where images are blocked.
 */
export function brandShell({
  title,
  preheader,
  body,
}: {
  /** The message's one-line headline. */
  title: string;
  /** The preview text shown beside the subject in the inbox. */
  preheader: string;
  /** The message body — built with the helpers above. */
  body: string;
}): string {
  return `<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <meta name="x-apple-disable-message-reformatting" />
    <title>${escapeEmailHtml(title)}</title>
    <style>
      /* Small screens only; every rule has an inline fallback. */
      @media only screen and (max-width: 600px) {
        .rc-shell { padding: 20px 12px !important; }
        .rc-card { padding: 24px 18px !important; }
        .rc-title { font-size: 20px !important; }
        .rc-code { font-size: 24px !important; letter-spacing: .16em !important; }
        .rc-button a { display: block !important; text-align: center !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background:${BRAND.background};font-family:${FONT};color:${BRAND.text}">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeEmailHtml(preheader)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.background}">
      <tr>
        <td class="rc-shell" style="padding:32px 16px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;margin:0 auto">
            <tr>
              <td style="padding:0 2px 18px">
                ${brandLockup()}
              </td>
            </tr>
            <tr>
              <td class="rc-card" style="background:#ffffff;border:1px solid ${BRAND.hairline};border-radius:12px;padding:32px 28px">
                ${accentRule()}
                <h1 class="rc-title" style="margin:0 0 16px;font-family:${FONT};font-size:22px;line-height:1.3;font-weight:700;letter-spacing:-0.015em;color:${BRAND.ink}">${escapeEmailHtml(title)}</h1>
                ${body}
              </td>
            </tr>
            <tr>
              <td style="padding:26px 2px 0">
                <p style="margin:0 0 8px;font-family:${FONT};font-size:12px;line-height:1.7;color:${BRAND.muted}">
                  Sent by <strong style="color:${BRAND.ink}">Rush Cart</strong> — Discover products. Shop independent stores.
                </p>
                <p style="margin:0 0 8px;font-family:${FONT};font-size:12px;line-height:1.7;color:${BRAND.muted}">
                  <a href="${platformConfig.appUrl}" style="color:${BRAND.irisDeep};text-decoration:none">Visit Rush Cart</a>
                  &nbsp;·&nbsp;
                  <a href="${platformConfig.appUrl}/orders" style="color:${BRAND.irisDeep};text-decoration:none">Your orders</a>
                  &nbsp;·&nbsp;
                  <a href="${platformConfig.appUrl}/settings" style="color:${BRAND.irisDeep};text-decoration:none">Account settings</a>
                </p>
                <p style="margin:0;font-family:${FONT};font-size:12px;line-height:1.7;color:${BRAND.muted}">
                  This is a transactional message about your Rush Cart account or order. For questions about a purchase, contact the seller from your order page.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/** The plain-text counterpart every message must carry. */
export function brandText(lines: string[]): string {
  return [...lines, "", "— Rush Cart · Discover products. Shop independent stores."].join("\n");
}
