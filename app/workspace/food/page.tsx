import { ModulePage } from "@/components/workspace/ModulePage";

export const metadata = { title: "Food" };

export const dynamic = "force-dynamic";

export default async function FoodPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <ModulePage moduleKey="food" searchParams={await searchParams} />;
}
