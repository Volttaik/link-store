import { BrowseSection, type RawSearchParams } from "@/components/marketplace/BrowseSection";

export const metadata = { title: "Furniture" };

export const dynamic = "force-dynamic";

export default async function FurniturePage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  return (
    <BrowseSection
      slug="furniture"
      description="Home and office furniture, decor and fittings."
      searchParams={await searchParams}
    />
  );
}
