import { BrowseSection, type RawSearchParams } from "@/components/marketplace/BrowseSection";

export const metadata = { title: "Digital products" };

export const dynamic = "force-dynamic";

export default async function DigitalPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  return (
    <BrowseSection
      slug="digital"
      description="Templates, e-books, courses and files, delivered instantly after payment."
      searchParams={await searchParams}
    />
  );
}
