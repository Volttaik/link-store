/**
 * A module's shelf, assembled from its own declaration.
 *
 * One function, driven by the registry in `lib/workspace-modules.ts`, produces
 * everything a module page needs: the rows, the counts, the filter facets and the
 * search control. Because it is driven by the declaration, a module cannot be
 * given another module's categories or another module's facets — a Food page is
 * handed the food tree and food facets, and the wrong option does not exist to be
 * rendered.
 *
 * Nothing here filters in the browser: every facet becomes part of the SQL
 * (`lib/server/listings.ts`), so a filtered shelf is a real question asked of the
 * catalogue and stays correct under pagination.
 */

import "server-only";

import type { WorkspaceFacet } from "@/components/workspace/WorkspaceFilterBar";
import { categoryOptions, flattenCategoryTree, type CategoryNode } from "../categories";
import { formatNumber } from "../format";
import { parseMoneyToMinor } from "../money";
import {
  MODULE_SORT_OPTIONS,
  isModuleSort,
  type WorkspaceModule,
} from "../workspace-modules";
import { categorySubtreeIdList, listCategoryTree } from "./categories";
import {
  countListings,
  listListings,
  listingStatusCounts,
  type AttributeFilter,
  type FilterableColumn,
  type ListingQuery,
} from "./listings";

/** Next.js hands search params as `string | string[] | undefined`. */
export type ModuleSearchParams = Record<string, string | string[] | undefined>;

function param(params: ModuleSearchParams, key: string): string {
  const value = params[key];
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function numberParam(params: ModuleSearchParams, key: string): number | undefined {
  const raw = param(params, key).trim();
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

export type ModuleShelf = {
  module: WorkspaceModule;
  listings: Awaited<ReturnType<typeof listListings>>;
  /** Rows matching what is on screen, not the whole catalogue. */
  total: number;
  counts: Record<string, number>;
  facets: WorkspaceFacet[];
  search: { value: string; label: string; placeholder: string };
  sort: string;
  /** The trail of the category currently being viewed, for the page heading. */
  categoryTrail: CategoryNode[];
  /** What the page needs to know about its own state. */
  filtering: boolean;
};

/** How many rows a shelf shows at once. */
const SHELF_LIMIT = 60;

/**
 * The state a module's shelf may be in.
 *
 * A URL is not a permission: if `status` names a state this module is not
 * allowed to show — a draft on the Listing shelf, for instance — it is discarded
 * and the module's own default is used. The draft is then not merely hidden, it
 * is never queried.
 */
function resolveStatus(module: WorkspaceModule, params: ModuleSearchParams) {
  const requested = param(params, "status");
  const allowed = module.allowedStatuses as string[];
  return (allowed.includes(requested) ? requested : module.defaultStatus) as
    | "active"
    | "draft"
    | "archived";
}

/**
 * Turn the module's declared facets into query filters, reading only the params
 * those facets own.
 */
function attributeFiltersFor(
  module: WorkspaceModule,
  params: ModuleSearchParams,
): { attributes: AttributeFilter[]; columns: ListingQuery["columnFilters"] } {
  const attributes: AttributeFilter[] = [];
  const columns: NonNullable<ListingQuery["columnFilters"]> = [];

  for (const filter of module.filters) {
    switch (filter.kind) {
      case "attributeText": {
        const value = param(params, filter.param).trim();
        if (value) attributes.push({ key: filter.attribute, contains: value });
        break;
      }
      case "attributeSelect": {
        const value = param(params, filter.param).trim();
        if (!value) break;
        // A value the facet does not offer cannot filter: the parameter is only
        // ever read for a value the module itself declared.
        if (!filter.options.some((option) => option.value === value)) break;
        attributes.push(
          filter.multi ? { key: filter.attribute, includes: value } : { key: filter.attribute, equals: value },
        );
        break;
      }
      case "attributeRange": {
        const min = numberParam(params, filter.param);
        if (typeof min === "number") attributes.push({ key: filter.attribute, min });
        break;
      }
      case "select": {
        const value = param(params, filter.param).trim();
        if (value && filter.options.some((option) => option.value === value)) {
          columns.push({ column: filter.column as FilterableColumn, value });
        }
        break;
      }
      case "range": {
        const raw = param(params, filter.param);
        const rawMax = param(params, `${filter.param}_max`);
        const min = filter.money
          ? raw.trim()
            ? parseMoneyToMinor(raw)
            : null
          : numberParam(params, filter.param);
        const max = filter.money
          ? rawMax.trim()
            ? parseMoneyToMinor(rawMax)
            : null
          : numberParam(params, `${filter.param}_max`);
        if (typeof min === "number") columns.push({ column: filter.column as FilterableColumn, min });
        if (typeof max === "number") columns.push({ column: filter.column as FilterableColumn, max });
        break;
      }
      case "switch": {
        // Handled on the query itself (stock) or as an attribute flag below.
        if (filter.source === "attribute" && filter.attribute) {
          const value = param(params, filter.param);
          if (value === "1") attributes.push({ key: filter.attribute, flag: true });
        }
        break;
      }
      case "category":
        break;
    }
  }

  return { attributes, columns };
}

/** Whether anything at all is narrowing the shelf. */
function anyActive(module: WorkspaceModule, params: ModuleSearchParams, sort: string): boolean {
  if (param(params, "q").trim() || param(params, "category").trim()) return true;
  if (sort !== "newest") return true;
  for (const filter of module.filters) {
    if (param(params, filter.param).trim()) return true;
    if (filter.kind === "range" && param(params, `${filter.param}_max`).trim()) return true;
  }
  return false;
}

export async function loadModuleShelf(
  module: WorkspaceModule,
  storeId: string,
  params: ModuleSearchParams,
): Promise<ModuleShelf> {
  const status = resolveStatus(module, params);

  // The module's own branch of the tree — the products branch on the Listing
  // page, the food branch on Food — never the whole catalogue.
  const tree = await listCategoryTree(storeId, module.categoryKind);
  const requestedCategory = param(params, "cat") || param(params, "category");
  const known = flattenCategoryTree(tree).some((node) => node.id === requestedCategory);
  const categoryIds =
    known && requestedCategory ? await categorySubtreeIdList(requestedCategory) : undefined;

  const { attributes, columns } = attributeFiltersFor(module, params);

  const search = param(params, "q").trim();
  const sortRaw = param(params, "sort");
  const sort = isModuleSort(sortRaw)
    ? (sortRaw as NonNullable<ListingQuery["sort"]>)
    : ("newest" as const);

  const query: ListingQuery = {
    storeId,
    types: module.types.length > 0 ? module.types : undefined,
    status,
    categoryIds,
    search: search || undefined,
    minPrice: numberParam(params, "min"),
    maxPrice: numberParam(params, "max"),
    inStockOnly: param(params, "stock") === "1" || undefined,
    attributes,
    columnFilters: columns,
    sort,
  };

  const [listings, total, counts] = await Promise.all([
    listListings({ ...query, limit: SHELF_LIMIT }),
    countListings(query),
    listingStatusCounts(storeId, module.types.length > 0 ? module.types : undefined),
  ]);

  // --- The facets the module actually declared ------------------------------

  const facets: WorkspaceFacet[] = [];

  for (const filter of module.filters) {
    if (filter.kind === "category") {
      // A category is a choice from a tree this module owns, so it is offered as
      // one: the options are read from the database and only ever from this
      // module's branch of it.
      facets.push({
        kind: "select",
        key: filter.param,
        label: filter.label,
        description: filter.description,
        value: known ? requestedCategory : "all",
        options: [
          { value: "all", label: `Every ${module.label.toLowerCase()} category` },
          ...categoryOptions(tree),
        ],
      });
      continue;
    }

    if (filter.kind === "range") {
      facets.push({
        kind: "range",
        key: filter.param,
        secondaryKey: `${filter.param}_max`,
        label: filter.label,
        description: filter.description,
        value: param(params, filter.param),
        secondaryValue: param(params, `${filter.param}_max`),
        placeholder: filter.money ? ["Min", "Max"] : [`Min${filter.suffix ? ` (${filter.suffix})` : ""}`, `Max${filter.suffix ? ` (${filter.suffix})` : ""}`],
      });
      continue;
    }

    if (filter.kind === "select" || filter.kind === "attributeSelect") {
      const value = param(params, filter.param) || "all";
      facets.push({
        kind: "select",
        key: filter.param,
        label: filter.label,
        description: filter.description,
        value,
        options: [{ value: "all", label: "Any" }, ...filter.options],
      });
      continue;
    }

    if (filter.kind === "attributeText") {
      facets.push({
        kind: "text",
        key: filter.param,
        label: filter.label,
        description: filter.description,
        value: param(params, filter.param),
      });
      continue;
    }

    if (filter.kind === "attributeRange") {
      facets.push({
        kind: "range",
        key: filter.param,
        secondaryKey: `${filter.param}_max`,
        label: filter.label,
        description: filter.description,
        value: param(params, filter.param),
        secondaryValue: param(params, `${filter.param}_max`),
        placeholder: ["At least", "At most"],
      });
      continue;
    }

    if (filter.kind === "switch") {
      const active =
        filter.source === "stock"
          ? param(params, filter.param) === "1"
          : param(params, filter.param) === "1";
      facets.push({
        kind: "switch",
        key: filter.param,
        label: filter.label,
        description: filter.description,
        value: active,
      });
    }
  }

  // The shelf's own state, offered as a facet only where there is a choice to
  // make: a module allowed to show drafts asks; the Listing module does not.
  if (module.allowedStatuses.length > 1) {
    const labels: Record<string, string> = {
      active: "Live",
      draft: "Drafts",
      archived: "Archived",
    };
    facets.unshift({
      kind: "select",
      key: "status",
      label: "State",
      description: "Live items are on your storefront and in the marketplace.",
      value: status,
      options: module.allowedStatuses.map((state) => ({
        value: state,
        label: `${labels[state]} · ${formatNumber(counts[state] ?? 0)}`,
      })),
    });
  }

  facets.push({
    kind: "select",
    key: "sort",
    label: "Order",
    value: sort,
    neutral: "newest",
    options: MODULE_SORT_OPTIONS.map((option) => ({ ...option })),
  });

  return {
    module,
    listings,
    total,
    counts,
    facets,
    search: {
      value: search,
      label: `Search ${module.plural}`,
      placeholder: `Name, description or category`,
    },
    sort,
    categoryTrail: known && requestedCategory ? trailOf(tree, requestedCategory) : [],
    filtering: anyActive(module, params, sort) || status !== module.defaultStatus,
  };
}

function trailOf(tree: CategoryNode[], id: string): CategoryNode[] {
  const walk = (list: CategoryNode[], trail: CategoryNode[]): CategoryNode[] | null => {
    for (const node of list) {
      const next = [...trail, node];
      if (node.id === id) return next;
      const deeper = walk(node.children, next);
      if (deeper) return deeper;
    }
    return null;
  };

  return walk(tree, []) ?? [];
}
