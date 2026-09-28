/**
 * Category reads, scoped by module.
 *
 * Every read here is a **branch** read: given a kind, only that module's part of
 * the tree comes back. That is the mechanism behind the platform being
 * context-aware — a filter panel is not told which options to hide, it is never
 * given the wrong ones in the first place.
 */

import "server-only";

import { query } from "../db";
import { buildCategoryTree, flattenCategoryTree, type CategoryKind, type CategoryNode } from "../categories";
import type { CategoryRow } from "../types";

/**
 * A branch of the category tree: the platform's categories of `kind`, plus this
 * seller's own, assembled into a forest.
 *
 * The roots are included, so the returned tree is complete enough to render and
 * to walk for a subtree's ids.
 */
export async function listCategoryTree(
  storeId: string,
  kind?: CategoryKind,
): Promise<CategoryNode[]> {
  const kindClause = kind ? "AND kind = ?" : "";
  const rows = await query<CategoryRow>(
    `SELECT * FROM categories
      WHERE (store_id IS NULL OR store_id = ?) ${kindClause}
      ORDER BY (store_id IS NULL) ASC, position ASC, name ASC`,
    kind ? [storeId, kind] : [storeId],
  );

  return buildCategoryTree(rows);
}

/**
 * Every platform main category, whatever its kind.
 *
 * Used where the question is "what does the platform sell", not "what may this
 * module offer": the marketplace front door, and the store-creation picker.
 */
export async function listMainCategories(): Promise<CategoryNode[]> {
  const rows = await query<CategoryRow>(
    `SELECT * FROM categories
      WHERE store_id IS NULL AND parent_id IS NULL
      ORDER BY position ASC, name ASC`,
  );

  return buildCategoryTree(rows);
}

/** The ids of a category and everything under it, for a subtree query. */
export async function categorySubtreeIdList(id: string): Promise<string[]> {
  const rows = await query<CategoryRow>(
    `WITH RECURSIVE branch(id) AS (
       SELECT id FROM categories WHERE id = ?
       UNION ALL
       SELECT c.id FROM categories c JOIN branch b ON c.parent_id = b.id
     )
     SELECT id FROM branch`,
    [id],
  );

  return rows.map((row) => row.id);
}

/**
 * A category read for a form: the module's own tree, flattened and ready to
 * render, with a marker for the seller's own entries.
 */
export async function listCategoryOptions(
  storeId: string,
  kind: CategoryKind,
): Promise<Array<{ id: string; name: string; depth: number; own: boolean }>> {
  const tree = await listCategoryTree(storeId, kind);

  return flattenCategoryTree(tree).map((node) => ({
    id: node.id,
    name: node.name,
    depth: Math.max(depthOf(tree, node.id), 0),
    own: node.own,
  }));
}

function depthOf(nodes: CategoryNode[], id: string): number {
  const walk = (list: CategoryNode[], depth: number): number | null => {
    for (const node of list) {
      if (node.id === id) return depth;
      const deeper = walk(node.children, depth + 1);
      if (deeper !== null) return deeper;
    }
    return null;
  };

  return walk(nodes, 0) ?? 0;
}
