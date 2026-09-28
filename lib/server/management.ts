/**
 * Management data access: customers, discounts and reviews.
 * Every function is scoped to the owning store.
 */

import "server-only";

import { execute, query, queryOne } from "../db";
import { nowIso } from "../format";
import { newId } from "../ids";
import type { CustomerRow, DiscountRow, OrderRow, ReviewRow } from "../types";

// --- Customers --------------------------------------------------------------

export type CustomerQuery = { storeId: string; search?: string; limit?: number; offset?: number };

export async function listCustomers(
  input: CustomerQuery,
): Promise<CustomerRow[]> {
  const limit = Math.min(Math.max(input.limit ?? 25, 1), 100);
  const offset = Math.max(input.offset ?? 0, 0);

  if (input.search) {
    const term = `%${input.search.trim().toLowerCase()}%`;
    return query<CustomerRow>(
      `SELECT * FROM customers
       WHERE store_id = ? AND (LOWER(email) LIKE ? OR LOWER(COALESCE(name, '')) LIKE ?)
       ORDER BY last_order_at DESC NULLS LAST, created_at DESC
       LIMIT ? OFFSET ?`,
      [input.storeId, term, term, limit, offset],
    );
  }

  return query<CustomerRow>(
    `SELECT * FROM customers WHERE store_id = ?
     ORDER BY last_order_at DESC NULLS LAST, created_at DESC
     LIMIT ? OFFSET ?`,
    [input.storeId, limit, offset],
  );
}

export async function countCustomers(storeId: string, search?: string): Promise<number> {
  if (search) {
    const term = `%${search.trim().toLowerCase()}%`;
    const row = await queryOne<{ total: number }>(
      `SELECT COUNT(*) AS total FROM customers
       WHERE store_id = ? AND (LOWER(email) LIKE ? OR LOWER(COALESCE(name, '')) LIKE ?)`,
      [storeId, term, term],
    );
    return Number(row?.total ?? 0);
  }

  const row = await queryOne<{ total: number }>(
    "SELECT COUNT(*) AS total FROM customers WHERE store_id = ?",
    [storeId],
  );
  return Number(row?.total ?? 0);
}

export async function getCustomer(
  customerId: string,
  storeId: string,
): Promise<CustomerRow | null> {
  return queryOne<CustomerRow>("SELECT * FROM customers WHERE id = ? AND store_id = ?", [
    customerId,
    storeId,
  ]);
}

export async function listCustomerOrders(
  customerId: string,
  storeId: string,
  limit = 20,
): Promise<OrderRow[]> {
  return query<OrderRow>(
    "SELECT * FROM orders WHERE customer_id = ? AND store_id = ? ORDER BY created_at DESC LIMIT ?",
    [customerId, storeId, limit],
  );
}

// --- Discounts --------------------------------------------------------------

export async function listDiscounts(storeId: string): Promise<DiscountRow[]> {
  return query<DiscountRow>(
    "SELECT * FROM discounts WHERE store_id = ? ORDER BY created_at DESC",
    [storeId],
  );
}

export async function getDiscount(discountId: string, storeId: string): Promise<DiscountRow | null> {
  return queryOne<DiscountRow>("SELECT * FROM discounts WHERE id = ? AND store_id = ?", [
    discountId,
    storeId,
  ]);
}

export type DiscountInput = {
  name: string;
  code: string | null;
  type: "percentage" | "fixed";
  value: number;
  minSubtotal: number;
  usageLimit: number | null;
  scope: "order" | "listing";
  listingId: string | null;
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
};

function validateDiscount(input: DiscountInput): string | null {
  if (input.name.trim().length < 2) return "Give this discount a name.";
  if (input.type === "percentage" && (input.value <= 0 || input.value > 100)) {
    return "A percentage discount must be between 1 and 100.";
  }
  if (input.type === "fixed" && input.value <= 0) {
    return "Enter an amount for a fixed discount.";
  }
  if (input.startsAt && input.endsAt && input.startsAt > input.endsAt) {
    return "The end date must be after the start date.";
  }
  return null;
}

export async function createDiscount(
  storeId: string,
  input: DiscountInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const invalid = validateDiscount(input);
  if (invalid) return { ok: false, error: invalid };

  const code = input.code?.trim().toUpperCase() || null;
  if (code) {
    const clash = await queryOne<{ id: string }>(
      "SELECT id FROM discounts WHERE store_id = ? AND UPPER(code) = ?",
      [storeId, code],
    );
    if (clash) return { ok: false, error: "You already have a discount with that code." };
  }

  const id = newId("dsc");
  const timestamp = nowIso();

  await execute(
    `INSERT INTO discounts
       (id, store_id, code, name, type, value, min_subtotal, usage_limit, used_count, scope,
        listing_id, starts_at, ends_at, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      storeId,
      code,
      input.name.trim(),
      input.type,
      Math.round(input.value),
      Math.round(input.minSubtotal),
      input.usageLimit,
      input.scope,
      input.scope === "listing" ? input.listingId : null,
      input.startsAt,
      input.endsAt,
      input.isActive ? 1 : 0,
      timestamp,
      timestamp,
    ],
  );

  return { ok: true, id };
}

export async function updateDiscount(
  discountId: string,
  storeId: string,
  input: DiscountInput,
): Promise<{ ok: boolean; error?: string }> {
  const existing = await getDiscount(discountId, storeId);
  if (!existing) return { ok: false, error: "Discount not found." };

  const invalid = validateDiscount(input);
  if (invalid) return { ok: false, error: invalid };

  const code = input.code?.trim().toUpperCase() || null;
  if (code) {
    const clash = await queryOne<{ id: string }>(
      "SELECT id FROM discounts WHERE store_id = ? AND UPPER(code) = ? AND id != ?",
      [storeId, code, discountId],
    );
    if (clash) return { ok: false, error: "You already have a discount with that code." };
  }

  await execute(
    `UPDATE discounts SET
       code = ?, name = ?, type = ?, value = ?, min_subtotal = ?, usage_limit = ?,
       scope = ?, listing_id = ?, starts_at = ?, ends_at = ?, is_active = ?, updated_at = ?
     WHERE id = ? AND store_id = ?`,
    [
      code,
      input.name.trim(),
      input.type,
      Math.round(input.value),
      Math.round(input.minSubtotal),
      input.usageLimit,
      input.scope,
      input.scope === "listing" ? input.listingId : null,
      input.startsAt,
      input.endsAt,
      input.isActive ? 1 : 0,
      nowIso(),
      discountId,
      storeId,
    ],
  );

  return { ok: true };
}

export async function setDiscountActive(
  discountId: string,
  storeId: string,
  active: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const existing = await getDiscount(discountId, storeId);
  if (!existing) return { ok: false, error: "Discount not found." };

  await execute("UPDATE discounts SET is_active = ?, updated_at = ? WHERE id = ? AND store_id = ?", [
    active ? 1 : 0,
    nowIso(),
    discountId,
    storeId,
  ]);
  return { ok: true };
}

export async function deleteDiscount(
  discountId: string,
  storeId: string,
): Promise<{ ok: boolean; error?: string }> {
  const existing = await getDiscount(discountId, storeId);
  if (!existing) return { ok: false, error: "Discount not found." };

  await execute("DELETE FROM discounts WHERE id = ? AND store_id = ?", [discountId, storeId]);
  return { ok: true };
}

// --- Reviews ----------------------------------------------------------------

export async function listReviews(
  storeId: string,
  options: { status?: string; limit?: number; offset?: number } = {},
): Promise<Array<ReviewRow & { listing_title: string | null; listing_slug: string | null }>> {
  const limit = Math.min(Math.max(options.limit ?? 25, 1), 100);
  const offset = Math.max(options.offset ?? 0, 0);

  if (options.status && options.status !== "all") {
    return query(
      `SELECT r.*, l.title AS listing_title, l.slug AS listing_slug
       FROM reviews r LEFT JOIN listings l ON l.id = r.listing_id
       WHERE r.store_id = ? AND r.status = ?
       ORDER BY r.created_at DESC LIMIT ? OFFSET ?`,
      [storeId, options.status, limit, offset],
    );
  }

  return query(
    `SELECT r.*, l.title AS listing_title, l.slug AS listing_slug
     FROM reviews r LEFT JOIN listings l ON l.id = r.listing_id
     WHERE r.store_id = ? ORDER BY r.created_at DESC LIMIT ? OFFSET ?`,
    [storeId, limit, offset],
  );
}

export async function countReviews(storeId: string, status?: string): Promise<number> {
  if (status && status !== "all") {
    const row = await queryOne<{ total: number }>(
      "SELECT COUNT(*) AS total FROM reviews WHERE store_id = ? AND status = ?",
      [storeId, status],
    );
    return Number(row?.total ?? 0);
  }
  const row = await queryOne<{ total: number }>(
    "SELECT COUNT(*) AS total FROM reviews WHERE store_id = ?",
    [storeId],
  );
  return Number(row?.total ?? 0);
}

export async function listListingReviews(listingId: string, limit = 20): Promise<ReviewRow[]> {
  return query<ReviewRow>(
    "SELECT * FROM reviews WHERE listing_id = ? AND status = 'published' ORDER BY created_at DESC LIMIT ?",
    [listingId, limit],
  );
}

export async function getStoreRating(
  storeId: string,
): Promise<{ average: number | null; count: number }> {
  const row = await queryOne<{ average: number | null; count: number }>(
    `SELECT AVG(rating) AS average, COUNT(*) AS count FROM reviews
     WHERE store_id = ? AND status = 'published'`,
    [storeId],
  );

  return {
    average: row?.average === null || row?.average === undefined ? null : Number(row.average),
    count: Number(row?.count ?? 0),
  };
}

export async function getListingRating(
  listingId: string,
): Promise<{ average: number | null; count: number }> {
  const row = await queryOne<{ average: number | null; count: number }>(
    `SELECT AVG(rating) AS average, COUNT(*) AS count FROM reviews
     WHERE listing_id = ? AND status = 'published'`,
    [listingId],
  );

  return {
    average: row?.average === null || row?.average === undefined ? null : Number(row.average),
    count: Number(row?.count ?? 0),
  };
}

export async function setReviewStatus(
  reviewId: string,
  storeId: string,
  status: "published" | "hidden",
): Promise<{ ok: boolean; error?: string }> {
  const review = await queryOne<ReviewRow>(
    "SELECT * FROM reviews WHERE id = ? AND store_id = ?",
    [reviewId, storeId],
  );
  if (!review) return { ok: false, error: "Review not found." };

  await execute("UPDATE reviews SET status = ? WHERE id = ? AND store_id = ?", [
    status,
    reviewId,
    storeId,
  ]);
  return { ok: true };
}

export async function deleteReview(
  reviewId: string,
  storeId: string,
): Promise<{ ok: boolean; error?: string }> {
  const review = await queryOne<ReviewRow>(
    "SELECT * FROM reviews WHERE id = ? AND store_id = ?",
    [reviewId, storeId],
  );
  if (!review) return { ok: false, error: "Review not found." };

  await execute("DELETE FROM reviews WHERE id = ? AND store_id = ?", [reviewId, storeId]);
  return { ok: true };
}

/**
 * Submit a review. Only a customer with a paid order for that store may review,
 * which keeps ratings meaningful.
 */
export async function createReview(input: {
  storeId: string;
  listingId: string | null;
  email: string;
  name?: string | null;
  rating: number;
  title?: string | null;
  body?: string | null;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const email = input.email.trim().toLowerCase();
  if (!email) return { ok: false, error: "Sign in or provide the email you ordered with." };

  const rating = Math.round(input.rating);
  if (rating < 1 || rating > 5) return { ok: false, error: "Choose a rating from 1 to 5." };

  const purchased = await queryOne<{ id: string }>(
    `SELECT id FROM orders WHERE store_id = ? AND email = ? AND payment_status = 'paid' LIMIT 1`,
    [input.storeId, email],
  );
  if (!purchased) {
    return { ok: false, error: "Only customers with a paid order can review this store." };
  }

  // One review per customer per product keeps ratings honest.
  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM reviews
     WHERE store_id = ? AND customer_email = ? AND (listing_id IS ? OR listing_id = ?)`,
    [input.storeId, email, input.listingId, input.listingId ?? ""],
  );
  if (existing) {
    return { ok: false, error: "You have already reviewed this." };
  }

  const id = newId("rev");
  await execute(
    `INSERT INTO reviews
       (id, store_id, listing_id, order_id, customer_name, customer_email, rating, title, body, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', ?)`,
    [
      id,
      input.storeId,
      input.listingId,
      purchased.id,
      input.name?.trim() || null,
      email,
      rating,
      input.title?.trim() || null,
      input.body?.trim() || null,
      nowIso(),
    ],
  );

  return { ok: true, id };
}
