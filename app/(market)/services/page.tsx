import { BrowseSection, type RawSearchParams } from "@/components/marketplace/BrowseSection";

export const metadata = { title: "Services" };

export const dynamic = "force-dynamic";

export default async function ServicesPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  return (
    <BrowseSection
      slug="services"
      description="Design, photography, consulting, repairs, beauty and more."
      searchParams={await searchParams}
    />
  );
}
