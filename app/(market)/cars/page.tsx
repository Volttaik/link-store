import { BrowseSection, type RawSearchParams } from "@/components/marketplace/BrowseSection";

export const metadata = { title: "Cars & vehicles" };

export const dynamic = "force-dynamic";

export default async function CarsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  return (
    <BrowseSection
      slug="cars"
      description="Vehicles, bikes and parts listed by Link Store sellers."
      searchParams={await searchParams}
    />
  );
}
