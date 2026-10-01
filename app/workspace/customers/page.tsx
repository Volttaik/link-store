import { Avatar } from "@heroui/react/avatar";
import { Card } from "@heroui/react/card";
import { Link } from "@heroui/react/link";

import { PageHeader, StatTile, StatusChip } from "@/components/ui/atoms";
import { EmptyState } from "@/components/ui/feedback";
import { requireStore } from "@/lib/auth";
import { countCustomers, listCustomers } from "@/lib/server/management";
import { listOrders } from "@/lib/server/commerce";
import { formatDate, formatNumber, formatRelative } from "@/lib/format";
import { formatMoney } from "@/lib/money";

export const metadata = { title: "Customers" };

export const dynamic = "force-dynamic";

/**
 * Customers are ranked, not listed.
 *
 * The question a seller actually has is "who is worth keeping?", and the answer
 * is a relationship: how much someone has spent, how often they come back, and
 * how recently they did. So the list is ordered by lifetime value, each person
 * carries a bar showing their share of the shop's best customer, and the
 * repeat buyers are marked — the shape of the list is the answer.
 */
export default async function CustomersPage() {
  const { store } = await requireStore();

  const [customers, total, recentOrders] = await Promise.all([
    listCustomers({ storeId: store.id, limit: 100 }),
    countCustomers(store.id),
    listOrders({ storeId: store.id, paymentStatus: "paid", limit: 6 }),
  ]);

  const ranked = customers
    .slice()
    .sort((a, b) => Number(b.total_spent) - Number(a.total_spent));

  const lifetimeValue = ranked.reduce((sum, customer) => sum + Number(customer.total_spent), 0);
  const returning = ranked.filter((customer) => Number(customer.orders_count) > 1).length;
  const bestSpend = Math.max(...ranked.map((customer) => Number(customer.total_spent)), 1);
  const repeatRevenue = ranked
    .filter((customer) => Number(customer.orders_count) > 1)
    .reduce((sum, customer) => sum + Number(customer.total_spent), 0);

  return (
    <div className="space-y-7">
      <PageHeader
        title="Customers"
        description={`${formatNumber(total)} ${
          total === 1 ? "person has" : "people have"
        } ordered from your store. Every one is a record of a real payment.`}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          hint="One record per email per store"
          label="Customers"
          value={formatNumber(total)}
        />
        <StatTile
          hint={
            total > 0
              ? `${((returning / total) * 100).toFixed(0)}% of your customers`
              : "Nobody has come back yet"
          }
          label="Returning"
          value={formatNumber(returning)}
        />
        <StatTile
          hint="Everything your customers have ever paid"
          label="Lifetime value"
          value={formatMoney(lifetimeValue, store.currency)}
        />
        <StatTile
          hint={
            lifetimeValue > 0
              ? `${((repeatRevenue / lifetimeValue) * 100).toFixed(0)}% of that is repeat business`
              : "No repeat business yet"
          }
          label="Repeat revenue"
          value={formatMoney(repeatRevenue, store.currency)}
        />
      </div>

      {ranked.length === 0 ? (
        <EmptyState
          icon="customers"
          title="No customers yet"
          description="A customer record is created the first time someone checks out with your store. They appear here, ranked by what they have spent with you."
        />
      ) : (
        <section className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
              By lifetime value
            </h2>
            <p className="text-[12.5px] text-muted">
              Bars are measured against your best customer
            </p>
          </div>

          <Card className="overflow-hidden ls-elev-2">
            {ranked.map((customer, index) => {
              const spent = Number(customer.total_spent);
              const share = (spent / bestSpend) * 100;
              const repeat = Number(customer.orders_count) > 1;
              const name = customer.name ?? "Guest customer";

              return (
                <div
                  className={`flex flex-wrap items-center gap-x-5 gap-y-3 px-5 py-4 ${
                    index > 0 ? "mt-1" : ""
                  }`}
                  key={customer.id}
                >
                  {/* Rank — the list means something, so the position is shown. */}
                  <span className="w-5 shrink-0 text-right text-[13px] font-semibold tabular-nums text-muted">
                    {index + 1}
                  </span>

                  <Avatar className="size-10 shrink-0">
                    <Avatar.Fallback>{name.slice(0, 2).toUpperCase()}</Avatar.Fallback>
                  </Avatar>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-[15px] font-medium text-foreground">{name}</p>
                      {repeat ? <StatusChip label="Repeat" tone="primary" /> : null}
                    </div>
                    <p className="mt-0.5 truncate text-[12.5px] text-muted">
                      {customer.email}
                      {customer.phone ? ` · ${customer.phone}` : ""} · joined{" "}
                      {formatDate(customer.created_at)}
                    </p>

                    {/* Their weight in the shop, drawn. */}
                    <div className="mt-2.5 h-1.5 max-w-xs overflow-hidden rounded-full bg-surface-secondary">
                      <span
                        className={`block h-full rounded-full ${
                          repeat ? "bg-foreground/80" : "bg-foreground/35"
                        }`}
                        style={{ width: `${Math.max(share, 3)}%` }}
                      />
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <p className="text-[15px] leading-tight font-semibold tabular-nums text-foreground">
                      {formatMoney(spent, store.currency)}
                    </p>
                    <p className="mt-0.5 text-[12.5px] text-muted">
                      {formatNumber(Number(customer.orders_count))}{" "}
                      {Number(customer.orders_count) === 1 ? "order" : "orders"}
                      {customer.last_order_at
                        ? ` · last ${formatRelative(customer.last_order_at)}`
                        : ""}
                    </p>
                  </div>
                </div>
              );
            })}
          </Card>
        </section>
      )}

      {recentOrders.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
            Latest paid orders
          </h2>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {recentOrders.map((order) => (
              <Link
                className="flex items-center justify-between gap-4 ls-lift rounded-xl bg-surface px-4 py-3.5 no-underline"
                href={`/workspace/orders/${order.id}`}
                key={order.id}
              >
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-medium text-foreground">
                    {order.customer_name ?? order.email}
                  </span>
                  <span className="mt-0.5 block font-mono text-[12px] text-muted">
                    {order.order_number}
                  </span>
                </span>
                <span className="shrink-0 text-[15px] font-semibold tabular-nums text-foreground">
                  {formatMoney(Number(order.total), order.currency)}
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
