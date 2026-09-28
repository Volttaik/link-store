import { ModuleNewPage } from "@/components/workspace/ModuleNewPage";

export const metadata = { title: "New digital product" };

export const dynamic = "force-dynamic";

export default async function NewDigitalProductPage() {
  return <ModuleNewPage moduleKey="digital" />;
}
