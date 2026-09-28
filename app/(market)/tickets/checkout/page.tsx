import { Card } from "@heroui/react/card";

import { TicketCheckoutForm } from "@/components/marketplace/TicketCheckoutForm";
import { PageHeader } from "@/components/ui/atoms";
import { ButtonLink } from "@/components/ui/controls";
import { EmptyState, InfoNote } from "@/components/ui/feedback";
import { Icon } from "@/components/ui/Icon";
import { getCurrentUser } from "@/lib/auth";
import { isPaystackConfigured } from "@/lib/env";
import { formatDateTime } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { getEventDetail } from "@/lib/server/events";

export const metadata = { title: "Buy tickets" };

export const dynamic = "force-dynamic";

/**
 * The ticket purchase — not a cart.
 *
 * Tickets are bought here and nowhere else. The shopper chose quantities on the
 * event page, and those choices arrive in the URL; this page re-reads every one
 * of them from the database (is it on sale, is it inside its window, is there
 * any capacity left), shows the true total, and hands the buyer to Paystack. On
 * payment the event's fulfilment issues one ticket per admission — each with its
 * own code and QR — and they appear in the ticket inventory.
 *
 * Because the cart is never involved, a ticket can never become a basket line,
 * and the quantities here can never be edited after the fact the way stock is.
 */
export default async function TicketCheckoutPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const eventId = typeof params.event === "string" ? params.event : "";
  const rawLines = Array.isArray(params.line) ? params.line : params.line ? [params.line] : [];

  /** `line=<ticketTypeId>:<quantity>` — the choice, re-verified below. */
  const chosen = new Map<string, number>();
  for (const entry of rawLines) {
    const [id, quantity] = String(entry).split(":");
    const parsed = Math.floor(Number(quantity) || 0);
    if (id && parsed > 0) chosen.set(id, (chosen.get(id) ?? 0) + parsed);
  }

  const [event, user] = await Promise.all([
    eventId ? getEventDetail(eventId) : Promise.resolve(null),
    getCurrentUser(),
  ]);

  const backToEvent = (
    <ButtonLink href={eventId ? `/events/${eventId}` : "/events"} variant="secondary">
      Back to the event
    </ButtonLink>
  );

  if (!event) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6">
        <EmptyState
          icon="ticket"
          title="That event could not be found"
          description="It may have been removed, or the link may be incomplete."
          action={
            <ButtonLink href="/events" variant="primary">
              Browse events
            </ButtonLink>
          }
        />
      </div>
    );
  }

  if (event.status !== "published") {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6">
        <EmptyState
          icon="ticket"
          title="Tickets are not on sale"
          description={`${event.title} is not published, so nothing can be bought for it yet.`}
          action={backToEvent}
        />
      </div>
    );
  }

  const now = new Date().toISOString();

  const lines = event.ticketTypes
    .filter((type) => chosen.has(type.id))
    .map((type) => {
      const quantity = chosen.get(type.id) ?? 0;
      const remaining =
        Number(type.quantity_total) === 0
          ? null
          : Math.max(0, Number(type.quantity_total) - Number(type.quantity_sold));

      const onSale =
        type.is_active === 1 &&
        (!type.sales_start || now >= type.sales_start) &&
        (!type.sales_end || now <= type.sales_end);

      const available = onSale && (remaining === null || remaining >= quantity);

      return { id: type.id, name: type.name, price: type.price, quantity, remaining, onSale, available };
    });

  const unavailable = lines.filter((line) => !line.available);
  const total = lines
    .filter((line) => line.available)
    .reduce((sum, line) => sum + line.price * line.quantity, 0);

  if (lines.length === 0 || unavailable.length > 0 || total <= 0) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6">
        <EmptyState
          icon="alert"
          title="Those tickets cannot be bought right now"
          description={
            unavailable.length > 0
              ? unavailable
                  .map((line) =>
                    !line.onSale
                      ? `“${line.name}” is not on sale.`
                      : `Only ${line.remaining ?? 0} of “${line.name}” remain.`,
                  )
                  .join(" ")
              : "Choose at least one ticket on the event page and try again."
          }
          action={backToEvent}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-7 px-4 py-8 sm:px-6">
      <PageHeader
        title="Buy tickets"
        description={`${event.title} · ${formatDateTime(event.startsAt)}`}
        breadcrumb={
          <ButtonLink href={`/events/${event.id}`} size="sm" variant="ghost">
            <Icon name="arrowLeft" size={13} />
            Back to the event
          </ButtonLink>
        }
      />

      <Card className="ls-elev-2">
        <Card.Header className="flex-col items-start gap-1">
          <p className="text-[15px] font-semibold text-foreground">Your tickets</p>
          <p className="text-[13px] text-muted">
            Each admission is issued separately, with its own code and its own QR, the moment the
            payment is verified.
          </p>
        </Card.Header>
        <Card.Content className="gap-3">
          {lines.map((line) => (
            <div
              key={line.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-secondary/40 p-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold">{line.name}</p>
                <p className="text-xs text-muted">
                  {formatMoney(line.price, event.currency)} each
                  {line.remaining !== null ? ` · ${line.remaining} left` : ""}
                </p>
              </div>
              <p className="text-sm font-semibold tabular-nums">
                {line.quantity} × {formatMoney(line.price, event.currency)}
              </p>
            </div>
          ))}

          <div className="flex items-center justify-between border-t border-separator pt-3">
            <span className="text-sm text-muted">
              {lines.reduce((sum, line) => sum + line.quantity, 0)} ticket(s)
            </span>
            <span className="text-lg font-semibold">{formatMoney(total, event.currency)}</span>
          </div>
        </Card.Content>
      </Card>

      {!isPaystackConfigured ? (
        <InfoNote tone="warning" title="Payments are not configured yet">
          This event cannot take payments until Paystack credentials are set. Nothing can be bought
          until then, and nothing is issued without a verified payment.
        </InfoNote>
      ) : null}

      <TicketCheckoutForm
        defaultEmail={user?.email ?? ""}
        defaultName={user?.name ?? ""}
        eventId={event.id}
        items={lines.map((line) => ({ ticketTypeId: line.id, quantity: line.quantity }))}
        paymentsReady={isPaystackConfigured}
        total={total}
        currency={event.currency}
      />
    </div>
  );
}
