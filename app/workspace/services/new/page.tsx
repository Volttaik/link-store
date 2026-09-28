import { ModuleNewPage } from "@/components/workspace/ModuleNewPage";

export const metadata = { title: "New service" };

export const dynamic = "force-dynamic";

export default async function NewServicePage() {
  return <ModuleNewPage moduleKey="services" />;
}
