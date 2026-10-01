import { Link } from "@heroui/react/link";
import { notFound } from "next/navigation";

import { ButtonLink } from "@/components/ui/controls";
import { PageHeader } from "@/components/ui/atoms";
import { EmptyState, InfoNote } from "@/components/ui/feedback";
import { Icon } from "@/components/ui/Icon";
import { ShelfCard } from "@/components/workspace/ShelfCard";
import { WorkspaceFilterBar } from "@/components/workspace/WorkspaceFilterBar";
import { requireStore } from "@/lib/auth";
import { formatNumber } from "@/lib/format";
import { getStoreSettings } from "@/lib/server/stores";
import { loadModuleShelf, type ModuleSearchParams } from "@/lib/server/modules";
import { workspaceModule } from "@/lib/workspace-modules";

/**
 * A module's workspace page.
 *
 * This is what replaced "Services is a filter of Listing". The page reads the
 * module's declaration (`lib/workspace-modules.ts`) and asks the database the
 * question that declaration describes: this seller's rows, of this module's
 * types, in this module's categories, published in this module's states, filtered
 * by this module's own facets.
 *
 * Nothing about the page is shared state with another definition. The filters are
 * the module's, so a menu item is filtered by diet and a rental by bedrooms; the
 * states are the module's, so the Listing module cannot be talked into showing a
 * draft; and the categories are the module's branch of the tree, so a Food page
 * is never offered a car part.
 */
export async function ModulePage({
  moduleKey,
  searchParams,
}: {
  moduleKey: string;
  searchParams: ModuleSearchParams;
}) {
  const { store } = await requireStore();
  const definition = workspaceModule(moduleKey);

  // The drafts surface has its own page: it is a cross-module view of unfinished
  // work rather than one module's shelf, and merging the two would put drafts
  // back on a listing page, which is the mistake this pass exists to undo.
  if (!definition || definition.source === "drafts") notFound();

  const [shelf, settings] = await Promise.all([
    loadModuleShelf(definition, store.id, searchParams),
    getStoreSettings(store.id),
  ]);

  const threshold = Number(settings.low_stock_threshold);
  const noun = definition.plural;
  const selectedCategory = shelf.categoryTrail.at(-1);
  const createHref = selectedCategory ? `${definition.workflow.href}?category=${encodeURIComponent(selectedCategory.id)}` : definition.workflow.href;

  const totalStock = shelf.listings.reduce(
    (sum, listing) => sum + (listing.trackInventory ? listing.stock : 0),
    0,
  );
  const soldOut = shelf.listings.filter(
    (listing) => listing.trackInventory && listing.stock <= 0,
  ).length;

  const live = shelf.counts.active ?? 0;
  const drafts = shelf.counts.draft ?? 0;

  const heading =
    shelf.categoryTrail.length > 0
      ? shelf.categoryTrail.map((node) => node.name).join(" › ")
      : definition.label;

  return (
    <div className="space-y-7">
      <PageHeader
        title={heading}
        description={`${definition.blurb} ${formatNumber(shelf.total)} in this view.`}
        breadcrumb={
          shelf.categoryTrail.length > 0 ? (
            <Link
              className="flex items-center gap-1 text-xs font-medium text-muted hover:text-foreground"
              href={definition.href}
            >
              <Icon name="arrowLeft" size={13} />
              All {definition.label.toLowerCase()}
            </Link>
          ) : null
        }
        actions={
          <ButtonLink href={createHref} variant="primary">
            Add {definition.noun === "menu item" ? "a menu item" : `a ${definition.noun}`}
          </ButtonLink>
        }
      />

      {/*
        The Listing module says what it is, on the page itself, because the whole
        correction is about the meaning of the word: this shelf is *live products
        ready to be sold*, and anything unfinished belongs somewhere else.
      */}
      {definition.key === "listing" ? (
        <InfoNote title="Everything here is live and ready to sell">
          These products are published on your storefront. Unfinished products are in{" "}
          <Link className="font-medium" href="/workspace/drafts">
            Drafts
          </Link>
          , alongside Events you are still preparing.
        </InfoNote>
      ) : null}

      {/* The shelf header: what is on it, and the figures a seller checks before
          anything else. Filtering itself is one button underneath, not a wall. */}
      <div className="flex flex-col gap-4 rounded-2xl ls-elev-2 bg-surface p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <span className="flex items-baseline gap-2">
            <span className="text-[21px] leading-none font-semibold tabular-nums text-foreground">
              {formatNumber(live)}
            </span>
            <span className="text-[13px] text-muted">live</span>
          </span>

          {drafts > 0 ? (
            <>
              <span className="hidden h-8 w-px bg-border sm:block" />
              <span className="flex items-baseline gap-2">
                <span className="text-[21px] leading-none font-semibold tabular-nums text-foreground">
                  {formatNumber(drafts)}
                </span>
                <span className="text-[13px] text-muted">
                  {drafts === 1 ? "draft" : "drafts"} in{" "}
                  <Link className="underline decoration-border underline-offset-2" href="/workspace/drafts">
                    Drafts
                  </Link>
                </span>
              </span>
            </>
          ) : null}

          {definition.source === "listings" && shelf.listings.some((listing) => listing.trackInventory) ? (
            <>
              <span className="hidden h-8 w-px bg-border sm:block" />
              <span className="flex items-baseline gap-2">
                <span className="text-[21px] leading-none font-semibold tabular-nums text-foreground">
                  {formatNumber(totalStock)}
                </span>
                <span className="text-[13px] text-muted">units in stock</span>
              </span>
              {soldOut > 0 ? (
                <span className="flex items-center gap-2 rounded-full border border-danger/30 bg-danger/10 px-3 py-1.5 text-[12.5px] font-medium text-danger">
                  <Icon name="alert" size={13} />
                  {formatNumber(soldOut)} sold out
                </span>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      <WorkspaceFilterBar
        basePath={definition.href}
        search={shelf.search}
        facets={shelf.facets}
      />

      {shelf.listings.length === 0 ? (
        <EmptyState
          icon={definition.icon}
          title={
            shelf.search.value
              ? `Nothing matches “${shelf.search.value}”`
              : shelf.filtering
                ? `Nothing in this view`
                : `No ${noun} yet`
          }
          description={
            shelf.search.value
              ? "Try a different search, or clear it to see everything on this shelf."
              : shelf.filtering
                ? "Your filters exclude everything here. Clear them to see it all again."
                : definition.key === "listing"
                  ? "Add a product and it is live on your storefront immediately. That is what listing means here."
                  : `${definition.blurb} Add one and it appears on your storefront once published.`
          }
          action={
            shelf.search.value ? null : (
              <ButtonLink href={createHref} variant="primary">
                Add {definition.noun === "menu item" ? "a menu item" : `a ${definition.noun}`}
              </ButtonLink>
            )
          }
          secondaryAction={
            shelf.filtering ? (
              <ButtonLink href={definition.href} variant="outline">
                Show all
              </ButtonLink>
            ) : null
          }
        />
      ) : (
        <div className="ls-deal-grid grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {shelf.listings.map((listing) => (
            <ShelfCard key={listing.id} listing={listing} module={definition} threshold={threshold} />
          ))}
        </div>
      )}
    </div>
  );
}
