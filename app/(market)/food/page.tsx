import { BrowseSection, type RawSearchParams } from "@/components/marketplace/BrowseSection";

export const metadata = { title: "Food" };

export const dynamic = "force-dynamic";

export default async function FoodPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  return (
    <BrowseSection
      slug="food"
      description="Meals, drinks and groceries from kitchens and restaurants on Link Store."
      searchParams={await searchParams}
    />
  );
}
