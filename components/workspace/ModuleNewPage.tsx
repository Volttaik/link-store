import { Link } from "@heroui/react/link";
import { notFound } from "next/navigation";

import { ListingForm } from "@/components/workspace/ListingForm";
import { PageHeader } from "@/components/ui/atoms";
import { Icon } from "@/components/ui/Icon";
import { InfoNote } from "@/components/ui/feedback";
import { requireStore } from "@/lib/auth";
import { categoryPath, flattenCategoryTree } from "@/lib/categories";
import { listingTypeMeta, type ListingType } from "@/lib/catalog";
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
export async function ModuleNewPage({ moduleKey }: { moduleKey: string }) {
  const module = workspaceModule(moduleKey);

  if (!module || module.source !== "listings" || module.types.length === 0) notFound();

  const { store } = await requireStore();
  const tree = await listCategoryTree(store.id, module.categoryKind);

  // The module's own category names, indented by depth so the SelectField can
  // still show the hierarchy a flat list would otherwise lose.
  const categories = flattenCategoryTree(tree).map((node) => ({
    id: node.id,
    name: `${"· ".repeat(Math.max(categoryPath(tree, node.id).length - 1, 0))}${node.name}`,
  }));

  // The Listing module owns the whole product family, so it keeps the type
  // choice; the others *are* one type.
  const locked = module.types.length === 1;
  const defaultType = module.types[0] as ListingType;
  const meta = listingTypeMeta(defaultType);

  const backHref = module.href;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`New ${module.noun}`}
        description={`${module.blurb} The fields below are what a ${meta.label.toLowerCase()} needs, not a generic product form.`}
        breadcrumb={
          <Link
            className="flex items-center gap-1 text-xs font-medium text-muted hover:text-foreground"
            href={backHref}
          >
            <Icon name="arrowLeft" size={13} />
            {module.label}
          </Link>
        }
      />

      {module.workflow.autoPublish ? (
        <InfoNote tone="success" title="This product goes on sale the moment you save it">
          Adding through Listing means “I am listing this for sale now”. It will be live on your
          storefront and in the marketplace straight away, so there is no draft option in this
          workflow — work you have not finished belongs in Drafts.
        </InfoNote>
      ) : (
        <InfoNote title={`Saving a ${module.noun}`}>
          Save it as a draft while you are still working on it, and publish when it is ready. Drafts
          you have started appear in Drafts, under their own module.
        </InfoNote>
      )}

      <ListingForm
        autoPublish={module.workflow.autoPublish}
        categories={categories}
        currency={store.currency}
        defaultType={defaultType}
        lockedType={locked}
        submitLabel={module.workflow.submitLabel}
      />
    </div>
  );
}
