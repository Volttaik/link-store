import { Suspense } from "react";

import { BrowserNotifications } from "@/components/layout/BrowserNotifications";
import { LiveUpdates } from "@/components/layout/LiveUpdates";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import { ContentSpinner } from "@/components/ui/controls";
import { requireUser, getStoreForUser } from "@/lib/auth";
import { getWorkspaceContextData } from "@/lib/server/context";
import { flattenCategoryTree } from "@/lib/categories";
import { listMainCategories } from "@/lib/server/categories";
import { WORKSPACE_NAV } from "@/lib/workspace-nav";

export const metadata = {
  title: { default: "Workspace", template: "%s · Workspace · Rush Cart" },
};

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // `middleware.ts` already redirected obvious signed-out traffic, but this is
  // the check that actually authorises: it validates the session in the database
  // and redirects to sign-in when it is missing or expired.
  const user = await requireUser("/workspace");
  const store = await getStoreForUser(user.id);

  // The section display beside the menu is fed from the store's own rows — real
  // products, orders, stock, customers and money — in one parallel round. No
  // store means no sections to preview, so the shell stays a menu-only panel.
  const contextData = store ? await getWorkspaceContextData(store, user.id) : null;
  const productCategories = store ? await listMainCategories() : [];

  return (
    // This boundary only covers resolving the session and the seller's store —
    // once the shell is mounted it stays put, and page-level loading is handled
    // by `loading.tsx` inside the content area.
    <Suspense fallback={<ContentSpinner className="min-h-dvh" />}>
      <LiveUpdates enabled userId={user.id} />
      <BrowserNotifications userId={user.id} />
      <WorkspaceShell
        user={user}
        store={
          store
            ? { name: store.name, slug: store.slug, isPublished: store.is_published === 1 }
            : null
        }
        nav={WORKSPACE_NAV}
        productCategories={flattenCategoryTree(productCategories).map(({ id, name }) => ({ id, name }))}
        contextData={contextData}
        homeHref="/"
      >
        {children}
      </WorkspaceShell>
    </Suspense>
  );
}
