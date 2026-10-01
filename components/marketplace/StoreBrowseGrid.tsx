import { ButtonLink } from "@/components/ui/controls";
import { ShopCard } from "@/components/cards/ShopCard";
import { PageHeader } from "@/components/ui/atoms";
import { EmptyState } from "@/components/ui/feedback";
import { PaginationBar } from "@/components/marketplace/BrowseFilters";
import { StoreFilters } from "@/components/marketplace/StoreFilters";
import { pickParam, type RawSearchParams } from "@/components/marketplace/BrowseSection";
import { countStores, listStores } from "@/lib/server/discovery";

const PER_PAGE = 24;

export async function StoreBrowseGrid({
  searchParams,
  embedded = false,
}: {
  searchParams: RawSearchParams;
  /** Render only the results, for use inside a page that supplies its own shell. */
  embedded?: boolean;
}) {
  const page = Math.max(1, Number.parseInt(pickParam(searchParams, "page") ?? "1", 10) || 1);
  const search = pickParam(searchParams, "q");
  const category = pickParam(searchParams, "category");
  const sortParam = pickParam(searchParams, "sort");
  const sort = sortParam === "name" || sortParam === "listings" ? sortParam : "newest";

  const query = {
    search,
    category,
    // Only stores with something to show — an empty storefront is a dead end.
    onlyWithListings: true,
    withGallery: true,
    sort,
    limit: PER_PAGE,
    offset: (page - 1) * PER_PAGE,
  } as const;

  const [stores, total] = await Promise.all([listStores(query), countStores(query)]);

  if (embedded) {
    return (
      <div className="space-y-6">
        {stores.length === 0 ? (
          <EmptyState icon="storefront"
            title={search ? `No shops matching “${search}”` : "No open shops yet"} description="A shop appears here once a seller publishes their store and lists at least one item."
          />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-x-14 gap-y-20 lg:grid-cols-2">
              {stores.map((store) => (
                <div
                  className="min-w-0"
                  key={store.id}
                >
                  <ShopCard store={store} />
                </div>
              ))}
            </div>
            <PaginationBar total={total} page={page} perPage={PER_PAGE} basePath="/stores" />
          </>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 sm:px-6">
      <PageHeader
        title={search ? `Shops matching “${search}”` : "Shops on Rush Cart"}
        
        actions={
          <ButtonLink href="/sign-up" size="sm" variant="primary">
            Open your shop
          </ButtonLink>
        }
      />

      <StoreFilters />

      {stores.length === 0 ? (
        <EmptyState icon="storefront"
          title={search ? `No shops matching “${search}”` : "No open shops yet"} description="A shop appears here once a seller publishes their store and lists at least one item. Until then, this list is genuinely empty."
          action={
            <ButtonLink href="/sign-up" variant="primary">
              Be the first shop
            </ButtonLink>
          }
          secondaryAction={
            <ButtonLink href="/products" variant="outline">
              Browse listings instead
            </ButtonLink>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-x-14 gap-y-20 lg:grid-cols-2">
            {stores.map((store) => (
              <div
                className="min-w-0"
                key={store.id}
              >
                <ShopCard store={store} />
              </div>
            ))}
          </div>

          <PaginationBar total={total} page={page} perPage={PER_PAGE} basePath="/stores" />
        </>
      )}
    </div>
  );
}
