import { Link } from "@heroui/react/link";

import { ActionButton, ButtonLink } from "@/components/ui/controls";
import { PageHeader, StatusChip } from "@/components/ui/atoms";
import { EmptyState } from "@/components/ui/feedback";
import { Icon } from "@/components/ui/Icon";
import { WorkspaceFilterBar } from "@/components/workspace/WorkspaceFilterBar";
import {
  deleteEventAction,
  deleteListingAction,
  setListingStatusAction,
} from "@/app/actions/listings";
import { requireStore } from "@/lib/auth";
import { formatNumber, formatRelative } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { listEvents } from "@/lib/server/events";
import { listListings } from "@/lib/server/listings";
import { CREATABLE_MODULES, moduleForListingType } from "@/lib/workspace-modules";
import type { EventCardData, ListingCardData } from "@/lib/types";

export const metadata = { title: "Drafts" };

export const dynamic = "force-dynamic";

type DraftRow = {
  id: string;
  title: string;
  /** The module the draft belongs to — what it will be when it grows up. */
  moduleKey: string;
  moduleLabel: string;
  editHref: string;
  kind: "listing" | "event";
  updatedAt: string;
  imageUrl: string | null;
  /** The two facts that decide whether it is finished enough to publish. */
  hasPhoto: boolean;
  hasPrice: boolean;
  priceLabel: string | null;
  missing: string[];
};

/**
 * Drafts — everything started and not yet published.
 *
 * This is the module that makes the rest of the architecture work. Because a
 * draft is **not** a listing (a listing is a live product ready to be sold), the
 * Listing shelf cannot show one; if unfinished work had nowhere else to go it
 * would have to reappear there, which is exactly the confusion this pass
 * removes. So Drafts is its own destination, across *every* module: a draft
 * service, a draft menu item, a draft rental, a draft event and a draft product
 * all land here, labelled with the module they belong to and a link straight back
 * into the form that owns them.
 *
 * It is a read of `status = 'draft'` — of two tables, because events are their
 * own records — and it is the page that makes "Draft → Active" a real state
 * change rather than a filter someone can apply to the wrong shelf.
 */
export default async function DraftsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; kind?: string; sort?: string }>;
}) {
  const { store } = await requireStore();
  const params = await searchParams;

  const search = params.q?.trim() ?? "";
  const kindFilter = params.kind?.trim() ?? "all";
  const sort = params.sort === "oldest" ? "oldest" : params.sort === "title" ? "title" : "newest";

  const [draftListings, draftEvents] = await Promise.all([
    listListings({ storeId: store.id, status: "draft", limit: 100, sort: "newest" }),
    listEvents({ storeId: store.id, status: "draft", limit: 100 }),
  ]);

  const rows: DraftRow[] = [
    ...draftListings.map(listingRow),
    ...draftEvents.map(eventRow),
  ];

  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.moduleKey, (counts.get(row.moduleKey) ?? 0) + 1);

  const matches = (row: DraftRow) => {
    if (kindFilter !== "all" && row.moduleKey !== kindFilter) return false;
    if (!search) return true;
    const term = search.toLowerCase();
    return row.title.toLowerCase().includes(term) || row.moduleLabel.toLowerCase().includes(term);
  };

  const visible = rows.filter(matches).sort((a, b) => {
    if (sort === "title") return a.title.localeCompare(b.title);
    if (sort === "oldest") return a.updatedAt < b.updatedAt ? -1 : 1;
    return a.updatedAt < b.updatedAt ? 1 : -1;
  });

  const ready = visible.filter((row) => row.hasPhoto && row.hasPrice).length;

  return (
    <div className="space-y-7">
      <PageHeader
        title="Drafts"
        description={`${formatNumber(rows.length)} ${
          rows.length === 1 ? "thing" : "things"
        } started and not yet published. Nothing here is for sale, and nothing here is on your storefront.`}
        actions={
          <ButtonLink href="/workspace/listings/new" variant="primary">
            List a product now
          </ButtonLink>
        }
      />

      <div className="flex flex-wrap items-center gap-x-8 gap-y-3 rounded-2xl ls-elev-2 bg-surface px-5 py-4">
        <span className="flex items-baseline gap-2">
          <span className="text-[24px] leading-none font-semibold tabular-nums text-foreground">
            {formatNumber(visible.length)}
          </span>
          <span className="text-[13px] text-muted">in this view</span>
        </span>
        <span className="hidden h-8 w-px bg-border sm:block" />
        <span className="flex items-baseline gap-2">
          <span className="text-[24px] leading-none font-semibold tabular-nums text-foreground">
            {formatNumber(ready)}
          </span>
          <span className="text-[13px] text-muted">with a photo and a price</span>
        </span>
      </div>

      <WorkspaceFilterBar
        basePath="/workspace/drafts"
        search={{ value: search, label: "Search drafts", placeholder: "Name or module" }}
        facets={[
          {
            kind: "select",
            key: "kind",
            label: "Module",
            description: "Which module this unfinished work belongs to.",
            value: kindFilter,
            options: [
              { value: "all", label: `Every module · ${formatNumber(rows.length)}` },
              ...CREATABLE_MODULES.filter((module) => counts.has(module.key)).map((module) => ({
                value: module.key,
                label: `${module.label} · ${formatNumber(counts.get(module.key) ?? 0)}`,
              })),
            ],
          },
          {
            kind: "select",
            key: "sort",
            label: "Order",
            value: sort,
            neutral: "newest",
            options: [
              { value: "newest", label: "Recently touched" },
              { value: "oldest", label: "Oldest first" },
              { value: "title", label: "Name A–Z" },
            ],
          },
        ]}
      />

      {visible.length === 0 ? (
        <EmptyState
          icon="edit"
          title={rows.length === 0 ? "No drafts" : "Nothing in this view"}
          description={
            rows.length === 0
              ? "Drafts appear here the moment you start something and save it without publishing: a product, a service, a menu item, a rental or an event. Adding through Listing publishes immediately, so use any other module to begin something unfinished."
              : "Your filters exclude every draft. Clear them to see them all again."
          }
          action={
            rows.length === 0 ? (
              <ButtonLink href="/workspace/services/new" variant="primary">
                Start a service
              </ButtonLink>
            ) : (
              <ButtonLink href="/workspace/drafts" variant="outline">
                Show all
              </ButtonLink>
            )
          }
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {visible.map((row) => (
            <DraftCard key={`${row.kind}-${row.id}`} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * One unfinished thing.
 *
 * A row rather than a shelf card, because a draft is not something to look at —
 * it is something to go and finish. So the card leads with what is *missing*
 * (no photo yet, no price yet) rather than with a photograph it may not have,
 * and its primary action goes straight back to the form that owns it.
 */
function DraftCard({ row }: { row: DraftRow }) {
  return (
    <article className="ls-card flex-row gap-4 p-4">
      <Link
        className="media-frame block size-24 shrink-0 overflow-hidden bg-surface-secondary no-underline sm:size-28"
        href={row.editHref}
      >
        {row.imageUrl ? (
          <img alt="" className="size-full object-cover" loading="lazy" src={row.imageUrl} />
        ) : (
          <span className="flex size-full items-center justify-center text-muted">
            <Icon name="image" size={20} />
          </span>
        )}
      </Link>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip label={row.moduleLabel} tone="secondary" />
          <span className="text-[11.5px] text-muted">Touched {formatRelative(row.updatedAt)}</span>
        </div>

        <Link
          className="line-clamp-2 text-[15.5px] leading-snug font-semibold text-foreground no-underline"
          href={row.editHref}
        >
          {row.title || "Untitled draft"}
        </Link>

        <p className="text-[12.5px] text-muted">
          {row.missing.length === 0
            ? "Ready to publish."
            : `Still missing: ${row.missing.join(", ")}.`}
          {row.priceLabel ? ` · ${row.priceLabel}` : ""}
        </p>

        <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
          <ButtonLink className="flex-1" href={row.editHref} size="sm" variant="secondary">
            <Icon name="edit" size={14} />
            Continue editing
          </ButtonLink>

          {row.kind === "listing" ? (
            <ActionButton
              action={setListingStatusAction.bind(null, row.id, "active")}
              size="sm"
              variant="ghost"
            >
              Publish
            </ActionButton>
          ) : null}

          <ActionButton
            action={
              row.kind === "listing"
                ? deleteListingAction.bind(null, row.id)
                : deleteEventAction.bind(null, row.id)
            }
            confirm={`Delete “${row.title || "this draft"}”? This cannot be undone.`}
            size="sm"
            variant="danger-soft"
          >
            Delete
          </ActionButton>
        </div>
      </div>
    </article>
  );
}

function listingRow(listing: ListingCardData): DraftRow {
  const module = moduleForListingType(listing.type);
  const missing: string[] = [];
  if (!listing.imageUrl) missing.push("a photo");
  if (listing.price <= 0) missing.push("a price");

  return {
    id: listing.id,
    title: listing.title,
    moduleKey: module?.key ?? "listing",
    moduleLabel: module?.label ?? listing.type,
    editHref: `/workspace/listings/${listing.id}`,
    kind: "listing",
    updatedAt: listing.createdAt,
    imageUrl: listing.imageUrl,
    hasPhoto: Boolean(listing.imageUrl),
    hasPrice: listing.price > 0,
    priceLabel: listing.price > 0 ? formatMoney(listing.price, listing.currency) : null,
    missing,
  };
}

function eventRow(event: EventCardData): DraftRow {
  const missing: string[] = [];
  if (!event.coverImageUrl) missing.push("a cover image");
  if (event.ticketsTotal === 0) missing.push("ticket types");

  return {
    id: event.id,
    title: event.title,
    moduleKey: "events",
    moduleLabel: "Events",
    editHref: `/workspace/events/${event.id}`,
    kind: "event",
    updatedAt: event.startsAt,
    imageUrl: event.coverImageUrl,
    hasPhoto: Boolean(event.coverImageUrl),
    hasPrice: event.minPrice !== null,
    priceLabel:
      event.minPrice !== null ? `from ${formatMoney(event.minPrice, event.currency)}` : null,
    missing,
  };
}
