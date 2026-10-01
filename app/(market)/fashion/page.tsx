import { BrowseSection, type RawSearchParams } from "@/components/marketplace/BrowseSection";

export const metadata = { title: "Fashion" };

export const dynamic = "force-dynamic";

export default async function FashionPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  return (
    <BrowseSection
      slug="fashion"
      description="Clothing, shoes and accessories from Rush Cart sellers."
      searchParams={await searchParams}
    />
  );
}
