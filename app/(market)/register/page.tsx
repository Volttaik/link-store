/**
 * The old registration address.
 *
 * Kept as a redirect so existing links keep working. Everything now lives at
 * `/sign-up`.
 */

import { redirect } from "next/navigation";

export default async function RegisterRedirect({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; email?: string }>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  if (params.next) query.set("next", params.next);
  if (params.email) query.set("email", params.email);

  const suffix = query.toString();
  redirect(suffix ? `/sign-up?${suffix}` : "/sign-up");
}
