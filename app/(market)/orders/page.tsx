import { Card } from "@heroui/react/card";
import { cookies } from "next/headers";

import { PurchaseCard, type PurchaseSummary } from "@/components/cards/PurchaseCard";
import { ButtonLink } from "@/components/ui/controls";
import { PageHeader } from "@/components/ui/atoms";
import { EmptyState } from "@/components/ui/feedback";
import { OrderLookupForm } from "@/components/marketplace/OrderLookupForm";
import { formatNumber } from "@/lib/format";
import { getCurrentUser } from "@/lib/auth";
import {
  ORDER_ACCESS_COOKIE,
  getOrderByAccessToken,
  getOrderWithItems,
  listOrders,
} from "@/lib/server/commerce";
import { formatMoney } from "@/lib/money";

export const metadata = { title: "Your orders" };

export const dynamic = "force-dynamic";

/**
 * What a buyer wants from an orders page is not a table — it is the answer to
 * "where is my thing?".
 *
 * So every order is rendered as a purchase: a compact transaction record whose
 * state is said in plain words and shown as progress, written for the person
 * who paid rather than the seller. The reference, the amount and the way in
 * are all present, but the state of the transaction is the point.
 */

export default async function BuyerOrdersPage() {
  const user = await getCurrentUser();

  /**
   * Everything this person bought — from this account, and any order placed
   * later with the same email as a guest. Fetched separately because they are
   * two different claims to the same purchase, then merged by order id so an
   * order that is both is only listed once.
   */
  const cookieStore = await cookies();
  const guestToken = cookieStore.get(ORDER_ACCESS_COOKIE)?.value ?? null;
  const guestOrder = guestToken ? await getOrderByAccessToken(guestToken) : null;

  /** The order this browser was granted at checkout — a guest's way back in. */
  const guestSummary: PurchaseSummary | null = guestOrder
    ? await (async () => {
        const withItems = await getOrderWithItems(guestOrder.id);
        if (!withItems) return null;
        return {
          ...guestOrder,
          store_name: withItems.storeName,
          item_count: withItems.items.reduce((total, item) => total + item.quantity, 0),
        };
      })()
    : null;

  const orders = await (async () => {
        const collected: PurchaseSummary[] = [];

        if (user) {
          const [byAccount, byEmail] = await Promise.all([
            listOrders({ userId: user.id, limit: 50 }),
            listOrders({ email: user.email, limit: 50 }),
          ]);
          collected.push(...byAccount, ...byEmail);
        }

        if (guestSummary) collected.push(guestSummary);

        const merged = new Map(collected.map((order) => [order.id, order] as const));

        return [...merged.values()].sort((a, b) =>
          a.created_at < b.created_at ? 1 : -1,
        );
      })();

  const spent = orders.reduce(
    (sum, order) => sum + (order.payment_status === "paid" ? Number(order.total) : 0),
    0,
  );

  return (
    <div className="mx-auto w-full max-w-4xl space-y-7 px-4 py-8 sm:px-6">
      <PageHeader
        title="Your orders"
        description={
          user
            ? `Everything you have bought with this account. ${
                orders.length > 0
                  ? `${formatNumber(orders.length)} ${
                      orders.length === 1 ? "order" : "orders"
                    } · ${formatMoney(spent, orders[0]?.currency ?? "NGN")} paid in total.`
                  : ""
              }`
            : "Sign in to see your orders, or track a guest order with the email and order number you were given at checkout."
        }
        actions={
          <ButtonLink href="/products" size="sm" variant="secondary">
            Continue shopping
          </ButtonLink>
        }
      />

      {orders.length === 0 ? (
        <EmptyState
          icon="receipt"
          title={user ? "No orders yet" : "Sign in to see your orders"}
          description={
            user
              ? "Your orders appear here with receipts and delivery status. If you checked out as a guest, look yours up below."
              : "Guest orders can be opened with the email address and order number from your receipt."
          }
          action={
            <ButtonLink href="/products" variant="primary">
              Browse the marketplace
            </ButtonLink>
          }
        />
      ) : (
        <div className="flex flex-col gap-5">
          {orders.map((order) => (
            <PurchaseCard key={order.id} order={order} />
          ))}
        </div>
      )}

      <Card className="ls-elev-2">
        <Card.Header className="flex-col items-start gap-1">
          <p className="text-[15px] font-semibold text-foreground">Find an order</p>
          <p className="text-[13px] text-muted">
            Guest orders open with the email address and order number from your receipt.
          </p>
        </Card.Header>
        <Card.Content>
          <OrderLookupForm />
        </Card.Content>
      </Card>
    </div>
  );
}
