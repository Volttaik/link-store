/**
 * Shared shape of the Workspace section display.
 *
 * These types are client-safe: the sidebar renders from a bundle the server
 * produces, and both sides need to agree on its shape.
 */

/** Tones the section display understands (a subset of the app's status tones). */
export type ContextTone = "default" | "success" | "warning" | "danger";

/** One selectable row in the contextual panel. */
export type ContextItem = {
  id: string;
  title: string;
  /** Secondary line: price, customer, date — whatever identifies the record. */
  meta: string;
  href: string;
  /** A real thumbnail when the record has one (products); never a stock image. */
  imageUrl?: string | null;
  badge: { label: string; tone: ContextTone } | null;
};

/** A single compact figure in a quick view (revenue, views, stock). */
export type ContextStat = {
  label: string;
  value: string;
  hint?: string | null;
};

/** A message thread as the side menu shows it. */
export type ContextThread = {
  id: string;
  counterpartName: string;
  listingTitle: string | null;
  lastMessage: string | null;
  lastFromMe: boolean;
  unread: number;
  href: string;
};

export type WorkspaceContextData = {
  /** Unread messages across every thread — shown on the rail. */
  unreadMessages: number;
  threads: ContextThread[];
  counts: {
    products: number;
    services: number;
    listings: number;
    inventory: number;
    orders: number;
    customers: number;
    events: number;
  };
  /**
   * A quick view per catalogue module, keyed by module key.
   *
   * Every module in the side menu reads its own rows here — the Listing module
   * its *live* products, Drafts its unfinished work, Food its menu — so the panel
   * beside the menu can never show one module's rows under another module's name.
   */
  modules: Record<string, ContextItem[]>;
  /** Row counts per module key. */
  moduleCounts: Record<string, number>;
  products: ContextItem[];
  services: ContextItem[];
  inventory: ContextItem[];
  orders: ContextItem[];
  customers: ContextItem[];
  events: ContextItem[];
  transactions: ContextItem[];
  finance: { balance: number; currency: string; pending: number };
  /** Compact sales overview — formatted on the server so the panel just renders. */
  sales: { stats: ContextStat[]; recent: ContextItem[] };
  /** Compact traffic/conversion overview. */
  analytics: { stats: ContextStat[]; funnel: ContextStat[] };
};
