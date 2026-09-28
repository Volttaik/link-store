/**
 * Workspace navigation — the primary rail.
 *
 * A flat, stable list of the primary Workspace destinations. Each entry declares
 * the **context** it opens, which is what decides what the section display beside
 * it shows.
 *
 * ## Why the catalogue entries are generated
 *
 * The marketplace modules — Listing, Services, Food, Events, Rentals, Digital,
 * Drafts — are generated from `lib/workspace-modules.ts` rather than typed out
 * again here. That is deliberate: a module's label, its own route, its icon and
 * the words a search should find it by are declared **once**, so the side menu
 * cannot drift from the pages it points at, and a new module appears in the menu
 * by being declared as a module.
 *
 * ## Why it is searchable
 *
 * This menu is deliberately long — a broad marketplace is managed from it — and
 * collapsing it back into one generic page is the thing we are undoing. So
 * instead of shrinking it, it carries a **search**: `products` finds Listing,
 * `booking` finds Services, `files` finds Digital, `property` finds Rentals.
 * Every entry's `keywords` are what that search reads.
 */

import type { IconName } from "@/components/ui/Icon";
import { MODULE_MAP } from "./workspace-modules";

/** Which section the display beside the menu shows. */
export type WorkspaceContextKey =
  | "dashboard"
  | "analytics"
  | "sales"
  | "listing"
  | "services"
  | "food"
  | "events"
  | "rentals"
  | "digital"
  | "drafts"
  | "inventory"
  | "orders"
  | "customers"
  | "messages"
  | "finance"
  | "store";

export type WorkspaceNavItem = {
  key: string;
  label: string;
  /** A short line shown under the label in the section display heading. */
  blurb: string;
  href: string;
  icon: IconName;
  /** Extra query params this item is distinguished by. */
  query?: Record<string, string>;
  /**
   * Where to send the seller when the destination needs a store that does not
   * exist yet. Keeps an entry from ever being a dead link.
   */
  fallbackHref?: string;
  /** The section display this destination opens. */
  context: WorkspaceContextKey;
  /** What the menu's own search matches, beyond the label. */
  keywords?: string[];
};

/** Everything a nav entry needs from the outside world to resolve its href. */
export type NavContext = {
  storeSlug?: string | null;
};

/** The catalogue modules in the order the menu lists them. */
const MODULE_NAV_ORDER = [
  "listing",
  "drafts",
  "food",
  "services",
  "events",
  "rentals",
  "digital",
] as const;

/**
 * The catalogue half of the rail, read straight from the module registry.
 *
 * `Listing` comes first because it is what a seller touches most — it is the
 * shelf of things ready to sell. `Drafts` sits directly under it, because the
 * two are the pair the whole architecture turns on: live work on one side,
 * unfinished work on the other, and never the same page.
 */
const MODULE_NAV: WorkspaceNavItem[] = MODULE_NAV_ORDER.map((key) => {
  const module = MODULE_MAP[key];
  return {
    key: `module-${module.key}`,
    label: module.label,
    blurb: module.blurb,
    href: module.href,
    icon: module.icon,
    context: module.key as WorkspaceContextKey,
    keywords: module.keywords,
  };
});

/**
 * Panel 1 — the primary Workspace destinations.
 *
 * The order is the order a seller works in: overview, what they sell, stock,
 * trade, money and the shop itself.
 */
export const WORKSPACE_NAV: WorkspaceNavItem[] = [
  {
    key: "dashboard",
    label: "Dashboard",
    blurb: "Your workspace at a glance.",
    href: "/workspace",
    icon: "dashboard",
    context: "dashboard",
    keywords: ["home", "overview", "summary"],
  },
  {
    key: "analytics",
    label: "Analytics",
    blurb: "Traffic and conversion.",
    href: "/workspace/analytics",
    query: { tab: "overview" },
    icon: "analytics",
    context: "analytics",
    keywords: ["traffic", "visits", "conversion", "funnel", "insights"],
  },
  {
    key: "sales",
    label: "Sales",
    blurb: "Revenue, orders and what sold.",
    href: "/workspace/analytics",
    query: { tab: "sales" },
    icon: "trendingUp",
    context: "sales",
    keywords: ["revenue", "sold", "takings", "money in"],
  },

  ...MODULE_NAV,

  {
    key: "inventory",
    label: "Inventory",
    blurb: "Stock levels and movements.",
    href: "/workspace/inventory",
    icon: "inventory",
    context: "inventory",
    keywords: ["stock", "quantity", "restock", "levels", "warehouse"],
  },
  {
    key: "orders",
    label: "Orders",
    blurb: "Everything sold, awaiting fulfilment.",
    href: "/workspace/orders",
    icon: "orders",
    context: "orders",
    keywords: ["purchases", "fulfilment", "shipping", "delivery", "sales"],
  },
  {
    key: "customers",
    label: "Customers",
    blurb: "The people who buy from you.",
    href: "/workspace/customers",
    icon: "customers",
    context: "customers",
    keywords: ["buyers", "people", "accounts"],
  },
  {
    key: "messages",
    label: "Messages",
    blurb: "Conversations about your listings.",
    href: "/messages",
    icon: "message",
    context: "messages",
    keywords: ["chat", "threads", "enquiries", "inbox"],
  },
  {
    key: "finance",
    label: "Finance",
    blurb: "Balance, fees and payouts.",
    href: "/workspace/finance",
    icon: "finance",
    context: "finance",
    keywords: ["payout", "payouts", "balance", "bank", "transactions", "fees"],
  },
  {
    key: "store",
    label: "Store",
    blurb: "Your storefront and its settings.",
    href: "/workspace/settings",
    query: { tab: "store" },
    fallbackHref: "/workspace/onboarding",
    icon: "shop",
    context: "store",
    keywords: ["storefront", "settings", "handle", "profile", "shop", "brand"],
  },
];

/** The platform administration rail — one panel, platform scope. */
export const ADMIN_NAV: WorkspaceNavItem[] = [
  {
    key: "admin-overview",
    label: "Overview",
    blurb: "Everything on LINK STORE.",
    href: "/admin",
    icon: "dashboard",
    context: "dashboard",
    keywords: ["platform", "summary"],
  },
  {
    key: "admin-stores",
    label: "Shops",
    blurb: "Every shop on the platform.",
    href: "/admin/stores",
    icon: "shop",
    context: "store",
    keywords: ["stores", "sellers"],
  },
  {
    key: "admin-users",
    label: "Accounts",
    blurb: "The people behind the shops.",
    href: "/admin/users",
    icon: "customers",
    context: "customers",
    keywords: ["users", "people", "signups"],
  },
];

/** Replace the `:slug` placeholder with the seller's real store handle. */
function materializeHref(item: WorkspaceNavItem, ctx?: NavContext): string {
  if (!item.href.includes(":slug")) return item.href;
  const slug = ctx?.storeSlug;
  if (slug) return item.href.replace(":slug", slug);
  return item.fallbackHref ?? item.href;
}

/**
 * Which primary destination does the current URL belong to?
 *
 * Query params distinguish destinations that share a path
 * (`/workspace/analytics?tab=sales` is Sales, not Analytics), and a nested route
 * — a product's editor — keeps its parent entry lit. Ties keep the earlier (more
 * general) entry.
 */
export function resolveActiveNav(
  nav: WorkspaceNavItem[],
  pathname: string,
  searchParams: URLSearchParams,
  ctx?: NavContext,
): { itemKey: string | null } {
  let best: { itemKey: string; score: number } | null = null;

  for (const item of nav) {
    const href = materializeHref(item, ctx);
    const exact = pathname === href;
    const nested = pathname.startsWith(`${href}/`) && !href.includes(":slug");
    if (!exact && !nested) continue;

    const required = Object.entries(item.query ?? {});
    const matchesQuery = required.every(([key, value]) => searchParams.get(key) === value);

    const score = nested ? 1 : exact && matchesQuery ? 2 + required.length : 1;
    if (!best || score > best.score) {
      best = { itemKey: item.key, score };
    }
  }

  return { itemKey: best?.itemKey ?? null };
}

/** Absolute URL for a navigation entry, including its query string. */
export function navItemHref(item: WorkspaceNavItem, ctx?: NavContext): string {
  const base = materializeHref(item, ctx);
  const query = new URLSearchParams(item.query ?? {}).toString();
  return query ? `${base}?${query}` : base;
}

/**
 * Does an entry match what has been typed into the menu's search?
 *
 * Matched on the label and on the registered keywords, so the menu is searched by
 * what the seller means rather than by what a page happens to be called.
 */
export function navItemMatches(item: WorkspaceNavItem, term: string): boolean {
  const query = term.trim().toLowerCase();
  if (!query) return true;

  if (item.label.toLowerCase().includes(query)) return true;
  if (item.blurb.toLowerCase().includes(query)) return true;

  return (item.keywords ?? []).some((keyword) => keyword.includes(query));
}

/**
 * The five destinations in the floating mobile navigation, in order.
 *
 * Looked up by key so the same list works for the workspace and for platform
 * admin; preferred entries that do not exist in the given nav are dropped rather
 * than rendered as dead controls.
 */
export function mobileNavItems(nav: WorkspaceNavItem[]): WorkspaceNavItem[] {
  const preferred = ["dashboard", "module-listing", "module-drafts", "orders", "store"];
  const picked = preferred
    .map((key) => nav.find((item) => item.key === key))
    .filter((item): item is WorkspaceNavItem => Boolean(item));

  return picked.length >= 4 ? picked : nav.slice(0, 5);
}
