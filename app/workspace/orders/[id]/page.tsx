import { Avatar } from "@heroui/react/avatar";
import { Button } from "@heroui/react/button";
import { Card } from "@heroui/react/card";
import { Chip } from "@heroui/react/chip";
import { Link } from "@heroui/react/link";
import { notFound } from "next/navigation";

import { ActionButton, ButtonLink } from "@/components/ui/controls";
import { PageHeader, StatusChip } from "@/components/ui/atoms";
import { Icon } from "@/components/ui/Icon";
import { InfoNote } from "@/components/ui/feedback";
import {
  refundOrderAction,
  resendOrderEmailsAction,
  setOrderStatusAction,
} from "@/app/actions/orders-admin";
import { ShipmentPanel } from "@/components/workspace/ShipmentPanel";
import { requireStore } from "@/lib/auth";
import {
  getOrderWithItems,
  listPaymentsForOrder,
} from "@/lib/server/commerce";
import { getShipmentForOrder, listShipmentEvents } from "@/lib/server/shipments";
import { queryOne } from "@/lib/db";
import { listEmailsForOrder } from "@/lib/server/email";
import {
  orderStatusTone,
  paymentStatusLabel,
  paymentStatusTone,
} from "@/lib/catalog";
import { formatDateTime, humanize } from "@/lib/format";
import { formatMoney } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function WorkspaceOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { store } = await requireStore();
  const { id } = await params;

  // Ownership is enforced by the store filter, not by the id alone.
  // The reference in the path may be the order's id or its human order number:
  // emails link by order number so no internal identifier ever travels by
  // mail. Either way the lookup stays scoped to this seller's own store.
  const order = await queryOne<{ id: string }>(
    "SELECT id FROM orders WHERE (id = ? OR order_number = ?) AND store_id = ?",
    [id, id, store.id],
  );
  if (!order) notFound();

  const detail = await getOrderWithItems(order.id);
  if (!detail) notFound();

  const [payments, emails, shipment] = await Promise.all([
    listPaymentsForOrder(order.id),
    listEmailsForOrder(order.id),
    getShipmentForOrder(order.id),
  ]);

  const shipmentEvents = shipment ? await listShipmentEvents(shipment.id) : [];

  const address = detail.shipping_address
    ? (JSON.parse(detail.shipping_address) as Record<string, string>)
    : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Order ${detail.order_number}`}
        description={`${formatDateTime(detail.created_at)} · ${detail.email}`}
        breadcrumb={
          <Link href="/workspace/orders" className="flex items-center gap-1 text-xs font-medium text-muted hover:text-foreground"
          >
            <Icon name="arrowLeft" size={13} />
            All orders
          </Link>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip label={detail.status} tone={orderStatusTone(detail.status)} />
            <StatusChip
              label={paymentStatusLabel(detail.payment_status)}
              tone={paymentStatusTone(detail.payment_status)}
            />
          </div>
        }
      />

      {detail.payment_status !== "paid" ? (
        <InfoNote tone="warning" title="Payment not verified">
          This order has not been paid. Fulfilment actions stay available so you can prepare, but
          nothing has been charged. Payment status only changes once payment is confirmed.
        </InfoNote>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)]">
        <div className="space-y-6">
          <Card className="ls-elev-2">
            <Card.Header className="pb-0">
              <p className="text-sm font-semibold">Items</p>
            </Card.Header>
            <Card.Content className="gap-3">
              {detail.items.map((item) => (
                <div key={item.id} className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{item.title}</p>
                    <p className="text-xs text-muted">
                      {item.quantity} × {formatMoney(Number(item.unit_price), item.currency)}
                      {item.variant_name ? ` · ${item.variant_name}` : ""}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <Chip size="sm" variant="secondary" className="text-xs">
                        {humanize(item.item_type)}
                      </Chip>
                      <Chip size="sm" variant="secondary"
                        color={
                          item.fulfilment_status === "fulfilled"
                            ? "success"
                            : item.fulfilment_status === "pending_delivery"
                              ? "warning"
                              : "default"
                        } className="text-xs"
                      >
                        {humanize(item.fulfilment_status.replace(/_/g, " "))}
                      </Chip>
                    </div>
                  </div>
                  <span className="shrink-0 text-sm font-semibold">
                    {formatMoney(Number(item.total), item.currency)}
                  </span>
                </div>
              ))}

              

              <div className="space-y-1.5 text-sm">
                <Row label="Subtotal">{formatMoney(Number(detail.subtotal), detail.currency)}</Row>
                {Number(detail.shipping_total) > 0 ? (
                  <Row label="Delivery">
                    {formatMoney(Number(detail.shipping_total), detail.currency)}
                  </Row>
                ) : null}
                {Number(detail.discount_total) > 0 ? (
                  <Row label={`Discount${detail.discount_code ? ` (${detail.discount_code})` : ""}`}>
                    <span className="text-success">
                      −{formatMoney(Number(detail.discount_total), detail.currency)}
                    </span>
                  </Row>
                ) : null}
                
                <div className="flex justify-between text-base font-bold">
                  <span>Total</span>
                  <span>{formatMoney(Number(detail.total), detail.currency)}</span>
                </div>
              </div>
            </Card.Content>
          </Card>

          <Card className="ls-elev-2">
            <Card.Header className="pb-0">
              <p className="text-sm font-semibold">Payment records</p>
            </Card.Header>
            <Card.Content className="gap-3">
              {payments.length === 0 ? (
                <p className="text-xs text-muted">
                  No payment has been attempted for this order yet.
                </p>
              ) : (
                payments.map((payment) => (
                  <div key={payment.id} className="space-y-1 rounded-xl bg-surface-secondary/50 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-xs">{payment.reference}</span>
                      <Chip size="sm" variant="secondary"
                        color={
                          payment.status === "success"
                            ? "success"
                            : payment.status === "failed"
                              ? "danger"
                              : "warning"
                        } className="text-xs"
                      >
                        {payment.status}
                      </Chip>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                      <span>
                        {formatMoney(Number(payment.amount), payment.currency)}
                        {payment.channel ? ` · ${payment.channel}` : ""}
                      </span>
                      <span>
                        {payment.paid_at ? `Paid ${formatDateTime(payment.paid_at)}` : "Not paid"}
                      </span>
                    </div>
                    {payment.failure_reason ? (
                      <p className="text-xs text-danger">{payment.failure_reason}</p>
                    ) : null}
                  </div>
                ))
              )}
            </Card.Content>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="ls-elev-2">
            <Card.Header className="pb-0">
              <p className="text-sm font-semibold">Fulfilment</p>
            </Card.Header>
            <Card.Content className="gap-3">
              {shipment ? (
                <ShipmentPanel
                  shipment={{
                    id: shipment.id,
                    orderId: detail.id,
                    method: shipment.method,
                    status: shipment.status,
                    origin: shipment.origin,
                    destination: shipment.destination,
                    current_location: shipment.current_location,
                    current_location_at: shipment.current_location_at,
                    estimated_delivery: shipment.estimated_delivery,
                    shipped_at: shipment.shipped_at,
                    delivered_at: shipment.delivered_at,
                    events: shipmentEvents.map((event) => ({
                      id: event.id,
                      status: event.status,
                      title: event.title,
                      note: event.note,
                      location: event.location,
                      created_at: event.created_at,
                    })),
                  }}
                />
              ) : (
                <>
                  <ActionButton
                    action={setOrderStatusAction.bind(null, detail.id, "processing")} variant="secondary"
                    isDisabled={detail.status === "processing"}
                    fullWidth
                  >
                    Mark as processing
                  </ActionButton>
                  <ActionButton
                    action={setOrderStatusAction.bind(null, detail.id, "fulfilled")}
                    isDisabled={detail.status === "fulfilled"}
                    fullWidth
                    variant="primary"
                  >
                    Mark as fulfilled
                  </ActionButton>
                </>
              )}

              {detail.status !== "cancelled" && detail.payment_status !== "paid" ? (
                <ActionButton
                  action={setOrderStatusAction.bind(null, detail.id, "cancelled")} variant="danger-soft"
                  confirm="Cancel this order?"
                  fullWidth
                >
                  Cancel order
                </ActionButton>
              ) : null}

              {detail.payment_status === "paid" && detail.status !== "refunded" ? (
                <>
                  <ActionButton
                    action={refundOrderAction.bind(null, detail.id)}
                    variant="danger-soft"
                    confirm="Refund this order? The payment will be returned and its stock restored."
                    fullWidth
                  >
                    Refund this order
                  </ActionButton>
                  <p className="text-xs text-muted">
                    The refund goes back to the buyer through Paystack. Once accepted, the order is
                    closed and the items return to stock.
                  </p>
                </>
              ) : null}
            </Card.Content>
          </Card>

          {detail.receipt_code ? (
            <Card className="ls-elev-2">
              <Card.Header className="pb-0">
                <p className="text-sm font-semibold">Receipt verification</p>
              </Card.Header>
              <Card.Content className="gap-2 text-sm">
                <p className="text-xs text-muted">
                  The buyer&apos;s receipt QR encodes this code. Scan it (or type it) in the receipt
                  verifier to confirm the order before handing anything over.
                </p>
                <p className="font-mono text-sm font-semibold">{detail.receipt_code}</p>
                <ButtonLink
                  href={`/workspace/orders/verify?code=${encodeURIComponent(detail.receipt_code)}`}
                  size="sm"
                  variant="secondary"
                  fullWidth
                >
                  Open in receipt verifier
                </ButtonLink>
              </Card.Content>
            </Card>
          ) : null}

          <Card className="ls-elev-2">
            <Card.Header className="pb-0">
              <p className="text-sm font-semibold">Receipts</p>
            </Card.Header>
            <Card.Content className="gap-3">
              {emails.length === 0 ? (
                <p className="text-xs text-muted">
                  {detail.payment_status === "paid"
                    ? "No email has been sent for this order yet."
                    : "The invoice is emailed automatically once payment is verified."}
                </p>
              ) : (
                emails.slice(0, 5).map((email) => (
                  <div key={email.id} className="space-y-1 rounded-xl bg-surface-secondary/50 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-medium capitalize">
                        {humanize(email.kind)}
                      </span>
                      <Chip size="sm" variant="secondary"
                        color={
                          email.status === "sent"
                            ? "success"
                            : email.status === "skipped"
                              ? "warning"
                              : "danger"
                        } className="text-xs"
                      >
                        {email.status === "sent" ? "Sent" : email.status === "skipped" ? "Not sent" : "Failed"}
                      </Chip>
                    </div>
                    <p className="truncate text-xs text-muted">{email.recipient}</p>
                    <p className="text-xs text-muted">{formatDateTime(email.created_at)}</p>
                    {email.error ? <p className="text-xs text-danger">{email.error}</p> : null}
                  </div>
                ))
              )}

              {detail.payment_status === "paid" ? (
                <ActionButton
                  action={resendOrderEmailsAction.bind(null, detail.id)} variant="secondary"
                  fullWidth
                >
                  {emails.length > 0 ? "Send receipt again" : "Send receipt"}
                </ActionButton>
              ) : null}
            </Card.Content>
          </Card>

          <Card className="ls-elev-2">
            <Card.Content className="gap-3 text-sm">
              <div className="flex items-center gap-3">
                <Avatar size="sm">
                  <Avatar.Fallback>{(detail.customer_name ?? detail.email).slice(0, 1).toUpperCase()}</Avatar.Fallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate font-medium">{detail.customer_name ?? "Guest customer"}</p>
                  <p className="truncate text-xs text-muted">{detail.email}</p>
                </div>
              </div>
              {detail.phone ? <Row label="Phone">{detail.phone}</Row> : null}
              
              <Row label="Source">{humanize(detail.source)}</Row>
              <Row label="Placed">{formatDateTime(detail.created_at)}</Row>
              {detail.paid_at ? <Row label="Paid">{formatDateTime(detail.paid_at)}</Row> : null}
              {detail.fulfilled_at ? (
                <Row label="Fulfilled">{formatDateTime(detail.fulfilled_at)}</Row>
              ) : null}
            </Card.Content>
          </Card>

          {address ? (
            <Card className="ls-elev-2">
              <Card.Content className="gap-2 text-sm">
                <p className="font-semibold">Delivery address</p>
                <div className="text-muted">
                  {[address.line1, address.line2].filter(Boolean).map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                  <p>
                    {[address.city, address.state, address.postalCode].filter(Boolean).join(", ")}
                  </p>
                  {address.country ? <p>{address.country}</p> : null}
                </div>
              </Card.Content>
            </Card>
          ) : null}

          {detail.customer_note ? (
            <Card className="ls-elev-2">
              <Card.Content className="gap-2 text-sm">
                <p className="font-semibold">Customer note</p>
                <p className="text-muted">{detail.customer_note}</p>
              </Card.Content>
            </Card>
          ) : null}

          <ButtonLink href="/workspace/orders" variant="secondary" fullWidth size="sm">
            Back to orders
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  );
}
