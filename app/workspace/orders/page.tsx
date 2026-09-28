import { Link } from "@heroui/react/link";

import { ButtonLink } from "@/components/ui/controls";
import { PageHeader, StatusChip } from "@/components/ui/atoms";
import { EmptyState } from "@/components/ui/feedback";
import { WorkspaceFilterBar } from "@/components/workspace/WorkspaceFilterBar";
import { requireStore } from "@/lib/auth";
import { countOrders, listOrders } from "@/lib/server/commerce";
import { getStoreSettings } from "@/lib/server/stores";
import {
  PAYMENT_STATUSES,
  orderStatusTone,
  paymentStatusLabel,
  paymentStatusTone,
} from "@/lib/catalog";
import { formatNumber } from "@/lib/format";
import { formatMoney } from "@/lib/money";

export const metadata = { title: "Orders" };

export const dynamic = "force-dynamic";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "paid", label: "Paid" },
  { key: "processing", label: "Processing" },
  { key: "fulfilled", label: "Fulfilled" },
  { key: "cancelled", label: "Cancelled" },
];

/** Where an order has got to, in the order it gets there. */
const STAGES = ["Paid", "Processing", "Fulfilled"] as const;

function stageReached(status: string): number {
  if (status === "fulfilled") return 3;
  if (status === "processing") return 2;
  if (status === "paid") return 1;
  return 0;
}

/**
 * Orders are documents with a date and a stage, so this page is written like a
 * ledger: grouped by the day they came in, newest day first, each day totalled,
 * and every row carrying a small marker of how far the order has actually got.
 *
 * A cancelled order is called out rather than left sitting in the middle of a
 * stage it never reached.
 */
export default async function WorkspaceOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; payment?: string }>;
}) {
  const { store } = await requireStore();
  const params = await searchParams;
  const status = params.status ?? "all";
  const search = params.q?.trim() ?? "";
  const payment = params.payment && params.payment !== "all" ? params.payment : "all";

  /** The filters this view is actually asking for, used by both reads below. */
  const filters = {
    storeId: store.id,
    status,
    search: search || undefined,
    paymentStatus: payment === "all" ? undefined : payment,
  };

  const filtersActive = status !== "all" || payment !== "all" || Boolean(search);

  const [orders, total, settings] = await Promise.all([
    listOrders({ ...filters, limit: 100 }),
    countOrders(filters),
    getStoreSettings(store.id),
  ]);

  // The counts behind the state options are deliberately unfiltered by the other
  // facets: they answer "how many orders are in this state", not "how many of the
  // ones I have already narrowed to" — which would always equal the row count.
  const counts = await Promise.all(
    FILTERS.map((filter) => countOrders({ storeId: store.id, status: filter.key })),
  );

  // Grouped by the calendar day they were placed, because that is how a seller
  // looks for an order: "the one from yesterday", not "row 14".
  const days = new Map<string, typeof orders>();
  for (const order of orders) {
    const day = order.created_at.slice(0, 10);
    const bucket = days.get(day);
    if (bucket) bucket.push(order);
    else days.set(day, [order]);
  }

  const grouped = [...days.entries()];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Orders"
        description={`${formatNumber(total)} ${
          total === 1 ? "order" : "orders"
        } in this view. Only confirmed payments count as paid.`}
        actions={
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/workspace/orders/verify" size="sm" variant="secondary">
              Verify a receipt
            </ButtonLink>
            <ButtonLink href="/workspace/finance?tab=payments" size="sm" variant="secondary">
              Payment records
            </ButtonLink>
          </div>
        }
      />

      {/*
        One control instead of a strip. "Paid / Pending / Processing / Fulfilled"
        used to sit across the page as six tabs with counts — a wall of facets the
        seller had to read past on every visit, on a page whose job is packing
        orders. The counts are still here, in the options themselves.
      */}
      <WorkspaceFilterBar
        basePath="/workspace/orders"
        search={{
          value: search,
          label: "Search orders",
          placeholder: "Order number, customer name or email",
        }}
        facets={[
          {
            kind: "select",
            key: "status",
            label: "Order state",
            description: "How far each order has got, from paid to fulfilled.",
            value: status,
            options: FILTERS.map((filter, index) => ({
              value: filter.key,
              label: `${filter.label} · ${formatNumber(counts[index])}`,
            })),
          },
          {
            kind: "select",
            key: "payment",
            label: "Payment",
            description: "Only payments verified on the server count as paid.",
            value: payment,
            options: [
              { value: "all", label: "Any payment state" },
              ...PAYMENT_STATUSES.map((entry) => ({ value: entry.value, label: entry.label })),
            ],
          },
        ]}
      />

      {orders.length === 0 ? (
        <EmptyState
          icon="receipt"
          title={search ? `Nothing matches “${search}”` : filtersActive ? "Nothing in this view" : "No orders yet"}
          description={
            search
              ? "Try a different search, or clear it to see every order in this view."
              : filtersActive
                ? "Your filters exclude every order. Clear them to see everything again."
                : "Orders appear here the moment a customer checks out, with the items, the customer and the payment that was verified for it."
          }
          action={
            filtersActive ? null : (
              <ButtonLink href="/workspace/listings/new" variant="primary">
                Add a listing
              </ButtonLink>
            )
          }
        />
      ) : (
        <div className="space-y-8">
          {grouped.map(([day, dayOrders]) => {
            const dayRevenue = dayOrders.reduce(
              (sum, order) =>
                sum + (order.payment_status === "paid" ? Number(order.total) : 0),
              0,
            );
            const paidCount = dayOrders.filter(
              (order) => order.payment_status === "paid",
            ).length;

            return (
              <section key={day}>
                {/* Day heading — the date, what came in, and what it was worth. */}
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
                  <h2 className="text-[13px] font-semibold tracking-[0.08em] text-foreground uppercase">
                    {dayLabel(day)}
                  </h2>
                  <p className="text-[12.5px] text-muted">
                    {formatNumber(dayOrders.length)}{" "}
                    {dayOrders.length === 1 ? "order" : "orders"}
                    {paidCount > 0
                      ? ` · ${formatNumber(paidCount)} paid · ${formatMoney(
                          dayRevenue,
                          dayOrders[0].currency,
                        )}`
                      : ""}
                  </p>
                </div>

                <div className="overflow-hidden rounded-2xl ls-elev-2 bg-surface">
                  {dayOrders.map((order, index) => {
                    const reached = stageReached(order.status);
                    const cancelled =
                      order.status === "cancelled" || order.status === "refunded";

                    return (
                      <Link
                        className={`grid grid-cols-1 items-center gap-4 px-5 py-4 no-underline transition-colors hover:bg-surface-secondary/50 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.5fr)_minmax(0,1.5fr)_minmax(0,0.9fr)_auto] ${
                          index > 0 ? "mt-1" : ""
                        }`}
                        href={`/workspace/orders/${order.id}`}
                        key={order.id}
                      >
                        {/* The document reference. */}
                        <div className="min-w-0">
                          <span className="font-mono text-[14px] font-semibold text-foreground">
                            {order.order_number}
                          </span>
                          <span className="mt-1.5 flex flex-wrap gap-1.5">
                            <StatusChip
                              label={paymentStatusLabel(order.payment_status)}
                              tone={paymentStatusTone(order.payment_status)}
                            />
                            {cancelled ? (
                              <StatusChip label={order.status} tone={orderStatusTone(order.status)} />
                            ) : null}
                          </span>
                        </div>

                        {/* Who it is for, and how much of it there is. */}
                        <div className="min-w-0">
                          <span className="block truncate text-[14.5px] font-medium text-foreground">
                            {order.customer_name ?? "Guest customer"}
                          </span>
                          <span className="mt-0.5 block truncate text-[12.5px] text-muted">
                            {order.email} · {formatNumber(Number(order.item_count))}{" "}
                            {Number(order.item_count) === 1 ? "item" : "items"}
                          </span>
                        </div>

                        {/* How far it has got. Three marks, filled in order. */}
                        <div className="flex items-center gap-2">
                          {cancelled ? (
                            <span className="text-[12.5px] text-muted">
                              Stopped — no further fulfilment.
                            </span>
                          ) : (
                            STAGES.map((stage, position) => {
                              const done = reached >= position + 1;
                              return (
                                <span className="flex items-center gap-2" key={stage}>
                                  {position > 0 ? (
                                    <span
                                      aria-hidden="true"
                                      className={`h-px w-4 ${done ? "bg-foreground/40" : "bg-border"}`}
                                    />
                                  ) : null}
                                  <span className="flex items-center gap-1.5">
                                    <span
                                      aria-hidden="true"
                                      className={`size-2 rounded-full ${
                                        done ? "bg-foreground" : "border border-muted/50 bg-transparent"
                                      }`}
                                    />
                                    <span
                                      className={`hidden text-[12px] xl:inline ${
                                        done ? "font-medium text-foreground" : "text-muted"
                                      }`}
                                    >
                                      {stage}
                                    </span>
                                  </span>
                                </span>
                              );
                            })
                          )}
                        </div>

                        {/* What it is worth — the loudest number in the row. */}
                        <div className="text-left lg:text-right">
                          <span className="block text-[16px] font-semibold tabular-nums text-foreground">
                            {formatMoney(Number(order.total), order.currency)}
                          </span>
                          {Number(order.discount_total) > 0 ? (
                            <span className="mt-0.5 block text-[12px] text-success">
                              −{formatMoney(Number(order.discount_total), order.currency)}{" "}
                              {order.discount_code ?? "discount"}
                            </span>
                          ) : (
                            <span className="mt-0.5 block text-[12px] text-muted">
                              {formatTime(order.created_at)}
                            </span>
                          )}
                        </div>

                        <span className="hidden items-center justify-end text-[13px] font-medium text-muted lg:flex">
                          Open
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {settings ? (
        <p className="text-[12.5px] text-muted">
          Order numbers use the prefix <span className="font-mono">{settings.order_prefix}</span>,
          which you can change in store settings.
        </p>
      ) : null}
    </div>
  );
}

/** "Today", "Yesterday", or the date — how people actually refer to a day. */
function dayLabel(day: string): string {
  const today = new Date();
  const key = (date: Date) => date.toISOString().slice(0, 10);

  if (day === key(today)) return "Today";

  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (day === key(yesterday)) return "Yesterday";

  return new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Just the clock time, for a row inside a day that is already named. */
function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}
