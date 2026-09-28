import { ModuleNewPage } from "@/components/workspace/ModuleNewPage";

export const metadata = { title: "New menu item" };

export const dynamic = "force-dynamic";

export default async function NewMenuItemPage() {
  return <ModuleNewPage moduleKey="food" />;
}
