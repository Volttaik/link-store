"use client";

import { Button, useOverlayState } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { deleteReviewAction, setReviewStatusAction } from "@/app/actions/listings";
import { ConfirmDialog } from "@/components/ui/controls";

/**
 * Publish, hide or remove a review.
 *
 * Reviews are public-facing content, so every change is confirmed and applied
 * server-side against the store that owns it.
 */
export function ReviewModeration({
  reviewId,
  status,
  customerName,
}: {
  reviewId: string;
  status: string;
  customerName: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const dialog = useOverlayState();

  const isPublished = status === "published";

  const setStatus = (next: "published" | "hidden") => {
    setError(null);
    startTransition(async () => {
      const result = await setReviewStatusAction(reviewId, next);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  const remove = () => {
    setError(null);
    startTransition(async () => {
      const result = await deleteReviewAction(reviewId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      dialog.close();
      router.refresh();
    });
  };

  return (
    <>
      <div className="flex items-center gap-1">
        <Button
          isPending={pending}
          size="sm"
          variant="ghost"
          onPress={() => setStatus(isPublished ? "hidden" : "published")}
        >
          {isPublished ? "Hide" : "Publish"}
        </Button>
        <Button size="sm" variant="danger-soft" onPress={dialog.open}>
          Delete
        </Button>
      </div>

      {error ? <p className="text-xs text-danger">{error}</p> : null}

      <ConfirmDialog
        cancelLabel="Keep review"
        confirmLabel="Delete"
        description={
          <>
            Delete the review left by{" "}
            <span className="font-medium text-foreground">
              {customerName || "this customer"}
            </span>
            ? This cannot be undone.
          </>
        }
        isOpen={dialog.isOpen}
        isPending={pending}
        title="Delete review"
        onConfirm={remove}
        onOpenChange={dialog.setOpen}
      />
    </>
  );
}
