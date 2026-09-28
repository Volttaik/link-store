"use client";

import { Input } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { setStorePublishedAdminAction, setUserRoleAction } from "@/app/actions/admin";
import { SelectField, SwitchField } from "@/components/ui/field";
import { SearchForm } from "@/components/ui/SearchForm";

/** Hide or restore a storefront across the marketplace. */
export function StoreVisibilityControl({
  storeId,
  isPublished,
  storeName,
}: {
  storeId: string;
  isPublished: boolean;
  storeName: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <SwitchField
        aria-label={`${isPublished ? "Suspend" : "Restore"} ${storeName}`}
        isDisabled={pending}
        isSelected={isPublished}
        size="sm"
        onChange={() =>
          startTransition(async () => {
            const result = await setStorePublishedAdminAction(storeId, !isPublished);
            setError(result.ok ? null : result.error);
            router.refresh();
          })
        }
      >
        {isPublished ? "Live" : "Suspended"}
      </SwitchField>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}

/** Promote or demote an account. */
export function UserRoleControl({ userId, role }: { userId: string; role: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <SelectField
        aria-label="Account role"
        className="w-32"
        isDisabled={pending}
        options={[
          { value: "user", label: "User" },
          { value: "admin", label: "Admin" },
        ]}
        value={role}
        onChange={(value) => {
          const next = (value ? String(value) : "user") as "user" | "admin";
          startTransition(async () => {
            const result = await setUserRoleAction(userId, next);
            setError(result.ok ? null : result.error);
            router.refresh();
          });
        }}
      />
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}

/**
 * Server-side search that keeps the query in the URL, so a filtered view can be
 * bookmarked or shared and the filtering itself happens in SQL.
 */
export function AdminSearch({
  action,
  defaultValue,
  placeholder,
}: {
  action: string;
  defaultValue?: string;
  placeholder: string;
}) {
  return (
    <SearchForm action={action} className="flex w-full items-end gap-2 sm:max-w-md">
      <Input
        aria-label={placeholder}
        className="flex-1"
        defaultValue={defaultValue}
        name="q"
        placeholder={placeholder}
        variant="secondary"
      />
    </SearchForm>
  );
}
