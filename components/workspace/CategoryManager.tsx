"use client";

import { Button, Chip, Modal, Table, useOverlayState } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { deleteCategoryAction, saveCategoryAction } from "@/app/actions/store";
import { ConfirmDialog } from "@/components/ui/controls";
import { Field, SelectField } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/feedback";
import { Icon } from "@/components/ui/Icon";
import {
  categoryIconName,
  LISTING_TYPES,
  listingTypeIcon,
  listingTypeMeta,
  type ListingType,
} from "@/lib/catalog";

type EditableCategory = {
  id: string;
  name: string;
  slug: string;
  kind: string;
  icon: string | null;
  listingCount: number;
  isPlatform: boolean;
};

const TYPE_OPTIONS = LISTING_TYPES.map((type) => ({
  value: type.value,
  label: type.label,
  icon: listingTypeIcon(type.value),
}));

/**
 * Create, rename and remove the categories that organise a store's catalogue.
 *
 * Platform categories are shown read-only: they belong to the marketplace, not
 * to this store, and their listing count is still displayed because it is real.
 */
export function CategoryManager({ categories }: { categories: EditableCategory[] }) {
  const router = useRouter();
  const editor = useOverlayState();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<EditableCategory | null>(null);
  const [deleting, setDeleting] = useState<EditableCategory | null>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState("physical");
  const [error, setError] = useState<string | null>(null);

  const openCreate = () => {
    setEditing(null);
    setName("");
    setKind("physical");
    setError(null);
    editor.open();
  };

  const openEdit = (category: EditableCategory) => {
    setEditing(category);
    setName(category.name);
    setKind(category.kind);
    setError(null);
    editor.open();
  };

  const save = () => {
    setError(null);
    startTransition(async () => {
      const result = await saveCategoryAction({
        id: editing?.id,
        name: name.trim(),
        kind,
        // The category icon is derived from its listing type — the UI never
        // asks a seller to paste a glyph, and no emoji can reach the database.
        icon: listingTypeIcon(kind),
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      editor.close();
      router.refresh();
    });
  };

  const confirmDelete = () => {
    if (!deleting) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteCategoryAction(deleting.id);
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
        <Button size="sm" variant="primary" onPress={openCreate}>
          New category
        </Button>
      </div>

      {categories.length === 0 ? (
        <EmptyState
          action={
            <Button size="sm" variant="primary" onPress={openCreate}>
              Create category
            </Button>
          }
          description="Categories group your listings so shoppers can find them. Create your first one to get started."
          icon="categories"
          title="No categories yet"
        />
      ) : (
        <Table>
          <Table.ScrollContainer>
            <Table.Content aria-label="Store categories" className="min-w-[640px]">
              <Table.Header>
                <Table.Column isRowHeader>Category</Table.Column>
                <Table.Column>Type</Table.Column>
                <Table.Column>Listings</Table.Column>
                <Table.Column>Actions</Table.Column>
              </Table.Header>
              <Table.Body>
                {categories.map((category) => (
                  <Table.Row key={category.id}>
                    <Table.Cell>
                      <div className="flex items-center gap-2">
                        <Icon
                          className="shrink-0 text-muted"
                          name={categoryIconName(category)}
                          size={14}
                        />
                        <span className="font-medium">{category.name}</span>
                        {category.isPlatform ? (
                          <Chip size="sm" variant="soft">
                            Platform
                          </Chip>
                        ) : null}
                      </div>
                    </Table.Cell>
                    <Table.Cell>
                      <Chip size="sm" variant="soft">
                        {listingTypeMeta(category.kind as ListingType).label}
                      </Chip>
                    </Table.Cell>
                    <Table.Cell>
                      <span className="tabular-nums">{category.listingCount}</span>
                    </Table.Cell>
                    <Table.Cell>
                      <div className="flex justify-end gap-2">
                        <Button
                          isDisabled={category.isPlatform}
                          size="sm"
                          variant="ghost"
                          onPress={() => openEdit(category)}
                        >
                          Edit
                        </Button>
                        <Button
                          isDisabled={category.isPlatform}
                          size="sm"
                          variant="danger-soft"
                          onPress={() => setDeleting(category)}
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
          <Modal.Container>
            <Modal.Dialog className="sm:max-w-[440px]">
              <Modal.CloseTrigger />
              <Modal.Header>
                <Modal.Heading>{editing ? "Edit category" : "New category"}</Modal.Heading>
              </Modal.Header>

              <Modal.Body className="gap-5 py-6">
                <Field
                  isRequired
                  inputProps={{ autoFocus: true }}
                  label="Name"
                  name="name"
                  onChange={setName}
                  placeholder="e.g. Summer collection"
                  value={name}
                />

                <SelectField
                  description="Which kind of listing belongs in this category."
                  label="Listing type"
                  name="kind"
                  onChange={(value) => setKind(value ? String(value) : "physical")}
                  options={TYPE_OPTIONS}
                  value={kind}
                />

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
                  isDisabled={name.trim().length === 0}
                  isPending={pending}
                  onPress={save}
                >
                  {editing ? "Save changes" : "Create category"}
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      <ConfirmDialog
        cancelLabel="Keep category"
        confirmLabel="Delete"
        description={
          <>
            Delete <span className="font-medium text-foreground">{deleting?.name}</span>? Listings in
            it are kept and simply become uncategorised.
          </>
        }
        isOpen={deleting !== null}
        isPending={pending}
        title="Delete category"
        onConfirm={confirmDelete}
        onOpenChange={() => setDeleting(null)}
      />
    </>
  );
}
