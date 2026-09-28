"use client";

import { Button, Card } from "@heroui/react";
import { useEffect } from "react";

import { Icon } from "@/components/ui/Icon";

/**
 * What the Workspace shows when a page fails to load.
 *
 * Without this, a failed query surfaces as Next.js's raw error overlay — a
 * stack trace in the middle of the product. This keeps the Workspace shell
 * (header, side menu, bottom navigation) mounted and replaces only the page
 * segment, so the failure is contained: the rest of the app keeps working and
 * the person can retry the section they were in.
 *
 * `reset()` re-renders the segment, which is what actually clears a transient
 * database or network error.
 */
export default function WorkspaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The server already logged the detail; this keeps the browser console
    // honest for client-side failures during development.
    console.error(error);
  }, [error]);

  return (
    <Card className="mx-auto max-w-xl ls-elev-2">
      <Card.Content className="items-start gap-4 p-6">
        <span className="flex size-11 items-center justify-center rounded-2xl bg-danger-soft text-danger">
          <Icon name="alert" size={20} />
        </span>

        <div className="space-y-1.5">
          <h2 className="text-lg font-semibold tracking-tight">This section didn’t load</h2>
          <p className="text-sm text-muted">
            Something went wrong while loading this part of your workspace. Nothing has been
            changed — your products, orders and store settings are untouched.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" onPress={reset}>
            Try again
          </Button>
          <Button variant="secondary" onPress={() => window.location.assign("/workspace")}>
            Back to dashboard
          </Button>
        </div>

        {error.digest ? (
          <p className="text-xs text-muted">
            Reference <span className="font-mono">{error.digest}</span> if you need to report it.
          </p>
        ) : null}
      </Card.Content>
    </Card>
  );
}
