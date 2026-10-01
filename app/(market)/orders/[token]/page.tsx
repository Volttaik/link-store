import { BrandMark, Wordmark } from "@/components/ui/Icon";
import { MessageSellerButton } from "@/components/marketplace/MessageSellerButton";
import { notFound } from "next/navigation";
import { getOrderByAccessToken, getOrderWithItems } from "@/lib/server/commerce";
import { getShipmentForOrder, listShipmentEvents } from "@/lib/server/shipments";
import { getStoreSettings } from "@/lib/server/stores";
import { OrderTracking } from "@/components/marketplace/OrderTracking";
import { ReceiptQr } from "@/components/marketplace/ReceiptQr";
import { PageHeader, StatusChip } from "@/components/ui/atoms";
import { ButtonLink } from "@/components/ui/controls";
import { InfoNote } from "@/components/ui/feedback";
import { paymentStatusLabel, paymentStatusTone } from "@/lib/catalog";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/format";
export const dynamic = "force-dynamic";
export const metadata = { title: "Order" };
export default async function OrderPage({ params }: { params: Promise<{ token: string }> }) {
  const order = await getOrderByAccessToken((await params).token); if (!order) notFound();
  const [detail, shipment, settings] = await Promise.all([getOrderWithItems(order.id), getShipmentForOrder(order.id), getStoreSettings(order.store_id)]); if (!detail) notFound();
  const events = shipment ? await listShipmentEvents(shipment.id) : [];
  return <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6"><div className="flex items-center gap-3"><BrandMark className="h-10 w-20" /><Wordmark /><span className="ml-auto text-xs text-muted">Order receipt</span></div><PageHeader title={`Order ${order.order_number}`} description={`Placed ${formatDateTime(order.created_at)} with ${detail.storeName}`} actions={<StatusChip label={paymentStatusLabel(order.payment_status)} tone={paymentStatusTone(order.payment_status)} />} />
    {order.payment_status !== "paid" ? <InfoNote tone="warning" title="Awaiting payment">Your order will be confirmed when payment has been verified.</InfoNote> : <InfoNote tone="success" title="Payment verified">Keep this page as your receipt.</InfoNote>}
    {shipment ? <OrderTracking order={order} shipment={shipment} events={events} pickup={shipment.method === "pickup" ? { locationName: settings.pickup_location_name, address: settings.pickup_address, hours: settings.pickup_hours, instructions: settings.pickup_instructions } : null} /> : null}
    <section className="space-y-4 rounded-3xl border border-border bg-surface p-6"><h2 className="font-semibold">Your order</h2>{detail.items.map(item => <div key={item.id} className="flex justify-between gap-4"><div><p className="text-sm font-medium">{item.title}</p><p className="text-xs text-muted">{item.quantity} × {formatMoney(item.unit_price, item.currency)}{item.variant_name ? ` · ${item.variant_name}` : ""}</p></div><span className="text-sm">{formatMoney(item.total, item.currency)}</span></div>)}<div className="flex justify-between border-t border-border pt-4 font-semibold"><span>{order.payment_status === "paid" ? "Total paid" : "Total"}</span><span>{formatMoney(order.total, order.currency)}</span></div></section>
    <div className="flex flex-wrap items-start justify-between gap-6 rounded-3xl border border-border bg-surface p-6"><div className="space-y-2"><h2 className="font-semibold">Customer</h2><p className="text-sm">{order.customer_name}</p><p className="text-sm text-muted">{order.email}</p>{order.customer_note ? <p className="text-sm text-muted">{order.customer_note}</p> : null}<div className="flex flex-wrap gap-2"><ButtonLink href={`/@${detail.storeSlug}`} variant="secondary" size="sm">Visit {detail.storeName}</ButtonLink><MessageSellerButton storeId={order.store_id} sellerName={detail.storeName} label="Contact seller" size="sm" /></div></div>{order.receipt_code && order.payment_status === "paid" ? <div className="w-36"><ReceiptQr code={order.receipt_code} /></div> : null}</div>
  </main>;
}
