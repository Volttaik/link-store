/**
 * The category tree, as a data structure rather than rows.
 *
 * `categories` is a self-referencing table (`parent_id`), and the whole point of
 * that shape is **context**: a module is handed its own branch of the tree and
 * nothing else, so a Food page cannot be offered a car part and a Services page
 * cannot be offered a garment size. That rule is enforced by what is read out of
 * the database (see `lib/server/categories.ts`), not by hiding options in the
 * browser.
 *
 * This module is client-safe on purpose: the workspace forms, the marketplace
 * browse controls and the workspace filter panels all render from the same tree,
 * so "what categories exist" has exactly one answer across the platform.
 *
 * Two ideas live in the tree and they are not the same idea:
 *
 * | Idea | What it is | Where it sits |
 * | --- | --- | --- |
 * | **Main category** | a marketplace module — Products, Food, Services… | the roots |
 * | **Subcategory** | that module's own vocabulary, however deep | everything below |
 */

import type { CategoryRow } from "./types";

/** Retired catch-alls are readable historical data, never selectable categories. */
export function isGenericCategory(value?: string | null): boolean {
  return ["other", "others", "miscellaneous", "misc", "uncategorized", "uncategorised"].includes((value ?? "").toLowerCase().replace(/[^a-z]/g, ""));
}
export function isSupportedCategory(category: { name: string; slug: string }): boolean {
  return !isGenericCategory(category.name) && !isGenericCategory(category.slug);
}

/** Canonical platform reference data; db/seed.sql mirrors these stable ids. */
export const PRODUCT_CATEGORY_DEFINITIONS = [
  { slug: "fashion", name: "Fashion", icon: "fashion", parent: null },
  { slug: "clothing", name: "Clothing", icon: "fashion", parent: "fashion" },
  { slug: "shoes", name: "Shoes", icon: "fashion", parent: "fashion" },
  { slug: "accessories", name: "Accessories", icon: "tag", parent: null },
  { slug: "electronics", name: "Electronics", icon: "electronics", parent: null },
  { slug: "beauty", name: "Beauty", icon: "beauty", parent: null },
  { slug: "home", name: "Home", icon: "home", parent: null },
  { slug: "sports", name: "Sports", icon: "tag", parent: null },
  { slug: "collectibles", name: "Collectibles", icon: "tag", parent: null },
  { slug: "digital", name: "Digital", icon: "digital", parent: null },
  { slug: "books", name: "Books & stationery", icon: "tag", parent: null },
  { slug: "toys", name: "Toys & games", icon: "tag", parent: null },
  { slug: "baby", name: "Baby & kids", icon: "tag", parent: null },
  { slug: "pets", name: "Pet supplies", icon: "tag", parent: null },
  { slug: "health", name: "Health & wellness", icon: "tag", parent: null },
  { slug: "grocery", name: "Grocery & pantry", icon: "tag", parent: null },
  { slug: "garden", name: "Garden & outdoors", icon: "tag", parent: null },
  { slug: "tools", name: "Tools & hardware", icon: "tag", parent: null },
  { slug: "automotive", name: "Automotive accessories", icon: "tag", parent: null },
  { slug: "arts", name: "Arts & crafts", icon: "tag", parent: null },
  { slug: "office", name: "Office supplies", icon: "tag", parent: null },
  { slug: "music", name: "Musical instruments", icon: "tag", parent: null },
] as const;

/** Which module a category belongs to. Inherited down the tree, never repeated. */
export type CategoryKind = "general" | "product";
export const CATEGORY_KINDS: CategoryKind[] = ["general", "product"];

export function isCategoryKind(value: string | null | undefined): value is CategoryKind {
  return CATEGORY_KINDS.includes((value ?? "") as CategoryKind);
}

/** One node of the tree, with its own branch already assembled. */
export type CategoryNode = {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  kind: CategoryKind;
  icon: string | null;
  position: number;
  /** True when the seller made it, rather than the platform. */
  own: boolean;
  children: CategoryNode[];
};

function toNode(row: CategoryRow, own: boolean): CategoryNode {
  return {
    id: row.id,
    parentId: row.parent_id ?? null,
    name: row.name,
    slug: row.slug,
    kind: isCategoryKind(row.kind) ? row.kind : "general",
    icon: row.icon,
    position: Number(row.position),
    own,
    children: [],
  };
}

/**
 * Rows into a forest.
 *
 * A row whose parent is not in the given set is treated as a root rather than
 * dropped — that is what makes it safe to read *one branch* of the tree out of
 * the database: reading the products branch returns its roots even though their
 * parent was never fetched.
 */
export function buildCategoryTree(rows: CategoryRow[]): CategoryNode[] {
  rows = rows.filter(isSupportedCategory);
  const nodes = new Map<string, CategoryNode>();
  for (const row of rows) nodes.set(row.id, toNode(row, row.store_id !== null));

  const roots: CategoryNode[] = [];
  for (const row of rows) {
    const node = nodes.get(row.id);
    if (!node) continue;

    const parent = row.parent_id ? nodes.get(row.parent_id) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  const sort = (list: CategoryNode[]) => {
    list.sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
    for (const node of list) sort(node.children);
  };
  sort(roots);

  return roots;
}

/** Every node in the forest, depth first — parents before their children. */
export function flattenCategoryTree(nodes: CategoryNode[]): CategoryNode[] {
  const out: CategoryNode[] = [];
  const walk = (list: CategoryNode[]) => {
    for (const node of list) {
      out.push(node);
      walk(node.children);
    }
  };
  walk(nodes);
  return out;
}

/** The ids of a category and everything beneath it. */
export function categorySubtreeIds(nodes: CategoryNode[], id: string): string[] {
  const find = (list: CategoryNode[]): CategoryNode | null => {
    for (const node of list) {
      if (node.id === id) return node;
      const deeper = find(node.children);
      if (deeper) return deeper;
    }
    return null;
  };

  const node = find(nodes);
  if (!node) return [id];
  return flattenCategoryTree([node]).map((entry) => entry.id);
}

/** The trail from a root down to a category, for breadcrumbs. */
export function categoryPath(nodes: CategoryNode[], id: string): CategoryNode[] {
  const walk = (list: CategoryNode[], trail: CategoryNode[]): CategoryNode[] | null => {
    for (const node of list) {
      const next = [...trail, node];
      if (node.id === id) return next;
      const deeper = walk(node.children, next);
      if (deeper) return deeper;
    }
    return null;
  };

  return walk(nodes, []) ?? [];
}

/**
 * A flat list for a `<select>`, indented by depth.
 *
 * Depth is carried in the label (`— Men's Clothing`) because a native select has
 * nowhere else to put it, and the hierarchy is the information.
 */
export function categoryOptions(
  nodes: CategoryNode[],
  options: { includeAll?: string } = {},
): Array<{ value: string; label: string }> {
  const out: Array<{ value: string; label: string }> = [];

  if (options.includeAll) out.push({ value: "all", label: options.includeAll });

  for (const node of flattenCategoryTree(nodes)) {
    const trail = categoryPath(nodes, node.id);
    const depth = Math.max(trail.length - 1, 0);
    out.push({
      value: node.id,
      label: `${depth > 0 ? `${"— ".repeat(depth)}` : ""}${node.name}${node.own ? " · yours" : ""}`,
    });
  }

  return out;
}
