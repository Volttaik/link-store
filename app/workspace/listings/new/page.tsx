import { ModuleNewPage } from "@/components/workspace/ModuleNewPage";

export const metadata = { title: "New product" };

export const dynamic = "force-dynamic";

export default async function NewListingPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  return <ModuleNewPage moduleKey="listing" categoryId={(await searchParams).category} />;
}
