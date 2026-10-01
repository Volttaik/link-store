import { Card } from "@heroui/react/card";
import { Chip } from "@heroui/react/chip";
import { Link } from "@heroui/react/link";

import { PageHeader, StatTile } from "@/components/ui/atoms";
import { EmptyState } from "@/components/ui/feedback";
import { formatDateTime, formatNumber } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { getPlatformMetrics, listStoresForAdmin } from "@/lib/server/admin";

export const dynamic = "force-dynamic";

export const metadata = { title: "Overview" };

/**
 * Platform overview.
 *
 * GMV comes from orders whose payment status is `paid`, so it reflects money
 * Paystack confirmed rather than orders that were merely created.
 */
export default async function AdminOverviewPage() {
  const [metrics, recentStores] = await Promise.all([
    getPlatformMetrics(),
    listStoresForAdmin({ limit: 6 }),
  ]);

  const { gmv } = metrics;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Platform overview" description="Every store, listing and naira that moves through Rush Cart."
        breadcrumb={
          <span className="text-xs text-muted">
            Admin <span className="mx-1">/</span> Overview
          </span>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Paid volume"
          value={formatMoney(gmv.gross, gmv.currency)}
          hint={`${formatNumber(gmv.orders)} paid orders`}
        />
        <StatTile label="Stores"
          value={formatNumber(metrics.stores.total)}
          hint={`${formatNumber(metrics.stores.published)} public · ${formatNumber(metrics.stores.new30Days)} new in 30 days`}
        />
        <StatTile label="Accounts"
          value={formatNumber(metrics.users.total)}
          hint={`${formatNumber(metrics.users.admins)} admin${metrics.users.admins === 1 ? "" : "s"} · ${formatNumber(metrics.users.new30Days)} new in 30 days`}
        />
        <StatTile label="Listings"
          value={formatNumber(metrics.catalogue.listings)}
          hint={`${formatNumber(metrics.catalogue.active)} published · ${formatNumber(metrics.catalogue.events)} events`}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="ls-elev-2 lg:col-span-2">
          <Card.Header className="flex-col items-start gap-1">
            <h2 className="text-lg font-semibold">Newest stores</h2>
            <p className="text-sm text-muted">The last few storefronts created on the platform.</p>
          </Card.Header>
          
          <Card.Content className="gap-4">
            {recentStores.length === 0 ? (
              <EmptyState icon="storefront" title="No stores yet" description="Storefronts appear here as sellers onboard onto the platform."
              />
            ) : (
              recentStores.map((store) => (
                <div
                  key={store.id} className="flex flex-wrap items-center justify-between gap-3 pb-3 last:pb-0"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/@${store.slug}`} className="truncate font-medium">
                        {store.name}
                      </Link>
                      <Chip size="sm" variant="secondary"
                        color={store.is_published ? "success" : "default"}
                      >
                        {store.is_published ? "public" : "hidden"}
                      </Chip>
                    </div>
                    <p className="text-xs text-muted">
                      {store.owner_email} · joined {formatDateTime(store.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-muted">{formatNumber(store.listings)} listings</span>
                    <span className="font-medium">{formatMoney(store.revenue, store.currency)}</span>
                  </div>
                </div>
              ))
            )}
          </Card.Content>
        </Card>

        <Card className="ls-elev-2">
          <Card.Header className="flex-col items-start gap-1">
            <h2 className="text-lg font-semibold">Order health</h2>
            <p className="text-sm text-muted">Across every store, all time.</p>
          </Card.Header>
          
          <Card.Content className="gap-4">
            <Row label="Orders created" value={formatNumber(metrics.orders.total)} />
            <Row label="Orders paid" value={formatNumber(metrics.orders.paid)} />
            <Row label="Awaiting payment"
              value={formatNumber(metrics.orders.total - metrics.orders.paid)}
            />
            <Row label="Orders in last 30 days" value={formatNumber(metrics.orders.last30Days)} />
            <Row label="Volume in last 30 days"
              value={formatMoney(gmv.last30Days, gmv.currency)}
            />
          </Card.Content>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-muted">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}
