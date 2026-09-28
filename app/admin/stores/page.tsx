import { Card } from "@heroui/react/card";
import { Chip } from "@heroui/react/chip";
import { Link } from "@heroui/react/link";
import { Table } from "@heroui/react/table";
import { TableBody, TableCell, TableColumn, TableHeader, TableRow } from "@heroui/react";

import { AdminSearch, StoreVisibilityControl } from "@/components/admin/AdminControls";
import { PageHeader, StatTile } from "@/components/ui/atoms";
import { EmptyState } from "@/components/ui/feedback";
import { UrlPagination } from "@/components/workspace/UrlPagination";
import { formatDate, formatNumber } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { countStoresForAdmin, getPlatformMetrics, listStoresForAdmin } from "@/lib/server/admin";

export const dynamic = "force-dynamic";

export const metadata = { title: "Stores" };

const PAGE_SIZE = 20;

/**
 * Every storefront on the platform, with the numbers that matter for moderation:
 * how much is published, how much has sold, and whether it is currently visible.
 */
export default async function AdminStoresPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const page = Math.max(Number(params.page ?? "1") || 1, 1);

  const [total, metrics] = await Promise.all([
    countStoresForAdmin(query),
    getPlatformMetrics(),
  ]);

  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);
  const currentPage = Math.min(page, totalPages);

  const stores = await listStoresForAdmin({
    search: query,
    limit: PAGE_SIZE,
    offset: (currentPage - 1) * PAGE_SIZE,
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Stores" description="Every storefront, its owner and its sales performance."
        breadcrumb={
          <span className="text-xs text-muted">
            Admin <span className="mx-1">/</span> Stores
          </span>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile label="Stores" value={formatNumber(metrics.stores.total)} />
        <StatTile label="Public" value={formatNumber(metrics.stores.published)} hint="Visible in discovery" />
        <StatTile label="Suspended or hidden"
          value={formatNumber(metrics.stores.total - metrics.stores.published)}
        />
      </div>

      <Card className="ls-elev-2">
        <Card.Content className="gap-4">
          <AdminSearch action="/admin/stores" defaultValue={query} placeholder="Search by store or owner email" />

          {stores.length === 0 ? (
            <EmptyState icon="search"
              title={query ? "No stores match that search" : "No stores yet"}
              description={
                query
                  ? "Try a different store name, handle or owner email."
                  : "Sellers will appear here as soon as they create a storefront."
              }
            />
          ) : (
            <Table aria-label="All stores">
              <TableHeader>
                <TableColumn>Store</TableColumn>
                <TableColumn>Owner</TableColumn>
                <TableColumn>Listings</TableColumn>
                <TableColumn>Orders</TableColumn>
                <TableColumn>Paid volume</TableColumn>
                <TableColumn>Joined</TableColumn>
                <TableColumn className="text-end">Visibility</TableColumn>
              </TableHeader>
              <TableBody items={stores}>
                {(store) => (
                  <TableRow key={store.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <Link href={`/@${store.slug}`} className="font-medium">
                          {store.name}
                        </Link>
                        <span className="text-xs text-muted">@{store.slug}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm">{store.owner_name}</span>
                        <span className="text-xs text-muted">{store.owner_email}</span>
                      </div>
                    </TableCell>
                    <TableCell>{formatNumber(store.listings)}</TableCell>
                    <TableCell>{formatNumber(store.orders)}</TableCell>
                    <TableCell>
                      <span className="font-medium">{formatMoney(store.revenue, store.currency)}</span>
                    </TableCell>
                    <TableCell>
                      <Chip size="sm" variant="secondary">
                        {formatDate(store.created_at)}
                      </Chip>
                    </TableCell>
                    <TableCell>
                      <StoreVisibilityControl
                        storeId={store.id}
                        storeName={store.name}
                        isPublished={store.is_published === 1}
                      />
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}

          <UrlPagination
            page={currentPage}
            totalPages={totalPages}
            summary={`Showing ${stores.length} of ${total} stores`}
          />
        </Card.Content>
      </Card>
    </div>
  );
}
