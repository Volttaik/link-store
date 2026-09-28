"use client";

import { Tooltip } from "@heroui/react";

import { formatDate, formatNumber } from "@/lib/format";
import { formatMoney } from "@/lib/money";

/**
 * A compact column chart for a daily series.
 *
 * Built from NextUI's `Tooltip` plus Tailwind's own height scale — bar heights
 * are quantised into the available steps so no generated CSS or inline styles
 * are involved, and the chart plots exactly the values it is given.
 */
const BAR_STEPS = [
  "h-[3%]",
  "h-[10%]",
  "h-[18%]",
  "h-[26%]",
  "h-[34%]",
  "h-[42%]",
  "h-[50%]",
  "h-[58%]",
  "h-[66%]",
  "h-[74%]",
  "h-[82%]",
  "h-[90%]",
  "h-[97%]",
] as const;

export type TrendPoint = { day: string; value: number };

/**
 * How to format a point's value. A plain descriptor rather than a callback: a
 * server page cannot hand a function to a client component, and this keeps the
 * formatting rule serializable while staying in one place.
 */
export type TrendFormat =
  | { kind: "money"; currency: string }
  | { kind: "count"; unit?: string };

export function TrendChart({
  data,
  label,
  format,
  tone = "primary",
}: {
  data: TrendPoint[];
  label: string;
  format: TrendFormat;
  tone?: "primary" | "success" | "warning";
}) {
  const max = data.reduce((highest, point) => Math.max(highest, point.value), 0);

  const formatValue = (value: number) =>
    format.kind === "money"
      ? formatMoney(value, format.currency)
      : `${formatNumber(value)}${format.unit ? ` ${format.unit}` : ""}`;

  const toneClass = {
    primary: "bg-accent",
    success: "bg-success",
    warning: "bg-warning",
  }[tone];

  if (data.length === 0) {
    return <p className="text-sm text-muted">No data points to plot yet.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-40 items-end gap-1">
        {data.map((point) => {
          const step = max <= 0 || point.value <= 0 ? 0 : Math.max(1, Math.round((point.value / max) * 12));

          return (
            <Tooltip key={point.day}>
              <div className="flex h-full flex-1 cursor-default flex-col justify-end">
                <div
                  className={`w-full rounded-t ${point.value <= 0 ? "bg-default-hover" : toneClass} ${BAR_STEPS[step]}`}
                />
              </div>
              <Tooltip.Content placement="top">
                <div className="px-1 py-0.5 text-xs">
                  <p className="font-medium tabular-nums">{formatValue(point.value)}</p>
                  <p className="text-muted">{formatDate(point.day)}</p>
                </div>
              </Tooltip.Content>
            </Tooltip>
          );
        })}
      </div>

      <div className="flex items-center justify-between text-xs text-muted">
        <span>{formatDate(data[0]?.day)}</span>
        <span className="uppercase tracking-wide">{label}</span>
        <span>{formatDate(data[data.length - 1]?.day)}</span>
      </div>
    </div>
  );
}
