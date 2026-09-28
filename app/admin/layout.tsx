import { Suspense } from "react";

import { LoadingBlock } from "@/components/ui/controls";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import { requireAdmin } from "@/lib/auth";
import { ADMIN_NAV } from "@/lib/workspace-nav";

export const metadata = {
  title: { default: "Platform admin", template: "%s · Admin · LINK STORE" },
};

export const dynamic = "force-dynamic";

/**
 * Platform administration.
 *
 * `requireAdmin()` validates the session against the database and redirects a
 * non-admin straight back to their workspace, so this shell is never rendered to
 * someone without the role.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();

  return (
    <Suspense fallback={<LoadingBlock label="Opening platform administration" />}>
      <WorkspaceShell
        user={user}
        store={null}
        nav={ADMIN_NAV}
        homeHref="/workspace"
        label="Platform admin"
      >
        {children}
      </WorkspaceShell>
    </Suspense>
  );
}
