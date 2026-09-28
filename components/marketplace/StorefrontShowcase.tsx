"use client";

/**
 * The storefront catalogue — one shop, its sections, and the reorganisation
 * between them.
 *
 * The shop leads with its primary design type (the seller's choice in Settings,
 * or whichever part of their catalogue is actually biggest) and only shows the
 * sections it really supports — a restaurant gets Food, not four empty tabs.
 *
 * Choosing a section does not reload anything: the interface reorganises itself
 * around the choice. Cards that stay glide to their new places, cards that
 * arrive fade up, cards that leave fade out where they stood — and a quiet
 * welcome line names the section you entered. The same machinery runs the
 * in-section filters, so filtering feels like the same reorganisation as
 * switching.
 *
 * Each kind of section *shows its wares the way that wares deserve*: food reads
 * as a menu (rows, prices up front), products as a shelf (large cards with
 * quick view), services as offerings (what is included, how to book), events as
 * posters. One system, four emphases — never four different websites.
 */

import { Button } from "@heroui/react/button";
import { Link } from "@heroui/react/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";

import { EventCard } from "@/components/cards/EventCard";
import { ProductCard } from "@/components/cards/ProductCard";
import { CardBuyButton } from "@/components/marketplace/CardBuyButton";
import { MediaPlaceholder, PriceTag } from "@/components/ui/atoms";
import { ButtonLink } from "@/components/ui/controls";
import { Icon } from "@/components/ui/Icon";
import { ContextNotice, RearrangeGroup, type RearrangeItem } from "@/components/visual/Rearrange";
import { tintTreatment, useImagePalette } from "@/components/visual/AdaptiveTint";
import { listingTypeMeta } from "@/lib/catalog";
import { formatNumber } from "@/lib/format";
import type { EventCardData, ListingCardData } from "@/lib/types";

type ShopSection = {
  design: string;
  label: string;
  welcomeLabel: string;
  presentation: "menu" | "shelf" | "services" | "posters";
  items: ListingCardData[];
  categories: Array<{ name: string; count: number }>;
};

/** One stop in the section selector: what it is called and what it holds. */
type Segment = {
  key: string;
  design: string;
  label: string;
  welcomeLabel: string;
  presentation: "menu" | "shelf" | "services" | "posters";
  count: number;
  kind: "listings" | "events";
  items: ListingCardData[] | EventCardData[];
  categories: Array<{ name: string; count: number }>;
};

/** The filter that means "the whole section" — never a real category. */
const ALL_CATEGORIES = "__all";

/** Catalogue order, so every shop's sections read consistently. */
const DESIGN_ORDER = ["food", "products", "services", "digital", "rentals", "events"];

/**
 * A menu row — food presented like a menu line: the dish, a word about it,
 * the price where the eye lands, and the way to order it right there.
 */
function MenuRow({ listing }: { listing: ListingCardData }) {
  const meta = listingTypeMeta(listing.type);
  const soldOut = listing.trackInventory && listing.stock <= 0;

  return (
    <article className="ls-elev-1 flex items-center gap-3 rounded-2xl border border-border/50 bg-surface p-2.5 transition-colors hover:border-border">
      <Link
        aria-label={listing.title}
        className="media-frame size-16 shrink-0 overflow-hidden rounded-xl bg-surface-secondary no-underline"
        href={`/listing/${listing.id}`}
      >
        {listing.imageUrl ? (
          <img
            alt={listing.title}
            className="h-full w-full object-cover"
            loading="lazy"
            src={listing.imageUrl}
          />
        ) : (
          <MediaPlaceholder label={meta.label} />
        )}
      </Link>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Link
          className="truncate text-sm font-semibold text-foreground no-underline hover:underline"
          href={`/listing/${listing.id}`}
        >
          {listing.title}
        </Link>
        <p className="truncate text-xs text-muted">
          {listing.categoryName ?? meta.label}
          {soldOut ? " · Sold out" : ""}
        </p>
        <PriceTag amount={listing.price} currency={listing.currency} compareAt={listing.compareAtPrice} />
      </div>

      <div className="w-28 shrink-0">
        <CardBuyButton
          eventId={listing.eventId}
          listingId={listing.id}
          soldOut={soldOut}
          type={listing.type}
          variantCount={listing.variantCount}
        />
      </div>
    </article>
  );
}

/**
 * The storefront's sections.
 *
 * The selector is one compact horizontal line — "Food Products Services Events"
 * — never a screen of large buttons. Only sections the shop really supports
 * appear, and only filters that mean something inside the chosen section.
 */
export function StorefrontShowcase({
  storeName,
  sections,
  events,
  designType,
}: {
  storeName: string;
  sections: ShopSection[];
  events: EventCardData[];
  /** The shop's primary design type — the section it leads with. */
  designType?: string;
}) {
  const segments: Segment[] = useMemo(() => {
    const list: Segment[] = sections.map((section) => ({
      key: section.design,
      design: section.design,
      label: section.label,
      welcomeLabel: section.welcomeLabel,
      presentation: section.presentation,
      count: section.items.length,
      kind: "listings",
      items: section.items,
      categories: section.categories,
    }));

    if (events.length > 0) {
      list.push({
        key: "events",
        design: "events",
        label: "Events",
        welcomeLabel: "Events",
        presentation: "posters",
        count: events.length,
        kind: "events",
        items: events,
        categories: [],
      });
    }

    // The primary design type leads; the rest keep the catalogue's order.
    return list.sort((a, b) => {
      const rank = (design: string) =>
        design === designType ? -1 : DESIGN_ORDER.indexOf(design);
      return rank(a.design) - rank(b.design);
    });
  }, [sections, events, designType]);

  const leadKey = segments.find((segment) => segment.design === designType)?.key ?? segments[0]?.key;

  const [activeKey, setActiveKey] = useState<string | null>(leadKey ?? null);
  const [activeCategory, setActiveCategory] = useState<string>(ALL_CATEGORIES);
  const [preview, setPreview] = useState<ListingCardData | null>(null);

  // Keep the choice honest when the catalogue changes underneath it: a section
  // that no longer exists falls back to the shop's lead section.
  useEffect(() => {
    if (!activeKey || !segments.some((segment) => segment.key === activeKey)) {
      setActiveKey(leadKey ?? null);
      setActiveCategory(ALL_CATEGORIES);
    }
  }, [segments, activeKey, leadKey]);

  const active = segments.find((segment) => segment.key === activeKey) ?? segments[0] ?? null;

  /*
   * Focus UI: the atmosphere around the selector follows what is being looked
   * at. The lead image of the active section decides the hue; the chip wash and
   * hairline borrow it at low strength while every label keeps its own contrast.
   */
  const atmosphereSrc =
    active?.kind === "events"
      ? (active.items as EventCardData[]).find((event) => event.coverImageUrl)?.coverImageUrl ?? null
      : (active?.items as ListingCardData[] | undefined)?.find((item) => item.imageUrl)?.imageUrl ?? null;
  const palette = useImagePalette(atmosphereSrc);
  const atmosphere = palette ? tintTreatment(palette, 0.7) : null;
  const atmosphereStyle = atmosphere
    ? ({
        "--image-hue": String(Math.round(atmosphere.hue)),
        "--image-saturation": `${atmosphere.saturation}%`,
        "--image-lightness": `${atmosphere.lightness}%`,
      } as CSSProperties)
    : undefined;

  /** The cards on the floor right now — the section, narrowed by its filter. */
  const visible = useMemo(() => {
    if (!active) return [];
    if (active.kind === "events") return active.items;
    if (activeCategory === ALL_CATEGORIES) return active.items;
    return (active.items as ListingCardData[]).filter(
      (item) => item.categoryName === activeCategory,
    );
  }, [active, activeCategory]);

  const rearrangeItems: RearrangeItem[] = useMemo(() => {
    if (!active) return [];

    if (active.kind === "events") {
      return (visible as EventCardData[]).map((event) => ({
        key: `event-${event.id}`,
        node: <EventCard event={event} />,
      }));
    }

    const listings = visible as ListingCardData[];

    if (active.presentation === "menu") {
      return listings.map((listing) => ({
        key: listing.id,
        node: <MenuRow listing={listing} />,
      }));
    }

    return listings.map((listing) => ({
      key: listing.id,
      node: (
        <div className="group/card relative h-full">
          <ProductCard listing={listing} showBuy showStore={false} />
          <button
            type="button"
            onClick={() => setPreview(listing)}
            className="absolute top-3 right-3 z-10 flex items-center gap-1.5 rounded-full ls-elev-2 bg-surface px-3 py-1.5 text-[11.5px] font-medium text-foreground opacity-0 shadow-elev-2 transition-opacity group-hover/card:opacity-100 focus-visible:opacity-100"
          >
            <Icon name="eye" size={13} />
            Quick view
          </button>
        </div>
      ),
    }));
  }, [active, visible]);

  // Quick view closes on Escape and locks the page behind it.
  useEffect(() => {
    if (!preview) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreview(null);
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [preview]);

  if (segments.length === 0 || !active) return null;

  const gridClass =
    active.presentation === "menu"
      ? "grid gap-2.5 sm:grid-cols-2"
      : active.presentation === "services"
        ? "grid gap-4 sm:grid-cols-2"
        : "grid gap-4 sm:grid-cols-2 lg:grid-cols-3";

  return (
    <div className="space-y-6" style={atmosphereStyle}>
      {/*
        The section selector: one compact horizontal line. The active stop takes
        the atmosphere of what is being viewed (Focus UI) — decorative only, the
        label keeps its own contrast.
      */}
      <div className="flex flex-col gap-2.5">
        <div
          aria-label={`Sections of ${storeName}`}
          className="no-scrollbar -mx-1 flex flex-nowrap items-center gap-1.5 overflow-x-auto px-1 pb-1"
          role="group"
        >
          {segments.map((segment) => {
            const isActive = segment.key === active.key;
            return (
              <button
                aria-pressed={isActive}
                className={`ls-focus-ring shrink-0 rounded-full px-3.5 py-1.5 text-[12.5px] font-medium whitespace-nowrap transition-colors ${
                  isActive
                    ? "ls-atmosphere-chip text-foreground"
                    : "text-muted hover:bg-surface-secondary/60 hover:text-foreground"
                }`}
                key={segment.key}
                onClick={() => {
                  if (segment.key === active.key) return;
                  setActiveKey(segment.key);
                  setActiveCategory(ALL_CATEGORIES);
                }}
                type="button"
              >
                {segment.label}
                <span className={`ml-1.5 tabular-nums ${isActive ? "opacity-70" : "opacity-60"}`}>
                  {formatNumber(segment.count)}
                </span>
              </button>
            );
          })}
        </div>

        {/* Inside a section, only the filters that section can actually answer. */}
        {active.kind === "listings" && active.categories.length > 1 ? (
          <div
            aria-label={`Filter ${active.label}`}
            className="no-scrollbar -mx-1 flex flex-nowrap items-center gap-1.5 overflow-x-auto px-1"
            role="group"
          >
            {[{ name: ALL_CATEGORIES, count: active.count }, ...active.categories].map((category) => {
              const isActive = category.name === activeCategory;
              return (
                <button
                  aria-pressed={isActive}
                  className={`ls-focus-ring shrink-0 rounded-full border px-2.5 py-1 text-[11.5px] whitespace-nowrap transition-colors ${
                    isActive
                      ? "border-accent/40 bg-accent/10 font-medium text-foreground"
                      : "border-border/50 text-muted hover:border-border hover:text-foreground"
                  }`}
                  key={category.name}
                  onClick={() => setActiveCategory(category.name)}
                  type="button"
                >
                  {category.name === ALL_CATEGORIES ? "All" : category.name}
                  <span className="ml-1 opacity-60 tabular-nums">{formatNumber(category.count)}</span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      {/* The quiet welcome when the interface turns to face a new section. */}
      <ContextNotice
        message={
          activeCategory !== ALL_CATEGORIES
            ? `Filtered to ${activeCategory} in ${active.label}`
            : `Welcome to the ${active.welcomeLabel} section of ${storeName}`
        }
        showOnMount={false}
        trigger={`${active.key}:${activeCategory}`}
      />

      <div>
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">{active.label}</h2>
            <p className="mt-1 text-sm text-muted">
              {activeCategory !== ALL_CATEGORIES
                ? `${formatNumber(visible.length)} of ${formatNumber(active.count)} in ${activeCategory}`
                : `${formatNumber(active.count)} ${active.count === 1 ? "item" : "items"} from ${storeName}`}
            </p>
          </div>
        </div>

        {rearrangeItems.length === 0 ? (
          <p className="rounded-2xl border border-border/50 bg-surface-secondary/40 px-4 py-8 text-center text-sm text-muted">
            Nothing here under {activeCategory} yet.
          </p>
        ) : (
          <RearrangeGroup
            className={gridClass}
            itemClassName="h-full"
            items={rearrangeItems}
          />
        )}
      </div>

      {/* The expanded product: the same card, scaled into a larger surface. */}
      {preview ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/45 p-0 sm:items-center sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label={preview.title}
          onClick={() => setPreview(null)}
        >
          <div
            className="w-full max-w-3xl overflow-hidden rounded-t-3xl ls-elev-2 bg-surface shadow-2xl motion-safe:animate-rise sm:rounded-3xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="grid gap-0 sm:grid-cols-2">
              {/* The expanded product's photograph, clipped by the media system
                  like every other image on the platform. */}
              <div className="media-frame-lg aspect-4/3 w-full overflow-hidden bg-surface-secondary sm:aspect-auto sm:h-full">
                {preview.imageUrl ? (
                  <img alt={preview.title} className="h-full w-full object-cover" src={preview.imageUrl} />
                ) : (
                  <div className="flex h-full min-h-48 w-full items-center justify-center text-muted">
                    <Icon name="image" size={22} />
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-4 p-6">
                <div className="flex items-start justify-between gap-3">
                  <span className="text-[11px] font-medium tracking-wide text-muted uppercase">
                    {preview.categoryName ?? listingTypeMeta(preview.type).label}
                  </span>
                  <button
                    type="button"
                    aria-label="Close"
                    onClick={() => setPreview(null)}
                    className="rounded-full p-1 text-muted transition-colors hover:bg-surface-secondary hover:text-foreground"
                  >
                    <Icon name="x" size={16} />
                  </button>
                </div>

                <h3 className="text-xl font-semibold tracking-tight">{preview.title}</h3>

                <PriceTag amount={preview.price} currency={preview.currency} compareAt={preview.compareAtPrice} />

                <p className="text-sm text-muted">
                  {preview.trackInventory
                    ? preview.stock > 0
                      ? `${formatNumber(preview.stock)} in stock`
                      : "Out of stock"
                    : "Available to order"}
                </p>

                <div className="mt-auto flex flex-col gap-2 pt-2 sm:flex-row">
                  <ButtonLink
                    className="flex-1"
                    href={`/listing/${preview.id}`}
                    variant="primary"
                  >
                    View full product
                  </ButtonLink>
                  <Button
                    variant="secondary"
                    onClick={() => setPreview(null)}
                    className="sm:w-auto"
                  >
                    Keep browsing
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
