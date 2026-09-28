/**
 * Email audit harness — development only.
 *
 * Money events (a settled payment, a refund, a delivered order) cannot be
 * conjured without moving real money, yet their emails must still be verifiable
 * end to end: real rows, real rendering, real delivery through Resend. This
 * route fires a named transactional email against the real rows it names, so
 * `scripts/email-audit.mjs` can inspect exactly what a real flow would send.
 *
 * It never fabricates data and never changes any transaction state — it only
 * triggers the mail a genuine flow would trigger. In production this route
 * answers 403 and sends nothing.
 */

import { NextResponse } from "next/server";

import {
  sendOrderCancelledEmail,
  sendOrderCompletedEmail,
  sendOrderInvoice,
  sendPayoutRequestedEmail,
  sendRefundEmails,
  sendEventChangeEmail,
  sendShipmentUpdateEmail,
  sendTicketDelivery,
  storeOwnerContact,
} from "@/lib/server/email";
import { deliverSellerMail } from "@/lib/server/commerce";
import { query, queryOne } from "@/lib/db";
import { formatDateTime, nowIso } from "@/lib/format";
import { platformConfig } from "@/lib/env";
import type { OrderRow, PayoutRow } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(body: { event?: string; orderId?: string; payoutId?: string; eventId?: string }) {
  const event = body.event ?? "";

  const order = async (): Promise<OrderRow> => {
    const row = body.orderId
      ? await queryOne<OrderRow>("SELECT * FROM orders WHERE id = ?", [body.orderId])
      : null;
    if (!row) throw new Error("No order with that id.");
    return row;
  };

  switch (event) {
    case "invoice": {
      const { sent, error } = await sendOrderInvoice((await order()).id);
      return { sent, error: error ?? null };
    }
    case "tickets": {
      const { sent, error } = await sendTicketDelivery((await order()).id);
      return { sent, error: error ?? null };
    }
    case "order-completed": {
      const row = await order();
      await sendOrderCompletedEmail({
        order: row,
        method:
          row.fulfilment_method === "pickup" ||
          row.fulfilment_method === "digital" ||
          row.fulfilment_method === "delivery"
            ? row.fulfilment_method
            : "none",
        at: nowIso(),
      });
      return { sent: true };
    }
    case "order-cancelled": {
      await sendOrderCancelledEmail({ order: await order() });
      return { sent: true };
    }
    case "refund": {
      await sendRefundEmails({ order: await order() });
      return { sent: true };
    }
    case "seller-order": {
      await deliverSellerMail((await order()).id);
      return { sent: true };
    }
    case "shipment-update": {
      const row = await order();
      await sendShipmentUpdateEmail({
        order: row,
        statusLabel: "Shipped",
        note: "Your parcel is on its way.",
        location: "Lagos",
        at: nowIso(),
        method: row.fulfilment_method === "pickup" ? "pickup" : "delivery",
      });
      return { sent: true };
    }
    case "payout": {
      const payout = body.payoutId
        ? await queryOne<PayoutRow>("SELECT * FROM payouts WHERE id = ?", [body.payoutId])
        : null;
      if (!payout) throw new Error("No payout with that id.");
      const owner = await storeOwnerContact(payout.store_id);
      if (!owner) throw new Error("That store has no owner.");
      const destination = JSON.parse(payout.destination ?? "{}") as {
        bankName?: string;
        accountNumber?: string;
      };
      await sendPayoutRequestedEmail({
        sellerEmail: owner.email,
        sellerName: owner.name,
        payoutId: payout.id,
        amountMinor: Number(payout.amount),
        currency: payout.currency,
        bankName: destination.bankName ?? null,
        accountNumber: destination.accountNumber ?? null,
      });
      return { sent: true };
    }
    case "event-update":
    case "event-cancelled": {
      const eventRow = await queryOne<{
        id: string;
        title: string;
        starts_at: string | null;
        venue_name: string | null;
        city: string | null;
      }>("SELECT id, title, starts_at, venue_name, city FROM events WHERE id = ?", [body.eventId ?? ""]);
      if (!eventRow) throw new Error("No event with that id.");

      const holders = await query<{ holder_email: string | null; holder_name: string | null }>(
        "SELECT holder_email, holder_name FROM tickets WHERE event_id = ? AND status = 'valid'",
        [eventRow.id],
      );

      // One notice per person — a holder with five tickets is one inbox, not
      // five copies of the same news.
      const recipients = new Map<string, string | null>();
      for (const holder of holders) {
        const to = holder.holder_email?.trim().toLowerCase();
        if (to && !recipients.has(to)) recipients.set(to, holder.holder_name ?? null);
      }

      let sentTo = 0;
      for (const [to, holderName] of recipients) {
        await sendEventChangeEmail({
          to,
          holderName,
          eventId: eventRow.id,
          eventTitle: eventRow.title,
          eventUrl: `${platformConfig.appUrl}/events/${eventRow.id}`,
          changeLine:
            event === "event-cancelled"
              ? `the organiser has cancelled ${eventRow.title}.`
              : `the date and time of ${eventRow.title} have changed.`,
          detailLines: [
            {
              label: event === "event-cancelled" ? "Was scheduled" : "New date & time",
              value: eventRow.starts_at ? formatDateTime(eventRow.starts_at) : "To be announced",
            },
          ],
          cancelled: event === "event-cancelled",
          changedAt: nowIso(),
        });
        sentTo += 1;
      }
      return { sent: true, holders: sentTo };
    }
    default:
      throw new Error(`Unknown audit event: ${event || "(none)"}`);
  }
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "The email audit harness is a development tool." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as {
      event?: string;
      orderId?: string;
      payoutId?: string;
      eventId?: string;
    };
    const result = await handle(body);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "The email could not be sent." },
      { status: 400 },
    );
  }
}
