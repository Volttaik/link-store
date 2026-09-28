"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth";
import { moveTicketToTrash, restoreTicket } from "@/lib/server/tickets";
import { fail, ok, type ActionResult } from "@/lib/types";

/**
 * The holder's own ticket trash.
 *
 * Every action re-derives the viewer from the session and then re-reads the
 * ticket from the database through the ownership clause in `lib/server/tickets`.
 * Nothing about the ticket — its owner, its event, its order, its state — is
 * accepted from the caller, so a guessed ticket id reaches nothing.
 */
async function scopeFromSession(): Promise<{ userId: string; email: string | null } | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  return { userId: user.id, email: user.email ?? null };
}

/** Move one of the viewer's own spent tickets to their trash. */
export async function trashTicketAction(ticketId: string): Promise<ActionResult<undefined>> {
  const scope = await scopeFromSession();
  if (!scope) return fail("Sign in to manage your tickets.");

  const result = await moveTicketToTrash(ticketId, scope);
  if (!result.ok) return fail(result.error);

  revalidatePath("/tickets");
  revalidatePath("/orders");
  return ok(undefined);
}

/** Bring one of the viewer's own tickets back out of the trash. */
export async function restoreTicketAction(ticketId: string): Promise<ActionResult<undefined>> {
  const scope = await scopeFromSession();
  if (!scope) return fail("Sign in to manage your tickets.");

  const result = await restoreTicket(ticketId, scope);
  if (!result.ok) return fail(result.error);

  revalidatePath("/tickets");
  revalidatePath("/orders");
  return ok(undefined);
}
