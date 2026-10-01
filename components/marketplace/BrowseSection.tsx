import { ButtonLink } from "@/components/ui/controls";
import { ProductCard } from "@/components/cards/ProductCard";
import { PageHeader } from "@/components/ui/atoms";
import { EmptyState, InfoNote } from "@/components/ui/feedback";
import { BrowseFilters, PaginationBar } from "@/components/marketplace/BrowseFilters";
import { ContextNotice, RearrangeGroup } from "@/components/visual/Rearrange";
import { countListings, listListings, type ListingQuery } from "@/lib/server/listings";
import { listPlatformCategories, listStoreCategories } from "@/lib/server/stores";
import {
  buildCategoryTree,
  categoryPath,
  flattenCategoryTree,
} from "@/lib/categories";
import { categorySubtreeIdList } from "@/lib/server/categories";
import { MARKETPLACE_SECTIONS, type ListingType } from "@/lib/catalog";
import { parseMoneyToMinor } from "@/lib/money";
import type { CategoryRow } from "@/lib/types";

export type RawSearchParams = Record<string, string | string[] | undefined>;

export function pickParam(params: RawSearchParams, key: string): string | undefined {
  const value = params[key];
  if (Array.isArray(value)) return value[0];
  return value ?? undefined;
}

const PER_PAGE = 24;

/**
 * The branch of the catalogue tree each marketplace section browses in.
 *
 * This is the public side of the context rule. Browsing **Food** must not offer
 * Fashion, Electronics or a product brand — not because those options are hidden
 * once rendered, but because the category set the page builds its filter from is
 * this section's branch of the tree. A shopper who is looking for dinner is not
 * asked whether they want a sofa.
 *
 * Every product section shares the products branch, because that is what
 * separates "Products → Clothing → Men's Clothing" from "Products → Electronics"
 * — a narrowing inside one environment rather than a different environment.
 */
const SECTION_CATEGORY_KIND: Record<string, string> = { products: "product", fashion: "product", electronics: "product", furniture: "product" };

const SORTS = ["newest", "oldest", "price_asc", "price_desc", "popular", "title"] as const;
type Sort = (typeof SORTS)[number];

function parseSort(value: string | undefined): Sort {
  return (SORTS as readonly string[]).includes(value ?? "") ? (value as Sort) : "newest";
}

/**
 * The shared browse experience.
 *
 * Every marketplace section (products, fashion, food, services, digital, cars
 * and search) renders through this one component, so filters, pagination and
 * empty states behave identically everywhere.
 */
export async function BrowseSection({
  slug,
  label,
  description,
  searchParams,
  storeId,
  basePath,
}: {
  slug?: string;
  label?: string;
  description?: string;
  searchParams: RawSearchParams;
  /** When set, browse is scoped to a single storefront. */
  storeId?: string;
  basePath?: string;
}) {
  const section = slug ? MARKETPLACE_SECTIONS.find((entry) => entry.slug === slug) : undefined;
  const heading = label ?? section?.label ?? "Browse";
  const path = basePath ?? `/${slug ?? "products"}`;

  const page = Math.max(1, Number.parseInt(pickParam(searchParams, "page") ?? "1", 10) || 1);
  const types: ListingType[] = ["product"];

  // Choosing a main category has to find everything filed beneath it, or the
  // tree would only work for its leaves. The subtree is resolved before the
  // query so the filter is the query, not a second pass over the results.
  const requestedCategory = pickParam(searchParams, "category");
  const categoryScopes = requestedCategory
    ? await categorySubtreeIdList(requestedCategory)
    : undefined;

  const query: ListingQuery = {
    storeId,
    types: types && types.length > 0 ? types : undefined,
    categoryIds: categoryScopes,
    status: "active",
    search: pickParam(searchParams, "q"),
    sort: parseSort(pickParam(searchParams, "sort")),
    inStockOnly: pickParam(searchParams, "stock") === "1",
    onlyPublishedStores: !storeId,
    limit: PER_PAGE,
    offset: (page - 1) * PER_PAGE,
  };

  const rawMin = pickParam(searchParams, "min");
  const rawMax = pickParam(searchParams, "max");
  const minPrice = rawMin ? parseMoneyToMinor(rawMin) : null;
  const maxPrice = rawMax ? parseMoneyToMinor(rawMax) : null;
  if (minPrice !== null) query.minPrice = minPrice;
  if (maxPrice !== null) query.maxPrice = maxPrice;

  const [listings, total, allCategories] = await Promise.all([
    listListings(query),
    countListings(query),
    storeId ? listStoreCategories(storeId) : listPlatformCategories(),
  ]);

  // Only this section's branch — the filter cannot be handed another module's
  // categories, because they are filtered out before the tree is built.
  const sectionKind = slug ? SECTION_CATEGORY_KIND[slug] : undefined;
  const categories = sectionKind
    ? allCategories.filter((category) => category.kind === sectionKind)
    : allCategories;

  /*
   * The category filter is the *tree*, not a flat list of every category.
   *
   * Two things follow from that, and both are the point of §8–§11 of the spec:
   * a main category groups its own subcategories (indented, so the hierarchy is
   * legible in a native select), and choosing a main category matches everything
   * filed beneath it — which is what makes `Products → Clothing → Men's Clothing`
   * a way to narrow down rather than three unrelated filters.
   */
  const categoryTree = buildCategoryTree(categories);

  const visibleCategories: Array<Pick<CategoryRow, "id" | "name">> = flattenCategoryTree(
    categoryTree,
  ).map((node) => ({
    id: node.id,
    name: `${"· ".repeat(Math.max(categoryPath(categoryTree, node.id).length - 1, 0))}${node.name}`,
  }));

  const searching = Boolean(query.search);

  // The one line that says "the interface turned to face this" — quiet, quick,
  // and gone before it could be called a banner.
  const categoryName = requestedCategory
    ? visibleCategories
        .find((category) => category.id === requestedCategory)
        ?.name
        ?.replace(/^[·\s]+/, "")
        .trim() ?? null
    : null;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 sm:px-6">
      <PageHeader
        title={searching ? `Results for “${query.search}”` : categoryName ? `Products · ${categoryName}` : heading}
        description={
          description ??
          (total > 0
            ? `${total} ${total === 1 ? "listing" : "listings"} available`
            : "Nothing published here yet")
        }
      />

      <BrowseFilters
        basePath={path}
        categories={visibleCategories}
        showTypeFilter={false}
      />

      <ContextNotice
        message={
          categoryName
            ? `Welcome to ${categoryName}`
            : searching
              ? `Searching for “${query.search}”`
              : null
        }
        trigger={`${requestedCategory ?? "all"}:${query.search ?? ""}`}
      />

      {listings.length === 0 ? (
        searching ? (
          <EmptyState icon="search"
            title={`No results for “${query.search}”`} description="Try a different word, or clear the filters to see everything published in this section."
            action={
              <ButtonLink href={path} variant="primary">
                Clear search
              </ButtonLink>
            }
          />
        ) : (
          <EmptyState icon="tag" title={categoryName ? `No products in ${categoryName} yet` : "No products here yet"}
            description={categoryName ? `Try another category or browse all products.` : "New products appear here as sellers publish them."}
            action={
              <ButtonLink href="/sign-up" variant="primary">
                Start selling
              </ButtonLink>
            }
            secondaryAction={
              <ButtonLink href="/products" variant="outline">
                Explore Marketplace
              </ButtonLink>
            }
          />
        )
      ) : (
        <>
          {/* Card width is a floor, not a share of the row: a marketplace card
              keeps its size and the grid reflows around it. Cards that survive
              a filter glide to their new places; new arrivals fade up — the
              interface reorganises rather than reloading. */}
          <RearrangeGroup
            className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,17rem),1fr))] gap-4"
            itemClassName="h-full"
            items={listings.map((listing) => ({
              key: listing.id,
              node: <ProductCard listing={listing} />,
            }))}
          />

          <PaginationBar
            total={total}
            page={page}
            perPage={PER_PAGE}
            basePath={path}
          />
        </>
      )}

      {!searching && total > 0 && total <= 6 ? (
        <InfoNote title="This collection is still growing">
          Only {total} {total === 1 ? "listing has" : "listings have"} been published here so far.
          Check back soon, or browse the wider marketplace.
        </InfoNote>
      ) : null}
    </div>
  );
}
