import { cookies } from "next/headers";
import { ButtonLink } from "@/components/ui/controls";
import { Card } from "@heroui/react/card";
import { Link } from "@heroui/react/link";

import { CartLine } from "@/components/marketplace/CartLine";
import { EmptyState, InfoNote } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/atoms";
import { Icon } from "@/components/ui/Icon";
import { getCurrentUser } from "@/lib/auth";
import { CART_COOKIE, getCartView, priceCart, resolveActiveCart } from "@/lib/server/commerce";
import { formatMoney } from "@/lib/money";

export const metadata = { title: "Cart" };

export const dynamic = "force-dynamic";

export default async function CartPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(CART_COOKIE)?.value ?? null;
  const user = await getCurrentUser();
  // Account-scoped: a signed-in shopper sees only their own basket.
  const cart = await resolveActiveCart(token, user?.id ?? null);

  if (!cart) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6">
        <EmptyState icon="cart" title="Your cart is empty" description="Browse the marketplace and add something to get started. You can mix items from as many shops as you like. Each one is paid separately at checkout."
          action={
            <ButtonLink href="/products" variant="primary">
              Browse products
            </ButtonLink>
          }
          secondaryAction={
            <ButtonLink href="/stores" variant="outline">
              Browse shops
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
        <EmptyState icon="cart" title="Your cart is empty"
          description="Nothing has been added yet, so there is no basket to show rather than placeholder items."
          action={
            <ButtonLink href="/products" variant="primary">
              Browse products
            </ButtonLink>
          }
        />
      </div>
    );
  }

  const totals = await priceCart(cart.id);
  const multiStore = view.storeCount > 1;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 sm:px-6">
      <PageHeader title="Your cart"
        description={
          multiStore ? (
            <span>
              {view.itemCount} items from {view.storeCount} shops. Each shop is paid separately, so
              every seller is paid directly.
            </span>
          ) : (
            <span>
              From{" "}
              <Link href={`/@${view.groups[0].storeSlug}`}>{view.groups[0].storeName}</Link> — payment
              goes straight to the seller.
            </span>
          )
        }
        actions={
          <ButtonLink href="/products" variant="secondary" size="sm">
            Keep shopping
          </ButtonLink>
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

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.6fr)]">
        <div className="space-y-8">
          {view.groups.map((group) => {
            const groupTotals = totals.groups.find((entry) => entry.storeId === group.storeId);

            return (
              <section className="space-y-3" key={group.storeId}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
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
                        {groupTotals ? ` · ${formatMoney(groupTotals.subtotal, view.currency)}` : ""}
                      </p>
                    </div>
                  </div>

                  {multiStore ? (
                    <ButtonLink fullWidth={false} href={`/@${group.storeSlug}`} size="sm" variant="secondary">
                      Open Store
                    </ButtonLink>
                  ) : null}
                </div>

                {group.items.map((item) => (
                  <CartLine item={item} key={item.id} />
                ))}

                {groupTotals ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface-secondary px-4 py-3">
                    <span className="text-xs text-muted">
                      Subtotal {formatMoney(groupTotals.subtotal, view.currency)}
                      {groupTotals.requiresShipping
                        ? groupTotals.shippingTotal === 0
                          ? " · delivery free"
                          : ` · delivery ${formatMoney(groupTotals.shippingTotal, view.currency)}`
                        : " · no delivery needed"}
                    </span>
                    <span className="text-sm font-semibold tabular-nums">
                      {formatMoney(groupTotals.total, view.currency)}
                    </span>
                  </div>
                ) : null}

                {multiStore ? (
                  <ButtonLink
                    fullWidth={false}
                    href={`/checkout?store=${group.storeId}`}
                    isDisabled={totals.issues.length > 0}
                    size="sm"
                    variant="primary"
                  >
                    Pay {group.storeName} only
                  </ButtonLink>
                ) : null}
              </section>
            );
          })}
        </div>

        <div className="space-y-4">
          <Card className="ls-elev-2">
            <Card.Content className="gap-3">
              <p className="text-sm font-semibold">Order summary</p>

              <div className="space-y-2 text-sm">
                <Row label={`Subtotal (${view.itemCount} items)`}>
                  {formatMoney(totals.subtotal, view.currency)}
                </Row>

                {totals.shippingTotal > 0 ? (
                  <Row label="Delivery">{formatMoney(totals.shippingTotal, view.currency)}</Row>
                ) : null}

                {totals.discountTotal > 0 ? (
                  <Row label="Discount">
                    <span className="text-success">
                      −{formatMoney(totals.discountTotal, view.currency)}
                    </span>
                  </Row>
                ) : null}
              </div>

              

              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">Total</span>
                <span className="text-lg font-bold">
                  {formatMoney(totals.total, view.currency)}
                </span>
              </div>

              {multiStore ? (
                <p className="text-xs text-muted">
                  Checkout runs once per shop, so you pay {view.storeCount} times — each payment goes
                  only to that seller. Finish one and the rest stay in your cart.
                </p>
              ) : null}

              <ButtonLink className="ls-edge" href="/checkout" variant="primary" size="lg"
                fullWidth
                isDisabled={totals.issues.length > 0}
              >
                Proceed to checkout
              </ButtonLink>

              {totals.issues.length > 0 ? (
                <p className="text-xs text-danger">
                  Resolve the issues above before checking out.
                </p>
              ) : null}
            </Card.Content>
          </Card>

          <InfoNote>
            Payment is handled securely by Paystack. Your order is only
            confirmed — and anything delivered — once verification succeeds.
          </InfoNote>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted">{label}</span>
      <span className="font-medium">{children}</span>
    </div>
  );
}
