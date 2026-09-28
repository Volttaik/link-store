import { BrowseSection, type RawSearchParams } from "@/components/marketplace/BrowseSection";

export const metadata = {
  title: "Rentals",
  description:
    "Property, vehicles and equipment let by the day, week or month. Arranged with the owner before anything is paid.",
};

export const dynamic = "force-dynamic";

export default async function RentalsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  return (
    <BrowseSection
      slug="rentals"
      label="Rentals"
      description="Things let out rather than sold. Rentals are agreed in the thread first, and can be paid for once both sides are happy."
      searchParams={await searchParams}
    />
  );
}
