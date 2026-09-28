import { ModulePage } from "@/components/workspace/ModulePage";

export const metadata = { title: "Rentals" };

export const dynamic = "force-dynamic";

export default async function RentalsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <ModulePage moduleKey="rentals" searchParams={await searchParams} />;
}
