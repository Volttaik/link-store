import { BrowseSection, type RawSearchParams } from "@/components/marketplace/BrowseSection";

export const metadata = { title: "Electronics" };

export const dynamic = "force-dynamic";

export default async function ElectronicsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  return (
    <BrowseSection
      slug="electronics"
      description="Phones, computers, gadgets and accessories listed on Link Store."
      searchParams={await searchParams}
    />
  );
}
