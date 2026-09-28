"use client";

/**
 * A search form that says it is searching.
 *
 * The fields stay the caller's — every screen draws its own input — but the
 * submit is ours. The query is collected from whatever named fields are in the
 * form, pushed inside a transition, and the button keeps its spinner until the
 * destination has rendered.
 *
 * A plain `<form action>` would hand the browser a navigation, which means the
 * button looks finished the instant it is pressed and the screen sits unchanged
 * while the server answers. This is what `SearchBox` already does for the
 * search page, expressed once so every shelf, list and admin table gets it.
 */

import { Button } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useTransition, type ReactNode } from "react";

import type { ButtonSize, ButtonVariant } from "@/components/ui/controls";

export function SearchForm({
  action,
  children,
  label = "Search",
  variant = "secondary",
  size = "sm",
  className,
  buttonClassName,
  ariaLabel,
}: {
  /** The path to land on. Query parameters come from the fields. */
  action: string;
  children: ReactNode;
  label?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  buttonClassName?: string;
  /** Set when the visible label is not enough to name the control. */
  ariaLabel?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <form
      className={className}
      onSubmit={(event) => {
        event.preventDefault();

        const data = new FormData(event.currentTarget);
        const query = new URLSearchParams();
        data.forEach((value, key) => {
          const text = String(value).trim();
          // An empty field is not a filter — it is the absence of one, and the
          // URL should not carry it.
          if (text) query.set(key, text);
        });

        const search = query.toString();
        startTransition(() => router.push(search ? `${action}?${search}` : action));
      }}
    >
      {children}

      <Button
        aria-label={ariaLabel}
        className={buttonClassName}
        isPending={pending}
        size={size}
        type="submit"
        variant={variant}
      >
        {label}
      </Button>
    </form>
  );
}
