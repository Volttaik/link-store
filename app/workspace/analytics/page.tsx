import { Card } from "@heroui/react/card";
import { Chip } from "@heroui/react/chip";
import { Link } from "@heroui/react/link";
import { ProgressBar } from "@heroui/react/progress-bar";

import { PageHeader, StatTile } from "@/components/ui/atoms";
import { EmptyState, InfoNote } from "@/components/ui/feedback";
import { TrendChart } from "@/components/workspace/TrendChart";
import { UrlTabs } from "@/components/workspace/UrlTabs";
import { requireStore } from "@/lib/auth";
import { listingTypeMeta } from "@/lib/catalog";
import { formatDateTime, formatNumber, formatPercent } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { getAnalyticsOverview, getDashboardMetrics } from "@/lib/server/insights";
import { getStoreSettings } from "@/lib/server/stores";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "sales", label: "Sales" },
  { key: "products", label: "Products" },
  { key: "traffic", label: "Store traffic" },
  { key: "customers", label: "Customers" },
];

/** The windows the page can be read over. */
const RANGES = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
] as const;

const DEFAULT_RANGE = 30;

/**
 * Analytics.
 *
 * Sources: `analytics_events` (views, add-to-cart, searches), `orders` and
 * `order_items`. Every panel states the window it covers, and when a metric has
 * no data behind it the page says so instead of drawing a flat fake line.
 */
export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; days?: string }>;
}) {
  const params = await searchParams;
  const { store } = await requireStore();

  const tab = TABS.some((entry) => entry.key === params.tab) ? (params.tab as string) : "overview";

  // The window is a real choice, not a caption: every figure and every chart on
  // this page is measured over the range that is selected.
  const requested = Number(params.days);
  const RANGE_DAYS = RANGES.some((entry) => entry.days === requested)
    ? requested
    : DEFAULT_RANGE;

  const settings = await getStoreSettings(store.id);
  const [metrics, analytics] = await Promise.all([
    getDashboardMetrics(store, Number(settings.low_stock_threshold), RANGE_DAYS),
    getAnalyticsOverview(store.id, RANGE_DAYS),
  ]);

  const currency = metrics.currency;

  const revenueSeries = metrics.revenueSeries.map((point) => ({
    day: point.day,
    value: point.revenue,
  }));
  const orderSeries = metrics.revenueSeries.map((point) => ({ day: point.day, value: point.orders }));
  const viewSeries = analytics.trafficSeries.map((point) => ({
    day: point.day,
    value: point.storeViews + point.listingViews,
  }));
  const cartSeries = analytics.trafficSeries.map((point) => ({ day: point.day, value: point.addToCart }));

  const windowViews = viewSeries.reduce((total, point) => total + point.value, 0);
  const referredVisits = analytics.topSources.reduce((total, source) => total + source.visits, 0);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Analytics"
        description={`Store activity and sales performance over the last ${RANGE_DAYS} days.`}
        breadcrumb={
          <span className="text-xs text-muted">
            Workspace <span className="mx-1">/</span> Analytics
          </span>
        }
        actions={<RangePicker tab={tab} days={RANGE_DAYS} />}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Store views"
          value={formatNumber(metrics.traffic.storeViews)}
          hint={`${formatNumber(windowViews)} views in ${RANGE_DAYS} days`}
        />
        <StatTile label="Listing views"
          value={formatNumber(metrics.traffic.listingViews)}
          hint={`${formatNumber(metrics.traffic.last30Days)} tracked events`}
        />
        <StatTile label="Orders"
          value={formatNumber(metrics.orders.total)}
          hint={`${formatNumber(metrics.orders.last30Days)} in ${RANGE_DAYS} days`}
        />
        <StatTile label="Conversion"
          value={metrics.conversion.rate === null ? "—" : formatPercent(metrics.conversion.rate)}
          hint={
            metrics.conversion.rate === null
              ? "Needs traffic to calculate"
              : `${formatNumber(metrics.conversion.cartAdds)} cart adds · ${formatNumber(metrics.conversion.purchases)} purchases`
          }
        />
      </div>

      <UrlTabs items={TABS} value={tab} ariaLabel="Analytics sections" />

      {tab === "overview" ? (
        <div className="flex flex-col gap-5">
          <Card className="ls-elev-2">
            <Card.Header className="flex-col items-start gap-1">
              <h2 className="text-lg font-semibold">Revenue trend</h2>
              <p className="text-sm text-muted">Paid revenue per day, last {RANGE_DAYS} days.</p>
            </Card.Header>
            
            <Card.Content>
              <TrendChart
                data={revenueSeries} label="Revenue"
                format={{ kind: "money", currency }}
              />
            </Card.Content>
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card className="ls-elev-2">
              <Card.Header className="flex-col items-start gap-1">
                <h2 className="text-lg font-semibold">Traffic trend</h2>
                <p className="text-sm text-muted">Store and listing views per day.</p>
              </Card.Header>
              
              <Card.Content>
                <TrendChart
                  data={viewSeries} label="Views" tone="success"
                  format={{ kind: "count", unit: "views" }}
                />
              </Card.Content>
            </Card>

            <Card className="ls-elev-2">
              <Card.Header className="flex-col items-start gap-1">
                <h2 className="text-lg font-semibold">Sales funnel</h2>
                <p className="text-sm text-muted">
                  How many visitors moved from browsing to buying.
                </p>
              </Card.Header>
              
              <Card.Content className="gap-4">
                <FunnelRow label="Cart adds"
                  value={metrics.conversion.cartAdds}
                  total={Math.max(metrics.conversion.cartAdds, 1)}
                />
                <FunnelRow label="Checkouts started"
                  value={metrics.conversion.checkouts}
                  total={Math.max(metrics.conversion.cartAdds, 1)}
                />
                <FunnelRow label="Purchases"
                  value={metrics.conversion.purchases}
                  total={Math.max(metrics.conversion.cartAdds, 1)} tone="success"
                />
                {metrics.conversion.cartAdds === 0 ? (
                  <InfoNote title="No funnel activity yet">
                    Once shoppers start adding items to a cart on your storefront, the funnel will fill in
                    from real events.
                  </InfoNote>
                ) : null}
              </Card.Content>
            </Card>
          </div>
        </div>
      ) : null}

      {tab === "sales" ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="ls-elev-2 lg:col-span-2">
            <Card.Header className="flex-col items-start gap-1">
              <h2 className="text-lg font-semibold">Orders per day</h2>
              <p className="text-sm text-muted">Volume of orders created each day.</p>
            </Card.Header>
            
            <Card.Content>
              <TrendChart
                data={orderSeries} label="Orders" tone="warning"
                format={{ kind: "count", unit: "orders" }}
              />
            </Card.Content>
          </Card>

          <Card className="ls-elev-2">
            <Card.Header className="flex-col items-start gap-1">
              <h2 className="text-lg font-semibold">Sales summary</h2>
              <p className="text-sm text-muted">All-time figures from paid orders.</p>
            </Card.Header>
            
            <Card.Content className="gap-4">
              <Metric label="Revenue"
                value={formatMoney(metrics.revenue.total, currency)}
                hint={
                  metrics.revenue.changePercent === null
                    ? "No previous period to compare"
                    : `${metrics.revenue.changePercent >= 0 ? "Up" : "Down"} ${formatPercent(Math.abs(metrics.revenue.changePercent))} vs previous ${RANGE_DAYS} days`
                }
              />
              <Metric label="Orders"
                value={formatNumber(metrics.orders.total)}
                hint={`${formatNumber(metrics.orders.fulfilled)} fulfilled · ${formatNumber(metrics.orders.pending)} awaiting payment`}
              />
              <Metric label="Paid orders"
                value={formatNumber(metrics.orders.paid)}
                hint={`${formatNumber(metrics.orders.total - metrics.orders.paid)} unpaid`}
              />
              <Metric label="Products in Events"
                value={formatNumber(metrics.events.products)}
                hint={`${formatNumber(metrics.events.published)} published events`}
              />
            </Card.Content>
          </Card>
        </div>
      ) : null}

      {tab === "products" ? (
        analytics.topListings.length === 0 ? (
          <EmptyState icon="products" title="No listing performance yet" description="Once listings exist and receive views or sales, their performance will be ranked here."
          />
        ) : (
          <Card className="ls-elev-2">
            <Card.Header className="flex-col items-start gap-1">
              <h2 className="text-lg font-semibold">Listing performance</h2>
              <p className="text-sm text-muted">
                Ranked by units sold, with view counts from real tracked events.
              </p>
            </Card.Header>
            
            <Card.Content className="gap-4">
              {analytics.topListings.map((listing) => (
                <div key={listing.listingId} className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <Link
                        href={`/listing/${listing.listingId}`} className="truncate font-medium"
                      >
                        {listing.title}
                      </Link>
                      <p className="text-xs text-muted">
                        {listingTypeMeta(listing.type).label} · {formatNumber(listing.views)} views
                      </p>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-muted">{formatNumber(listing.units)} sold</span>
                      <span className="font-semibold">{formatMoney(listing.revenue, currency)}</span>
                    </div>
                  </div>
                  <ProgressBar
                    aria-label={`${listing.title} sales`} color="accent" size="sm"
                    value={listing.units}
                    maxValue={Math.max(...analytics.topListings.map((entry) => entry.units), 1)}
                  />
                </div>
              ))}
            </Card.Content>
          </Card>
        )
      ) : null}

      {tab === "traffic" ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="ls-elev-2 lg:col-span-2">
            <Card.Header className="flex-col items-start gap-1">
              <h2 className="text-lg font-semibold">Daily traffic</h2>
              <p className="text-sm text-muted">
                Store views plus listing views, last {RANGE_DAYS} days.
              </p>
            </Card.Header>
            
            <Card.Content>
              <TrendChart
                data={viewSeries} label="Views" tone="success"
                format={{ kind: "count", unit: "views" }}
              />
            </Card.Content>
          </Card>

          <Card className="ls-elev-2">
            <Card.Header className="flex-col items-start gap-1">
              <h2 className="text-lg font-semibold">Referrers</h2>
              <p className="text-sm text-muted">Where tracked visits came from.</p>
            </Card.Header>
            
            <Card.Content className="gap-3">
              {analytics.topSources.length === 0 ? (
                <EmptyState
                  compact icon="link" title="No referrer data" description="Traffic sources appear once visitors reach your storefront."
                />
              ) : (
                analytics.topSources.map((source) => (
                  <div key={source.referrer} className="flex flex-col gap-1">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate">{source.referrer}</span>
                      <span className="font-medium">{formatNumber(source.visits)}</span>
                    </div>
                    <ProgressBar
                      aria-label={`${source.referrer} visits`} color="accent" size="sm"
                      value={source.visits}
                      maxValue={Math.max(referredVisits, 1)}
                    />
                  </div>
                ))
              )}
            </Card.Content>
          </Card>

          <Card className="ls-elev-2 lg:col-span-3">
            <Card.Header className="flex-col items-start gap-1">
              <h2 className="text-lg font-semibold">Marketplace searches leading to you</h2>
              <p className="text-sm text-muted">
                Platform-wide search terms used in the last {RANGE_DAYS} days.
              </p>
            </Card.Header>
            
            <Card.Content>
              {analytics.searchTerms.length === 0 ? (
                <EmptyState
                  compact icon="search" title="No searches recorded" description="Search terms are captured as shoppers use marketplace search."
                />
              ) : (
                <div className="flex flex-wrap gap-2">
                  {analytics.searchTerms.map((term) => (
                    <Chip key={term.term} variant="secondary" size="sm">
                      {term.term} · {formatNumber(term.total)}
                    </Chip>
                  ))}
                </div>
              )}
            </Card.Content>
          </Card>
        </div>
      ) : null}

      {tab === "customers" ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="ls-elev-2 lg:col-span-2">
            <Card.Header className="flex-col items-start gap-1">
              <h2 className="text-lg font-semibold">Customers</h2>
              <p className="text-sm text-muted">Behaviour computed from your order history.</p>
            </Card.Header>
            
            <Card.Content className="gap-4">
              <Metric label="Total customers"
                value={formatNumber(analytics.customerActivity.total)}
                hint={`${formatNumber(metrics.customers.new30Days)} new in the last ${RANGE_DAYS} days`}
              />
              <Metric label="Repeat rate"
                value={
                  analytics.customerActivity.repeatRate === null
                    ? "—"
                    : formatPercent(analytics.customerActivity.repeatRate)
                }
                hint={`${formatNumber(metrics.customers.returning)} returning by email`}
              />
              <Metric label="Average order value"
                value={formatMoney(analytics.customerActivity.averageOrderValue, currency)} hint="Across all orders received"
              />
              <Metric label="Orders per customer"
                value={
                  analytics.customerActivity.ordersPerCustomer === null
                    ? "—"
                    : analytics.customerActivity.ordersPerCustomer.toFixed(2)
                } hint="Lifetime average"
              />
              {analytics.customerActivity.total === 0 ? (
                <InfoNote title="No customers yet">
                  Customer analytics populate from the first order placed in your store.
                </InfoNote>
              ) : null}
            </Card.Content>
          </Card>

          <Card className="ls-elev-2">
            <Card.Header className="flex-col items-start gap-1">
              <h2 className="text-lg font-semibold">Recent orders</h2>
              <p className="text-sm text-muted">Newest activity from your buyers.</p>
            </Card.Header>
            
            <Card.Content className="gap-3">
              {metrics.recentOrders.length === 0 ? (
                <EmptyState
                  compact icon="receipt" title="No orders yet" description="Order activity will show up here as it happens."
                />
              ) : (
                metrics.recentOrders.map((order) => (
                  <div key={order.id} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/workspace/orders/${order.id}`} className="truncate">
                        {order.order_number}
                      </Link>
                      <p className="text-xs text-muted">
                        {order.customer_name ?? order.email} · {formatDateTime(order.created_at)}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-medium">
                      {formatMoney(order.total, order.currency)}
                    </span>
                  </div>
                ))
              )}
            </Card.Content>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm text-muted">{label}</p>
        {hint ? <p className="text-xs text-muted">{hint}</p> : null}
      </div>
      <p className="text-base font-semibold">{value}</p>
    </div>
  );
}

/**
 * The window the page is being read over.
 *
 * Three choices, each a link that keeps the section being viewed — because
 * changing the period should never throw you back to the first tab. Ordering the
 * results is not a separate control: the period *is* the control.
 */
function RangePicker({ tab, days }: { tab: string; days: number }) {
  return (
    <div
      aria-label="Period"
      className="flex items-center gap-0.5 rounded-full ls-elev-2 bg-surface p-0.5"
      role="group"
    >
      {RANGES.map((range) => {
        const active = range.days === days;

        return (
          <Link
            aria-current={active ? "true" : undefined}
            className={`rounded-full px-3 py-1.5 text-[12.5px] font-medium no-underline transition-colors ${
              active
                ? "bg-surface-secondary text-foreground"
                : "text-muted hover:text-foreground"
            }`}
            href={`/workspace/analytics?tab=${tab}&days=${range.days}`}
            key={range.days}
          >
            {range.label}
          </Link>
        );
      })}
    </div>
  );
}

function FunnelRow({
  label,
  value,
  total,
  tone = "accent",
}: {
  label: string;
  value: number;
  total: number;
  tone?: "accent" | "success";
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted">{label}</span>
        <span className="font-medium">{formatNumber(value)}</span>
      </div>
      <ProgressBar aria-label={label} size="sm" color={tone} value={value} maxValue={total} />
    </div>
  );
}
