"use client";

import { Button, useOverlayState } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { restoreTicketAction, trashTicketAction } from "@/app/actions/tickets";
import { ConfirmDialog } from "@/components/ui/controls";
import { Icon } from "@/components/ui/Icon";

/**
 * What a holder may do with one of their own tickets.
 *
 * Delete is offered only once the ticket is genuinely spent — used, expired,
 * cancelled, refunded or past its date. A live admission keeps its place in the
 * inventory, and the server refuses to trash one anyway; this is the same rule
 * expressed where a person can see it, not a substitute for it.
 *
 * Recover is the exact inverse, and it does not create anything: the same ticket
 * with the same code and QR comes back out of the trash.
 *
 * A refusal from the server is shown in the row's own words, because "this
 * ticket is still valid" is information, not a generic failure.
 */
export function TicketInventoryActions({
  ticketId,
  trashed,
  canDelete,
}: {
  ticketId: string;
  /** True when this ticket is currently in the holder's trash. */
  trashed: boolean;
  /** True when the ticket has become unusable, which is when Delete is offered. */
  canDelete: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const dialog = useOverlayState();

  function run() {
    setError(null);
    startTransition(async () => {
      const result = trashed
        ? await restoreTicketAction(ticketId)
        : await trashTicketAction(ticketId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  if (trashed) {
    return (
      <div className="flex flex-col items-start gap-1">
        <Button
          isPending={pending}
          size="sm"
          variant="secondary"
          onPress={() => startTransition(run)}
        >
          <Icon name="refresh" size={14} />
          Recover ticket
        </Button>
        {error ? <span className="text-xs text-danger">{error}</span> : null}
      </div>
    );
  }

  if (!canDelete) return null;

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        isPending={pending}
        size="sm"
        variant="danger-soft"
        onPress={() => dialog.open()}
      >
        <Icon name="trash" size={14} />
        Delete
      </Button>
      {error ? <span className="text-xs text-danger">{error}</span> : null}

      <ConfirmDialog
        confirmLabel="Move to trash"
        description="This ticket moves to your trash. Nothing is destroyed — its code, its QR and its order stay exactly as they are, and you can recover it from the trash at any time."
        isOpen={dialog.isOpen}
        isPending={pending}
        title="Move this ticket to trash?"
        status="warning"
        onConfirm={run}
        onOpenChange={dialog.setOpen}
      />
    </div>
  );
}
