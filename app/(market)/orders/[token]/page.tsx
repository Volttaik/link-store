import { Card } from "@heroui/react/card";
import { Chip } from "@heroui/react/chip";
import { Link } from "@heroui/react/link";
import { ButtonLink } from "@/components/ui/controls";
import { notFound } from "next/navigation";

import { InfoNote } from "@/components/ui/feedback";
import { Icon } from "@/components/ui/Icon";
import { PageHeader, StatusChip } from "@/components/ui/atoms";
import { TicketCard } from "@/components/cards/TicketCard";
import { TicketQr } from "@/components/marketplace/TicketQr";
import { ReceiptQr } from "@/components/marketplace/ReceiptQr";
import { OrderTracking } from "@/components/marketplace/OrderTracking";
import {
  getOrderByAccessToken,
  getOrderWithItems,
  listDownloadsForOrder,
  listTicketsForOrder,
} from "@/lib/server/commerce";
import {
  getShipmentForOrder,
  listShipmentEvents,
  type ShipmentRow,
} from "@/lib/server/shipments";
import { getStoreSettings } from "@/lib/server/stores";
import {
  orderStatusLabel,
  orderStatusTone,
  paymentStatusLabel,
  paymentStatusTone,
} from "@/lib/catalog";
import { formatDateTime, humanize } from "@/lib/format";
import { formatMoney } from "@/lib/money";

export const metadata = { title: "Order" };

export const dynamic = "force-dynamic";

/**
 * Order detail, reached with the order's access token.
 *
 * This is the customer's receipt, ticket wallet and download shelf in one page —
 * available without an account, because the token itself is the credential.
 */
export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const order = await getOrderByAccessToken(token);

  if (!order) notFound();

  const [orderWithItems, tickets, downloads, shipment, settings] = await Promise.all([
    getOrderWithItems(order.id),
    listTicketsForOrder(order.id),
    listDownloadsForOrder(order.id),
    getShipmentForOrder(order.id),
    getStoreSettings(order.store_id),
  ]);

  if (!orderWithItems) notFound();

  const shipmentEvents = shipment ? await listShipmentEvents(shipment.id) : [];

  const paid = order.payment_status === "paid";
  const shippingAddress = order.shipping_address
    ? (JSON.parse(order.shipping_address) as Record<string, string>)
    : null;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8 sm:px-6">
      <PageHeader
        title={`Order ${order.order_number}`}
        description={`Placed ${formatDateTime(order.created_at)} with ${orderWithItems.storeName}`}
        breadcrumb={
          <Link href="/orders" className="flex items-center gap-1 text-xs font-medium text-muted hover:text-foreground"
          >
            <Icon name="arrowLeft" size={13} />
            All orders
          </Link>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <StatusChip
              label={paymentStatusLabel(order.payment_status)}
              tone={paymentStatusTone(order.payment_status)}
            />
            <StatusChip
              label={orderStatusLabel(order.status)}
              tone={orderStatusTone(order.status)}
            />
          </div>
        }
      />

      {!paid ? (
        <InfoNote tone="warning" title="This order has not been paid">
          {order.payment_status === "failed"
            ? "The payment attempt failed. Nothing has been charged or delivered. You can place the order again from the storefront."
            : "We are still waiting on payment confirmation. Tickets and downloads are released the moment your payment lands."}
        </InfoNote>
      ) : (
        <InfoNote tone="primary" title="Payment verified">
          Confirmed on {formatDateTime(order.paid_at)}. Keep this page — it is your receipt.
        </InfoNote>
      )}

      {shipment ? (
        <OrderTracking
          order={order}
          shipment={shipment as ShipmentRow}
          events={shipmentEvents}
          pickup={
            shipment.method === "pickup"
              ? {
                  locationName: settings.pickup_location_name,
                  address: settings.pickup_address,
                  hours: settings.pickup_hours,
                  instructions: settings.pickup_instructions,
                }
              : null
          }
        />
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]">
        <div className="space-y-6">
          <Card className="ls-elev-2">
            <Card.Header className="pb-0">
              <p className="text-sm font-semibold">Items</p>
            </Card.Header>
            <Card.Content className="gap-3">
              {orderWithItems.items.map((item) => (
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
                        color={item.fulfilment_status === "fulfilled" ? "success" : "default"} className="text-xs"
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
                <div className="flex justify-between">
                  <span className="text-muted">Subtotal</span>
                  <span>{formatMoney(Number(order.subtotal), order.currency)}</span>
                </div>
                {Number(order.shipping_total) > 0 ? (
                  <div className="flex justify-between">
                    <span className="text-muted">Delivery</span>
                    <span>{formatMoney(Number(order.shipping_total), order.currency)}</span>
                  </div>
                ) : null}
                {Number(order.discount_total) > 0 ? (
                  <div className="flex justify-between">
                    <span className="text-muted">
                      Discount{order.discount_code ? ` (${order.discount_code})` : ""}
                    </span>
                    <span className="text-success">
                      −{formatMoney(Number(order.discount_total), order.currency)}
                    </span>
                  </div>
                ) : null}
                
                <div className="flex justify-between text-base font-bold">
                  <span>Total</span>
                  <span>{formatMoney(Number(order.total), order.currency)}</span>
                </div>
              </div>
            </Card.Content>
          </Card>

          {tickets.length > 0 ? (
            <Card className="ls-elev-2">
              <Card.Header className="flex-col items-start gap-1">
                <p className="text-sm font-semibold">
                  Your {tickets.length === 1 ? "ticket" : "tickets"}
                </p>
                <p className="text-xs text-muted">
                  Every ticket has its own QR code. Show it at the door — each one is scanned and
                  checked in once.
                </p>
              </Card.Header>
              
              <Card.Content className="gap-5">
                {tickets.map((ticket) => (
                  <TicketCard
                    key={ticket.id}
                    orderEmail={order.email}
                    qr={<TicketQr code={ticket.code} />}
                    ticket={ticket}
                  />
                ))}
              </Card.Content>
            </Card>
          ) : null}

          {downloads.length > 0 ? (
            <Card className="ls-elev-2">
              <Card.Header className="flex-col items-start gap-1 pb-0">
                <p className="text-sm font-semibold">Your downloads</p>
                <p className="text-xs text-muted">
                  Links are private and limited to {downloads[0]?.max_downloads ?? 10} downloads each.
                </p>
              </Card.Header>
              <Card.Content className="gap-3">
                {downloads.map((download) => {
                  const exhausted = download.download_count >= download.max_downloads;
                  const expired =
                    download.expires_at !== null &&
                    new Date(download.expires_at).getTime() < Date.now();

                  return (
                    <div
                      key={download.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-secondary/50 p-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium">File from this order</p>
                        <p className="text-xs text-muted">
                          {download.download_count} of {download.max_downloads} downloads used
                        </p>
                      </div>

                      {!paid || exhausted || expired ? (
                        <Chip size="sm" color="default" variant="secondary">
                          {expired ? "Expired" : exhausted ? "Limit reached" : "Awaiting payment"}
                        </Chip>
                      ) : (
                        <ButtonLink
                          href={`/downloads/${download.token}`} size="sm" variant="secondary"
                        >
                          Download
                        </ButtonLink>
                      )}
                    </div>
                  );
                })}
              </Card.Content>
            </Card>
          ) : null}
        </div>

        <div className="space-y-4">
          {order.receipt_code && paid ? (
            <Card className="ls-elev-2">
              <Card.Header className="flex-col items-start gap-1">
                <p className="text-sm font-semibold">Receipt</p>
                <p className="text-xs text-muted">
                  Show this at pickup or collection. The seller scans it to confirm this order —
                  it carries only the receipt code, nothing personal.
                </p>
              </Card.Header>
              <Card.Content className="gap-3">
                <div className="mx-auto w-40">
                  <ReceiptQr code={order.receipt_code} />
                </div>
                <p className="text-center font-mono text-xs text-muted">{order.receipt_code}</p>
              </Card.Content>
            </Card>
          ) : null}

          <Card className="ls-elev-2">
            <Card.Content className="gap-3 text-sm">
              <p className="font-semibold">Customer</p>
              <Detail label="Email" value={order.email} />
              {order.customer_name ? <Detail label="Name" value={order.customer_name} /> : null}
              {order.phone ? <Detail label="Phone" value={order.phone} /> : null}
              
              <p className="font-semibold">Seller</p>
              <Detail label="Store" value={orderWithItems.storeName} />
              <ButtonLink
                href={`/@${orderWithItems.storeSlug}`} size="sm" variant="secondary"
                fullWidth
              >
                Visit store
              </ButtonLink>
            </Card.Content>
          </Card>

          {shippingAddress ? (
            <Card className="ls-elev-2">
              <Card.Content className="gap-2 text-sm">
                <p className="font-semibold">Delivery address</p>
                <div className="text-muted">
                  {[shippingAddress.line1, shippingAddress.line2].filter(Boolean).map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                  <p>
                    {[shippingAddress.city, shippingAddress.state, shippingAddress.postalCode]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                  {shippingAddress.country ? <p>{shippingAddress.country}</p> : null}
                </div>
              </Card.Content>
            </Card>
          ) : null}

          {order.customer_note ? (
            <Card className="ls-elev-2">
              <Card.Content className="gap-2 text-sm">
                <p className="font-semibold">Your note</p>
                <p className="text-muted">{order.customer_note}</p>
              </Card.Content>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-muted">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
