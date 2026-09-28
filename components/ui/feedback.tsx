/** Shared empty / loading / error states built from HeroUI primitives. */

import { Alert } from "@heroui/react/alert";
import { Chip } from "@heroui/react/chip";
import { EmptyState as HeroEmptyState } from "@heroui/react/empty-state";
import { Skeleton } from "@heroui/react/skeleton";
import type { ReactNode } from "react";

import { Icon, type IconName } from "@/components/ui/Icon";
import { ButtonLink } from "@/components/ui/controls";

/**
 * The honest "nothing here yet" state.
 *
 * Every list in Link Store renders one of these instead of a blank screen, and
 * instead of fabricated placeholder rows.
 */
export function EmptyState({
  icon = "info",
  title,
  description,
  action,
  /** An optional lower-emphasis alternative to `action`. */
  secondaryAction,
  compact = false,
  tone = "default",
}: {
  icon?: IconName;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  secondaryAction?: ReactNode;
  compact?: boolean;
  tone?: "default" | "accent" | "danger" | "warning";
}) {
  return (
    <HeroEmptyState
      className={`ls-tone flex flex-col items-center justify-center rounded-2xl bg-surface-secondary/40 text-center ${
        compact ? "gap-2 p-5" : "gap-3 px-6 py-10"
      }`}
    >
      <span
        className={`flex size-10 items-center justify-center rounded-full ${
          tone === "danger"
            ? "bg-danger/10 text-danger"
            : tone === "warning"
              ? "bg-warning/10 text-warning"
              : "bg-iris/15 text-iris-deep"
        }`}
      >
        <Icon name={icon} height={compact ? 16 : 18} width={compact ? 16 : 18} />
      </span>

      <div className="flex max-w-md flex-col gap-1">
        <p className={`font-medium text-foreground ${compact ? "text-sm" : "text-[15px]"}`}>{title}</p>
        {description ? (
          <p className="text-[13px] leading-relaxed text-muted">{description}</p>
        ) : null}
      </div>

      {action || secondaryAction ? (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          {action}
          {secondaryAction}
        </div>
      ) : null}
    </HeroEmptyState>
  );
}

export function ErrorState({
  title = "Something went wrong",
  description = "This section could not be loaded. Try again in a moment.",
  action,
}: {
  title?: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Alert status="danger">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>{title}</Alert.Title>
        <Alert.Description>{description}</Alert.Description>
      </Alert.Content>
      {action}
    </Alert>
  );
}

/**
 * Contextual guidance — used to explain a flow, a limitation, or an environment
 * problem (for example: payments not configured) without pretending the feature
 * is working.
 */
export function InfoNote({
  title,
  children,
  tone = "default",
  action,
}: {
  title?: string;
  children: ReactNode;
  tone?: "default" | "primary" | "warning" | "danger" | "success";
  action?: ReactNode;
}) {
  const status = tone === "primary" ? "accent" : tone === "default" ? undefined : tone;

  return (
    <Alert status={status}>
      <Alert.Indicator />
      <Alert.Content>
        {title ? <Alert.Title>{title}</Alert.Title> : null}
        <Alert.Description className={title ? undefined : "text-foreground"}>
          {children}
        </Alert.Description>
      </Alert.Content>
      {action}
    </Alert>
  );
}

export function CardSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-surface p-3 shadow-elev-1">
      <Skeleton className="ls-shimmer aspect-4/3 w-full rounded-xl" />
      <div className="flex flex-col gap-2">
        <Skeleton className="ls-shimmer h-3 w-4/5 rounded-md" />
        <Skeleton className="ls-shimmer h-3 w-2/5 rounded-md" />
      </div>
    </div>
  );
}

export function CardGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {Array.from({ length: count }, (_, index) => (
        <CardSkeleton key={index} />
      ))}
    </div>
  );
}

export function RowSkeleton({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-surface p-3 shadow-elev-1">
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="flex items-center gap-4 rounded-xl px-2 py-2">
          <Skeleton className="ls-shimmer h-3 w-6 rounded-md" />
          {Array.from({ length: columns }, (_, column) => (
            <Skeleton
              key={column}
              className={`ls-shimmer h-3 rounded-md ${column === 0 ? "w-40" : "w-24"} ${column > 1 ? "hidden sm:block" : ""}`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function StatSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex flex-col gap-3 rounded-2xl bg-surface p-4 shadow-elev-1">
          <Skeleton className="ls-shimmer h-3 w-20 rounded-md" />
          <Skeleton className="ls-shimmer h-6 w-24 rounded-md" />
          <Skeleton className="ls-shimmer h-3 w-16 rounded-md" />
        </div>
      ))}
    </div>
  );
}

/**
 * An "Open …" action.
 *
 * Every section that used to trail off in a "See more" / "See all" link now
 * ends in a real button that names its destination — Open Products, Open
 * Orders, Open Analytics. The same wording is used on the marketplace and in
 * the workspace, and every one of them navigates to a route that exists.
 */
export function OpenLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <ButtonLink href={href} size="sm" variant="secondary">
      {children}
    </ButtonLink>
  );
}

export function FilterChip({
  label,
  value,
  color = "accent",
}: {
  label: string;
  value: string | number;
  color?: "accent" | "default" | "success" | "warning";
}) {
  return (
    <Chip color={color} size="sm" variant="soft">
      <span className="text-muted">{label}</span>
      <span className="ml-1 font-medium tabular-nums">{value}</span>
    </Chip>
  );
}
