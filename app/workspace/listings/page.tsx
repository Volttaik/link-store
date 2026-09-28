import { ModulePage } from "@/components/workspace/ModulePage";

export const metadata = { title: "Listing" };

export const dynamic = "force-dynamic";

/**
 * Listing — the products that are live and ready to be sold.
 *
 * Not a universal shelf, and not a filter over one: Services, Events, Food,
 * Rentals and Digital are their own modules now, and unpublished work is in
 * Drafts. This page reads the `listing` module's declaration, which is what
 * makes `status = active` the *only* state it can query.
 */
export default async function ListingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <ModulePage moduleKey="listing" searchParams={await searchParams} />;
}
