import { Card } from "@heroui/react/card";
import { Link } from "@heroui/react/link";

import { InventoryAdjust } from "@/components/workspace/InventoryAdjust";
import { PageHeader, StatusChip } from "@/components/ui/atoms";
import { EmptyState } from "@/components/ui/feedback";
import { Icon } from "@/components/ui/Icon";
import { requireStore } from "@/lib/auth";
import {
  listInventoryMovements,
  listListings,
  listLowStock,
} from "@/lib/server/listings";
import { getStoreSettings } from "@/lib/server/stores";
import { formatDateTime, formatNumber, humanize } from "@/lib/format";

export const metadata = { title: "Inventory" };

export const dynamic = "force-dynamic";

/**
 * Inventory is one question — what is about to stop selling? — so this page is
 * built around stock *levels* rather than a list of facts about stock.
 *
 * Each listing gets a bar you can read at a glance: how much is left, where the
 * seller's own low-stock line sits, and how close the two are. The listings that
 * have crossed that line are lifted out of the list and shown first, because
 * they are the only ones that need doing anything about.
 */
export default async function InventoryPage() {
  const { store } = await requireStore();
  const settings = await getStoreSettings(store.id);
  const threshold = Number(settings.low_stock_threshold);

  const [tracked, , movements] = await Promise.all([
    listListings({ storeId: store.id, inStockOnly: false, limit: 100 }),
    listLowStock(store.id, threshold),
    listInventoryMovements(store.id, 25),
  ]);

  const stocked = tracked.filter((listing) => listing.trackInventory);

  const out = stocked.filter((listing) => listing.stock <= 0);
  const low = stocked.filter((listing) => listing.stock > 0 && listing.stock <= threshold);
  const healthy = stocked.filter((listing) => listing.stock > threshold);
  const attention = [...out, ...low];

  const units = stocked.reduce((sum, listing) => sum + listing.stock, 0);
  const totalTracked = stocked.length;

  // One scale for every bar on the page, so a bar can be compared to the bar
  // above it. The threshold is always visible on the scale, even when stock is
  // far above it.
  const scale = Math.max(
    ...stocked.map((listing) => listing.stock),
    threshold * 3,
    1,
  );

  return (
    <div className="space-y-8">
      <PageHeader
        title="Inventory"
        description={`Stock for the ${formatNumber(totalTracked)} listings that track it. Low means at or below ${formatNumber(threshold)}.`}
      />

      {/* The state of the whole shelf in one strip: three counts and a bar that
          shows what share of the shelf each one is. */}
      <div className="rounded-2xl ls-elev-2 bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="flex flex-wrap gap-x-8 gap-y-4">
            <Health label="Units on hand" value={formatNumber(units)} />
            <Health
              label="Healthy"
              tone="success"
              value={formatNumber(healthy.length)}
            />
            <Health label="Low" tone="warning" value={formatNumber(low.length)} />
            <Health label="Sold out" tone="danger" value={formatNumber(out.length)} />
          </div>

          <p className="max-w-xs text-[12.5px] leading-relaxed text-muted">
            Every change is recorded as a movement below, so stock is always traceable back to
            the sale or the correction that caused it.
          </p>
        </div>

        {totalTracked > 0 ? (
          <div className="mt-5 flex h-2.5 w-full overflow-hidden rounded-full bg-surface-secondary">
            {/* Segments in the order that matters: what is fine first, what is
                not, then what has stopped. */}
            {[
              { count: healthy.length, className: "bg-success" },
              { count: low.length, className: "bg-warning" },
              { count: out.length, className: "bg-danger" },
            ].map((segment, index) =>
              segment.count === 0 ? null : (
                <span
                  className={segment.className}
                  key={index}
                  style={{ width: `${(segment.count / totalTracked) * 100}%` }}
                />
              ),
            )}
          </div>
        ) : null}
      </div>

      {/* The only listings that need anything doing, lifted to the top. */}
      {attention.length > 0 ? (
        <section className="space-y-3">
          <div className="flex items-center gap-2.5">
            <span className="flex size-7 items-center justify-center rounded-lg bg-warning/15 text-warning">
              <Icon name="alert" size={15} />
            </span>
            <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
              Needs attention
            </h2>
            <span className="text-[13px] text-muted">
              {formatNumber(attention.length)} of {formatNumber(totalTracked)}
            </span>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {attention.map((listing) => (
              <StockCard
                key={listing.id}
                listing={listing}
                scale={scale}
                threshold={threshold}
              />
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        <div className="flex items-center gap-2.5">
          <span className="flex size-7 items-center justify-center rounded-lg bg-surface-secondary text-muted">
            <Icon name="products" size={15} />
          </span>
          <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
            {attention.length > 0 ? "Everything tracked" : "Tracked stock"}
          </h2>
          <span className="text-[13px] text-muted">{formatNumber(totalTracked)} listings</span>
        </div>

        {totalTracked === 0 ? (
          <Card className="ls-elev-2">
            <Card.Content className="p-6">
              <EmptyState
                compact
                description="Turn on “Track stock” when creating or editing a listing and it appears here with its own level."
                title="No tracked inventory"
              />
            </Card.Content>
          </Card>
        ) : (
          <Card className="overflow-hidden ls-elev-2">
            {stocked
              .slice()
              // Lowest first: the shelf sorted the way the risk is.
              .sort((a, b) => a.stock - b.stock)
              .map((listing, index) => (
                <div
                  className={`flex flex-wrap items-center gap-4 px-5 py-4 ${
                    index > 0 ? "mt-1" : ""
                  }`}
                  key={listing.id}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        className="truncate text-[15px] font-medium text-foreground no-underline"
                        href={`/workspace/listings/${listing.id}`}
                      >
                        {listing.title}
                      </Link>
                      {listing.status !== "active" ? (
                        <StatusChip label={humanize(listing.status)} tone="default" />
                      ) : null}
                    </div>

                    <StockBar
                      className="mt-3 max-w-md"
                      scale={scale}
                      stock={listing.stock}
                      threshold={threshold}
                    />
                  </div>

                  <StockFigure scale={scale} stock={listing.stock} threshold={threshold} />

                  <InventoryAdjust listingId={listing.id} title={listing.title} variants={[]} />
                </div>
              ))}
          </Card>
        )}
      </section>

      {/* Movements are a history, so they read as a timeline rather than a table:
          a line down the left, each change hanging off it. */}
      <section className="space-y-3">
        <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
          Movement history
        </h2>

        {movements.length === 0 ? (
          <Card className="ls-elev-2">
            <Card.Content className="p-6">
              <EmptyState
                compact
                description="Restocks, sales and corrections are listed here as they happen."
                title="No stock movements yet"
              />
            </Card.Content>
          </Card>
        ) : (
          <div className="relative pl-6">
            {/* The spine. */}
            <span
              aria-hidden="true"
              className="absolute top-2 bottom-2 left-[5px] w-px bg-border"
            />

            <div className="space-y-5">
              {movements.map((movement) => {
                const up = movement.delta > 0;
                return (
                  <div className="relative" key={movement.id}>
                    <span
                      aria-hidden="true"
                      className={`absolute top-1.5 -left-6 size-2.5 rounded-full ring-4 ring-background ${
                        up ? "bg-success" : "bg-danger"
                      }`}
                    />

                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <p className="min-w-0 text-[14.5px] font-medium text-foreground">
                        {movement.title}
                      </p>
                      <p
                        className={`shrink-0 text-[14.5px] font-semibold tabular-nums ${
                          up ? "text-success" : "text-danger"
                        }`}
                      >
                        {up ? "+" : ""}
                        {formatNumber(movement.delta)}
                      </p>
                    </div>

                    <p className="mt-0.5 text-[12.5px] text-muted">
                      {humanize(movement.reason)}
                      {movement.note ? ` · ${movement.note}` : ""} ·{" "}
                      {formatNumber(movement.stock_after)} left ·{" "}
                      {formatDateTime(movement.created_at)}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

/** One figure in the shelf-health strip. */
function Health({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const colour =
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-warning"
        : tone === "danger"
          ? "text-danger"
          : "text-foreground";

  return (
    <div>
      <p className={`text-[20px] leading-none font-semibold tabular-nums ${colour}`}>{value}</p>
      <p className="mt-1.5 text-[12.5px] text-muted">{label}</p>
    </div>
  );
}

/**
 * How much is left, against the seller's own low-stock line.
 *
 * The bar is measured on one page-wide scale and the threshold is drawn on it,
 * so "half full" means the same thing on every row and you can see the line
 * being crossed rather than being told about it.
 */
function StockBar({
  stock,
  threshold,
  scale,
  className = "",
}: {
  stock: number;
  threshold: number;
  scale: number;
  className?: string;
}) {
  const filled = Math.max(0, Math.min(100, (stock / scale) * 100));
  const mark = Math.max(0, Math.min(100, (threshold / scale) * 100));

  const colour =
    stock <= 0 ? "bg-danger" : stock <= threshold ? "bg-warning" : "bg-foreground/70";

  return (
    <div className={`relative h-2.5 w-full rounded-full bg-surface-secondary ${className}`}>
      <span
        className={`absolute inset-y-0 left-0 rounded-full ${colour}`}
        style={{ width: `${filled}%` }}
      />
      {/* Where "low" begins. */}
      <span
        aria-hidden="true"
        className="absolute -top-1 -bottom-1 w-0.5 rounded-full bg-muted"
        style={{ left: `${mark}%` }}
        title={`Low-stock line: ${threshold}`}
      />
    </div>
  );
}

/** The number beside the bar, with the state written out. */
function StockFigure({
  stock,
  threshold,
  scale,
}: {
  stock: number;
  threshold: number;
  scale: number;
}) {
  const state =
    stock <= 0 ? "Sold out" : stock <= threshold ? "Low" : "Healthy";
  const tone = stock <= 0 ? "text-danger" : stock <= threshold ? "text-warning" : "text-success";

  return (
    <div className="min-w-24 text-right">
      <p className={`text-[15px] font-semibold tabular-nums ${tone}`}>{formatNumber(stock)}</p>
      <p className="mt-0.5 text-[12px] text-muted">{state}</p>
      {/* Kept honest: the scale is shared, so say what the maximum is. */}
      <p className="sr-only">{`Out of a scale of ${scale}`}</p>
    </div>
  );
}

/** A listing that needs attention: the bar, the figure, and the fix. */
function StockCard({
  listing,
  threshold,
  scale,
}: {
  listing: {
    id: string;
    title: string;
    stock: number;
    categoryName: string | null;
    status: string;
  };
  threshold: number;
  scale: number;
}) {
  const soldOut = listing.stock <= 0;

  return (
    <Card
      className={`border ${
        soldOut ? "border-danger/30 bg-danger/[0.03]" : "border-warning/30 bg-warning/[0.03]"
      }`}
    >
      <Card.Content className="gap-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <Link
              className="truncate text-[15px] font-semibold text-foreground no-underline"
              href={`/workspace/listings/${listing.id}`}
            >
              {listing.title}
            </Link>
            <p className="mt-1 truncate text-[12.5px] text-muted">
              {listing.categoryName ?? "Uncategorised"}
              {listing.status !== "active" ? ` · ${humanize(listing.status)}` : ""}
            </p>
          </div>

          <StatusChip
            label={soldOut ? "Sold out" : "Low stock"}
            tone={soldOut ? "danger" : "warning"}
          />
        </div>

        <StockBar scale={scale} stock={listing.stock} threshold={threshold} />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[13px] text-muted">
            <span className={`font-semibold ${soldOut ? "text-danger" : "text-warning"}`}>
              {formatNumber(listing.stock)}
            </span>{" "}
            on hand · low line {formatNumber(threshold)}
          </p>

          <InventoryAdjust listingId={listing.id} title={listing.title} variants={[]} />
        </div>
      </Card.Content>
    </Card>
  );
}
