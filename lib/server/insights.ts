/**
 * Analytics and finance.
 *
 * Every number surfaced to a seller is derived from real rows — orders, order
 * items, payments, ledger transactions and analytics events. There are no
 * hard-coded figures and no synthetic "demo" activity: a brand new store sees
 * zeros and an onboarding prompt, which is the truth.
 */

import "server-only";

import { execute, query, queryOne } from "../db";
import { newId } from "../ids";
import { nowIso } from "../format";
import { sendPayoutRequestedEmail, storeOwnerContact } from "./email";
import type { PayoutRow, StoreRow, TransactionRow } from "../types";

export type AnalyticsEventType =
  | "store_view"
  | "listing_view"
  | "add_to_cart"
  | "checkout_start"
  | "purchase"
  | "search";

/**
 * Record a behavioural event. Never throws: a failed analytics insert must not
 * be able to break a customer's purchase.
 */
export async function recordAnalyticsEvent(input: {
  storeId?: string | null;
  listingId?: string | null;
  eventType: AnalyticsEventType;
  path?: string | null;
  referrer?: string | null;
  sessionId?: string | null;
  userId?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    await execute(
      `INSERT INTO analytics_events
         (id, store_id, listing_id, event_type, path, referrer, session_id, user_id, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newId("ev"),
        input.storeId ?? null,
        input.listingId ?? null,
        input.eventType,
        input.path ?? null,
        input.referrer ?? null,
        input.sessionId ?? null,
        input.userId ?? null,
        input.metadata ? JSON.stringify(input.metadata) : null,
        nowIso(),
      ],
    );
  } catch {
    // Intentionally swallowed — see doc comment.
  }
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

// --- Dashboard --------------------------------------------------------------

export type DashboardMetrics = {
  currency: string;
  /**
   * The window every "recent" figure below covers, in days.
   *
   * The fields named `last30Days` / `previous30Days` / `new30Days` mean *this*
   * window and the one before it — the names are kept because they read from a
   * dozen places, but nothing here assumes 30 any more.
   */
  windowDays: number;
  revenue: { total: number; last30Days: number; previous30Days: number; changePercent: number | null };
  orders: { total: number; last30Days: number; pending: number; paid: number; fulfilled: number };
  customers: { total: number; returning: number; new30Days: number };
  catalogue: { active: number; draft: number; outOfStock: number; lowStock: number };
  traffic: { storeViews: number; listingViews: number; last30Days: number };
  conversion: { rate: number | null; cartAdds: number; checkouts: number; purchases: number };
  events: { published: number; upcoming: number; products: number };
  /** Units sold, summed from order items on paid orders. */
  units: { last30Days: number; total: number };
  /** Sparse: only days that actually took a payment. */
  revenueSeries: Array<{ day: string; revenue: number; orders: number }>;
  /**
   * The same 30 days, zero-filled, so a chart plots a real timeline instead of
   * silently compressing quiet days into the gaps between sales.
   */
  salesSeries: Array<{ day: string; revenue: number; orders: number }>;
  recentOrders: Array<{
    id: string;
    order_number: string;
    email: string;
    customer_name: string | null;
    total: number;
    currency: string;
    status: string;
    payment_status: string;
    created_at: string;
  }>;
  recentTransactions: TransactionRow[];
  topListings: Array<{ listingId: string | null; title: string; units: number; revenue: number }>;
  lowStockItems: Array<{ id: string; title: string; stock: number; slug: string }>;
};

export async function getDashboardMetrics(
  store: StoreRow,
  lowStockThreshold: number,
  /** How many days back the window runs. Defaults to a month. */
  days = 30,
): Promise<DashboardMetrics> {
  const storeId = store.id;
  const window = Math.max(1, Math.round(days));
  const period = daysAgo(window);
  const previousPeriod = daysAgo(window * 2);

  const [
    paidTotals,
    orderCounts,
    customerStats,
    catalogueStats,
    trafficTotals,
    funnel,
    eventStats,
    revenueSeries,
    recentOrders,
    recentTransactions,
    topListings,
    lowStockItems,
    unitsSold,
  ] = await Promise.all([
    queryOne<{ total: number; last30: number; previous30: number }>(
      `SELECT
         COALESCE(SUM(total), 0) AS total,
         COALESCE(SUM(CASE WHEN paid_at >= ? THEN total ELSE 0 END), 0) AS last30,
         COALESCE(SUM(CASE WHEN paid_at >= ? AND paid_at < ? THEN total ELSE 0 END), 0) AS previous30
       FROM orders WHERE store_id = ? AND payment_status = 'paid'`,
      [period, previousPeriod, period, storeId],
    ),

    queryOne<{ total: number; last30: number; pending: number; paid: number; fulfilled: number }>(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END), 0) AS last30,
              COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0) AS pending,
              COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN 1 ELSE 0 END), 0) AS paid,
              COALESCE(SUM(CASE WHEN status = 'fulfilled' THEN 1 ELSE 0 END), 0) AS fulfilled
       FROM orders WHERE store_id = ?`,
      [period, storeId],
    ),

    queryOne<{ total: number; returning: number; recent: number }>(
      // `returning` is a reserved word in SQLite, so the alias must be quoted.
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(CASE WHEN orders_count > 1 THEN 1 ELSE 0 END), 0) AS "returning",
              COALESCE(SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END), 0) AS recent
       FROM customers WHERE store_id = ?`,
      [period, storeId],
    ),

    queryOne<{ active: number; draft: number; out_of_stock: number; low_stock: number }>(
      `SELECT
         COALESCE(SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END), 0) AS active,
         COALESCE(SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END), 0) AS draft,
         COALESCE(SUM(CASE WHEN track_inventory = 1 AND stock <= 0 AND status = 'active' THEN 1 ELSE 0 END), 0) AS out_of_stock,
         COALESCE(SUM(CASE WHEN track_inventory = 1 AND stock > 0 AND stock <= ? AND status = 'active' THEN 1 ELSE 0 END), 0) AS low_stock
       FROM listings WHERE store_id = ?`,
      [lowStockThreshold, storeId],
    ),

    queryOne<{ store_views: number; listing_views: number; recent: number }>(
      `SELECT
         COALESCE(SUM(CASE WHEN event_type = 'store_view' THEN 1 ELSE 0 END), 0) AS store_views,
         COALESCE(SUM(CASE WHEN event_type = 'listing_view' THEN 1 ELSE 0 END), 0) AS listing_views,
         COALESCE(SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END), 0) AS recent
       FROM analytics_events WHERE store_id = ?`,
      [period, storeId],
    ),

    queryOne<{ cart_adds: number; checkouts: number; purchases: number }>(
      `SELECT
         COALESCE(SUM(CASE WHEN event_type = 'add_to_cart' THEN 1 ELSE 0 END), 0) AS cart_adds,
         COALESCE(SUM(CASE WHEN event_type = 'checkout_start' THEN 1 ELSE 0 END), 0) AS checkouts,
         COALESCE(SUM(CASE WHEN event_type = 'purchase' THEN 1 ELSE 0 END), 0) AS purchases
       FROM analytics_events WHERE store_id = ?`,
      [storeId],
    ),

    queryOne<{ published: number; upcoming: number; products: number }>(
      `SELECT
         COALESCE(SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END), 0) AS published,
         COALESCE(SUM(CASE WHEN status = 'published' AND starts_at >= ? THEN 1 ELSE 0 END), 0) AS upcoming,
         COALESCE((SELECT COUNT(*) FROM event_products ep JOIN events e2 ON e2.id = ep.event_id WHERE e2.store_id = ?), 0) AS products
       FROM events WHERE store_id = ?`,
      [nowIso(), storeId, storeId],
    ),

    query<{ day: string; revenue: number; orders: number }>(
      `SELECT substr(paid_at, 1, 10) AS day,
              COALESCE(SUM(total), 0) AS revenue,
              COUNT(*) AS orders
       FROM orders
       WHERE store_id = ? AND payment_status = 'paid' AND paid_at >= ?
       GROUP BY day ORDER BY day ASC`,
      [storeId, period],
    ),

    query<DashboardMetrics["recentOrders"][number]>(
      `SELECT id, order_number, email, customer_name, total, currency, status, payment_status, created_at
       FROM orders WHERE store_id = ? ORDER BY created_at DESC LIMIT 6`,
      [storeId],
    ),

    query<TransactionRow>(
      "SELECT * FROM transactions WHERE store_id = ? ORDER BY created_at DESC LIMIT 6",
      [storeId],
    ),

    query<{ listingId: string | null; title: string; units: number; revenue: number }>(
      `SELECT oi.listing_id AS listingId, oi.title,
              COALESCE(SUM(oi.quantity), 0) AS units,
              COALESCE(SUM(oi.total), 0) AS revenue
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE o.store_id = ? AND o.payment_status = 'paid'
       GROUP BY oi.listing_id, oi.title
       ORDER BY revenue DESC LIMIT 5`,
      [storeId],
    ),

    query<{ id: string; title: string; stock: number; slug: string }>(
      `SELECT id, title, stock, slug FROM listings
       WHERE store_id = ? AND track_inventory = 1 AND status = 'active' AND stock <= ?
       ORDER BY stock ASC LIMIT 5`,
      [storeId, lowStockThreshold],
    ),

    queryOne<{ last30: number; total: number }>(
      `SELECT
         COALESCE((SELECT SUM(oi.quantity) FROM order_items oi
                     JOIN orders o ON o.id = oi.order_id
                    WHERE o.store_id = ? AND o.payment_status = 'paid' AND o.paid_at >= ?), 0) AS last30,
         COALESCE((SELECT SUM(oi.quantity) FROM order_items oi
                     JOIN orders o ON o.id = oi.order_id
                    WHERE o.store_id = ? AND o.payment_status = 'paid'), 0) AS total`,
      [storeId, period, storeId],
    ),
  ]);

  // Fill the quiet days in, so a chart plots a real timeline rather than only
  // the days that happened to take a payment.
  const salesByDay = new Map(revenueSeries.map((point) => [point.day, point]));
  const salesSeries: DashboardMetrics["salesSeries"] = [];
  for (let index = window - 1; index >= 0; index -= 1) {
    const day = new Date(Date.now() - index * 86_400_000).toISOString().slice(0, 10);
    const point = salesByDay.get(day);
    salesSeries.push({
      day,
      revenue: Number(point?.revenue ?? 0),
      orders: Number(point?.orders ?? 0),
    });
  }

  const last30 = Number(paidTotals?.last30 ?? 0);
  const previous30 = Number(paidTotals?.previous30 ?? 0);
  const changePercent =
    previous30 > 0 ? ((last30 - previous30) / previous30) * 100 : last30 > 0 ? null : 0;

  const storeViews = Number(trafficTotals?.store_views ?? 0);
  const purchases = Number(funnel?.purchases ?? 0);

  return {
    currency: store.currency,
    windowDays: window,
    revenue: {
      total: Number(paidTotals?.total ?? 0),
      last30Days: last30,
      previous30Days: previous30,
      changePercent,
    },
    orders: {
      total: Number(orderCounts?.total ?? 0),
      last30Days: Number(orderCounts?.last30 ?? 0),
      pending: Number(orderCounts?.pending ?? 0),
      paid: Number(orderCounts?.paid ?? 0),
      fulfilled: Number(orderCounts?.fulfilled ?? 0),
    },
    customers: {
      total: Number(customerStats?.total ?? 0),
      returning: Number(customerStats?.returning ?? 0),
      new30Days: Number(customerStats?.recent ?? 0),
    },
    catalogue: {
      active: Number(catalogueStats?.active ?? 0),
      draft: Number(catalogueStats?.draft ?? 0),
      outOfStock: Number(catalogueStats?.out_of_stock ?? 0),
      lowStock: Number(catalogueStats?.low_stock ?? 0),
    },
    traffic: {
      storeViews,
      listingViews: Number(trafficTotals?.listing_views ?? 0),
      last30Days: Number(trafficTotals?.recent ?? 0),
    },
    conversion: {
      // Conversion is only meaningful once there is traffic to divide by.
      rate: storeViews > 0 ? (purchases / storeViews) * 100 : null,
      cartAdds: Number(funnel?.cart_adds ?? 0),
      checkouts: Number(funnel?.checkouts ?? 0),
      purchases,
    },
    events: {
      published: Number(eventStats?.published ?? 0),
      upcoming: Number(eventStats?.upcoming ?? 0),
      products: Number(eventStats?.products ?? 0),
    },
    units: {
      last30Days: Number(unitsSold?.last30 ?? 0),
      total: Number(unitsSold?.total ?? 0),
    },
    revenueSeries,
    salesSeries,
    recentOrders,
    recentTransactions,
    topListings,
    lowStockItems,
  };
}

// --- Analytics section ------------------------------------------------------

export type AnalyticsOverview = {
  trafficSeries: Array<{ day: string; storeViews: number; listingViews: number; addToCart: number }>;
  topListings: Array<{
    listingId: string;
    title: string;
    slug: string;
    type: string;
    views: number;
    units: number;
    revenue: number;
  }>;
  topSources: Array<{ referrer: string; visits: number }>;
  customerActivity: {
    total: number;
    repeatRate: number | null;
    averageOrderValue: number;
    ordersPerCustomer: number | null;
  };
  searchTerms: Array<{ term: string; total: number }>;
};

export async function getAnalyticsOverview(storeId: string, days = 30): Promise<AnalyticsOverview> {
  const since = daysAgo(days);

  const [trafficRows, listingRows, sourceRows, customerStats, searchRows] = await Promise.all([
    query<{ day: string; event_type: string; total: number }>(
      `SELECT substr(created_at, 1, 10) AS day, event_type, COUNT(*) AS total
       FROM analytics_events
       WHERE store_id = ? AND created_at >= ?
         AND event_type IN ('store_view', 'listing_view', 'add_to_cart')
       GROUP BY day, event_type ORDER BY day ASC`,
      [storeId, since],
    ),

    query<{ listingId: string; title: string; slug: string; type: string; views: number; units: number; revenue: number }>(
      `SELECT l.id AS listingId, l.title, l.slug, l.type, l.views_count AS views,
              COALESCE((SELECT SUM(oi.quantity) FROM order_items oi
                         JOIN orders o ON o.id = oi.order_id
                         WHERE oi.listing_id = l.id AND o.payment_status = 'paid'), 0) AS units,
              COALESCE((SELECT SUM(oi.total) FROM order_items oi
                         JOIN orders o ON o.id = oi.order_id
                         WHERE oi.listing_id = l.id AND o.payment_status = 'paid'), 0) AS revenue
       FROM listings l
       WHERE l.store_id = ?
       ORDER BY revenue DESC, views DESC
       LIMIT 10`,
      [storeId],
    ),

    query<{ referrer: string; visits: number }>(
      `SELECT COALESCE(NULLIF(referrer, ''), 'Direct') AS referrer, COUNT(*) AS visits
       FROM analytics_events
       WHERE store_id = ? AND event_type IN ('store_view', 'listing_view') AND created_at >= ?
       GROUP BY referrer ORDER BY visits DESC LIMIT 8`,
      [storeId, since],
    ),

    queryOne<{ total: number; repeat_customers: number; total_spent: number; total_orders: number }>(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(CASE WHEN orders_count > 1 THEN 1 ELSE 0 END), 0) AS repeat_customers,
              COALESCE(SUM(total_spent), 0) AS total_spent,
              COALESCE(SUM(orders_count), 0) AS total_orders
       FROM customers WHERE store_id = ?`,
      [storeId],
    ),

    query<{ term: string; total: number }>(
      `SELECT COALESCE(json_extract(metadata, '$.term'), 'unknown') AS term, COUNT(*) AS total
       FROM analytics_events
       WHERE store_id IS NULL AND event_type = 'search' AND created_at >= ?
       GROUP BY term ORDER BY total DESC LIMIT 8`,
      [since],
    ),
  ]);

  const seriesMap = new Map<string, { day: string; storeViews: number; listingViews: number; addToCart: number }>();
  for (let index = days - 1; index >= 0; index -= 1) {
    const day = new Date(Date.now() - index * 86_400_000).toISOString().slice(0, 10);
    seriesMap.set(day, { day, storeViews: 0, listingViews: 0, addToCart: 0 });
  }
  for (const row of trafficRows) {
    const entry = seriesMap.get(row.day);
    if (!entry) continue;
    if (row.event_type === "store_view") entry.storeViews = Number(row.total);
    if (row.event_type === "listing_view") entry.listingViews = Number(row.total);
    if (row.event_type === "add_to_cart") entry.addToCart = Number(row.total);
  }

  const customerTotal = Number(customerStats?.total ?? 0);
  const repeatCustomers = Number(customerStats?.repeat_customers ?? 0);
  const totalOrders = Number(customerStats?.total_orders ?? 0);

  return {
    trafficSeries: [...seriesMap.values()],
    topListings: listingRows,
    topSources: sourceRows,
    customerActivity: {
      total: customerTotal,
      repeatRate: customerTotal > 0 ? (repeatCustomers / customerTotal) * 100 : null,
      averageOrderValue: totalOrders > 0 ? Math.round(Number(customerStats?.total_spent ?? 0) / totalOrders) : 0,
      ordersPerCustomer: customerTotal > 0 ? totalOrders / customerTotal : null,
    },
    searchTerms: searchRows,
  };
}

// --- Finance ----------------------------------------------------------------

export type FinanceOverview = {
  currency: string;
  grossRevenue: number;
  platformFees: number;
  refunds: number;
  netRevenue: number;
  balance: number;
  payoutsTotal: number;
  payoutsPending: number;
  orderCount: number;
  averageOrderValue: number;
  paidOutCount: number;
  paidOutAmount: number;
  available: number;
};

export async function getFinanceOverview(storeId: string): Promise<FinanceOverview> {
  const store = await queryOne<{ currency: string }>("SELECT currency FROM stores WHERE id = ?", [
    storeId,
  ]);
  const currency = store?.currency ?? "NGN";

  const [ledger, orders, payouts] = await Promise.all([
    queryOne<{
      sale: number;
      fees: number;
      refunds: number;
      payout_total: number;
    }>(
      `SELECT
         COALESCE(SUM(CASE WHEN type = 'sale' AND direction = 'credit' THEN amount ELSE 0 END), 0) AS sale,
         COALESCE(SUM(CASE WHEN type = 'platform_fee' THEN amount ELSE 0 END), 0) AS fees,
         COALESCE(SUM(CASE WHEN type = 'refund' THEN amount ELSE 0 END), 0) AS refunds,
         COALESCE(SUM(CASE WHEN type = 'payout' THEN amount ELSE 0 END), 0) AS payout_total
       FROM transactions WHERE store_id = ?`,
      [storeId],
    ),

    queryOne<{ total: number; count: number }>(
      `SELECT COALESCE(SUM(total), 0) AS total, COUNT(*) AS count
       FROM orders WHERE store_id = ? AND payment_status = 'paid'`,
      [storeId],
    ),

    queryOne<{ paid_count: number; paid_amount: number; pending_amount: number }>(
      `SELECT
         COALESCE(SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END), 0) AS paid_count,
         COALESCE(SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END), 0) AS paid_amount,
         COALESCE(SUM(CASE WHEN status IN ('pending', 'processing') THEN amount ELSE 0 END), 0) AS pending_amount
       FROM payouts WHERE store_id = ?`,
      [storeId],
    ),
  ]);

  const grossRevenue = Number(orders?.total ?? 0);
  const platformFees = Number(ledger?.fees ?? 0);
  const refunds = Number(ledger?.refunds ?? 0);
  const netRevenue = Number(ledger?.sale ?? 0) - refunds;
  const payoutsTotal = Number(ledger?.payout_total ?? 0);
  const balance = netRevenue - payoutsTotal;

  return {
    currency,
    grossRevenue,
    platformFees,
    refunds,
    netRevenue,
    balance,
    payoutsTotal,
    payoutsPending: Number(payouts?.pending_amount ?? 0),
    orderCount: Number(orders?.count ?? 0),
    averageOrderValue: Number(orders?.count ?? 0) > 0 ? Math.round(grossRevenue / Number(orders?.count ?? 1)) : 0,
    paidOutCount: Number(payouts?.paid_count ?? 0),
    paidOutAmount: Number(payouts?.paid_amount ?? 0),
    available: Math.max(0, balance - Number(payouts?.pending_amount ?? 0)),
  };
}

export async function listTransactions(
  storeId: string,
  options: { limit?: number; offset?: number; type?: string } = {},
): Promise<TransactionRow[]> {
  const limit = Math.min(Math.max(options.limit ?? 25, 1), 100);
  const offset = Math.max(options.offset ?? 0, 0);

  if (options.type && options.type !== "all") {
    return query<TransactionRow>(
      `SELECT * FROM transactions WHERE store_id = ? AND type = ?
       ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [storeId, options.type, limit, offset],
    );
  }

  return query<TransactionRow>(
    "SELECT * FROM transactions WHERE store_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?",
    [storeId, limit, offset],
  );
}

export async function countTransactions(storeId: string, type?: string): Promise<number> {
  if (type && type !== "all") {
    const row = await queryOne<{ total: number }>(
      "SELECT COUNT(*) AS total FROM transactions WHERE store_id = ? AND type = ?",
      [storeId, type],
    );
    return Number(row?.total ?? 0);
  }
  const row = await queryOne<{ total: number }>(
    "SELECT COUNT(*) AS total FROM transactions WHERE store_id = ?",
    [storeId],
  );
  return Number(row?.total ?? 0);
}

export async function listPayouts(storeId: string, limit = 25): Promise<PayoutRow[]> {
  return query<PayoutRow>(
    "SELECT * FROM payouts WHERE store_id = ? ORDER BY requested_at DESC LIMIT ?",
    [storeId, limit],
  );
}

/** Every Paystack attempt for this store, successful or not. */
export async function listStorePayments(
  storeId: string,
  options: { limit?: number; status?: string } = {},
): Promise<
  Array<{
    id: string;
    order_id: string;
    order_number: string;
    reference: string;
    amount: number;
    currency: string;
    status: string;
    channel: string | null;
    failure_reason: string | null;
    paid_at: string | null;
    created_at: string;
    email: string;
  }>
> {
  const limit = Math.min(Math.max(options.limit ?? 25, 1), 100);

  if (options.status && options.status !== "all") {
    return query(
      `SELECT p.id, p.order_id, o.order_number, p.reference, p.amount, p.currency, p.status,
              p.channel, p.failure_reason, p.paid_at, p.created_at, o.email
       FROM payments p JOIN orders o ON o.id = p.order_id
       WHERE p.store_id = ? AND p.status = ?
       ORDER BY p.created_at DESC LIMIT ?`,
      [storeId, options.status, limit],
    );
  }

  return query(
    `SELECT p.id, p.order_id, o.order_number, p.reference, p.amount, p.currency, p.status,
            p.channel, p.failure_reason, p.paid_at, p.created_at, o.email
     FROM payments p JOIN orders o ON o.id = p.order_id
     WHERE p.store_id = ?
     ORDER BY p.created_at DESC LIMIT ?`,
    [storeId, limit],
  );
}

/**
 * Request a payout.
 *
 * This records a real request against the store's ledger balance. It does not
 * move money — disbursement is an operator action — so it is created as
 * `pending` and only the balance check happens here.
 */
export async function requestPayout(input: {
  storeId: string;
  amount: number;
  notes?: string | null;
}): Promise<{ ok: true; payoutId: string } | { ok: false; error: string }> {
  const finance = await getFinanceOverview(input.storeId);

  if (input.amount <= 0) return { ok: false, error: "Enter an amount to withdraw." };
  if (finance.available <= 0) {
    return { ok: false, error: "There is no balance available to withdraw yet." };
  }
  if (input.amount > finance.available) {
    return { ok: false, error: "That is more than your available balance." };
  }

  const settings = await queryOne<{
    payout_bank_code: string | null;
    payout_bank_name: string | null;
    payout_account_number: string | null;
    payout_account_name: string | null;
  }>("SELECT * FROM store_settings WHERE store_id = ?", [input.storeId]);

  if (!settings?.payout_account_number || !settings?.payout_bank_name) {
    return {
      ok: false,
      error: "Add your bank account in Settings → Payments before requesting a payout.",
    };
  }

  const id = newId("pay");
  const timestamp = nowIso();

  await execute(
    `INSERT INTO payouts
       (id, store_id, amount, currency, status, method, reference, destination, notes,
        requested_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'pending', 'bank_transfer', NULL, ?, ?, ?, ?, ?)`,
    [
      id,
      input.storeId,
      input.amount,
      finance.currency,
      JSON.stringify({
        bankCode: settings.payout_bank_code,
        bankName: settings.payout_bank_name,
        accountNumber: settings.payout_account_number,
        accountName: settings.payout_account_name,
      }),
      input.notes?.trim() || null,
      timestamp,
      timestamp,
      timestamp,
    ],
  );

  // The seller's own record of what they asked for. Best-effort: the request is
  // already made and recorded when this runs.
  const owner = await storeOwnerContact(input.storeId);
  if (owner) {
    await sendPayoutRequestedEmail({
      sellerEmail: owner.email,
      sellerName: owner.name,
      payoutId: id,
      amountMinor: input.amount,
      currency: finance.currency,
      bankName: settings.payout_bank_name,
      accountNumber: settings.payout_account_number,
    }).catch(() => {});
  }

  return { ok: true, payoutId: id };
}

// --- Admin ------------------------------------------------------------------

export type PlatformStats = {
  users: number;
  stores: number;
  publishedStores: number;
  listings: number;
  activeListings: number;
  events: number;
  orders: number;
  paidOrders: number;
  gmv: number;
  platformFees: number;
  payoutsPending: number;
  newUsers30Days: number;
  newStores30Days: number;
};

export async function getPlatformStats(): Promise<PlatformStats> {
  const since = daysAgo(30);

  const [counts, money, payouts, growth] = await Promise.all([
    queryOne<{
      users: number;
      stores: number;
      published: number;
      listings: number;
      active_listings: number;
      events: number;
      orders: number;
      paid_orders: number;
    }>(
      `SELECT
         (SELECT COUNT(*) FROM users) AS users,
         (SELECT COUNT(*) FROM stores) AS stores,
         (SELECT COUNT(*) FROM stores WHERE is_published = 1) AS published,
         (SELECT COUNT(*) FROM listings) AS listings,
         (SELECT COUNT(*) FROM listings WHERE status = 'active') AS active_listings,
         (SELECT COUNT(*) FROM events) AS events,
         (SELECT COUNT(*) FROM orders) AS orders,
         (SELECT COUNT(*) FROM orders WHERE payment_status = 'paid') AS paid_orders`,
    ),

    queryOne<{ gmv: number; fees: number }>(
      `SELECT
         (SELECT COALESCE(SUM(total), 0) FROM orders WHERE payment_status = 'paid') AS gmv,
         (SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE type = 'platform_fee') AS fees`,
    ),

    queryOne<{ pending: number }>(
      "SELECT COUNT(*) AS pending FROM payouts WHERE status IN ('pending', 'processing')",
    ),

    queryOne<{ new_users: number; new_stores: number }>(
      `SELECT
         (SELECT COUNT(*) FROM users WHERE created_at >= ?) AS new_users,
         (SELECT COUNT(*) FROM stores WHERE created_at >= ?) AS new_stores`,
      [since, since],
    ),
  ]);

  return {
    users: Number(counts?.users ?? 0),
    stores: Number(counts?.stores ?? 0),
    publishedStores: Number(counts?.published ?? 0),
    listings: Number(counts?.listings ?? 0),
    activeListings: Number(counts?.active_listings ?? 0),
    events: Number(counts?.events ?? 0),
    orders: Number(counts?.orders ?? 0),
    paidOrders: Number(counts?.paid_orders ?? 0),
    gmv: Number(money?.gmv ?? 0),
    platformFees: Number(money?.fees ?? 0),
    payoutsPending: Number(payouts?.pending ?? 0),
    newUsers30Days: Number(growth?.new_users ?? 0),
    newStores30Days: Number(growth?.new_stores ?? 0),
  };
}
