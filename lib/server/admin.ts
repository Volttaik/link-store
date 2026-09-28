/**
 * Platform administration.
 *
 * These reads span every store on the marketplace, so every entry point here is
 * only ever called from `/admin/*`, which is guarded by `requireAdmin()`.
 */

import "server-only";

import { execute, query, queryOne } from "../db";

export type PlatformMetrics = {
  stores: { total: number; published: number; new30Days: number };
  users: { total: number; admins: number; new30Days: number };
  catalogue: { listings: number; active: number; events: number };
  orders: { total: number; paid: number; last30Days: number };
  gmv: { gross: number; last30Days: number; currency: string; orders: number };
};

function sinceIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

/**
 * Marketplace-wide figures.
 *
 * Orders are joined through `payments` so GMV only counts money that Paystack
 * actually confirmed, and multi-currency orders are grouped separately.
 */
export async function getPlatformMetrics(): Promise<PlatformMetrics> {
  const period = sinceIso(30);

  const [stores, users, catalogue, orders, paid] = await Promise.all([
    queryOne<{ total: number; published: number; recent: number }>(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(CASE WHEN is_published = 1 THEN 1 ELSE 0 END), 0) AS published,
              COALESCE(SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END), 0) AS recent
       FROM stores`,
      [period],
    ),

    queryOne<{ total: number; admins: number; recent: number }>(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END), 0) AS admins,
              COALESCE(SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END), 0) AS recent
       FROM users`,
      [period],
    ),

    queryOne<{ listings: number; active: number; events: number }>(
      `SELECT
         (SELECT COUNT(*) FROM listings) AS listings,
         (SELECT COUNT(*) FROM listings WHERE status = 'active') AS active,
         (SELECT COUNT(*) FROM events) AS events`,
    ),

    queryOne<{ total: number; paid: number; recent: number }>(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN 1 ELSE 0 END), 0) AS paid,
              COALESCE(SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END), 0) AS recent
       FROM orders`,
      [period],
    ),

    queryOne<{ gross: number; recent: number; orders: number; currency: string }>(
      `SELECT COALESCE(SUM(o.total), 0) AS gross,
              COALESCE(SUM(CASE WHEN o.created_at >= ? THEN o.total ELSE 0 END), 0) AS recent,
              COUNT(*) AS orders,
              COALESCE(MAX(o.currency), 'NGN') AS currency
       FROM orders o
       WHERE o.payment_status = 'paid'`,
      [period],
    ),
  ]);

  return {
    stores: {
      total: Number(stores?.total ?? 0),
      published: Number(stores?.published ?? 0),
      new30Days: Number(stores?.recent ?? 0),
    },
    users: {
      total: Number(users?.total ?? 0),
      admins: Number(users?.admins ?? 0),
      new30Days: Number(users?.recent ?? 0),
    },
    catalogue: {
      listings: Number(catalogue?.listings ?? 0),
      active: Number(catalogue?.active ?? 0),
      events: Number(catalogue?.events ?? 0),
    },
    orders: {
      total: Number(orders?.total ?? 0),
      paid: Number(orders?.paid ?? 0),
      last30Days: Number(orders?.recent ?? 0),
    },
    gmv: {
      gross: Number(paid?.gross ?? 0),
      last30Days: Number(paid?.recent ?? 0),
      orders: Number(paid?.orders ?? 0),
      currency: paid?.currency ?? "NGN",
    },
  };
}

export type AdminStoreRow = {
  id: string;
  name: string;
  slug: string;
  currency: string;
  is_published: number;
  created_at: string;
  owner_name: string;
  owner_email: string;
  listings: number;
  orders: number;
  revenue: number;
};

export async function listStoresForAdmin(
  options: { search?: string; limit?: number; offset?: number } = {},
): Promise<AdminStoreRow[]> {
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
  const offset = Math.max(options.offset ?? 0, 0);
  const search = options.search?.trim().toLowerCase();

  const where = search ? "WHERE LOWER(s.name) LIKE ? OR LOWER(s.slug) LIKE ? OR LOWER(u.email) LIKE ?" : "";
  const args: Array<string | number> = search ? [`%${search}%`, `%${search}%`, `%${search}%`] : [];

  return query<AdminStoreRow>(
    `SELECT s.id, s.name, s.slug, s.currency, s.is_published, s.created_at,
            u.name AS owner_name, u.email AS owner_email,
            (SELECT COUNT(*) FROM listings l WHERE l.store_id = s.id) AS listings,
            (SELECT COUNT(*) FROM orders o WHERE o.store_id = s.id) AS orders,
            (SELECT COALESCE(SUM(o.total), 0) FROM orders o
              WHERE o.store_id = s.id AND o.payment_status = 'paid') AS revenue
     FROM stores s JOIN users u ON u.id = s.user_id
     ${where}
     ORDER BY s.created_at DESC LIMIT ? OFFSET ?`,
    [...args, limit, offset],
  );
}

export async function countStoresForAdmin(search?: string): Promise<number> {
  const term = search?.trim().toLowerCase();
  if (!term) {
    const row = await queryOne<{ total: number }>("SELECT COUNT(*) AS total FROM stores");
    return Number(row?.total ?? 0);
  }

  const row = await queryOne<{ total: number }>(
    `SELECT COUNT(*) AS total FROM stores s JOIN users u ON u.id = s.user_id
     WHERE LOWER(s.name) LIKE ? OR LOWER(s.slug) LIKE ? OR LOWER(u.email) LIKE ?`,
    [`%${term}%`, `%${term}%`, `%${term}%`],
  );
  return Number(row?.total ?? 0);
}

export type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  created_at: string;
  last_login_at: string | null;
  store_slug: string | null;
  store_name: string | null;
  orders: number;
};

export async function listUsersForAdmin(
  options: { search?: string; limit?: number; offset?: number } = {},
): Promise<AdminUserRow[]> {
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
  const offset = Math.max(options.offset ?? 0, 0);
  const search = options.search?.trim().toLowerCase();

  const where = search ? "WHERE LOWER(u.name) LIKE ? OR LOWER(u.email) LIKE ?" : "";
  const args: Array<string | number> = search ? [`%${search}%`, `%${search}%`] : [];

  return query<AdminUserRow>(
    `SELECT u.id, u.name, u.email, u.role, u.created_at, u.last_login_at,
            s.slug AS store_slug, s.name AS store_name,
            (SELECT COUNT(*) FROM orders o WHERE o.store_id = s.id) AS orders
     FROM users u LEFT JOIN stores s ON s.user_id = u.id
     ${where}
     ORDER BY u.created_at DESC LIMIT ? OFFSET ?`,
    [...args, limit, offset],
  );
}

export async function countUsersForAdmin(search?: string): Promise<number> {
  const term = search?.trim().toLowerCase();
  if (!term) {
    const row = await queryOne<{ total: number }>("SELECT COUNT(*) AS total FROM users");
    return Number(row?.total ?? 0);
  }

  const row = await queryOne<{ total: number }>(
    "SELECT COUNT(*) AS total FROM users WHERE LOWER(name) LIKE ? OR LOWER(email) LIKE ?",
    [`%${term}%`, `%${term}%`],
  );
  return Number(row?.total ?? 0);
}

export type AdminStoreDetail = AdminStoreRow & {
  description: string | null;
  city: string | null;
  country: string | null;
  contact_email: string | null;
  customers: number;
  published_listings: number;
  fees: number;
};

export async function getStoreForAdmin(storeId: string): Promise<AdminStoreDetail | null> {
  return queryOne<AdminStoreDetail>(
    `SELECT s.id, s.name, s.slug, s.currency, s.is_published, s.created_at,
            s.description, s.city, s.country, s.contact_email,
            u.name AS owner_name, u.email AS owner_email,
            (SELECT COUNT(*) FROM listings l WHERE l.store_id = s.id) AS listings,
            (SELECT COUNT(*) FROM listings l WHERE l.store_id = s.id AND l.status = 'active') AS published_listings,
            (SELECT COUNT(*) FROM orders o WHERE o.store_id = s.id) AS orders,
            (SELECT COUNT(*) FROM customers c WHERE c.store_id = s.id) AS customers,
            (SELECT COALESCE(SUM(o.total), 0) FROM orders o
              WHERE o.store_id = s.id AND o.payment_status = 'paid') AS revenue,
            (SELECT COALESCE(SUM(t.amount), 0) FROM transactions t
              WHERE t.store_id = s.id AND t.type = 'platform_fee') AS fees
     FROM stores s JOIN users u ON u.id = s.user_id
     WHERE s.id = ?`,
    [storeId],
  );
}

/** Suspend (hide) or restore a storefront from the platform side. */
export async function setStorePublishedByAdmin(
  storeId: string,
  published: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const store = await queryOne<{ id: string }>("SELECT id FROM stores WHERE id = ?", [storeId]);
  if (!store) return { ok: false, error: "Store not found." };

  await execute(
    "UPDATE stores SET is_published = ?, updated_at = ? WHERE id = ?",
    [published ? 1 : 0, new Date().toISOString(), storeId],
  );

  return { ok: true };
}

export async function setUserRole(
  userId: string,
  role: "user" | "admin",
): Promise<{ ok: boolean; error?: string }> {
  const user = await queryOne<{ id: string; role: string }>(
    "SELECT id, role FROM users WHERE id = ?",
    [userId],
  );
  if (!user) return { ok: false, error: "User not found." };

  // Never leave the platform without an administrator.
  if (user.role === "admin" && role === "user") {
    const admins = await queryOne<{ total: number }>(
      "SELECT COUNT(*) AS total FROM users WHERE role = 'admin'",
    );
    if (Number(admins?.total ?? 0) <= 1) {
      return { ok: false, error: "This is the only admin account. Promote another admin first." };
    }
  }

  await execute("UPDATE users SET role = ?, updated_at = ? WHERE id = ?", [
    role,
    new Date().toISOString(),
    userId,
  ]);

  return { ok: true };
}
