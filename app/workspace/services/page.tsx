import { ModulePage } from "@/components/workspace/ModulePage";

export const metadata = { title: "Services" };

export const dynamic = "force-dynamic";

export default async function ServicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <ModulePage moduleKey="services" searchParams={await searchParams} />;
}
