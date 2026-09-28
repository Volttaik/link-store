import { cookies } from "next/headers";
import { ButtonLink } from "@/components/ui/controls";
import { Button } from "@heroui/react/button";
import { Card } from "@heroui/react/card";
import { Link } from "@heroui/react/link";

import { CheckoutForm } from "@/components/marketplace/CheckoutForm";
import { EmptyState, InfoNote } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/atoms";
import { Icon } from "@/components/ui/Icon";
import { getCurrentUser } from "@/lib/auth";
import {
  CART_COOKIE,
  getCartView,
  priceCart,
  resolveActiveCart,
} from "@/lib/server/commerce";
import { getStoreSettings } from "@/lib/server/stores";
import { isPaystackConfigured } from "@/lib/env";
import { formatMoney } from "@/lib/money";

export const metadata = { title: "Checkout" };

export const dynamic = "force-dynamic";

/**
 * Checkout pays one seller at a time.
 *
 * A basket can hold items from several shops, and each shop is its own order
 * (one payment, one seller, one receipt). Opening `/checkout` on a mixed basket
 * therefore asks which shop to pay for; `?store=` picks one, and paying it
 * leaves the other shops' items untouched in the cart.
 */
export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; store?: string }>;
}) {
  const { code, store } = await searchParams;
  const cookieStore = await cookies();
  const token = cookieStore.get(CART_COOKIE)?.value ?? null;
  const user = await getCurrentUser();
  // Account-scoped: a signed-in shopper checks out only their own basket.
  const cart = await resolveActiveCart(token, user?.id ?? null);

  if (!cart) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6">
        <EmptyState icon="receipt" title="Nothing to check out" description="Your cart is empty, so there is no order to pay for yet."
          action={
            <ButtonLink href="/products" variant="primary">
              Browse products
            </ButtonLink>
          }
        />
      </div>
    );
  }

  const view = await getCartView(cart.id);

  if (!view || view.items.length === 0) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6">
        <EmptyState icon="receipt" title="Nothing to check out" description="Your cart is empty, so there is no order to pay for yet."
          action={
            <ButtonLink href="/products" variant="primary">
              Browse products
            </ButtonLink>
          }
        />
      </div>
    );
  }

  const selected = store
    ? (view.groups.find((group) => group.storeId === store) ?? null)      : view.groups.length === 1
        ? view.groups[0]
        : null;

  if (!selected) {
    const totals = await priceCart(cart.id);

    return (
      <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 sm:px-6">
        <PageHeader title="Choose a shop to pay"
          description={`Your cart has items from ${view.storeCount} shops. Each shop is paid on its own, so pick one to continue. The rest stay in your cart.`}
          breadcrumb={
            <Link href="/cart" className="flex items-center gap-1 text-xs font-medium text-muted hover:text-foreground">
              <Icon name="arrowLeft" size={13} />
              Back to cart
            </Link>
          }
        />

        {totals.issues.length > 0 ? (
          <InfoNote tone="warning" title="Some items need your attention">
            <ul className="list-inside list-disc space-y-1">
              {totals.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </InfoNote>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {view.groups.map((group) => {
            const groupTotals = totals.groups.find((entry) => entry.storeId === group.storeId);

            return (
              <Card className="ls-elev-2" key={group.storeId}>
                <Card.Content className="gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-surface-secondary text-muted">
                      <Icon name="storefront" size={17} />
                    </span>
                    <div className="min-w-0">
                      <Link
                        className="truncate text-sm font-semibold text-foreground"
                        href={`/@${group.storeSlug}`}
                      >
                        {group.storeName}
                      </Link>
                      <p className="truncate text-xs text-muted">
                        {group.itemCount} {group.itemCount === 1 ? "item" : "items"}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted">Subtotal</span>
                      <span>{formatMoney(groupTotals?.subtotal ?? group.subtotal, view.currency)}</span>
                    </div>
                    {groupTotals?.requiresShipping ? (
                      <div className="flex justify-between">
                        <span className="text-muted">Delivery</span>
                        <span>
                          {groupTotals.shippingTotal === 0
                            ? "Free"
                            : formatMoney(groupTotals.shippingTotal, view.currency)}
                        </span>
                      </div>
                    ) : null}
                  </div>

                  

                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">Total due</span>
                    <span className="text-lg font-bold tabular-nums">
                      {formatMoney(groupTotals?.total ?? group.subtotal, view.currency)}
                    </span>
                  </div>

                  <ButtonLink href={`/checkout?store=${group.storeId}`} fullWidth variant="primary">
                    Pay this shop
                  </ButtonLink>
                </Card.Content>
              </Card>
            );
          })}
        </div>

        <InfoNote title="One payment per shop">
          Paystack settles each payment to the shop that sold the item, so a mixed cart cannot be
          charged in one go. Pay a shop and its items leave your cart automatically.
        </InfoNote>
      </div>
    );
  }

  const [totals, settings] = await Promise.all([
    priceCart(cart.id, code ?? null, selected.storeId),
    getStoreSettings(selected.storeId),
  ]);

  const items = selected.items;
  const hasShipping = items.some((item) => item.fulfilment === "shipping");
  const digitalOnly = items.every((item) => item.fulfilment === "digital" || item.fulfilment === "ticket");
  const isPickup = !hasShipping && items.some((item) => item.fulfilment === "pickup");
  const multiStore = view.storeCount > 1;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 sm:px-6">
      <PageHeader title="Checkout"
        description={`Paying ${selected.storeName} securely with Paystack.`}
        breadcrumb={
          <Link href="/cart" className="flex items-center gap-1 text-xs font-medium text-muted hover:text-foreground"
          >
            <Icon name="arrowLeft" size={13} />
            Back to cart
          </Link>
        }
      />

      {multiStore ? (
        <InfoNote title={`Shop 1 of ${view.storeCount}`}>
          This pays {selected.storeName} only.{" "}
          {view.storeCount - 1 === 1
            ? "The other shop stays in your cart for its own payment."
            : `The other ${view.storeCount - 1} shops stay in your cart for their own payments.`}
        </InfoNote>
      ) : null}

      {!isPaystackConfigured ? (
        <InfoNote tone="warning" title="Payments are not configured on this deployment">
          No <code>PAYSTACK_SECRET_KEY</code> is set, so no card can be charged. Your order will be
          created as unpaid rather than being marked as a successful payment. Add your Paystack keys
          to accept real payments.
        </InfoNote>
      ) : null}

      {totals.issues.length > 0 ? (
        <InfoNote tone="warning" title="Some items need your attention">
          <ul className="list-inside list-disc space-y-1">
            {totals.issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </InfoNote>
      ) : null}

      {totals.discountMessage ? (
        <InfoNote
          tone={totals.discountTotal > 0 ? "primary" : "warning"}
          title={totals.discountTotal > 0 ? "Discount applied" : "Discount"}
        >
          {totals.discountMessage}
        </InfoNote>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <CheckoutForm
          defaultEmail={user?.email ?? ""}
          defaultName={user?.name ?? ""}
          hasShipping={hasShipping}
          discountCode={code ?? ""}
          paymentsReady={isPaystackConfigured}
          issues={totals.issues}
          currency={view.currency}
          total={totals.total}
          storeId={selected.storeId}
        />

        <div className="space-y-4">
          <Card className="ls-elev-2">
            <Card.Content className="gap-3">
              <p className="text-sm font-semibold">
                {items.length} {items.length === 1 ? "item" : "items"} from {selected.storeName}
              </p>

              <div className="space-y-2">
                {items.map((item) => (
                  <div key={item.id} className="flex items-start justify-between gap-3 text-sm">
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-1">{item.title}</span>
                      <span className="text-xs text-muted">
                        {item.quantity} × {formatMoney(item.currentPrice, item.currency)}
                        {item.variantName ? ` · ${item.variantName}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 font-medium">
                      {formatMoney(item.currentPrice * item.quantity, item.currency)}
                    </span>
                  </div>
                ))}
              </div>

              

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted">Subtotal</span>
                  <span>{formatMoney(totals.subtotal, view.currency)}</span>
                </div>
                {hasShipping ? (
                  <div className="flex justify-between">
                    <span className="text-muted">Delivery</span>
                    <span>
                      {totals.shippingTotal === 0
                        ? "Free"
                        : formatMoney(totals.shippingTotal, view.currency)}
                    </span>
                  </div>
                ) : null}
                {totals.discountTotal > 0 ? (
                  <div className="flex justify-between">
                    <span className="text-muted">Discount</span>
                    <span className="text-success">
                      −{formatMoney(totals.discountTotal, view.currency)}
                    </span>
                  </div>
                ) : null}
              </div>

              

              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">Total due</span>
                <span className="text-xl font-bold">{formatMoney(totals.total, view.currency)}</span>
              </div>
            </Card.Content>
          </Card>

          {digitalOnly ? (
            <InfoNote tone="primary" title="Instant delivery">
              Nothing needs shipping. Your tickets and download links appear on your order the moment
              payment is verified.
            </InfoNote>
          ) : isPickup ? (
            <InfoNote title="Collect in person">
              This order is picked up, not delivered — no delivery fee is charged.
              {settings.pickup_address || settings.pickup_location_name
                ? ` Collection point: ${settings.pickup_location_name ?? settings.pickup_address}${settings.pickup_hours ? ` (${settings.pickup_hours})` : ""}.`
                : " The seller will confirm the collection point with you."}
              {" "}Full collection details appear inside your order after payment.
            </InfoNote>
          ) : hasShipping ? (
            <InfoNote title="Delivery">
              Flat rate{" "}
              {Number(settings.shipping_flat_fee) > 0
                ? formatMoney(Number(settings.shipping_flat_fee), view.currency)
                : "free"}
              {settings.free_shipping_over !== null
                ? `, free over ${formatMoney(Number(settings.free_shipping_over), view.currency)}`
                : ""}
              . The seller arranges delivery after payment.
            </InfoNote>
          ) : null}
        </div>
      </div>
    </div>
  );
}
