"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { ORDER_ACCESS_COOKIE, getOrderByAccessToken } from "@/lib/server/commerce";
import { queryOne } from "@/lib/db";
import type { OrderRow } from "@/lib/types";

export type LookupState = { error?: string } | null;

/**
 * Guest order lookup.
 *
 * Requires the email the order was placed with *and* the order number. That
 * pair acts as the shared secret for a guest, who has no account to sign into.
 */
export async function lookupOrderAction(
  _previous: LookupState,
  formData: FormData,
): Promise<LookupState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const number = String(formData.get("orderNumber") ?? "").trim().toUpperCase();

  if (!email || !number) {
    return { error: "Enter both the email you ordered with and the order number." };
  }

  const order = await queryOne<Pick<OrderRow, "id" | "access_token">>(
    "SELECT id, access_token FROM orders WHERE email = ? AND UPPER(order_number) = ?",
    [email, number],
  );

  if (!order) {
    return {
      error:
        "No order matches that email and order number. Check both and try again. The number looks like LS-26-ABC123.",
    };
  }

  // Remember the grant so the customer can return to their orders later.
  const cookieStore = await cookies();
  cookieStore.set(ORDER_ACCESS_COOKIE, order.access_token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
  });

  redirect(`/orders/${order.access_token}`);
}

/** Orders belonging to the current browser session (or signed-in user). */
export async function currentOrderTokens(): Promise<string[]> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ORDER_ACCESS_COOKIE)?.value;
  if (!token) return [];

  const order = await getOrderByAccessToken(token);
  return order ? [order.access_token] : [];
}
