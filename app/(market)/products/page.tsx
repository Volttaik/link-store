import { BrowseSection, type RawSearchParams } from "@/components/marketplace/BrowseSection";

export const metadata = {
  title: "Marketplace",
  description: "Every published listing on Rush Cart: physical goods, fashion, electronics and more.",
};

export const dynamic = "force-dynamic";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  return (
    <BrowseSection
      slug="products"
      label="Marketplace"
      description="Everything published across Rush Cart storefronts."
      searchParams={await searchParams}
    />
  );
}
