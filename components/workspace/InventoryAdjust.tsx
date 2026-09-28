"use client";

import { Button, Popover } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { adjustInventoryAction } from "@/app/actions/listings";
import { Field, SelectField } from "@/components/ui/field";

/**
 * Adjust stock for a listing (or one of its variants).
 *
 * The delta is signed, so the same control handles restocking and corrections,
 * and the server writes an inventory movement for every change.
 */
export function InventoryAdjust({
  listingId,
  title,
  variants,
}: {
  listingId: string;
  title: string;
  variants: Array<{ id: string; name: string; stock: number }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [delta, setDelta] = useState("1");
  const [note, setNote] = useState("");
  const [variantId, setVariantId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const run = () => {
    const parsed = Number.parseInt(delta, 10);
    if (!Number.isFinite(parsed) || parsed === 0) {
      setError("Enter a non-zero quantity. Use a minus sign to remove stock.");
      return;
    }

    setError(null);

    startTransition(async () => {
      const result = await adjustInventoryAction({
        listingId,
        variantId: variantId || null,
        delta: parsed,
        note: note.trim() || null,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setDelta("1");
      setNote("");
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <Popover isOpen={open} onOpenChange={setOpen}>
      <Button size="sm" variant="secondary">
        Adjust stock
      </Button>

      <Popover.Content className="w-80" placement="bottom end">
        <Popover.Dialog>
          <Popover.Heading className="truncate text-sm">{title}</Popover.Heading>

          <div className="mt-3 flex flex-col gap-4">
            {variants.length > 0 ? (
              <SelectField
                className="text-sm"
                label="Variant"
                onChange={(value) => setVariantId(value ? String(value) : "")}
                options={[
                  { value: "", label: "All stock (listing total)" },
                  ...variants.map((variant) => ({
                    value: variant.id,
                    label: `${variant.name} (${variant.stock})`,
                  })),
                ]}
                value={variantId}
              />
            ) : null}

            <Field
              isRequired
              inputClassName="text-sm"
              description="Positive to add, negative to remove."
              inputProps={{ inputMode: "numeric" }}
              label="Change"
              name="delta"
              onChange={setDelta}
              placeholder="e.g. 10 or -3"
              value={delta}
            />

            <Field
              inputClassName="text-sm"
              label="Note"
              name="note"
              onChange={setNote}
              placeholder="New shipment"
              value={note}
            />

            {error ? (
              <p className="text-xs text-danger" role="alert">
                {error}
              </p>
            ) : null}

            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onPress={() => setOpen(false)}>
                Cancel
              </Button>
              <Button isPending={pending} size="sm" variant="primary" onPress={run}>
                Apply
              </Button>
            </div>
          </div>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
