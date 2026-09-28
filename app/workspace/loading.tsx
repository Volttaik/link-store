import { ContentSpinner } from "@/components/ui/controls";

/**
 * What the dynamic content area shows while a Workspace page is loading.
 *
 * `loading.tsx` replaces only the page segment inside `app/workspace/layout.tsx`,
 * which means the shell around it — the Workspace header, the side menu and the
 * bottom navigation — stays mounted and visible. Nothing blanks out, nothing
 * flashes, and there is no full-page spinner over the navigation.
 */
export default function WorkspaceLoading() {
  return <ContentSpinner className="min-h-[55vh]" />;
}
