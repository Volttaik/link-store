import { BrowseSection, type RawSearchParams } from "@/components/marketplace/BrowseSection";

export const metadata = {
  title: "All products",
  description: "Every published listing on Link Store: physical goods, fashion, electronics and more.",
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
      label="All products"
      description="Everything published across Link Store storefronts."
      searchParams={await searchParams}
    />
  );
}
