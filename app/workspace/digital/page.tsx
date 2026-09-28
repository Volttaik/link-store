import { ModulePage } from "@/components/workspace/ModulePage";

export const metadata = { title: "Digital" };

export const dynamic = "force-dynamic";

export default async function DigitalPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <ModulePage moduleKey="digital" searchParams={await searchParams} />;
}
