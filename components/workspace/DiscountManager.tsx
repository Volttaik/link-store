"use client";

import { Button, Chip, Modal, Table, useOverlayState } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  deleteDiscountAction,
  saveDiscountAction,
  toggleDiscountAction,
} from "@/app/actions/listings";
import { ConfirmDialog } from "@/components/ui/controls";
import { Field, SelectField, SwitchField } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/feedback";
import { formatDate } from "@/lib/format";
import { formatMoney, minorToInput, parseMoneyToMinor } from "@/lib/money";
import { DISCOUNT_TYPES } from "@/lib/catalog";
import type { DiscountRow } from "@/lib/types";

type ListingOption = { id: string; title: string };

const TYPE_OPTIONS = DISCOUNT_TYPES.map((entry) => ({
  value: entry.value,
  label: entry.label,
}));

const SCOPE_OPTIONS = [
  { value: "order", label: "The whole order" },
  { value: "listing", label: "A single listing" },
];

/**
 * Discounts.
 *
 * Codes are validated server-side; this form only shapes the input. Amounts are
 * entered in the store currency and converted to minor units here so the server
 * always receives integers.
 */
export function DiscountManager({
  discounts,
  listings,
  currency,
}: {
  discounts: DiscountRow[];
  listings: ListingOption[];
  currency: string;
}) {
  const router = useRouter();
  const editor = useOverlayState();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<DiscountRow | null>(null);
  const [deleting, setDeleting] = useState<DiscountRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [type, setType] = useState<"percentage" | "fixed">("percentage");
  const [value, setValue] = useState("10");
  const [minSubtotal, setMinSubtotal] = useState("");
  const [usageLimit, setUsageLimit] = useState("");
  const [scope, setScope] = useState<"order" | "listing">("order");
  const [listingId, setListingId] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(true);

  const reset = () => {
    setName("");
    setCode("");
    setType("percentage");
    setValue("10");
    setMinSubtotal("");
    setUsageLimit("");
    setScope("order");
    setListingId(null);
    setIsActive(true);
    setError(null);
  };

  const openCreate = () => {
    setEditing(null);
    reset();
    editor.open();
  };

  const openEdit = (discount: DiscountRow) => {
    setEditing(discount);
    setName(discount.name);
    setCode(discount.code ?? "");
    setType(discount.type);
    setValue(
      discount.type === "percentage" ? String(discount.value) : minorToInput(discount.value, currency),
    );
    setMinSubtotal(
      discount.min_subtotal > 0 ? minorToInput(discount.min_subtotal, currency) : "",
    );
    setUsageLimit(discount.usage_limit === null ? "" : String(discount.usage_limit));
    setScope(discount.scope);
    setListingId(discount.listing_id);
    setIsActive(discount.is_active === 1);
    setError(null);
    editor.open();
  };

  const save = () => {
    setError(null);

    const amount =
      type === "percentage" ? Math.round(Number(value)) : parseMoneyToMinor(value, currency);
    if (amount === null || Number.isNaN(amount)) {
      setError("Enter a valid discount value.");
      return;
    }

    const minimum = minSubtotal.trim() ? parseMoneyToMinor(minSubtotal, currency) : 0;
    if (minimum === null) {
      setError("Enter a valid minimum spend, or leave it empty.");
      return;
    }

    const limit = usageLimit.trim() ? Number(usageLimit) : null;
    if (limit !== null && (!Number.isFinite(limit) || limit <= 0)) {
      setError("Usage limit must be a positive whole number.");
      return;
    }

    startTransition(async () => {
      const result = await saveDiscountAction({
        id: editing?.id,
        name: name.trim(),
        code: code.trim() ? code.trim().toUpperCase() : null,
        type,
        value: amount,
        minSubtotal: minimum,
        usageLimit: limit,
        scope,
        listingId: scope === "listing" ? listingId : null,
        startsAt: editing?.starts_at ?? null,
        endsAt: editing?.ends_at ?? null,
        isActive,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      editor.close();
      router.refresh();
    });
  };

  const toggle = (discount: DiscountRow) => {
    setError(null);
    startTransition(async () => {
      const result = await toggleDiscountAction(discount.id, discount.is_active !== 1);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  const confirmDelete = () => {
    if (!deleting) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteDiscountAction(deleting.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDeleting(null);
      router.refresh();
    });
  };

  return (
    <>
      <div className="flex justify-end">
        <Button variant="primary" size="sm" onPress={openCreate}>
          New discount
        </Button>
      </div>

      {error && !editor.isOpen && deleting === null ? (
        <p className="text-sm text-danger">{error}</p>
      ) : null}

      {discounts.length === 0 ? (
        <EmptyState icon="tag" title="No discounts yet" description="Create a code your customers can apply at checkout, or a store-wide reduction."
          action={
            <Button variant="primary" size="sm" onPress={openCreate}>
              Create discount
            </Button>
          }
        />
      ) : (
        <Table>
          <Table.ScrollContainer>
            <Table.Content aria-label="Discounts" className="min-w-[720px]">
              <Table.Header>
                <Table.Column isRowHeader>Discount</Table.Column>
                <Table.Column>Value</Table.Column>
                <Table.Column>Applied to</Table.Column>
                <Table.Column>Used</Table.Column>
                <Table.Column>Actions</Table.Column>
              </Table.Header>
              <Table.Body>
                {discounts.map((discount) => (
                  <Table.Row key={discount.id}>
                    <Table.Cell>
                      <div className="flex flex-col">
                        <span className="font-medium">{discount.name}</span>
                        <span className="text-xs text-muted">
                          {discount.code ? discount.code : "No code required"}
                          {discount.ends_at ? ` · ends ${formatDate(discount.ends_at)}` : ""}
                        </span>
                      </div>
                    </Table.Cell>
                    <Table.Cell>
                      <span className="tabular-nums">
                        {discount.type === "percentage"
                          ? `${discount.value}%`
                          : formatMoney(discount.value, currency)}
                      </span>
                      {discount.min_subtotal > 0 ? (
                        <span className="block text-xs text-muted tabular-nums">
                          min {formatMoney(discount.min_subtotal, currency)}
                        </span>
                      ) : null}
                    </Table.Cell>
                    <Table.Cell>
                      <Chip size="sm" variant="soft">
                        {discount.scope === "order" ? "Whole order" : "One listing"}
                      </Chip>
                    </Table.Cell>
                    <Table.Cell>
                      <span className="tabular-nums">
                        {discount.used_count}
                        {discount.usage_limit ? ` / ${discount.usage_limit}` : ""}
                      </span>
                    </Table.Cell>
                    <Table.Cell>
                      <div className="flex items-center justify-end gap-2">
                        <SwitchField
                          aria-label={`Toggle ${discount.name}`}
                          isDisabled={pending}
                          isSelected={discount.is_active === 1}
                          size="sm"
                          onChange={() => toggle(discount)}
                        />
                        <Button size="sm" variant="ghost" onPress={() => openEdit(discount)}>
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="danger-soft"
                          onPress={() => setDeleting(discount)}
                        >
                          Delete
                        </Button>
                      </div>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Content>
          </Table.ScrollContainer>
        </Table>
      )}

      <Modal isOpen={editor.isOpen} onOpenChange={editor.setOpen}>
        <Modal.Backdrop>
          <Modal.Container scroll="inside" size="lg">
            <Modal.Dialog>
              <Modal.CloseTrigger />
              <Modal.Header>
                <Modal.Heading>{editing ? "Edit discount" : "New discount"}</Modal.Heading>
              </Modal.Header>

              <Modal.Body className="gap-5 py-6">
                <Field
                  isRequired
                  label="Name"
                  name="name"
                  onChange={setName}
                  placeholder="e.g. Launch week"
                  value={name}
                />
                <Field
                  description="Leave empty for an automatic discount applied to qualifying orders."
                  label="Code"
                  name="code"
                  onChange={setCode}
                  placeholder="LAUNCH10"
                  value={code}
                />

                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <SelectField
                    label="Type"
                    name="type"
                    onChange={(next) =>
                      setType((next ? String(next) : "percentage") as "percentage" | "fixed")
                    }
                    options={TYPE_OPTIONS}
                    value={type}
                  />
                  <Field
                    inputProps={{ inputMode: "decimal" }}
                    label={
                      type === "percentage" ? "Percentage off" : `Amount off (${currency})`
                    }
                    name="value"
                    onChange={setValue}
                    suffix={type === "percentage" ? <span className="text-muted">%</span> : null}
                    value={value}
                  />
                </div>

                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <Field
                    inputProps={{ inputMode: "decimal" }}
                    label={`Minimum spend (${currency})`}
                    name="minSubtotal"
                    onChange={setMinSubtotal}
                    placeholder="Optional"
                    value={minSubtotal}
                  />
                  <Field
                    inputProps={{ inputMode: "numeric" }}
                    label="Usage limit"
                    name="usageLimit"
                    onChange={setUsageLimit}
                    placeholder="Unlimited"
                    value={usageLimit}
                  />
                </div>

                <SelectField
                  label="Applies to"
                  name="scope"
                  onChange={(next) =>
                    setScope((next ? String(next) : "order") as "order" | "listing")
                  }
                  options={SCOPE_OPTIONS}
                  value={scope}
                />

                {scope === "listing" ? (
                  <SelectField
                    isDisabled={listings.length === 0}
                    label="Listing"
                    name="listingId"
                    onChange={(next) => setListingId(next ? String(next) : "")}
                    options={listings.map((listing) => ({
                      value: listing.id,
                      label: listing.title,
                    }))}
                    placeholder={
                      listings.length === 0 ? "No listings available" : "Choose a listing"
                    }
                    value={listingId || null}
                  />
                ) : null}

                <SwitchField
                  isSelected={isActive}
                  name="isActive"
                  size="sm"
                  onChange={setIsActive}
                >
                  Active
                </SwitchField>

                {error ? (
                  <p className="text-sm text-danger" role="alert">
                    {error}
                  </p>
                ) : null}
              </Modal.Body>

              <Modal.Footer>
                <Button slot="close" variant="tertiary">
                  Cancel
                </Button>
                <Button
                  isDisabled={name.trim().length < 2 || (scope === "listing" && !listingId)}
                  isPending={pending}
                  onPress={save}
                >
                  {editing ? "Save changes" : "Create discount"}
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      <ConfirmDialog
        cancelLabel="Keep discount"
        confirmLabel="Delete"
        description={
          <>
            Delete <span className="font-medium text-foreground">{deleting?.name}</span>? Orders
            that already used it keep their recorded reduction.
          </>
        }
        isOpen={deleting !== null}
        isPending={pending}
        title="Delete discount"
        onConfirm={confirmDelete}
        onOpenChange={() => setDeleting(null)}
      />
    </>
  );
}
