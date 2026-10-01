/**
 * Dashboard modules.
 *
 * The workspace dashboard is built from a small set of pieces that all share one
 * surface, one radius (the platform's own card radius, inherited from HeroUI's
 * `Card`) and one type scale. A metric is never a lone number floating in a
 * pill: it is a figure with its own label and a line of context, and related
 * figures sit together inside one soft group.
 *
 * Charts are plain SVG, so they render on the server, plot only the values they
 * are handed, and follow the theme through the design system's colour tokens —
 * no charting dependency, no hard-coded colours, no invented data points.
 */

import { Card } from "@heroui/react/card";
import type { ReactNode } from "react";

import { Icon, type IconName } from "@/components/ui/Icon";
import { formatDate } from "@/lib/format";

/** Every module is the same surface: one border, one radius, one depth. */
const CARD_SURFACE = "h-full gap-0 bg-surface p-0 ls-elev-2";

export function DashboardCard({
  title,
  description,
  icon,
  action,
  badge,
  children,
  className,
  contentClassName,
}: {
  title: string;
  description?: ReactNode;
  icon?: IconName;
  action?: ReactNode;
  /** A small status marker shown next to the title (e.g. "3 need attention"). */
  badge?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <Card className={`${CARD_SURFACE} ${className ?? ""}`}>
      <Card.Header className="flex-row items-start justify-between gap-x-3 gap-y-2 p-4 pb-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          {/* A module's name is never truncated — it wraps instead. */}
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            {icon ? <Icon name={icon} size={15} className="shrink-0 text-muted" /> : null}
            <h3 className="text-[15px] font-semibold tracking-tight text-foreground">{title}</h3>
            {badge ? <span className="shrink-0">{badge}</span> : null}
          </div>
          {description ? (
            <p className="text-[13px] leading-relaxed text-muted">{description}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </Card.Header>

      <Card.Content className={`gap-4 p-4 pt-1 ${contentClassName ?? ""}`}>
        {children}
      </Card.Content>
    </Card>
  );
}

/**
 * A single figure with the context it needs to be understood: what it measures,
 * the number, and what that number is made of.
 */
export function Figure({
  label,
  value,
  hint,
  delta,
  size = "md",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  delta?: ReactNode;
  size?: "md" | "lg";
}) {
  // Long currency strings step down a size rather than being clipped: a figure
  // that hides digits is worse than one that is slightly smaller.
  const length = typeof value === "string" ? value.length : 0;
  const valueSize =
    size === "lg"
      ? length > 12
        ? "text-[18px]"
        : "text-[24px]"
      : length > 14
        ? "text-[15px]"
        : "text-[18px]";

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span className="text-[11px] font-medium tracking-wider text-muted uppercase">{label}</span>
      <span className="flex min-w-0 flex-wrap items-center gap-2">
        <span
          className={`leading-none font-semibold tracking-tight tabular-nums text-foreground ${valueSize}`}
        >
          {value}
        </span>
        {delta}
      </span>
      {hint ? <span className="text-xs leading-snug text-muted">{hint}</span> : null}
    </div>
  );
}

/**
 * A soft panel that holds a group of related figures.
 *
 * Related metrics read as one unit because they share a panel — not because
 * each one was wrapped in its own little box.
 */
export function FigureGroup({
  children,
  columns = 4,
}: {
  children: ReactNode;
  columns?: 2 | 4;
}) {
  const layout = columns === 2 ? "grid-cols-2" : "grid-cols-2 lg:grid-cols-4";

  return (
    <div className={`grid ${layout} gap-x-4 gap-y-6 rounded-2xl bg-surface-secondary/50 p-4`}>
      {children}
    </div>
  );
}

/** Movement against the previous period. Only rendered when a comparison exists. */
export function DeltaBadge({ value }: { value: number }) {
  const up = value >= 0;

  return (
    <span
      className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold tabular-nums ${
        up ? "bg-success/15 text-success" : "bg-danger/15 text-danger"
      }`}
    >
      <Icon name={up ? "trendingUp" : "trendingDown"} size={12} />
      {Math.abs(value).toFixed(1)}%
    </span>
  );
}

export type SeriesPoint = { day: string; value: number };

/**
 * A filled line chart for a daily series.
 *
 * Drawn with `preserveAspectRatio="none"` and non-scaling strokes so the shape
 * stretches to whatever width the card has without the line going thick on
 * wide screens.
 */
export function AreaChart({
  data,
  label,
  formatValue,
  gradientId = "ls-dashboard-area",
}: {
  data: SeriesPoint[];
  label: string;
  formatValue: (value: number) => string;
  gradientId?: string;
}) {
  const WIDTH = 1000;
  const HEIGHT = 220;
  const TOP = 10;
  const BOTTOM = 6;

  const max = data.reduce((highest, point) => Math.max(highest, point.value), 0);
  const step = data.length > 1 ? WIDTH / (data.length - 1) : WIDTH;
  const y = (value: number) =>
    max <= 0 ? HEIGHT - BOTTOM : TOP + (1 - value / max) * (HEIGHT - TOP - BOTTOM);

  const line = data
    .map((point, index) => {
      const x = (index * step).toFixed(1);
      return `${index === 0 ? "M" : "L"}${x},${y(point.value).toFixed(1)}`;
    })
    .join(" ");
  const area = `${line} L${WIDTH},${HEIGHT} L0,${HEIGHT} Z`;
  const first = data[0]?.day;
  const last = data[data.length - 1]?.day;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3 text-xs text-muted">
        <span className="font-medium tracking-wide uppercase">{label}</span>
        <span className="tabular-nums">Peak {formatValue(max)}</span>
      </div>

      <svg
        aria-label={`${label}: ${formatValue(max)} peak`}
        className="h-40 w-full sm:h-44"
        preserveAspectRatio="none"
        role="img"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop className="text-accent" offset="0%" stopColor="currentColor" stopOpacity="0.3" />
            <stop className="text-accent" offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0, 0.5, 1].map((ratio) => {
          const gridY = TOP + ratio * (HEIGHT - TOP - BOTTOM);
          return (
            <line
              key={ratio}
              className="stroke-border"
              strokeDasharray="3 7"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
              x1="0"
              x2={WIDTH}
              y1={gridY}
              y2={gridY}
            />
          );
        })}

        <path d={area} fill={`url(#${gradientId})`} />
        <path
          className="stroke-accent"
          d={line}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <div className="flex items-center justify-between text-xs text-muted">
        <span>{formatDate(first)}</span>
        <span>{formatDate(last)}</span>
      </div>
    </div>
  );
}

/** A thin column chart — used to show volume behind the revenue trend. */
export function ColumnStrip({
  data,
  label,
  formatValue,
}: {
  data: SeriesPoint[];
  label: string;
  formatValue: (value: number) => string;
}) {
  const max = data.reduce((highest, point) => Math.max(highest, point.value), 0);
  const total = data.reduce((sum, point) => sum + point.value, 0);
  const busiest = data.reduce((highest, point) => Math.max(highest, Math.round(point.value)), 0);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3 text-xs text-muted">
        <span className="font-medium tracking-wide uppercase">{label}</span>
        <span className="tabular-nums">
          {formatValue(total)} total · {busiest} on the busiest day
        </span>
      </div>

      <div className="flex h-16 items-end gap-[3px]">
        {data.map((point) => (
          <div
            key={point.day}
            className={`flex-1 rounded-t-[3px] motion-safe:transition-colors ${
              point.value > 0 ? "bg-accent/70 hover:bg-accent" : "bg-surface-tertiary"
            }`}
            style={{
              height: point.value > 0 ? `${Math.max(6, (point.value / max) * 100)}%` : "3px",
            }}
            title={`${formatValue(point.value)} · ${formatDate(point.day)}`}
          />
        ))}
      </div>

      <div className="flex items-center justify-between text-xs text-muted">
        <span>{formatDate(data[0]?.day)}</span>
        <span>{formatDate(data[data.length - 1]?.day)}</span>
      </div>
    </div>
  );
}

/** A labelled proportion bar — a funnel step, a stock level, a mix. */
export function ProgressRow({
  label,
  value,
  max,
  valueLabel,
  tone = "accent",
}: {
  label: string;
  value: number;
  max: number;
  valueLabel: string;
  tone?: "accent" | "success" | "warning" | "danger";
}) {
  const percent = max > 0 ? (value / max) * 100 : 0;
  const fills = {
    accent: "bg-accent",
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
  } as const;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3 text-[13px]">
        <span className="min-w-0 truncate text-muted">{label}</span>
        <span className="shrink-0 font-semibold tabular-nums text-foreground">{valueLabel}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-secondary">
        <div
          aria-hidden="true"
          className={`h-full rounded-full ${fills[tone]} motion-safe:transition-[width] motion-safe:duration-500`}
          style={{ width: value > 0 ? `${Math.max(3, percent)}%` : "0%" }}
        />
      </div>
    </div>
  );
}

/** One bar split into its parts, with a legend that carries the real counts. */
export function StackedBar({
  segments,
}: {
  segments: Array<{
    label: string;
    value: number;
    tone: "accent" | "success" | "warning" | "danger" | "neutral";
  }>;
}) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const fills = {
    accent: "bg-accent",
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
    neutral: "bg-muted/50",
  } as const;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-secondary">
        {total > 0
          ? segments
              .filter((segment) => segment.value > 0)
              .map((segment) => (
                <div
                  key={segment.label}
                  className={`h-full ${fills[segment.tone]}`}
                  style={{ width: `${(segment.value / total) * 100}%` }}
                  title={`${segment.value} ${segment.label}`}
                />
              ))
          : null}
      </div>

      <ul className="flex flex-col gap-2">
        {segments.map((segment) => (
          <li key={segment.label} className="flex items-center justify-between gap-3 text-[13px]">
            <span className="flex min-w-0 items-center gap-2 text-muted">
              <span
                aria-hidden="true"
                className={`size-2 shrink-0 rounded-full ${fills[segment.tone]}`}
              />
              <span className="truncate">{segment.label}</span>
            </span>
            <span className="shrink-0 font-semibold tabular-nums text-foreground">
              {segment.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A ranked row: position, name, the figure, and its share of the leader. */
export function RankedRow({
  rank,
  title,
  meta,
  value,
  max,
  valueLabel,
}: {
  rank: number;
  title: string;
  meta?: string;
  value: number;
  max: number;
  valueLabel: string;
}) {
  const percent = max > 0 ? (value / max) * 100 : 0;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-secondary text-[11px] font-semibold tabular-nums text-muted">
          {rank}
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
          {title}
          {meta ? <span className="ml-1.5 text-[11px] font-normal text-muted">{meta}</span> : null}
        </span>
        <span className="shrink-0 text-[13px] font-semibold tabular-nums text-foreground">
          {valueLabel}
        </span>
      </div>
      <div className="ml-9 h-1.5 overflow-hidden rounded-full bg-surface-secondary">
        <div
          aria-hidden="true"
          className="h-full rounded-full bg-accent motion-safe:transition-[width] motion-safe:duration-500"
          style={{ width: `${Math.max(4, percent)}%` }}
        />
      </div>
    </div>
  );
}
