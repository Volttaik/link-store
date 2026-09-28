import { Chip } from "@heroui/react/chip";
import { Link } from "@heroui/react/link";

import { PageHeader, SectionHeader, StatusChip, chipColor } from "@/components/ui/atoms";
import { ButtonLink } from "@/components/ui/controls";
import { EmptyState, OpenLink } from "@/components/ui/feedback";
import { Icon } from "@/components/ui/Icon";
import {
  AreaChart,
  ColumnStrip,
  DashboardCard,
  DeltaBadge,
  Figure,
  FigureGroup,
  ProgressRow,
  RankedRow,
  StackedBar,
} from "@/components/workspace/DashboardCards";
import { requireStore } from "@/lib/auth";
import { orderStatusTone } from "@/lib/catalog";
import { formatDateTime, formatNumber, formatPercent, formatRelative } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { getDashboardMetrics } from "@/lib/server/insights";
import { countListings } from "@/lib/server/listings";
import { getStoreSettings } from "@/lib/server/stores";

export const metadata = { title: "Dashboard" };

export const dynamic = "force-dynamic";

/**
 * The seller dashboard.
 *
 * Every figure is a database aggregate grouped into a module that has a reason
 * to exist — sales, catalogue, traffic, activity — instead of a scatter of
 * one-number pills. A brand-new store sees zeros, a setup checklist and honest
 * empty states: never a fabricated number designed to make the page look busy.
 */
export default async function WorkspaceDashboardPage() {
  const { store } = await requireStore();
  const settings = await getStoreSettings(store.id);

  const [metrics, totalListings] = await Promise.all([
    getDashboardMetrics(store, Number(settings.low_stock_threshold)),
    countListings({ storeId: store.id, status: "all" }),
  ]);

  const isBrandNew =
    totalListings === 0 && metrics.orders.total === 0 && metrics.traffic.storeViews === 0;

  const storePublished = store.is_published === 1;
  const setupSteps = [
    {
      label: "Create your storefront",
      done: true,
      href: `/@${store.slug}`,
      note: `Your link is /@${store.slug}`,
    },
    {
      label: "Add your first listing",
      done: totalListings > 0,
      href: "/workspace/listings/new",
      note: "Products, services, food, digital files or events.",
    },
    {
      label: "Publish your storefront",
      done: storePublished,
      href: "/workspace/settings?tab=store",
      note: storePublished ? "Live and discoverable." : "Requires at least one published listing.",
    },
    {
      label: "Add payout bank details",
      done: Boolean(settings.payout_account_number),
      href: "/workspace/settings?tab=payments",
      note: "Needed before you can withdraw earnings.",
    },
  ];

  const completedSteps = setupSteps.filter((step) => step.done).length;
  const currency = metrics.currency;

  // Paid activity inside the 30-day window the chart plots.
  const windowRevenue = metrics.salesSeries.reduce((total, point) => total + point.revenue, 0);
  const windowOrders = metrics.salesSeries.reduce((total, point) => total + point.orders, 0);
  const averageOrder = windowOrders > 0 ? windowRevenue / windowOrders : 0;
  const hasComparison = metrics.revenue.previous30Days > 0;

  const chartPoints = metrics.salesSeries.map((point) => ({ day: point.day, value: point.revenue }));
  const orderPoints = metrics.salesSeries.map((point) => ({ day: point.day, value: point.orders }));

  // Stock mix. `active` already includes the low/out-of-stock listings, so the
  // segments are a real partition rather than a double count.
  const healthyStock = Math.max(
    0,
    metrics.catalogue.active - metrics.catalogue.lowStock - metrics.catalogue.outOfStock,
  );
  const needsAttention = metrics.catalogue.lowStock + metrics.catalogue.outOfStock;

  const funnel = [
    { label: "Store views", value: metrics.traffic.storeViews },
    { label: "Listing views", value: metrics.traffic.listingViews },
    { label: "Added to cart", value: metrics.conversion.cartAdds },
    { label: "Checkout started", value: metrics.conversion.checkouts },
    { label: "Purchased", value: metrics.conversion.purchases },
  ];
  const funnelPeak = Math.max(...funnel.map((step) => step.value), 1);

  const topListingRevenue = metrics.topListings.reduce(
    (highest, listing) => Math.max(highest, Number(listing.revenue)),
    0,
  );

  return (
    <div className="space-y-8">
      <PageHeader
        title="Overview"
        description={
          storePublished
            ? "Your store at a glance. Storefront is live."
            : "Your store at a glance. Storefront not published yet."
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/workspace/listings/new" variant="primary" size="sm">
              Add a listing
            </ButtonLink>
            <ButtonLink
              href={`/@${store.slug}`}
              variant="secondary"
              size="sm"
              isDisabled={!storePublished}
            >
              View storefront
            </ButtonLink>
          </div>
        }
      />

      {isBrandNew ? (
        <DashboardCard
          title="Get your store open"
          description="Real figures only. Everything here moves as you sell."
          icon="storefront"
        >
          <ProgressRow
            label="Setup progress"
            value={completedSteps}
            max={setupSteps.length}
            valueLabel={`${completedSteps} of ${setupSteps.length} steps`}
          />

          <div className="flex flex-col gap-2">
            {setupSteps.map((step) => (
              <div
                key={step.label}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-secondary/40 p-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    aria-hidden="true"
                    className={`flex size-6 shrink-0 items-center justify-center rounded-full ${
                      step.done ? "bg-success/15 text-success" : "bg-surface-tertiary text-muted"
                    }`}
                  >
                    {step.done ? <Icon name="check" size={12} /> : null}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{step.label}</p>
                    <p className="text-xs text-muted">{step.note}</p>
                  </div>
                </div>
                {!step.done ? (
                  <ButtonLink href={step.href} size="sm" variant="secondary">
                    Do it
                  </ButtonLink>
                ) : null}
              </div>
            ))}
          </div>
        </DashboardCard>
      ) : null}

      {/* Sales — the headline numbers, then the shape of the month behind them. */}
      <section className="space-y-3">
        <SectionHeader
          title="Sales"
          icon="trendingUp"
          description="Paid revenue, orders and units sold over the last 30 days."
        />

        <DashboardCard
          title="Revenue & orders"
          icon="finance"
          action={<OpenLink href="/workspace/analytics?tab=sales">Open Analytics</OpenLink>}
        >
          <FigureGroup>
            <Figure
              size="lg"
              label="Revenue · 30 days"
              value={formatMoney(metrics.revenue.last30Days, currency)}
              delta={
                hasComparison && metrics.revenue.changePercent !== null ? (
                  <DeltaBadge value={metrics.revenue.changePercent} />
                ) : undefined
              }
              hint={
                hasComparison
                  ? `vs ${formatMoney(metrics.revenue.previous30Days, currency)} the 30 days before`
                  : "No previous 30 days to compare against"
              }
            />
            <Figure
              label="Orders · 30 days"
              value={formatNumber(windowOrders)}
              hint={`${formatNumber(metrics.orders.pending)} pending · ${formatNumber(
                metrics.orders.fulfilled,
              )} fulfilled`}
            />
            <Figure
              label="Products sold"
              value={formatNumber(metrics.units.last30Days)}
              hint={`${formatNumber(metrics.units.total)} since you opened`}
            />
            <Figure
              label="Average order"
              value={formatMoney(averageOrder, currency)}
              hint={
                windowOrders > 0
                  ? `Across ${formatNumber(windowOrders)} paid ${
                      windowOrders === 1 ? "order" : "orders"
                    }`
                  : "No paid orders in this window"
              }
            />
          </FigureGroup>

          {windowRevenue > 0 ? (
            <div className="grid gap-6 xl:grid-cols-2">
              <AreaChart
                data={chartPoints}
                gradientId="ls-dashboard-revenue"
                label="Revenue per day"
                formatValue={(value) => formatMoney(value, currency)}
              />
              <ColumnStrip
                data={orderPoints}
                label="Orders per day"
                formatValue={(value) => formatNumber(value)}
              />
            </div>
          ) : (
            <EmptyState
              compact
              icon="trendingUp"
              title="No paid revenue in the last 30 days"
              description="Charts fill in as payments are verified."
              action={
                <ButtonLink href="/workspace/listings/new" size="sm" variant="primary">
                  Add a listing
                </ButtonLink>
              }
            />
          )}
        </DashboardCard>
      </section>

      {/* Catalogue — what is on sale, what sold, and what needs restocking. */}
      <section className="space-y-3">
        <SectionHeader
          title="Catalogue"
          icon="products"
          description="Your listings, how they are stocked, and which ones earn."
        />

        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          <DashboardCard
            title="Top products"
            icon="products"
            description="Ranked by paid revenue, all time."
            className="xl:col-span-2"
            action={<OpenLink href="/workspace/analytics?tab=products">Open Analytics</OpenLink>}
          >
            {metrics.topListings.length === 0 ? (
              <EmptyState
                compact
                icon="products"
                title="No sales data yet"
                description="Your best sellers appear after your first paid order."
              />
            ) : (
              <div className="flex flex-col gap-4">
                {metrics.topListings.map((listing, index) => (
                  <RankedRow
                    key={`${listing.listingId ?? listing.title}-${listing.title}`}
                    rank={index + 1}
                    title={listing.title}
                    meta={`${formatNumber(listing.units)} sold`}
                    value={Number(listing.revenue)}
                    max={topListingRevenue}
                    valueLabel={formatMoney(Number(listing.revenue), currency)}
                  />
                ))}
              </div>
            )}
          </DashboardCard>

          <DashboardCard
            title="Inventory"
            icon="inventory"
            description={`${formatNumber(totalListings)} listings, tracked against a threshold of ${settings.low_stock_threshold}.`}
            badge={
              needsAttention > 0 ? (
                <StatusChip
                  label={`${formatNumber(needsAttention)} need${needsAttention === 1 ? "s" : ""} attention`}
                  tone="warning"
                />
              ) : null
            }
            action={<OpenLink href="/workspace/inventory">Open Inventory</OpenLink>}
          >
            <StackedBar
              segments={[
                { label: "In stock", value: healthyStock, tone: "success" },
                { label: "Running low", value: metrics.catalogue.lowStock, tone: "warning" },
                { label: "Out of stock", value: metrics.catalogue.outOfStock, tone: "danger" },
                { label: "Draft", value: metrics.catalogue.draft, tone: "neutral" },
              ]}
            />

            <div className="flex flex-col gap-2.5 pt-3">
              <p className="text-[11px] font-medium tracking-wider text-muted uppercase">
                Restock first
              </p>

              {metrics.lowStockItems.length === 0 ? (
                <p className="text-[13px] text-muted">
                  Nothing is at or below your threshold of {settings.low_stock_threshold} — stock
                  levels are healthy.
                </p>
              ) : (
                metrics.lowStockItems.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate">{item.title}</span>
                    <Chip
                      color={item.stock <= 0 ? "danger" : "warning"}
                      size="sm"
                      variant="soft"
                    >
                      {item.stock <= 0 ? "Out of stock" : `${item.stock} left`}
                    </Chip>
                  </div>
                ))
              )}
            </div>
          </DashboardCard>
        </div>
      </section>

      {/* Traffic & events — how people arrive, and what is on the calendar. */}
      <section className="space-y-3">
        <SectionHeader
          title="Storefront"
          icon="activity"
          description="How shoppers move through your store, and what is coming up."
        />

        <div className="grid gap-4 lg:grid-cols-2">
          <DashboardCard
            title="Traffic & conversion"
            icon="analytics"
            description="Counted per storefront view, all time."
            action={<OpenLink href="/workspace/analytics?tab=traffic">Open Analytics</OpenLink>}
          >
            <FigureGroup columns={2}>
              <Figure
                label="Store views"
                value={formatNumber(metrics.traffic.storeViews)}
                hint={`${formatNumber(metrics.traffic.last30Days)} events in the last 30 days`}
              />
              <Figure
                label="Conversion"
                value={
                  metrics.conversion.rate === null ? "—" : formatPercent(metrics.conversion.rate, 2)
                }
                hint={
                  metrics.conversion.rate === null
                    ? "Needs storefront traffic to calculate"
                    : `${formatNumber(metrics.conversion.purchases)} purchases from ${formatNumber(
                        metrics.traffic.storeViews,
                      )} views`
                }
              />
              <Figure
                label="Customers"
                value={formatNumber(metrics.customers.total)}
                hint={`${formatNumber(metrics.customers.returning)} returning · ${formatNumber(
                  metrics.customers.new30Days,
                )} new in 30 days`}
              />
            </FigureGroup>

            <div className="flex flex-col gap-4">
              {funnel.map((step) => (
                <ProgressRow
                  key={step.label}
                  label={step.label}
                  value={step.value}
                  max={funnelPeak}
                  valueLabel={formatNumber(step.value)}
                  tone={step.label === "Purchased" ? "success" : "accent"}
                />
              ))}
            </div>
          </DashboardCard>

          <DashboardCard
            title="Events"
            icon="events"
            description="Tickets sold across every event you have published."
            action={<OpenLink href="/workspace/events">Open Events</OpenLink>}
          >
            {metrics.events.published === 0 && metrics.events.ticketsSold === 0 ? (
              <EmptyState
                compact
                icon="events"
                title="No events yet"
                description="Publish an event and its ticket sales appear here."
              />
            ) : (
              <FigureGroup columns={2}>
                <Figure
                  label="Tickets sold"
                  value={formatNumber(metrics.events.ticketsSold)}
                  hint="Across all of your events"
                />
                <Figure
                  label="Upcoming"
                  value={formatNumber(metrics.events.upcoming)}
                  hint={`${formatNumber(metrics.events.published)} published in total`}
                />
              </FigureGroup>
            )}
          </DashboardCard>
        </div>
      </section>

      {/* Activity — the most recent things that actually happened. */}
      <section className="space-y-3">
        <SectionHeader
          title="Recent activity"
          icon="orders"
          description="The latest orders and money movements in your store."
        />

        <div className="grid gap-4 lg:grid-cols-2">
          <DashboardCard
            title="Recent orders"
            icon="orders"
            description="Newest first."
            action={<OpenLink href="/workspace/orders">Open Orders</OpenLink>}
          >
            {metrics.recentOrders.length === 0 ? (
              <EmptyState
                compact
                icon="orders"
                title="No orders yet"
                description="Orders appear here when a customer checks out."
                action={
                  <ButtonLink href="/workspace/listings/new" size="sm" variant="primary">
                    Add your first listing
                  </ButtonLink>
                }
              />
            ) : (
              <div className="flex flex-col gap-3">
                {metrics.recentOrders.map((order) => (
                  <div
                    key={order.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-secondary/40 p-3 text-sm"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/workspace/orders/${order.id}`}
                          className="font-mono text-xs font-semibold text-foreground"
                        >
                          {order.order_number}
                        </Link>
                        <Chip color={chipColor(orderStatusTone(order.status))} size="sm" variant="soft">
                          {order.status}
                        </Chip>
                      </div>
                      <p className="truncate text-xs text-muted">
                        {order.customer_name ?? order.email}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold tabular-nums">
                        {formatMoney(Number(order.total), order.currency)}
                      </p>
                      <p className="text-xs text-muted">{formatRelative(order.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </DashboardCard>

          <DashboardCard
            title="Recent ledger activity"
            icon="transactions"
            description="Sales, platform fees and payouts."
            action={<OpenLink href="/workspace/finance?tab=transactions">Open Transactions</OpenLink>}
          >
            {metrics.recentTransactions.length === 0 ? (
              <EmptyState
                compact
                icon="transactions"
                title="No transactions yet"
                description="Recorded from your first payment."
              />
            ) : (
              <div className="flex flex-col gap-3">
                {metrics.recentTransactions.map((transaction) => (
                  <div
                    key={transaction.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-secondary/40 p-3 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {transaction.description ?? transaction.type}
                      </p>
                      <p className="text-xs text-muted">{formatDateTime(transaction.created_at)}</p>
                    </div>
                    <span
                      className={`font-medium tabular-nums ${
                        transaction.direction === "credit" ? "text-success" : "text-danger"
                      }`}
                    >
                      {transaction.direction === "credit" ? "+" : "−"}
                      {formatMoney(Number(transaction.amount), transaction.currency)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </DashboardCard>
        </div>
      </section>
    </div>
  );
}
