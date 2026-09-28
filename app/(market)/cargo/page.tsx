import { BrowseSection, type RawSearchParams } from "@/components/marketplace/BrowseSection";

export const metadata = { title: "Cargo" };

export const dynamic = "force-dynamic";

/**
 * Cargo — buying in bulk.
 *
 * A directory of its own because bulk buying is its own errand: the person here
 * is looking for cartons, sacks and pallets, priced by the package, not for a
 * single unit. Same engine, same cards, same checkout — a different question.
 */
export default async function CargoPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  return (
    <BrowseSection
      slug="cargo"
      description="Bulk and wholesale from Link Store sellers: cartons, sacks, crates and pallets, priced by the package."
      searchParams={await searchParams}
    />
  );
}
