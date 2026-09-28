import { ModuleNewPage } from "@/components/workspace/ModuleNewPage";

export const metadata = { title: "New rental" };

export const dynamic = "force-dynamic";

export default async function NewRentalPage() {
  return <ModuleNewPage moduleKey="rentals" />;
}
