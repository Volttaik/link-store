import { Card } from "@heroui/react/card";

import { PageHeader, StatTile } from "@/components/ui/atoms";
import { DiscountManager } from "@/components/workspace/DiscountManager";
import { requireStore } from "@/lib/auth";
import { formatNumber } from "@/lib/format";
import { listDiscounts } from "@/lib/server/management";
import { countListings, listListings } from "@/lib/server/listings";

export const dynamic = "force-dynamic";

/**
 * Discounts.
 *
 * Redemptions are counted from the `used_count` column, which checkout
 * increments transactionally — never from a projected or cached number.
 */
export default async function DiscountsPage() {
  const { store } = await requireStore();

  const [discounts, listings, listingCount] = await Promise.all([
    listDiscounts(store.id),
    listListings({ storeId: store.id, status: "all", limit: 100 }),
    countListings({ storeId: store.id, status: "all" }),
  ]);

  const active = discounts.filter((discount) => discount.is_active === 1).length;
  const redemptions = discounts.reduce((total, discount) => total + discount.used_count, 0);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Discounts" description="Codes and automatic reductions your customers can use at checkout."
        breadcrumb={
          <span className="text-xs text-muted">
            Workspace <span className="mx-1">/</span> Sales <span className="mx-1">/</span> Discounts
          </span>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile label="Discounts" value={formatNumber(discounts.length)} />
        <StatTile label="Active" value={formatNumber(active)} hint="Available at checkout" />
        <StatTile label="Redemptions" value={formatNumber(redemptions)} hint="Across all discounts" />
      </div>

      <Card className="ls-elev-2">
        <Card.Header className="flex-col items-start gap-1">
          <h2 className="text-lg font-semibold">Your discounts</h2>
          <p className="text-sm text-muted">
            {listingCount > 0
              ? "Discounts can target the whole order or a single listing."
              : "Create a listing before you can discount a single item."}
          </p>
        </Card.Header>
        
        <Card.Content className="gap-4">
          <DiscountManager
            discounts={discounts}
            currency={store.currency}
            listings={listings.map((listing) => ({ id: listing.id, title: listing.title }))}
          />
        </Card.Content>
      </Card>
    </div>
  );
}
