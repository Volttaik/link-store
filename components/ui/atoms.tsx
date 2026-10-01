/** Small presentational atoms shared across the marketplace and workspace. */

/**
 * Neutral stand-in when a seller has not uploaded a photo yet.
 *
 * Shared by the cards that lead with imagery — a product message and an event
 * poster both need the same honest "no photograph" plate rather than an empty
 * box or a borrowed stock image.
 */
export function MediaPlaceholder({ label }: { label: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-surface-secondary text-muted">
      <Icon name="image" size={20} />
      <span className="text-[11px] font-medium tracking-wide uppercase">{label}</span>
    </div>
  );
}

import { Card } from "@heroui/react/card";
import { Chip } from "@heroui/react/chip";
import { Link } from "@heroui/react/link";
import type { ReactNode } from "react";

import { Icon, type IconName } from "@/components/ui/Icon";
import { formatMoney } from "@/lib/money";
import type { StatusTone } from "@/lib/catalog";

/** HeroUI v3 chips speak in accent/default/status colours. */
export function chipColor(tone: StatusTone = "default") {
  if (tone === "primary" || tone === "secondary") return "accent" as const;
  return tone;
}

export function PriceTag({
  amount,
  currency,
  compareAt,
  size = "md",
}: {
  amount: number;
  currency: string;
  compareAt?: number | null;
  /** `card` is the size a price takes on a card: the loudest line after the title. */
  size?: "sm" | "md" | "lg" | "card";
}) {
  const hasDiscount = typeof compareAt === "number" && compareAt > amount;

  const sizeClasses = {
    sm: "text-[13.5px] font-medium",
    md: "text-[15px] font-semibold",
    card: "text-[17px] leading-none font-semibold tracking-tight",
    lg: "text-[23px] font-semibold tracking-tight",
  } as const;

  return (
    <span className="flex flex-wrap items-baseline gap-2">
      <span className={`tabular-nums text-foreground ${sizeClasses[size]}`}>
        {formatMoney(amount, currency)}
      </span>
      {hasDiscount ? (
        <span className="text-xs tabular-nums text-muted line-through">
          {formatMoney(compareAt as number, currency)}
        </span>
      ) : null}
    </span>
  );
}

export function StatusChip({
  label,
  tone = "default",
  variant = "soft",
  size = "sm",
  icon,
}: {
  label: string;
  tone?: StatusTone;
  variant?: "soft" | "primary" | "secondary" | "tertiary";
  size?: "sm" | "md" | "lg";
  icon?: IconName;
}) {
  return (
    <Chip color={chipColor(tone)} size={size} variant={variant} className="capitalize">
      {icon ? <Icon name={icon} /> : null}
      {label}
    </Chip>
  );
}

export function CountChip({
  value,
  label,
  tone = "default",
}: {
  value: number | string;
  label: string;
  tone?: StatusTone;
}) {
  return (
    <Chip color={chipColor(tone)} size="sm" variant="soft">
      <span className="font-medium tabular-nums">{value}</span>
      <span className="ml-1 text-muted">{label}</span>
    </Chip>
  );
}

/**
 * A single metric tile.
 *
 * `value` is always computed from the database by the caller — this component
 * never invents, rounds up or formats a number into existence.
 */
export function StatTile({
  label,
  value,
  hint,
  trend,
  icon,
  href,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  trend?: { value: number; label?: string } | null;
  icon?: IconName;
  href?: string;
}) {
  const content = (
    <Card.Content className="gap-3 p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[11.5px] font-medium tracking-wide text-muted uppercase">
          {label}
        </p>
        {icon ? <Icon name={icon} size={15} className="shrink-0 text-muted" /> : null}
      </div>

      <p className="text-[21px] leading-none font-semibold tracking-tight tabular-nums">{value}</p>

      <div className="flex min-h-5 items-center gap-2">
        {trend ? (
          <span
            className={`flex items-center gap-1 text-xs font-medium tabular-nums ${
              (trend.value ?? 0) >= 0 ? "text-success" : "text-danger"
            }`}
          >
            <Icon name={(trend.value ?? 0) >= 0 ? "trendingUp" : "trendingDown"} />
            {Math.abs(trend.value).toFixed(1)}%
          </span>
        ) : null}
        {hint ? <span className="truncate text-[13px] text-muted">{hint}</span> : null}
      </div>
    </Card.Content>
  );

  if (href) {
    return (
      <Link href={href} className="block no-underline">
        {/* Raised on hover and pressed on click — a stat tile is a doorway. */}
        <Card className="ls-lift h-full">{content}</Card>
      </Link>
    );
  }

  return <Card className="h-full">{content}</Card>;
}

export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  breadcrumb?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        {breadcrumb ? <div className="mb-2">{breadcrumb}</div> : null}
        <h1 className="truncate text-[20px] leading-tight font-semibold tracking-tight text-foreground sm:text-[22px]">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2.5">{actions}</div> : null}
    </div>
  );
}

export function SectionHeader({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  icon?: IconName;
}) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2.5 text-[15px] font-semibold tracking-tight text-foreground">
          {icon ? <Icon name={icon} size={17} className="text-muted" /> : null}
          {title}
        </h2>
        {description ? <p className="mt-1 text-[14px] text-muted">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function RatingStars({
  rating,
  count,
  size = "sm",
}: {
  rating: number | null;
  count?: number;
  size?: "sm" | "md";
}) {
  if (rating === null) {
    return <span className="text-xs text-muted">No ratings yet</span>;
  }

  const filled = Math.round(rating);
  const starSize = size === "sm" ? 13 : 15;

  return (
    <span className={`flex items-center gap-1.5 ${size === "sm" ? "text-xs" : "text-sm"}`}>
      <span className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((position) => (
          <Icon
            key={position}
            name="star"
            height={starSize}
            width={starSize}
            className={position <= filled ? "text-warning" : "text-muted opacity-40"}
          />
        ))}
      </span>
      <span className="font-medium tabular-nums text-foreground">{rating.toFixed(1)}</span>
      {typeof count === "number" ? <span className="text-muted tabular-nums">({count})</span> : null}
    </span>
  );
}

export function KeyValue({
  label,
  children,
  icon,
}: {
  label: string;
  children: ReactNode;
  icon?: IconName;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted uppercase">
        {icon ? <Icon name={icon} /> : null}
        {label}
      </span>
      <span className="text-[14px] font-medium text-foreground">{children}</span>
    </div>
  );
}
