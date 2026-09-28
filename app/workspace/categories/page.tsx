import { Card } from "@heroui/react/card";

import { PageHeader, StatTile } from "@/components/ui/atoms";
import { CategoryManager } from "@/components/workspace/CategoryManager";
import { requireStore } from "@/lib/auth";
import { formatNumber } from "@/lib/format";
import { countStoreListingsByCategory, listStoreCategories } from "@/lib/server/stores";

export const dynamic = "force-dynamic";

/**
 * Categories.
 *
 * A store sees the platform categories it inherits plus the ones it created,
 * each with a listing count taken from the store's own listings.
 */
export default async function CategoriesPage() {
  const { store } = await requireStore();

  const [categories, counts] = await Promise.all([
    listStoreCategories(store.id),
    countStoreListingsByCategory(store.id),
  ]);

  const rows = categories.map((category) => ({
    id: category.id,
    name: category.name,
    slug: category.slug,
    kind: category.kind,
    icon: category.icon,
    listingCount: counts[category.id] ?? 0,
    isPlatform: category.store_id === null,
  }));

  const customCount = rows.filter((row) => !row.isPlatform).length;
  const usedCount = rows.filter((row) => row.listingCount > 0).length;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Categories" description="Group your listings so shoppers can browse your store by type."
        breadcrumb={
          <span className="text-xs text-muted">
            Workspace <span className="mx-1">/</span> Categories
          </span>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile label="Available categories" value={formatNumber(rows.length)} />
        <StatTile label="Your own categories" value={formatNumber(customCount)} hint="Created by you" />
        <StatTile label="In use" value={formatNumber(usedCount)} hint="Have at least one listing" />
      </div>

      <Card className="ls-elev-2">
        <Card.Header className="flex-col items-start gap-1">
          <h2 className="text-lg font-semibold">Your catalogue structure</h2>
          <p className="text-sm text-muted">
            Platform categories are shared across Link Store and cannot be renamed.
          </p>
        </Card.Header>
        
        <Card.Content className="gap-4">
          <CategoryManager categories={rows} />
        </Card.Content>
      </Card>
    </div>
  );
}
