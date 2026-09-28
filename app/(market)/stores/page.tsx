import { StoreBrowseGrid } from "@/components/marketplace/StoreBrowseGrid";
import type { RawSearchParams } from "@/components/marketplace/BrowseSection";

export const metadata = {
  title: "Stores",
  description: "Browse storefronts on Link Store, every seller's own link.",
};

export const dynamic = "force-dynamic";

export default async function StoresPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  return <StoreBrowseGrid searchParams={await searchParams} />;
}
