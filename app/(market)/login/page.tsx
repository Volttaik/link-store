/**
 * The old sign-in address.
 *
 * Kept as a redirect so links people already have — and the `next` they carry —
 * still work. Everything now lives at `/sign-in`.
 */

import { redirect } from "next/navigation";

export default async function LoginRedirect({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; email?: string }>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  if (params.next) query.set("next", params.next);
  if (params.email) query.set("email", params.email);

  const suffix = query.toString();
  redirect(suffix ? `/sign-in?${suffix}` : "/sign-in");
}
