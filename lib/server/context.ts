/**
 * Workspace contextual (quick-view) data.
 *
 * The second segment of the side menu is a live quick view of whichever area is
 * selected in the first segment — real products, real orders, real revenue,
 * real stock. Nothing here is invented: each list is a bounded read of the
 * store's own rows, and an empty result is handed to the UI so it can show an
 * honest empty state.
 *
 * Everything is fetched in one parallel round for the whole side menu, so moving
 * between areas is instant — the quick view changes from data already in hand
 * rather than re-querying the database on every click.
 */

import "server-only";

import { orderStatusTone } from "../catalog";
import { formatDateTime, formatNumber, formatPercent, formatRelative } from "../format";
import { formatMoney } from "../money";
import type { StoreRow } from "../types";
import type {
  ContextItem,
  ContextStat,
  ContextThread,
  ContextTone,
  WorkspaceContextData,
} from "../workspace-context";
import { countOrders, listOrders } from "./commerce";
import { countEvents, listEvents } from "./events";
import { getDashboardMetrics, getFinanceOverview, listTransactions } from "./insights";
import { countListings, listListings } from "./listings";
import { countCustomers, listCustomers } from "./management";
import { countUnreadThreads, listThreads } from "./messages";
import { getStoreSettings } from "./stores";

const PRODUCT_TYPES = ["product"];
const PANEL_LIMIT = 6;

function statusTone(value: string | null | undefined): ContextTone {
  const tone = orderStatusTone(value);
  return tone === "success" || tone === "warning" || tone === "danger" ? tone : "default";
}

export async function getWorkspaceContextData(
  store: StoreRow,
  userId: string,
): Promise<WorkspaceContextData> {
  const settings = await getStoreSettings(store.id);
  const threshold = Number(settings.low_stock_threshold);

  const [
    products,
    productCount,
    listingCount,
    tracked,
    orders,
    paidOrders,
    orderCount,
    customers,
    customerCount,
    events,
    eventCount,
    finance,
    transactions,
    metrics,
    threads,
    unreadMessages,
  ] = await Promise.all([
    // Products here are the *listing* module's rows: live products, ready to
    // sell. A draft product is unfinished work and belongs to Drafts, so it must
    // not appear under the Listing heading in the menu either.
    listListings({ storeId: store.id, types: PRODUCT_TYPES, status: "active", sort: "newest", limit: PANEL_LIMIT }),
    countListings({ storeId: store.id, types: PRODUCT_TYPES, status: "active" }),
    countListings({ storeId: store.id, status: "all" }),
    listListings({ storeId: store.id, inStockOnly: false, limit: 100 }),
    listOrders({ storeId: store.id, limit: PANEL_LIMIT }),
    listOrders({ storeId: store.id, paymentStatus: "paid", limit: 4 }),
    countOrders({ storeId: store.id }),
    listCustomers({ storeId: store.id, limit: PANEL_LIMIT }),
    countCustomers(store.id),
    listEvents({ storeId: store.id, limit: PANEL_LIMIT }),
    countEvents({ storeId: store.id }),
    getFinanceOverview(store.id),
    listTransactions(store.id, { limit: PANEL_LIMIT }),
    getDashboardMetrics(store, threshold),
    listThreads(userId, 8),
    countUnreadThreads(userId),
  ]);

  const [draftItems, draftCount] = await Promise.all([listListings({ storeId: store.id, status: "draft", limit: PANEL_LIMIT }), countListings({ storeId: store.id, status: "draft" })]);

  const trackedListings = tracked.filter((listing) => listing.trackInventory);
  const inventoryItems = [...trackedListings].sort((a, b) => a.stock - b.stock).slice(0, PANEL_LIMIT);
  const currency = metrics.currency;

  /** Turn an order row into a panel row (used by Orders and Recent sales). */
  const orderItem = (order: (typeof orders)[number]): ContextItem => ({
    id: order.id,
    title: order.order_number,
    meta: `${order.customer_name ?? order.email} · ${formatMoney(Number(order.total), order.currency)}`,
    href: `/workspace/orders/${order.id}`,
    badge: { label: order.status, tone: statusTone(order.status) },
  });

  /**
   * Turn a listing row into a module panel row.
   *
   * One mapper for every catalogue module, because the row says the same things
   * about any listing: what it is, what it costs, how it is doing, and — the only
   * coloured thing on it — whether anything is wrong.
   */
  const moduleItem = (listing: (typeof products)[number]): ContextItem => ({
    id: listing.id,
    title: listing.title,
    meta: `${formatMoney(listing.price, listing.currency)} · ${formatNumber(listing.viewsCount)} views`,
    href: `/workspace/listings/${listing.id}`,
    imageUrl: listing.imageUrl,
    badge:
      listing.status !== "active"
        ? {
            label: listing.status === "draft" ? "Draft, not published" : "Archived",
            tone: "default" as ContextTone,
          }
        : listing.trackInventory && listing.stock <= 0
          ? { label: "Out of stock", tone: "danger" as ContextTone }
          : null,
  });

  /** Turn an event row into a panel row. */
  const eventItem = (event: (typeof events)[number]): ContextItem => ({
    id: event.id,
    title: event.title,
    meta: `${formatDateTime(event.startsAt)}${event.city ? ` · ${event.city}` : ""}`,
    href: `/workspace/events/${event.id}`,
    badge:
      event.status === "draft"
        ? { label: "Draft, not published", tone: "default" as ContextTone }
        : { label: `${formatNumber(event.productCount)} products`, tone: "default" as ContextTone },
  });

  const windowOrders = metrics.orders.last30Days;
  const windowRevenue = metrics.revenue.last30Days;
  const averageOrder = windowOrders > 0 ? windowRevenue / windowOrders : 0;

  const contextThreads: ContextThread[] = threads.map((thread) => ({
    id: thread.id,
    counterpartName: thread.counterpartName,
    listingTitle: thread.listingTitle,
    lastMessage: thread.lastMessage,
    lastFromMe: thread.lastFromMe,
    unread: thread.unread,
    href: `/messages/${thread.id}`,
  }));

  return {
    unreadMessages,
    threads: contextThreads,

    counts: {
      products: productCount,
      listings: listingCount,
      inventory: trackedListings.length,
      orders: orderCount,
      customers: customerCount,
      events: eventCount,
    },

    products: products.map(moduleItem),

    /*
     * One quick view per module.
     *
     * The menu's second panel is fed from here, keyed by the same module keys the
     * menu uses — so picking Food shows food, picking Drafts shows unfinished
     * work of every kind, and picking Listing shows only what is live. The panel
     * cannot show one module's rows under another module's name because it is
     * never given them.
     */
    modules: {
      listing: products.map(moduleItem),
      drafts: draftItems.map(moduleItem),
      events: events.map(eventItem),
    },

    moduleCounts: {
      listing: productCount,
      drafts: draftCount,
      events: eventCount,
    },

    inventory: inventoryItems.map((listing) => ({
      id: listing.id,
      title: listing.title,
      meta:
        listing.stock <= 0
          ? "Out of stock"
          : `${formatNumber(listing.stock)} in stock · threshold ${threshold}`,
      href: `/workspace/listings/${listing.id}`,
      imageUrl: listing.imageUrl,
      badge:
        listing.stock <= 0
          ? { label: "Out of stock", tone: "danger" as ContextTone }
          : listing.stock <= threshold
            ? { label: "Low stock", tone: "warning" as ContextTone }
            : { label: "In stock", tone: "success" as ContextTone },
    })),

    orders: orders.map(orderItem),

    customers: customers.map((customer) => ({
      id: customer.id,
      title: customer.name ?? customer.email,
      meta: `${formatNumber(Number(customer.orders_count))} ${
        Number(customer.orders_count) === 1 ? "order" : "orders"
      } · ${formatMoney(Number(customer.total_spent), store.currency)}`,
      // The store has no per-customer page, so selecting a customer opens the
      // orders that belong to them — a real destination, not a placeholder.
      href: `/workspace/orders?q=${encodeURIComponent(customer.email)}`,
      badge:
        customer.last_order_at != null
          ? { label: formatRelative(customer.last_order_at), tone: "default" as ContextTone }
          : null,
    })),

    events: events.map(eventItem),

    transactions: transactions.map((transaction) => ({
      id: transaction.id,
      title: transaction.description ?? transaction.type,
      meta: formatDateTime(transaction.created_at),
      href: "/workspace/finance?tab=transactions",
      badge: {
        label: `${transaction.direction === "credit" ? "+" : "−"}${formatMoney(
          Number(transaction.amount),
          transaction.currency,
        )}`,
        tone: (transaction.direction === "credit" ? "success" : "default") as ContextTone,
      },
    })),

    finance: {
      balance: finance.balance,
      currency: finance.currency,
      pending: finance.payoutsPending,
    },

    sales: {
      stats: [
        {
          label: "Revenue · 30 days",
          value: formatMoney(windowRevenue, currency),
          hint:
            metrics.revenue.changePercent === null
              ? "No previous 30 days to compare"
              : `${metrics.revenue.changePercent >= 0 ? "Up" : "Down"} ${formatPercent(
                  Math.abs(metrics.revenue.changePercent),
                )} vs previous 30 days`,
        },
        {
          label: "Orders · 30 days",
          value: formatNumber(windowOrders),
          hint: `${formatNumber(metrics.orders.pending)} pending · ${formatNumber(
            metrics.orders.fulfilled,
          )} fulfilled`,
        },
        {
          label: "Average order",
          value: formatMoney(averageOrder, currency),
          hint: `${formatNumber(metrics.units.last30Days)} units sold in 30 days`,
        },
      ],
      recent: paidOrders.length > 0 ? paidOrders.map(orderItem) : orders.slice(0, 3).map(orderItem),
    },

    analytics: {
      stats: [
        {
          label: "Store views",
          value: formatNumber(metrics.traffic.storeViews),
          hint: `${formatNumber(metrics.traffic.last30Days)} tracked events in 30 days`,
        },
        {
          label: "Listing views",
          value: formatNumber(metrics.traffic.listingViews),
          hint: `${formatNumber(metrics.conversion.purchases)} purchases all time`,
        },
        {
          label: "Conversion",
          value:
            metrics.conversion.rate === null ? "—" : formatPercent(metrics.conversion.rate, 2),
          hint:
            metrics.conversion.rate === null
              ? "Needs storefront traffic"
              : `${formatNumber(metrics.conversion.cartAdds)} cart adds`,
        },
      ],
      funnel: [
        { label: "Store views", value: formatNumber(metrics.traffic.storeViews) },
        { label: "Added to cart", value: formatNumber(metrics.conversion.cartAdds) },
        { label: "Checkout started", value: formatNumber(metrics.conversion.checkouts) },
        { label: "Purchased", value: formatNumber(metrics.conversion.purchases) },
      ],
    },
  };
}
