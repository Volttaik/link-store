"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth";
import { setStorePublishedByAdmin, setUserRole } from "@/lib/server/admin";
import { fail, ok, type ActionResult } from "@/lib/types";

/**
 * Suspend or restore a storefront.
 *
 * Platform-level moderation, so the guard is the `admin` role on the server
 * rather than anything the caller supplies.
 */
export async function setStorePublishedAdminAction(
  storeId: string,
  published: boolean,
): Promise<ActionResult<undefined>> {
  const user = await getCurrentUser();
  if (!user) return fail("Your session expired.");
  if (user.role !== "admin") return fail("Only platform admins can do that.");

  const result = await setStorePublishedByAdmin(storeId, published);
  if (!result.ok) return fail(result.error ?? "Could not update that store.");

  revalidatePath("/admin/stores");
  revalidatePath("/admin");
  revalidatePath("/", "layout");
  return ok(undefined);
}

export async function setUserRoleAction(
  userId: string,
  role: "user" | "admin",
): Promise<ActionResult<undefined>> {
  const user = await getCurrentUser();
  if (!user) return fail("Your session expired.");
  if (user.role !== "admin") return fail("Only platform admins can do that.");

  const result = await setUserRole(userId, role);
  if (!result.ok) return fail(result.error ?? "Could not update that account.");

  revalidatePath("/admin/users");
  return ok(undefined);
}
