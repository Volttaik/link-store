import { Link } from "@heroui/react/link";
import { notFound } from "next/navigation";

import { ProductCreation } from "@/components/workspace/ProductCreation";
import { PageHeader } from "@/components/ui/atoms";
import { Icon } from "@/components/ui/Icon";
import { InfoNote } from "@/components/ui/feedback";
import { requireStore } from "@/lib/auth";
import { categoryPath, flattenCategoryTree } from "@/lib/categories";
import { type ListingType } from "@/lib/catalog";
import { listCategoryTree } from "@/lib/server/categories";
import { workspaceModule } from "@/lib/workspace-modules";

/**
 * A module's creation page.
 *
 * Every module has its own route into the form, and that route decides three
 * things the form itself must not guess:
 *
 * | Decision | Why it belongs to the module |
 * | --- | --- |
 * | **The type** | a service form is a *service* form; the type is what the module is |
 * | **The categories** | only this module's branch of the tree is offered |
 * | **The publish rule** | Listing has no draft in it; the others do, because that is where drafts come from |
 *
 * The field *questions* themselves come from the type's own schema
 * (`lib/listing-fields.ts`), so a service is asked for its service area and a
 * menu item for its allergens — the forms share a renderer, never a field list.
 */
export async function ModuleNewPage({ moduleKey, categoryId }: { moduleKey: string; categoryId?: string }) {
  const definition = workspaceModule(moduleKey);

  if (!definition || definition.source !== "listings" || definition.types.length === 0) notFound();

  const { store } = await requireStore();
  const tree = await listCategoryTree(store.id, definition.categoryKind);

  // The module's own category names, indented by depth so the SelectField can
  // still show the hierarchy a flat list would otherwise lose.
  const categories = flattenCategoryTree(tree).map((node) => ({
    id: node.id,
    name: `${"· ".repeat(Math.max(categoryPath(tree, node.id).length - 1, 0))}${node.name}`,
  }));

  // The Listing module owns the whole product family, so it keeps the type
  // choice; the others *are* one type.
  const locked = definition.types.length === 1;
  const defaultType = definition.types[0] as ListingType;

  const selectedCategory = categories.find(category => category.id === categoryId);
  const backHref = selectedCategory ? `${definition.href}?category=${encodeURIComponent(selectedCategory.id)}` : definition.href;

  return (
    <div className="space-y-6">
      <PageHeader
        title={selectedCategory ? `New ${selectedCategory.name.replace(/^[·\s]+/, "")} product` : `New ${definition.noun}`}
        description={`${definition.blurb} Add the details buyers need.`}
        breadcrumb={
          <Link
            className="flex items-center gap-1 text-xs font-medium text-muted hover:text-foreground"
            href={backHref}
          >
            <Icon name="arrowLeft" size={13} />
            {definition.label}
          </Link>
        }
      />

      {definition.workflow.autoPublish ? (
        <InfoNote tone="success" title="This product goes on sale the moment you save it">
          Save to publish on your storefront. You can choose Draft if you are still preparing this product.
        </InfoNote>
      ) : (
        <InfoNote title={`Saving a ${definition.noun}`}>
          Save it as a draft while you are still working on it, and publish when it is ready. Drafts
          you have started appear in Drafts, alongside your other unfinished work.
        </InfoNote>
      )}

      <ProductCreation
        key={store.id}
        autoPublish={definition.workflow.autoPublish}
        categories={categories}
        defaultCategoryId={selectedCategory?.id}
        currency={store.currency}
        defaultType={defaultType}
        lockedType={locked}
        submitLabel={definition.workflow.submitLabel}
      />
    </div>
  );
}
