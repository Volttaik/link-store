"use client";

import { Link } from "@heroui/react";

import { Icon } from "@/components/ui/Icon";
import { NavButton } from "@/components/ui/controls";
import { formatNumber } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import type { ContextItem, WorkspaceContextData } from "@/lib/workspace-context";
import type { WorkspaceNavItem } from "@/lib/workspace-nav";

/**
 * SECTION B of the side menu — the secondary area.
 *
 * One white surface floating on the dark purple menu, holding text: the area's
 * name, the **Open** button that actually enters the page, then figures and
 * records as plain label/value lines and record lines. No stat pills, no chips —
 * statuses are written into the line they belong to.
 *
 * Picking an area in SECTION A points this card at that area without navigating,
 * so it doubles as a navigation surface: the records here can be opened
 * directly, and the Open button enters the whole section.
 *
 * Everything comes from the store's own rows, and an empty area says so plainly.
 */
export function WorkspaceSectionDisplay({
  item,
  contextData,
  storeName,
  storePublished,
  openHref,
  showOpen,
  onOpen,
  onNavigate,
}: {
  item: WorkspaceNavItem;
  contextData: WorkspaceContextData;
  storeName: string | null;
  storePublished: boolean;
  /** Where the Open button goes. */
  openHref: string;
  /** Hide the button when the picked area is the page already being viewed. */
  showOpen: boolean;
  /** Runs as the Open button navigates — closes the drawer it lives in. */
  onOpen?: () => void;
  onNavigate?: () => void;
}) {
  const { counts, finance } = contextData;

  return (
    <div className="h-full min-h-0 motion-safe:animate-segment">
      <div className="ls-edge-card relative flex h-full min-h-0 flex-col overflow-hidden rounded-2xl bg-surface p-4 shadow-elev-float">
        {/* The card wears the accent trio around its edge in motion — the
            colour travels the perimeter, the surface stays white. */}
        <div className="flex shrink-0 flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-baseline gap-3">
              <h2 className="min-w-0 truncate text-[17px] font-semibold tracking-tight text-foreground">
                {item.label}
              </h2>
              <span className="shrink-0 text-[12.5px] tabular-nums text-muted">
                {countLabel(item, contextData)}
              </span>
            </div>
            <p className="mt-1.5 truncate text-[13px] text-muted">{item.blurb}</p>
          </div>

          {showOpen ? (
            <NavButton
              className="ls-edge shrink-0"
              href={openHref}
              onNavigate={onOpen}
              variant="primary"
            >
              Open {item.label}
            </NavButton>
          ) : (
            <span className="shrink-0 pt-2 text-[12.5px] text-muted">
              You are viewing this area.
            </span>
          )}
        </div>

        <div className="no-scrollbar mt-4 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
          {item.context === "dashboard" ? (
            <Lines
              rows={[
                { label: "Products", value: formatNumber(counts.products) },
                { label: "Orders", value: formatNumber(counts.orders) },
                { label: "Customers", value: formatNumber(counts.customers) },
                { label: "Tracked stock", value: formatNumber(counts.inventory) },
                {
                  label: "Available balance",
                  value: formatMoney(finance.balance, finance.currency),
                },
              ]}
            />
          ) : null}

          {item.context === "analytics" ? (
            <>
              <Lines rows={contextData.analytics.stats} />
              <Group label="Conversion funnel" />
              <Lines
                rows={contextData.analytics.funnel.map((step) => ({
                  label: step.label,
                  value: step.value,
                }))}
              />
            </>
          ) : null}

          {item.context === "sales" ? (
            <>
              <Lines rows={contextData.sales.stats} />
              <Items
                empty="Paid orders appear here as soon as one is verified."
                items={contextData.sales.recent}
                label="Recent sales"
                onNavigate={onNavigate}
              />
            </>
          ) : null}

          {/*
            Every catalogue module, from one branch.

            The panel is handed a quick view keyed by the module it belongs to —
            Listing's live products, Food's menu, Drafts' unfinished work — so a
            module can never be previewed with another module's rows, and a new
            module needs no new branch here.
          */}
          {contextData.modules[item.context] ? (
            <Items
              empty={moduleEmpty(item.context)}
              items={contextData.modules[item.context]}
              label={item.context === "drafts" ? "Unfinished, newest first" : "Newest first"}
              onNavigate={onNavigate}
              thumb
            />
          ) : null}

          {item.context === "inventory" ? (
            <Items
              empty="Listings that track stock appear here, lowest first."
              items={contextData.inventory}
              label="Lowest stock first"
              onNavigate={onNavigate}
              thumb
            />
          ) : null}

          {item.context === "orders" ? (
            <Items
              empty="Orders appear here as customers buy from your storefront."
              items={contextData.orders}
              label="Latest"
              onNavigate={onNavigate}
            />
          ) : null}

          {item.context === "customers" ? (
            <Items
              empty="Someone is recorded the first time they check out."
              items={contextData.customers}
              label="Most recent"
              onNavigate={onNavigate}
            />
          ) : null}

          {item.context === "messages" ? (
            <>
              <Group label="Latest conversations" />
              {contextData.threads.length === 0 ? (
                <p className="py-2.5 text-[13px] leading-relaxed text-muted">
                  No conversations yet. A buyer asking about a product starts one, and it appears
                  here with the listing it is about.
                </p>
              ) : (
                contextData.threads.map((thread) => (
                  <Link
                    className="flex items-center gap-3.5 rounded-xl px-2 py-2.5 no-underline transition-colors hover:bg-surface-secondary/60"
                    href={thread.href}
                    key={thread.id}
                    onClick={onNavigate}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium text-foreground">
                        {thread.counterpartName}
                        {thread.unread > 0 ? (
                          <span className="ml-2 text-[11.5px] text-accent">
                            {thread.unread} new
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-1 block truncate text-[13px] text-muted">
                        {thread.listingTitle ? `${thread.listingTitle} · ` : ""}
                        {thread.lastFromMe ? "You: " : ""}
                        {thread.lastMessage ?? "No messages yet."}
                      </span>
                    </span>
                  </Link>
                ))
              )}
            </>
          ) : null}


          {item.context === "finance" ? (
            <>
              <Lines
                rows={[
                  {
                    label: "Available balance",
                    value: formatMoney(finance.balance, finance.currency),
                  },
                  {
                    label: "Requested in payouts",
                    value: formatMoney(finance.pending, finance.currency),
                  },
                ]}
              />
              <Items
                empty="Sales, platform fees and payouts appear here."
                items={contextData.transactions}
                label="Recent activity"
                onNavigate={onNavigate}
              />
            </>
          ) : null}

          {item.context === "store" ? (
            <Lines
              rows={[
                { label: "Storefront", value: storeName ?? "None yet" },
                { label: "Visibility", value: storePublished ? "Published" : "Not public yet" },
                { label: "Listings", value: formatNumber(counts.listings) },
                { label: "Orders", value: formatNumber(counts.orders) },
                { label: "Customers", value: formatNumber(counts.customers) },
              ]}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** What sits next to the area's name — a real figure, never decoration. */
function countLabel(item: WorkspaceNavItem, data: WorkspaceContextData): string {
  switch (item.context) {
    case "dashboard":
      return "Store overview";
    case "analytics":
      return "Last 30 days";
    case "sales":
      return `${formatNumber(data.counts.orders)} orders`;
    case "inventory":
      return `${formatNumber(data.counts.inventory)} tracked`;
    case "orders":
      return `${formatNumber(data.counts.orders)} orders`;
    case "customers":
      return `${formatNumber(data.counts.customers)} customers`;
    case "messages":
      return data.unreadMessages > 0
        ? `${formatNumber(data.unreadMessages)} unread`
        : `${formatNumber(data.threads.length)} threads`;
    case "finance":
      return "Balance & activity";
    case "store":
      return "Your storefront";
    default: {
      // A catalogue module: the count of its own rows, in the state it opens on.
      const count = data.moduleCounts[item.context];
      if (typeof count !== "number") return item.blurb;
      const noun = count === 1 ? "item" : "items";
      return `${formatNumber(count)} ${noun}`;
    }
  }
}

/** What a module's panel says when it has nothing yet. */
function moduleEmpty(context: string): string {
  switch (context) {
    case "listing":
      return "Add a product and it is live and ready to sell straight away.";
    case "drafts":
      return "Drafts appear here the moment you save something unfinished.";
    case "events":
      return "Curate your products into an Event and it appears here.";
    default:
      return "Nothing here yet.";
  }
}

/** A small heading inside the card, for the lists that follow it. */
function Group({ label }: { label: string }) {
  return (
    <p className="px-2 pt-3 pb-1 text-[10.5px] font-semibold tracking-[0.14em] text-muted uppercase">
      {label}
    </p>
  );
}

function Lines({ rows }: { rows: Array<{ label: string; value: string }> }) {
  return (
    <>
      {rows.map((row) => (
        <div
          key={row.label}
          className="flex items-baseline justify-between gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-surface-secondary/60"
        >
          <span className="min-w-0 truncate text-[14px] text-muted">{row.label}</span>
          <span className="shrink-0 text-[15.5px] font-semibold tabular-nums text-foreground">
            {row.value}
          </span>
        </div>
      ))}
    </>
  );
}

function Items({
  label,
  items,
  empty,
  thumb = false,
  onNavigate,
}: {
  label: string;
  items: ContextItem[];
  empty: string;
  thumb?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <>
      <Group label={label} />

      {items.length === 0 ? (
        <p className="py-2.5 text-[13px] leading-relaxed text-muted">{empty}</p>
      ) : (
        items.map((entry) => (
          <Link
            key={entry.id}
            href={entry.href}
            onClick={onNavigate}
            className="flex items-center gap-3.5 rounded-xl px-2 py-2.5 no-underline transition-colors hover:bg-surface-secondary/60"
          >
            {thumb ? (
              <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-secondary text-iris-deep">
                {entry.imageUrl ? (
                  <img
                    alt=""
                    className="size-full object-cover"
                    loading="lazy"
                    src={entry.imageUrl}
                  />
                ) : (
                  <Icon name="image" size={14} />
                )}
              </span>
            ) : null}

            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-medium text-foreground">
                {entry.title}
              </span>
              <span className="mt-1 block truncate text-[13px] text-muted">
                {entry.meta}
                {entry.badge ? `${entry.meta ? " · " : ""}${entry.badge.label}` : ""}
              </span>
            </span>
          </Link>
        ))
      )}
    </>
  );
}
