/**
 * Transactional email.
 *
 * Sent through Resend's HTTP API — a plain POST, no SDK — so the only thing
 * needed to turn mail on is `RESEND_API_KEY`. Everything is composed here from
 * real rows: an invoice is the order's own items and totals, a ticket email is
 * the buyer's own tickets with their own scannable codes. Every message wears
 * the Rush Cart shell from `lib/server/email-templates.ts` — the LINK ICON
 * mark, one strong hierarchy, one clear action, a professional footer.
 *
 * Sending never throws into a fulfilment path. A failed email is reported back
 * to the caller, and the order stays exactly as it was — the money and the
 * fulfilment are the source of truth, not the mail.
 */

import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { emailSafetyError, escapeEmailHtml, isProductionEmailUrl } from "../email-safety";


import {
  brandShell,
  brandText,
  emailButton,
  emailCode,
  emailItemsTable,
  emailLink,
  emailParagraph,
  emailPanel,
  emailRows,
} from "./email-templates";
import { execute, query, queryOne } from "../db";
import { isEmailConfigured, platformConfig, resendConfig } from "../env";
import { formatDateTime, nowIso } from "../format";
import { newId } from "../ids";
import { formatMoney } from "../money";
import type { OrderItemRow, OrderRow } from "../types";

export type EmailResult =
  | { ok: true; id: string; duplicate?: boolean }
  | { ok: false; error: string; skipped?: boolean };

/** What an email *is*, so its outcome can be read back per order. */
export type EmailKind =
  | "invoice"
  | "update"
  | "test"
  | "auth"
  | "welcome"
  | "password-reset"
  | "password-changed"
  | "payment-request"
  | "payment-received"
  | "payment-failed"
  | "payment-cancelled"
  | "seller-order"
  | "refund"
  | "refund-seller"
  | "order-completed"
  | "order-cancelled"
  | "payout"
  | "message";

export type EmailDeliveryRow = {
  id: string;
  order_id: string | null;
  store_id: string | null;
  kind: EmailKind;
  recipient: string;
  subject: string | null;
  status: "sent" | "failed" | "skipped";
  error: string | null;
  provider_id: string | null;
  created_at: string;
};

export type EmailMeta = {
  orderId?: string | null;
  storeId?: string | null;
  kind?: EmailKind;
  /**
   * Names the event this message reports — `completed:ord_123`, `refund:ord_123`.
   *
   * One key, one email: a repeated trigger of the same event (a webhook and a
   * return page racing, a retried action, two code paths closing the same
   * order) finds the key already recorded and sends nothing. Only "sent"
   * outcomes hold a key, so a failed send is always retriable.
   */
  dedupeKey?: string | null;
};

/**
 * Sends a message and records what happened.
 *
 * The record is written whether the send succeeded or not, because "no invoice
 * arrived" needs an answer the seller can look up rather than a line in a
 * server log they will never read.
 */
export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string | null;
  meta?: EmailMeta;
}): Promise<EmailResult> {
  const dedupeKey = input.meta?.dedupeKey ?? null;

  // Idempotency, before anything leaves the building: the same event never
  // sends twice, no matter how many paths trigger it.
  if (dedupeKey) {
    try {
      const prior = await queryOne<{ provider_id: string | null }>(
        `SELECT provider_id FROM email_deliveries
          WHERE dedupe_key = ? AND status = 'sent' LIMIT 1`,
        [dedupeKey],
      );
      if (prior) {
        return { ok: true, id: prior.provider_id ?? "", duplicate: true };
      }
    } catch (error) {
      // The record-keeping table cannot answer right now. Sending is the
      // stronger obligation here — a missing receipt must not swallow a real
      // security or money email.
      console.error("[mail] dedupe lookup failed; sending anyway", error);
    }
  }

  const result = await deliverEmail(input);

  // Development only: every composed message is also written to a local
  // outbox, so the exact HTML, text and subject that were sent can be inspected
  // (and audited) instead of guessed at. Nothing like this runs in production.
  if (process.env.NODE_ENV !== "production") {
    try {
      const dir = path.join(process.cwd(), ".email-outbox");
      await mkdir(dir, { recursive: true });
      const stamp = `${nowIso().replace(/[:.]/g, "-")}-${input.meta?.kind ?? "test"}`;
      await writeFile(
        path.join(dir, `${stamp}.json`),
        JSON.stringify(
          {
            to: input.to,
            subject: input.subject,
            text: input.text,
            html: input.html,
            kind: input.meta?.kind ?? "test",
            dedupeKey: input.meta?.dedupeKey ?? null,
            outcome: result.ok ? "sent" : result.skipped ? "skipped" : "failed",
          },
          null,
          2,
        ),
      );
    } catch (error) {
      console.error("[mail] could not write the dev outbox", error);
    }
  }

  // Recording is best-effort: it must never turn a sent email into an error.
  // A key is held only by a "sent" row — the unique index on the column is the
  // last line of defence against two callers racing past the lookup above.
  try {
    await execute(
      `INSERT INTO email_deliveries
         (id, order_id, store_id, kind, recipient, subject, status, error, provider_id, dedupe_key, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newId("mail"),
        input.meta?.orderId ?? null,
        input.meta?.storeId ?? null,
        input.meta?.kind ?? "test",
        input.to,
        input.subject,
        result.ok ? "sent" : result.skipped ? "skipped" : "failed",
        result.ok ? null : result.error,
        result.ok ? result.id : null,
        result.ok ? dedupeKey : null,
        nowIso(),
      ],
    );
  } catch (error) {
    if (dedupeKey && result.ok) {
      // The index refused the row: somebody else sent this very event first.
      return { ok: true, id: result.id, duplicate: true };
    }
    console.error("[mail] could not record delivery", error);
  }

  return result;
}

/** The actual POST to Resend. Kept separate so recording wraps every path. */
async function deliverEmail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string | null;
  meta?: EmailMeta;
}): Promise<EmailResult> {
  if (!isEmailConfigured) {
    return { ok: false, error: "Email is not configured.", skipped: true };
  }

  const safetyError = emailSafetyError(input, platformConfig.appUrl);
  if (safetyError) return { ok: false, error: safetyError };
  if (!resendConfig.from || /[\r\n]/.test(resendConfig.from) || /@resend\.dev\b/i.test(resendConfig.from)) {
    return { ok: false, error: "Configure an authenticated sender address before sending email." };
  }

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.to)) {
    return { ok: false, error: "That address is not a valid email." };
  }

  const replyTo = input.replyTo || resendConfig.replyTo;
  if (replyTo && !/^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/.test(replyTo)) return { ok: false, error: "The reply address is not valid." };
  try {
    const response = await fetch("https://api.resend.com/emails", {
      signal: AbortSignal.timeout(15000),
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendConfig.apiKey}`,
        "Content-Type": "application/json",
        ...(input.meta?.dedupeKey ? { "Idempotency-Key": `rush-cart/${createHash("sha256").update(input.meta.dedupeKey).digest("hex")}` } : {}),
      },
      body: JSON.stringify({
        from: resendConfig.from,
        // The logo rides inside the message itself. `content_type` is stated
        // explicitly on purpose: the provider would otherwise treat the part
        // as `application/octet-stream`, and clients then refuse to render the
        // `cid:` reference — the logo "sent" but never appeared.
        attachments: [{
          filename: "rush-cart-logo.png",
          content: (await readFile(path.join(process.cwd(), "public/brand/rush-cart-logo.png"))).toString("base64"),
          content_type: "image/png",
          content_id: "rush-cart-logo",
        }],
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
        ...((input.replyTo || resendConfig.replyTo) ? { reply_to: input.replyTo || resendConfig.replyTo } : {}),
      }),
    });

    const payload = (await response.json().catch(() => null)) as {
      id?: string;
      message?: string;
    } | null;

    if (!response.ok) {
      return {
        ok: false,
        error: "The email could not be delivered. Please try again later.",
      };
    }

    return { ok: true, id: payload?.id ?? "" };
  } catch {
    return {
      ok: false,
      error: "The email could not be sent. Please try again later.",
    };
  }
}

export type InvoiceOutcome = {
  sent: boolean;
  error?: string;
  skipped?: boolean;
};

/**
 * What kind of purchase this is, in the buyer's own words.
 *
 * A food order says "food order", a chat-settled deal says "payment" — the
 * email speaks the vocabulary of the thing that happened, never a generic
 * warehouse voice over every kind of commerce.
 */
function orderTone(order: OrderRow): {
  subject: (orderNumber: string) => string;
  title: string;
  noun: string;
} {
  const chat = order.source === "chat";

  if (chat) {
    return {
      subject: (n) => `Your payment was successful · ${n}`,
      title: "Payment received",
      noun: "payment",
    };
  }
  return {
    subject: (n) => `Your order is confirmed · ${n}`,
    title: "Your order is confirmed",
    noun: "order",
  };
}

/** The first photo of an ordered item, when the listing has one. */
async function orderItemImage(item: OrderItemRow): Promise<string | null> {
  if (!item.listing_id) return null;
  const row = await queryOne<{ image_url: string }>(
    `SELECT image_url FROM listing_images WHERE listing_id = ? ORDER BY position ASC, created_at ASC LIMIT 1`,
    [item.listing_id],
  );
  return row?.image_url && isProductionEmailUrl(row.image_url) ? row.image_url : null;
}

/**
 * The buyer's order confirmation and receipt for a paid order.
 *
 * One email per order: what was bought (each line with its quantity and price,
 * its photo when the listing has one), the totals, the payment and fulfilment
 * facts, the delivery address when there is one, and a link back to the order
 * page where the buyer can follow its status. The wording follows what was
 * actually bought — a food order reads like a food order.
 */
function readableShippingAddress(value: string): string {
  try { const parsed = JSON.parse(value); return Object.values(parsed).filter(value => typeof value === "string" && value.trim()).join("\n"); } catch { return value; }
}

export async function sendOrderInvoice(orderId: string): Promise<InvoiceOutcome> {
  const order = await queryOne<OrderRow>("SELECT * FROM orders WHERE id = ?", [orderId]);
  if (!order) return { sent: false, error: "That order does not exist." };
  if (order.payment_status !== "paid") return { sent: false, error: "A receipt is available after payment is confirmed." };

  const items = await query<OrderItemRow>(
    "SELECT * FROM order_items WHERE order_id = ? ORDER BY created_at ASC",
    [orderId],
  );

  const store = await queryOne<{ name: string; slug: string }>(
    "SELECT name, slug FROM stores WHERE id = ?",
    [order.store_id],
  );

  const currency = order.currency;
  const money = (amount: number) => formatMoney(amount, currency);
  const tone = orderTone(order);

  // Each bought line as a real invoice row: photo, name, quantity, unit price
  // and the line total in its own column. Long names wrap; money never moves.
  const itemRows = await Promise.all(
    items.map(async (item) => ({
      title: item.title,
      detail: [item.variant_name, `${item.quantity} × ${money(Number(item.unit_price))}`]
        .filter(Boolean)
        .join(" · "),
      image: await orderItemImage(item),
      quantity: item.quantity,
      unitPrice: money(Number(item.unit_price)),
      amount: money(item.total),
    })),
  );

  const totals = [
    { label: "Subtotal", value: money(order.subtotal) },
    ...(order.discount_total > 0
      ? [
          {
            label: `Discount${order.discount_code ? ` (${order.discount_code})` : ""}`,
            value: `−${money(order.discount_total)}`,
          },
        ]
      : []),
    ...(order.shipping_total > 0 ? [{ label: "Delivery", value: money(order.shipping_total) }] : []),
    ...(order.tax_total > 0 ? [{ label: "Tax", value: money(order.tax_total) }] : []),
    { label: "Total paid", value: money(order.total), strong: true },
  ];

  const facts = [
    { label: "Order", value: order.order_number },
    { label: "Order date", value: formatDateTime(order.created_at) },
    { label: "Payment", value: `Paid${order.paid_at ? ` · ${formatDateTime(order.paid_at)}` : ""}` },
    { label: "Seller", value: store?.name ?? "The seller" },
    ...(order.fulfilment_method === "pickup"
      ? [{ label: "Fulfilment", value: "Pickup" }]
      : order.fulfilment_method === "delivery"
        ? [
            {
              label: "Fulfilment",
              value: order.estimated_delivery ? `Delivery · ${order.estimated_delivery}` : "Delivery",
            },
          ]
        : []),
  ];

  const orderUrl = `${platformConfig.appUrl}/orders/${order.access_token}`;

  const html = brandShell({
    title: tone.title,
    preheader: `${money(order.total)} paid to ${store?.name ?? "the seller"}. Your receipt and order details are inside.`,
    body: [
      emailParagraph(
        `Thanks${order.customer_name ? `, ${escapeEmailHtml(order.customer_name)}` : ""}. Your ${tone.noun} from <strong>${escapeEmailHtml(store?.name ?? "the seller")}</strong> is confirmed and paid.`,
      ),
      emailRows(facts),
      ...(order.customer_name || order.email
        ? [
            emailRows([
              { label: "Billed to", value: [order.customer_name, order.email].filter(Boolean).join(" · ") },
            ]),
          ]
        : []),
      emailItemsTable(itemRows),
      emailRows(totals),
      order.shipping_address
        ? emailParagraph(
            `<strong>Delivering to</strong><br>${escapeEmailHtml(readableShippingAddress(order.shipping_address)).replace(/\n/g, "<br>")}`,
          )
        : "",
      emailButton("View your order", orderUrl),
      store
        ? emailParagraph(
            `Bought from <a href="${platformConfig.appUrl}/@${store.slug}" style="color:#554695">${escapeEmailHtml(store.name)}</a>.`,
          )
        : "",
    ].join(""),
  });

  const text = brandText([
    `${tone.title} · ${order.order_number}`,
    store ? `Seller: ${store.name}` : "",
    "",
    ...items.map(
      (item) =>
        `${item.title}${item.variant_name ? ` (${item.variant_name})` : ""} × ${item.quantity} @ ${money(Number(item.unit_price))} = ${money(item.total)}`,
    ),
    "",
    `Subtotal: ${money(order.subtotal)}`,
    order.discount_total > 0 ? `Discount: −${money(order.discount_total)}` : "",
    order.shipping_total > 0 ? `Delivery: ${money(order.shipping_total)}` : "",
    `Total paid: ${money(order.total)}`,
    "",
    `View your order: ${orderUrl}`,
  ].filter(Boolean) as string[]);

  const result = await sendEmail({
    to: order.email,
    subject: tone.subject(order.order_number),
    html,
    text,
    meta: { orderId: order.id, storeId: order.store_id, kind: "invoice" },
  });

  return result.ok ? { sent: true } : { sent: false, error: result.error, skipped: result.skipped };
}

export async function sendOrderEmails(orderId: string): Promise<{ invoice: InvoiceOutcome }> { return { invoice: await sendOrderInvoice(orderId) }; }

/**
 * What was emailed for an order, newest first.
 *
 * This is what makes the invoice status on the order page honest: the seller
 * sees the real outcome of the real attempt, not an assumption that mail went
 * out because the order says "paid".
 */
export async function listEmailsForOrder(orderId: string): Promise<EmailDeliveryRow[]> {
  return query<EmailDeliveryRow>(
    "SELECT * FROM email_deliveries WHERE order_id = ? ORDER BY created_at DESC",
    [orderId],
  );
}

/**
 * A fulfilment update: the seller shipped it, it is out for delivery, it is
 * ready to collect, it arrived.
 *
 * Real data from the shipment record only — the status the seller recorded, the
 * place they reported, when they reported it — and the buyer's own tracking
 * link. Never sent for a mere location tweak, only for the milestones a buyer
 * is waiting on. Never throws: mail is not allowed to break fulfilment.
 */
export async function sendShipmentUpdateEmail(input: {
  order: Pick<OrderRow, "id" | "email" | "order_number" | "access_token" | "store_id" | "customer_name">;
  statusLabel: string;
  note: string | null;
  location: string | null;
  at: string;
  method: "delivery" | "pickup";
}): Promise<void> {
  try {
    const store = await queryOne<{ name: string }>("SELECT name FROM stores WHERE id = ?", [
      input.order.store_id,
    ]);
    const orderUrl = `${platformConfig.appUrl}/orders/${input.order.access_token}`;

    const facts = [
      { label: "Order", value: input.order.order_number },
      { label: "Status", value: input.statusLabel, strong: true },
      { label: "Reported", value: formatDateTime(input.at) },
      ...(input.location ? [{ label: "Location", value: input.location }] : []),
    ];

    const html = brandShell({
      title: `${input.order.order_number} · ${input.statusLabel}`,
      preheader: `Your ${input.method === "pickup" ? "order" : "delivery"} update from ${store?.name ?? "the seller"}: ${input.statusLabel}.`,
      body: [
        emailParagraph(
          `Hi${input.order.customer_name ? ` ${escapeEmailHtml(input.order.customer_name)}` : ""}. Here is the latest on your order from <strong>${escapeEmailHtml(store?.name ?? "the seller")}</strong>.`,
        ),
        emailRows(facts),
        input.note ? emailPanel(emailParagraph(escapeEmailHtml(input.note))) : "",
        emailParagraph(
          "This update was reported by the seller. This platform does not use live GPS tracking. The status above is exactly what the seller recorded.",
        ),
        emailButton("Open your order", orderUrl),
      ].join(""),
    });

    const text = brandText([
      `${input.order.order_number} · ${input.statusLabel}`,
      `Reported: ${formatDateTime(input.at)}`,
      input.location ? `Location: ${input.location}` : "",
      input.note ? input.note : "",
      "",
      "Reported by the seller. This platform does not use live GPS tracking.",
      `Open your order: ${orderUrl}`,
    ].filter(Boolean) as string[]);

    await sendEmail({
      to: input.order.email,
      subject: `${input.order.order_number} · ${input.statusLabel}`,
      html,
      text,
      meta: { orderId: input.order.id, storeId: input.order.store_id, kind: "update" },
    });
  } catch (error) {
    console.error(`[mail] shipment update for ${input.order.id} failed`, error);
  }
}

/**
 * Resends an order's invoice (and its tickets, when it has them).
 *
 * Used when a buyer did not receive mail, or when a send failed while payments
 * were being configured. The order is already paid, so this only sends — it
 * never re-fulfils, re-charges or re-issues tickets.
 */
export async function resendOrderEmails(orderId: string): Promise<{
  ok: boolean;
  error?: string;
  skipped?: boolean;
  orderId: string;
}> {
  const order = await queryOne<{ id: string }>("SELECT id FROM orders WHERE id = ?", [orderId]);
  if (!order) return { ok: false, error: "That order does not exist.", orderId };

  const outcome = await sendOrderEmails(orderId);

  if (!outcome.invoice.sent) {
    return {
      ok: false,
      error: outcome.invoice.error ?? "The invoice could not be sent.",
      skipped: outcome.invoice.skipped,
      orderId,
    };
  }

  return { ok: true, orderId };
}

/**
 * A sign-in code.
 *
 * The authentication engine decides *when* a code is needed and what it is;
 * the mail itself is composed here, in Rush Cart's own shell, so nothing in
 * the message belongs to the engine that generated it. The code is also
 * printed as text next to the styled block, so it stays readable and copyable
 * in a client that blocks styling.
 */
export async function sendSignInCodeEmail(input: {
  to: string;
  code: string;
  expiresInMinutes: number;
}): Promise<EmailResult> {
  const minutes = Math.max(1, Math.round(input.expiresInMinutes));

  const html = brandShell({
    title: "Your sign-in code",
    preheader: `${input.code}. It expires in ${minutes} minutes.`,
    body: [
      emailParagraph(
        `Enter this code to finish signing in. It expires in ${minutes} minutes.`,
      ),
      emailCode(input.code, { spaced: true }),
      emailParagraph(
        "If you did not try to sign in, someone may have mistyped their address. You can ignore this email. No one can get in without the code above.",
      ),
    ].join(""),
  });

  const text = brandText([
    "Your Rush Cart sign-in code",
    "",
    input.code.split("").join(" "),
    "",
    `It expires in ${minutes} minutes.`,
    "If you did not try to sign in, you can ignore this email.",
  ]);

  return sendEmail({
    to: input.to,
    subject: `${input.code} is your Rush Cart code`,
    html,
    text,
    meta: { kind: "auth" },
  });
}

/**
 * Welcome — sent once, when an account is created.
 *
 * It greets the new account by name and points at the one thing that matters
 * first: their storefront link. Best-effort by design: a welcome message must
 * never stand between a person and their account.
 */
export async function sendWelcomeEmail(input: {
  to: string;
  name: string;
}): Promise<EmailResult> {
  const workspaceUrl = `${platformConfig.appUrl}/workspace`;

  const html = brandShell({
    title: `Welcome to Rush Cart, ${input.name}`,
    preheader: "Your account is ready. Your whole world of selling now lives at one link.",
    body: [
      emailParagraph(
        `Your account is live, ${escapeEmailHtml(input.name)}. You can discover products, message sellers and keep track of your orders.`,
      ),
      emailParagraph("Open your workspace to create your storefront and add what you sell."),
      emailButton("Open your workspace", workspaceUrl),
      emailParagraph(
        "Bought something instead? Your orders and receipts stay together in your account.",
      ),
    ].join(""),
  });

  const text = brandText([
    `Welcome to Rush Cart, ${input.name}`,
    "",
    "Your account is live. Open your workspace to create your storefront and add what you sell:",
    workspaceUrl,
  ]);

  return sendEmail({
    to: input.to,
    subject: "Welcome to Rush Cart",
    html,
    text,
    meta: { kind: "welcome" },
  });
}

/**
 * The password-reset link.
 *
 * The link is time-limited and single-use: the engine consumes it the moment
 * the password is set. This is the only message that carries the key to an
 * account, so it says plainly what to do when the request was not the account
 * owner's.
 */
export async function sendPasswordResetEmail(input: {
  to: string;
  name: string;
  resetUrl: string;
  expiresInMinutes: number;
}): Promise<EmailResult> {
  const minutes = Math.max(1, Math.round(input.expiresInMinutes));

  const html = brandShell({
    title: "Reset your password",
    preheader: `A password reset was requested for your Rush Cart account. The link expires in ${minutes} minutes.`,
    body: [
      emailParagraph(
        `Hi ${escapeEmailHtml(input.name)}, someone asked to reset the password on this Rush Cart account. The link below sets a new one. It works once and expires in ${minutes} minutes.`,
      ),
      emailButton("Choose a new password", input.resetUrl),
      emailLink("Reset your password", input.resetUrl),
      emailParagraph(
        "If you did not ask for this, you can ignore this email. Your password stays exactly as it is.",
      ),
    ].join(""),
  });

  const text = brandText([
    "Reset your Rush Cart password",
    "",
    `Hi ${input.name}, someone asked to reset the password on this account.`,
    `Choose a new password (valid once, ${minutes} minutes):`,
    input.resetUrl,
    "",
    "If you did not ask for this, ignore this email. Your password is unchanged.",
  ]);

  return sendEmail({
    to: input.to,
    subject: "Reset your Rush Cart password",
    html,
    text,
    meta: { kind: "password-reset" },
  });
}

/**
 * Confirmation that a password changed.
 *
 * Sent after the fact, never before: this message reports a completed security
 * event, so it is what tells an account owner that someone else got in — while
 * there is still time to act.
 */
export async function sendPasswordChangedEmail(input: {
  to: string;
  name: string;
}): Promise<EmailResult> {
  const signInUrl = `${platformConfig.appUrl}/sign-in`;

  const html = brandShell({
    title: "Your password was changed",
    preheader: "The password on your Rush Cart account was just updated.",
    body: [
      emailParagraph(
        `Hi ${escapeEmailHtml(input.name)}, the password on your Rush Cart account was just changed. Your existing sessions were signed out.`,
      ),
      emailParagraph(
        "If this was you, there is nothing to do. If it was not, reset your password immediately from the sign-in screen and review your account.",
      ),
      emailButton("Go to sign in", signInUrl),
    ].join(""),
  });

  const text = brandText([
    "Your Rush Cart password was changed",
    "",
    `Hi ${input.name}, the password on your account was just changed. Your existing sessions were signed out.`,
    "If this was not you, reset your password immediately from the sign-in screen.",
  ]);

  return sendEmail({
    to: input.to,
    subject: "Your Rush Cart password was changed",
    html,
    text,
    meta: { kind: "password-changed" },
  });
}

/* -------------------------------------------------------------------------- */
/* Payment requests — the money agreed in a conversation                       */
/* -------------------------------------------------------------------------- */

/** The store owner's own address — read from the account record, never a client. */
export async function storeOwnerContact(
  storeId: string,
): Promise<{ email: string; name: string } | null> {
  return queryOne<{ email: string; name: string }>(
    `SELECT u.email, u.name FROM users u JOIN stores s ON s.user_id = u.id WHERE s.id = ?`,
    [storeId],
  );
}

/**
 * A payment request has arrived — the buyer's side.
 *
 * Who asked, for how much, for what, and where to open it. The link lands in
 * the conversation the request lives in, which is the only place it can be
 * paid, so there is exactly one place to go.
 */
export async function sendPaymentRequestEmail(input: {
  buyerEmail: string;
  buyerName: string | null;
  sellerName: string;
  amountMinor: number;
  currency: string;
  description: string | null;
  contextTitle: string | null;
  conversationId: string;
  paymentRequestId: string;
}): Promise<EmailResult> {
  const amount = formatMoney(input.amountMinor, input.currency);
  const conversationUrl = `${platformConfig.appUrl}/messages/${input.conversationId}`;

  const facts = [
    { label: "From", value: input.sellerName },
    ...(input.contextTitle ? [{ label: "For", value: input.contextTitle }] : []),
    ...(input.description ? [{ label: "About", value: input.description }] : []),
    { label: "Amount", value: amount, strong: true },
    { label: "Status", value: "Awaiting payment" },
  ];

  const html = brandShell({
    title: `You have a payment request from ${input.sellerName}`,
    preheader: `${input.sellerName} is requesting ${amount}. Open the conversation to review and pay it.`,
    body: [
      emailParagraph(
        `Hi${input.buyerName ? ` ${escapeEmailHtml(input.buyerName)}` : ""}, <strong>${escapeEmailHtml(input.sellerName)}</strong> sent you a payment request in your conversation.`,
      ),
      emailRows(facts),
      emailParagraph(
        "Nothing has been charged. Review the request and pay it only when you are happy with what was agreed.",
      ),
      emailButton("Open the payment request", conversationUrl),
    ].join(""),
  });

  const text = brandText([
    `You have a payment request from ${input.sellerName}`,
    "",
    input.contextTitle ? `For: ${input.contextTitle}` : "",
    input.description ? `About: ${input.description}` : "",
    `Amount: ${amount}`,
    "Status: Awaiting payment",
    "",
    "Nothing has been charged yet.",
    `Open the payment request: ${conversationUrl}`,
  ].filter(Boolean) as string[]);

  return sendEmail({
    to: input.buyerEmail,
    subject: `You have a payment request from ${input.sellerName}`,
    html,
    text,
    meta: {
      kind: "payment-request",
      dedupeKey: `payment-request:${input.paymentRequestId}`,
    },
  });
}

/**
 * A payment request was withdrawn — the buyer's side.
 *
 * Sent only when the seller actually cancelled it, so the card in the thread
 * and the inbox never tell different stories.
 */
export async function sendPaymentRequestCancelledEmail(input: {
  buyerEmail: string;
  buyerName: string | null;
  sellerName: string;
  amountMinor: number;
  currency: string;
  conversationId: string;
  paymentRequestId: string;
}): Promise<EmailResult> {
  const amount = formatMoney(input.amountMinor, input.currency);
  const conversationUrl = `${platformConfig.appUrl}/messages/${input.conversationId}`;

  const html = brandShell({
    title: "A payment request was cancelled",
    preheader: `${input.sellerName} withdrew the ${amount} payment request. Nothing was charged.`,
    body: [
      emailParagraph(
        `Hi${input.buyerName ? ` ${escapeEmailHtml(input.buyerName)}` : ""}, <strong>${escapeEmailHtml(input.sellerName)}</strong> cancelled the ${amount} payment request from your conversation.`,
      ),
      emailParagraph("Nothing was charged. If you still want to go ahead, reply in the conversation."),
      emailButton("Open the conversation", conversationUrl),
    ].join(""),
  });

  const text = brandText([
    "A payment request was cancelled",
    "",
    `${input.sellerName} cancelled the ${amount} payment request. Nothing was charged.`,
    `Open the conversation: ${conversationUrl}`,
  ]);

  return sendEmail({
    to: input.buyerEmail,
    subject: "A payment request was cancelled",
    html,
    text,
    meta: {
      kind: "payment-cancelled",
      dedupeKey: `payment-cancelled:${input.paymentRequestId}`,
    },
  });
}

/**
 * A payment request was paid — the seller's side.
 *
 * Money truth only: this goes out after Paystack has been verified and the
 * payment claimed, never on the buyer's word. Exactly once per request — the
 * claim that moves the request to paid is the same event that sends this.
 */
export async function sendPaymentReceivedEmail(input: {
  sellerEmail: string;
  sellerName: string | null;
  buyerName: string | null;
  amountMinor: number;
  currency: string;
  description: string | null;
  contextTitle: string | null;
  conversationId: string;
  paymentRequestId: string;
}): Promise<EmailResult> {
  const amount = formatMoney(input.amountMinor, input.currency);
  const conversationUrl = `${platformConfig.appUrl}/messages/${input.conversationId}`;

  const facts = [
    { label: "Amount", value: amount, strong: true },
    { label: "From", value: input.buyerName ?? "Your customer" },
    ...(input.contextTitle ? [{ label: "For", value: input.contextTitle }] : []),
    ...(input.description ? [{ label: "About", value: input.description }] : []),
  ];

  const html = brandShell({
    title: "You've been paid",
    preheader: `${amount} has been paid${input.buyerName ? ` by ${input.buyerName}` : ""}.`,
    body: [
      emailParagraph(
        `Hi${input.sellerName ? ` ${escapeEmailHtml(input.sellerName)}` : ""}, the payment request in your conversation has been paid in full.`,
      ),
      emailRows(facts),
      emailParagraph(
        "The payment was verified with the provider before this email was sent. Earnings appear in your finance page.",
      ),
      emailButton("Open the conversation", conversationUrl),
    ].join(""),
  });

  const text = brandText([
    "You've been paid",
    "",
    `Amount: ${amount}`,
    input.buyerName ? `From: ${input.buyerName}` : "",
    input.contextTitle ? `For: ${input.contextTitle}` : "",
    "",
    `Open the conversation: ${conversationUrl}`,
  ].filter(Boolean) as string[]);

  return sendEmail({
    to: input.sellerEmail,
    subject: `Your payment request was paid · ${amount}`,
    html,
    text,
    meta: {
      storeId: null,
      kind: "payment-received",
      dedupeKey: `payment-received:${input.paymentRequestId}`,
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Order events — completion, cancellation, refunds, failures                  */
/* -------------------------------------------------------------------------- */

/**
 * The payment did not go through — the buyer's side.
 *
 * Sent only from a server-verified failure, never from a browser claim, and
 * exactly once per payment however many verification paths see the failure.
 */
export async function sendPaymentFailedEmail(input: {
  to: string;
  name: string | null;
  orderNumber: string;
  amountMinor: number;
  currency: string;
  reason: string | null;
  ctaUrl: string;
  paymentId: string;
  orderId: string | null;
  storeId: string | null;
}): Promise<EmailResult> {
  const amount = formatMoney(input.amountMinor, input.currency);

  const html = brandShell({
    title: "Your payment did not go through",
    preheader: `${amount} for ${input.orderNumber} was not successful. Your order is not confirmed. Contact your bank if you see a pending debit.`,
    body: [
      emailParagraph(
        `Hi${input.name ? ` ${escapeEmailHtml(input.name)}` : ""}, the payment of <strong>${amount}</strong> for ${escapeEmailHtml(input.orderNumber)} was not successful, so the order has not been paid.`,
      ),
      emailRows([
        { label: "Order", value: input.orderNumber },
        { label: "Amount", value: amount },
        { label: "Status", value: "Not paid", strong: true },
        ...(input.reason ? [{ label: "Reason", value: input.reason }] : []),
      ]),
      emailParagraph(
        "You can try again from your order — your order has not been confirmed.",
      ),
      emailButton("Try again", input.ctaUrl),
    ].join(""),
  });

  const text = brandText([
    "Your payment did not go through",
    "",
    `Order: ${input.orderNumber}`,
    `Amount: ${amount}`,
    input.reason ? `Reason: ${input.reason}` : "",
    "",
    `Try again: ${input.ctaUrl}`,
  ].filter(Boolean) as string[]);

  return sendEmail({
    to: input.to,
    subject: `Your payment did not go through · ${input.orderNumber}`,
    html,
    text,
    meta: {
      orderId: input.orderId,
      storeId: input.storeId,
      kind: "payment-failed",
      dedupeKey: `payment-failed:${input.paymentId}`,
    },
  });
}

/**
 * A new paid order — the seller's side.
 *
 * The sale the seller is waiting on: who bought what, for how much, and how it
 * reaches the buyer. Buyer-only mail never comes here, and this never goes to
 * the buyer.
 */
export async function sendSellerOrderEmail(input: {
  sellerEmail: string;
  sellerName: string | null;
  orderId: string;
  storeId: string;
  orderNumber: string;
  customerName: string | null;
  itemSummary: string;
  amountMinor: number;
  currency: string;
  fulfilment: string;
}): Promise<EmailResult> {
  const amount = formatMoney(input.amountMinor, input.currency);
  // Linked by the human order number — no internal identifiers travel by mail.
  const orderUrl = `${platformConfig.appUrl}/workspace/orders/${encodeURIComponent(input.orderNumber)}`;

  const facts = [
    { label: "Order", value: input.orderNumber },
    { label: "Customer", value: input.customerName ?? "A customer" },
    { label: "Items", value: input.itemSummary },
    { label: "Total", value: amount, strong: true },
    { label: "Payment", value: "Paid" },
    { label: "Fulfilment", value: input.fulfilment },
  ];

  const html = brandShell({
    title: "New order",
    preheader: `${input.orderNumber} · ${amount}, paid and waiting for you.`,
    body: [
      emailParagraph(
        `Hi${input.sellerName ? ` ${escapeEmailHtml(input.sellerName)}` : ""}, you have a new paid order. The payment has been verified.`,
      ),
      emailRows(facts),
      emailButton("Open the order", orderUrl),
      emailParagraph("Prepare it and update its status from your workspace — the buyer is notified of every step."),
    ].join(""),
  });

  const text = brandText([
    "New order",
    "",
    `Order: ${input.orderNumber}`,
    `Customer: ${input.customerName ?? "A customer"}`,
    `Items: ${input.itemSummary}`,
    `Total: ${amount} (paid)`,
    `Fulfilment: ${input.fulfilment}`,
    "",
    `Open the order: ${orderUrl}`,
  ]);

  return sendEmail({
    to: input.sellerEmail,
    subject: `New order · ${input.orderNumber}`,
    html,
    text,
    meta: {
      orderId: input.orderId,
      storeId: input.storeId,
      kind: "seller-order",
      dedupeKey: `seller-order:${input.orderId}`,
    },
  });
}

/**
 * The order is completed — the buyer's side.
 *
 * Delivered, collected, or closed by the seller: the end of this order's story,
 * sent exactly once however many code paths reach the completed state.
 */
export async function sendOrderCompletedEmail(input: {
  order: Pick<OrderRow, "id" | "email" | "order_number" | "access_token" | "store_id" | "customer_name" | "total" | "currency">;
  method: "delivery" | "pickup" | "none";
  at: string;
}): Promise<void> {
  try {
    const store = await queryOne<{ name: string }>("SELECT name FROM stores WHERE id = ?", [
      input.order.store_id,
    ]);
    const orderUrl = `${platformConfig.appUrl}/orders/${input.order.access_token}`;
    const money = formatMoney(Number(input.order.total), input.order.currency);

    const closing = input.method === "pickup" ? "This order has been picked up." : input.method === "delivery" ? "This order has been delivered." : "Your agreed order has been completed.";

    const html = brandShell({
      title: "Your order is completed",
      preheader: `${input.order.order_number} is complete. ${closing}`,
      body: [
        emailParagraph(
          `Hi${input.order.customer_name ? ` ${escapeEmailHtml(input.order.customer_name)}` : ""}, good news: your order from <strong>${escapeEmailHtml(store?.name ?? "the seller")}</strong> is completed.`,
        ),
        emailRows([
          { label: "Order", value: input.order.order_number },
          { label: "Seller", value: store?.name ?? "The seller" },
          { label: "Total paid", value: money },
          { label: "Status", value: "Completed", strong: true },
        ]),
        emailParagraph(closing),
        emailButton("View your order", orderUrl),
        emailParagraph(
          "Something wrong with it? Contact the seller from your order page to discuss a resolution.",
        ),
      ].join(""),
    });

    const text = brandText([
      "Your order is completed",
      "",
      `Order: ${input.order.order_number}`,
      `Seller: ${store?.name ?? "The seller"}`,
      `Total paid: ${money}`,
      closing,
      "",
      `View your order: ${orderUrl}`,
    ]);

    await sendEmail({
      to: input.order.email,
      subject: `Your order is completed · ${input.order.order_number}`,
      html,
      text,
      meta: {
        orderId: input.order.id,
        storeId: input.order.store_id,
        kind: "order-completed",
        dedupeKey: `completed:${input.order.id}`,
      },
    });
  } catch (error) {
    console.error(`[mail] completion notice for ${input.order.id} failed`, error);
  }
}

/**
 * The order was cancelled — the buyer's side.
 *
 * Only for an order that never became paid (a paid order must be refunded
 * instead, and its refund mail tells that story).
 */
export async function sendOrderCancelledEmail(input: {
  order: Pick<OrderRow, "id" | "email" | "order_number" | "access_token" | "store_id" | "customer_name" | "total" | "currency">;
}): Promise<void> {
  try {
    const store = await queryOne<{ name: string }>("SELECT name FROM stores WHERE id = ?", [
      input.order.store_id,
    ]);
    const orderUrl = `${platformConfig.appUrl}/orders/${input.order.access_token}`;

    const html = brandShell({
      title: "Your order was cancelled",
      preheader: `${input.order.order_number} has been cancelled. Nothing has been charged.`,
      body: [
        emailParagraph(
          `Hi${input.order.customer_name ? ` ${escapeEmailHtml(input.order.customer_name)}` : ""}, your ${escapeEmailHtml(input.order.order_number)} with <strong>${escapeEmailHtml(store?.name ?? "the seller")}</strong> has been cancelled.`,
        ),
        emailParagraph(
          "Nothing has been charged. If you would like it after all, you can place the order again.",
        ),
        emailButton("View your order", orderUrl),
      ].join(""),
    });

    const text = brandText([
      "Your order was cancelled",
      "",
      `${input.order.order_number} has been cancelled. Nothing has been charged.`,
      `View your order: ${orderUrl}`,
    ]);

    await sendEmail({
      to: input.order.email,
      subject: `Your order was cancelled · ${input.order.order_number}`,
      html,
      text,
      meta: {
        orderId: input.order.id,
        storeId: input.order.store_id,
        kind: "order-cancelled",
        dedupeKey: `cancelled:${input.order.id}`,
      },
    });
  } catch (error) {
    console.error(`[mail] cancellation notice for ${input.order.id} failed`, error);
  }
}

/**
 * A refund was issued — both sides hear the same facts.
 *
 * Sent only after the provider accepted the refund, never before. The buyer's
 * copy says where their money is; the seller's copy says what left their
 * balance. Bank details never travel in either.
 */
export async function sendRefundEmails(input: {
  order: Pick<OrderRow, "id" | "email" | "order_number" | "access_token" | "store_id" | "customer_name" | "total" | "currency">;
}): Promise<void> {
  try {
    const store = await queryOne<{ name: string }>("SELECT name FROM stores WHERE id = ?", [
      input.order.store_id,
    ]);
    const owner = await storeOwnerContact(input.order.store_id);
    const orderUrl = `${platformConfig.appUrl}/orders/${input.order.access_token}`;
    const workspaceUrl = `${platformConfig.appUrl}/workspace/orders/${encodeURIComponent(input.order.order_number)}`;
    const money = formatMoney(Number(input.order.total), input.order.currency);

    await sendEmail({
      to: input.order.email,
      subject: `Your refund is on its way · ${input.order.order_number}`,
      html: brandShell({
        title: "Your refund was submitted",
        preheader: `${money} for ${input.order.order_number} has been submitted for return to your payment method.`,
        body: [
          emailParagraph(
            `Hi${input.order.customer_name ? ` ${escapeEmailHtml(input.order.customer_name)}` : ""}, a refund for your order with <strong>${escapeEmailHtml(store?.name ?? "the seller")}</strong> has been accepted for processing.`,
          ),
          emailRows([
            { label: "Order", value: input.order.order_number },
            { label: "Amount refunded", value: money, strong: true },
            { label: "Status", value: "Refund submitted" },
          ]),
          emailParagraph(
            "The money is going back to the payment method you paid with. Your bank controls how quickly it lands — usually a few working days.",
          ),
          emailButton("View your order", orderUrl),
        ].join(""),
      }),
      text: brandText([
        "Your order was refunded",
        "",
        `Order: ${input.order.order_number}`,
        `Amount refunded: ${money}`,
        "The money is returning to your payment method.",
        "",
        `View your order: ${orderUrl}`,
      ]),
      meta: {
        orderId: input.order.id,
        storeId: input.order.store_id,
        kind: "refund",
        dedupeKey: `refund:${input.order.id}`,
      },
    });

    if (owner) {
      await sendEmail({
        to: owner.email,
        subject: `Refund issued · ${input.order.order_number}`,
        html: brandShell({
          title: "A refund was issued",
          preheader: `${money} for ${input.order.order_number} has been submitted for return to the customer.`,
          body: [
            emailParagraph(
              `Hi${owner.name ? ` ${escapeEmailHtml(owner.name)}` : ""}, the refund you initiated for ${escapeEmailHtml(input.order.order_number)} has been accepted by the payment provider.`,
            ),
            emailRows([
              { label: "Order", value: input.order.order_number },
              { label: "Amount refunded", value: money, strong: true },
              { label: "Customer", value: input.order.customer_name ?? input.order.email },
            ]),
            emailParagraph(
              "The sale has been reversed in your finance page, net of the platform fee as stated in the policy.",
            ),
            emailButton("Open the order", workspaceUrl),
          ].join(""),
        }),
        text: brandText([
          "A refund was issued",
          "",
          `Order: ${input.order.order_number}`,
          `Amount refunded: ${money}`,
          "",
          `Open the order: ${workspaceUrl}`,
        ]),
        meta: {
          orderId: input.order.id,
          storeId: input.order.store_id,
          kind: "refund-seller",
          dedupeKey: `refund-seller:${input.order.id}`,
        },
      });
    }
  } catch (error) {
    console.error(`[mail] refund notices for ${input.order.id} failed`, error);
  }
}

/* -------------------------------------------------------------------------- */
/* Payouts — the seller's own money                                            */
/* -------------------------------------------------------------------------- */

/**
 * A payout was requested — the seller's own confirmation.
 *
 * The account is named but never fully shown (the last four digits only), and
 * nothing claims the money has moved: this is a request on its way to review,
 * and the email says exactly that.
 */
export async function sendPayoutRequestedEmail(input: {
  sellerEmail: string;
  sellerName: string | null;
  payoutId: string;
  amountMinor: number;
  currency: string;
  bankName: string | null;
  accountNumber: string | null;
}): Promise<EmailResult> {
  const amount = formatMoney(input.amountMinor, input.currency);
  const financeUrl = `${platformConfig.appUrl}/workspace/finance`;
  const destination = [input.bankName, input.accountNumber ? `••••${input.accountNumber.slice(-4)}` : ""]
    .filter(Boolean)
    .join(" · ") || "Your saved account";

  const html = brandShell({
    title: "Payout requested",
    preheader: `Your payout of ${amount} has been requested and is being reviewed.`,
    body: [
      emailParagraph(
        `Hi${input.sellerName ? ` ${escapeEmailHtml(input.sellerName)}` : ""}, your payout request has been recorded.`,
      ),
      emailRows([
        { label: "Amount", value: amount, strong: true },
        { label: "Destination", value: destination },
        { label: "Status", value: "Under review" },
      ]),
      emailParagraph(
        "The transfer is processed after review. You will see it move to paid on your finance page once it has been sent.",
      ),
      emailButton("Open your finance page", financeUrl),
    ].join(""),
  });

  const text = brandText([
    "Payout requested",
    "",
    `Amount: ${amount}`,
    `Destination: ${destination}`,
    "Status: Under review",
    "",
    `Open your finance page: ${financeUrl}`,
  ]);

  return sendEmail({
    to: input.sellerEmail,
    subject: `Payout requested · ${amount}`,
    html,
    text,
    meta: {
      kind: "payout",
      dedupeKey: `payout:${input.payoutId}`,
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Events — the people holding tickets                                         */
/* -------------------------------------------------------------------------- */

/**
 * An event a ticket holder is going to has changed — or been cancelled.
 *
 * One message per holder per change, sent to the address on the ticket. The
 * message says plainly what changed; it never dresses a cancellation as an
 * update.
 */
export async function sendMessageNotificationEmail(input: {
  to: string;
  name: string | null;
  fromName: string;
  preview: string;
  conversationId: string;
  day: string;
}): Promise<EmailResult> {
  const conversationUrl = `${platformConfig.appUrl}/messages/${input.conversationId}`;

  const html = brandShell({
    title: `New message from ${input.fromName}`,
    preheader: input.preview,
    body: [
      emailParagraph(
        `Hi${input.name ? ` ${escapeEmailHtml(input.name)}` : ""}, <strong>${escapeEmailHtml(input.fromName)}</strong> sent you a message in your Rush Cart conversation.`,
      ),
      emailPanel(emailParagraph(`“${escapeEmailHtml(input.preview)}”`)),
      emailButton("Open the conversation", conversationUrl),
      emailParagraph("You are only emailed when a conversation is waiting for you."),
    ].join(""),
  });

  const text = brandText([
    `New message from ${input.fromName}`,
    "",
    input.preview,
    "",
    `Open the conversation: ${conversationUrl}`,
  ]);

  return sendEmail({
    to: input.to,
    subject: `New message from ${input.fromName}`,
    html,
    text,
    meta: {
      kind: "message",
      dedupeKey: `message:${input.conversationId}:${input.to}:${input.day}`,
    },
  });
}
