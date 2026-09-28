import { SearchField } from "@heroui/react/search-field";
import { Suspense } from "react";

import { BrowseCategories } from "@/components/marketplace/BrowseCategories";
import { ProductRail } from "@/components/marketplace/ProductRail";
import { SectionHeader } from "@/components/ui/atoms";
import { EventCard } from "@/components/cards/EventCard";
import { ProductCard } from "@/components/cards/ProductCard";
import { ShopCard } from "@/components/cards/ShopCard";
import { ButtonLink } from "@/components/ui/controls";
import { EmptyState, OpenLink } from "@/components/ui/feedback";
import { Icon } from "@/components/ui/Icon";
import { SearchForm } from "@/components/ui/SearchForm";
import { AdaptiveTint } from "@/components/visual/AdaptiveTint";
import { DepthLayer, GradientField, ThreeOrbs } from "@/components/visual/Atmosphere";
import { Letter3D } from "@/components/visual/Letter3D";
import { RotatingWord } from "@/components/visual/RotatingWord";
import { getCurrentUser } from "@/lib/auth";
import { buildCategoryTree, flattenCategoryTree, type CategoryNode } from "@/lib/categories";
import { categoryIconName } from "@/lib/catalog";
import { ContextNotice } from "@/components/visual/Rearrange";
import { formatNumber } from "@/lib/format";
import {
  getCategoryMarketplace,
  getMarketplaceCounts,
  getMarketplaceHome,
} from "@/lib/server/discovery";
import { listPlatformCategories } from "@/lib/server/stores";
import type { SessionUser } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Shop cards are the largest object on the page: identity, description, a
 * gallery of three listings and an action. They are wider than a product card
 * and never shrink to fit — extra shops continue off-screen.
 */
const SHOP_ITEM_CLASS = "w-[21rem] shrink-0 snap-start sm:w-[25rem] lg:w-[26rem]";
/** Events are a grid, not a rail: there are usually only a few, each is a date. */
const EVENT_GRID = "grid grid-cols-[repeat(auto-fill,minmax(17rem,1fr))] gap-4";

/**
 * The public home page.
 *
 * Three jobs, each with exactly one section:
 *
 * 1. **Category discovery** — the `Explore Categories` control. The catalogue is
 *    long and a shopper wants one part of it, so the categories live behind a
 *    popover instead of being printed across the page.
 * 2. **Product discovery** — *one* rail of real listings. There used to be five
 *    (featured, new, trending, food, more-new), all doing the same job under
 *    different headings; a marketplace front door reads better with one strong
 *    feed than with a stack of near-duplicates.
 * 3. **Shop discovery** — one rail of shop cards, each with its own photography,
 *    because every listing belongs to a seller worth finding.
 *
 * Choosing a category does not swap a heading: the feed, the shops *and* the
 * events are re-read for that segment, and the whole block re-enters as one
 * staggered, faintly tinted marketplace. When a segment has nothing in it the
 * page says so rather than inventing filler.
 */
export default async function MarketplaceHomePage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const [user, categories, params] = await Promise.all([
    getCurrentUser(),
    listPlatformCategories(),
    searchParams,
  ]);

  const requested = typeof params.category === "string" ? params.category : null;

  /*
   * The category **tree**, because the front door now follows it.
   *
   * The control offers the main categories, and the chosen one's own
   * subcategories beside it — so choosing Food enters a food environment rather
   * than dropping a label onto a product feed. An unknown slug is treated as "no
   * filter", so a stale link shows the normal marketplace rather than an error.
   */
  const categoryTree = buildCategoryTree(categories);
  const activeCategory = requested
    ? (flattenCategoryTree(categoryTree).find((category) => category.slug === requested) ?? null)
    : null;

  // The branch the shopper is standing in. A child has no children of its own to
  // offer here, so its parent's row stays and the child is what is marked.
  const narrowedChildren =
    activeCategory == null
      ? []
      : (activeCategory.children.length > 0
          ? activeCategory.children
          : (categoryTree.find((root) =>
              flattenCategoryTree([root]).some((node) => node.id === activeCategory.id),
            )?.children ?? []));

  return (
    <div className="relative isolate">
      {/* Hero — the welcome, and the shopper's one action: search. */}
      <section className="relative isolate overflow-hidden">
        {/* The hero's quiet environment: a light foundation, one soft tonal
            variation, a careful dark-purple depth span, and small geometric SVG
            accents. All four layers are out of flow at `-z-*` behind the copy,
            so they can never push or resize the content above them. */}
        <GradientField className="absolute inset-0 -z-20" opacity={0.85} />
        <DepthLayer className="absolute inset-0 -z-20" opacity={0.6} />
        {/* The three-orb motif, big, at the top right — the hero's one piece
            of decorative SVG. No other accent shares that corner. */}
        <ThreeOrbs className="ls-orb-float absolute -top-2 -right-10 -z-10 h-[24rem] w-[24rem] sm:top-2 sm:-right-16 sm:h-[34rem] sm:w-[34rem]" />

        <div className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 sm:py-28">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">
            LINK STORE
          </p>

          {/* The first line is a 3D element: extruded lettering in the accent
              trio, drawn as SVG so it reads as an object, not as text. */}
          <h1 className="mt-5 max-w-3xl">
            <Letter3D className="w-full max-w-[34rem] sm:max-w-[42rem]" text="Welcome to Link Store" />
          </h1>

          {/* The second line, small and designed: a compact chip where the
              category word turns through the accent trio. The promise, in
              miniature and always in motion — it never crowds the lettering. */}
          <p className="mt-4 inline-flex max-w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-full bg-surface px-3.5 py-1.5 text-[12.5px] font-medium text-muted shadow-elev-1 sm:text-[13px]">
            <span aria-hidden="true">
              Everything you sell,{" "}
              <RotatingWord words={["products", "fashion", "food", "tickets", "services"]} />, one{" "}
              <span className="font-semibold text-foreground">link</span> away.
            </span>
            <span className="sr-only">
              Everything you sell: products, fashion, food, tickets and services. One link away.
            </span>
          </p>

          <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-muted">
            Products, fashion, food, services, tickets, digital files — your whole world of selling
            lives at one beautiful address. Customers find everything you offer in one place and check
            out in seconds.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            {/* The hero's call to action: a neutral button with the accent trio
                running around its edge. */}
            {user ? (
              <ButtonLink className="ls-edge" href="/workspace" variant="primary" size="md">
                Open your workspace
              </ButtonLink>
            ) : (
              <ButtonLink className="ls-edge" href="/sign-up" variant="primary" size="md">
                Create your store
              </ButtonLink>
            )}
          </div>

          {/* Search is the shopper's own way in, and the header repeats it at
              desktop widths — so the hero keeps it and nothing else duplicates it. */}
          <SearchForm action="/search" className="mt-10 flex max-w-md items-center gap-2">
            <SearchField aria-label="Search the marketplace" name="q" variant="secondary">
              <SearchField.Group>
                <SearchField.SearchIcon />
                <SearchField.Input
                  className="w-full min-w-0"
                  placeholder="Search products, stores and events"
                />
                <SearchField.ClearButton />
              </SearchField.Group>
            </SearchField>
          </SearchForm>

          <Suspense fallback={<div className="mt-6 h-4 w-64 max-w-full rounded-md bg-surface-secondary/70" />}>
            <MarketplaceTotals />
          </Suspense>
        </div>
      </section>

      {/* Category discovery — one control, and the segment it currently means.
          Separated from the hero by tonal contrast and spacing alone. */}
      <section className="bg-surface-secondary/45">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-4 sm:px-6">
          <BrowseCategories
            activeName={activeCategory?.name ?? null}
            activeSlug={activeCategory?.slug ?? null}
            categories={categoryTree.map((category) => ({
              id: category.id,
              name: category.name,
              slug: category.slug,
              icon: category.icon,
            }))}
            children={narrowedChildren.map((category) => ({
              id: category.id,
              name: category.name,
              slug: category.slug,
              icon: category.icon,
            }))}
          />

          <p className="text-xs text-muted">
            {activeCategory ? (
              <>
                The marketplace reorganised around{" "}
                <span className="font-medium text-foreground">{activeCategory.name}</span>.
              </>
            ) : (
              "Pick a category to reorganise the marketplace around it, or browse everything."
            )}
          </p>
        </div>
      </section>

      {/* A quiet word when the marketplace turns to face a category. */}
      <ContextNotice
        message={activeCategory ? `Welcome to ${activeCategory.name}` : null}
        trigger={activeCategory?.slug ?? "all"}
      />

      {/*
        The marketplace itself, keyed on the segment so the whole block is
        replaced as one piece when the category changes: the new segment enters
        together (cards settling in sequence) instead of the page appearing to
        reload.
      */}
      <Suspense key={activeCategory?.id ?? "all"} fallback={<MarketplaceSkeleton />}>
        {activeCategory ? (
          <CategoryMarketplace category={activeCategory} />
        ) : (
          <HomeMarketplace user={user} />
        )}
      </Suspense>

      {/* How selling works — a plain, useful explanation, no decoration. */}
      <div className="mx-auto w-full max-w-7xl px-4 pb-16 sm:px-6">
        <section className="ls-deal-grid grid gap-6 pt-14 sm:grid-cols-3">
          {[
            {
              icon: "storefront" as const,
              title: "Create a storefront",
              body: "Pick a name and your shop opens at its own link. Live in seconds, nothing to install.",
            },
            {
              icon: "products" as const,
              title: "Add what you sell",
              body: "Products, menus, services, events and digital files all live in one catalogue.",
            },
            {
              icon: "creditCard" as const,
              title: "Get paid",
              body: "Checkout runs on Paystack and every payment is verified on the server before fulfilment.",
            },
          ].map((step) => (
            <div key={step.title} className="flex flex-col gap-2">
              <Icon name={step.icon} size={18} className="text-muted" />
              <p className="text-[13px] font-medium">{step.title}</p>
              <p className="text-xs leading-relaxed text-muted">{step.body}</p>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}

/** Live platform totals — real counts, or nothing at all. */
async function MarketplaceTotals() {
  const counts = await getMarketplaceCounts();

  if (counts.listings === 0 && counts.stores === 0 && counts.events === 0) return null;

  return (
    <p className="mt-6 text-xs tabular-nums text-muted">
      {formatNumber(counts.listings)} live{" "}
      {counts.listings === 1 ? "listing" : "listings"} · {formatNumber(counts.stores)}{" "}
      {counts.stores === 1 ? "store" : "stores"} · {formatNumber(counts.events)} upcoming{" "}
      {counts.events === 1 ? "event" : "events"}
    </p>
  );
}

/**
 * The whole marketplace: one product feed and one shop feed.
 *
 * Sections only appear when they have real content, so an empty marketplace
 * shows a single honest empty state rather than four headings over nothing.
 */
async function HomeMarketplace({ user }: { user: SessionUser | null }) {
  const home = await getMarketplaceHome();

  const hasAnything = home.listings.length > 0 || home.stores.length > 0 || home.events.length > 0;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-16 px-4 py-16 sm:px-6">
      {!hasAnything ? (
        <EmptyState
          icon="storefront"
          title="The marketplace is just getting started"
          description="No seller has published a listing yet, so there is genuinely nothing to show here rather than placeholder products. Create your storefront, add what you sell, and it appears on this page immediately."
          action={
            <ButtonLink href={user ? "/workspace" : "/sign-up"} variant="primary" size="sm">
              {user ? "Create your storefront" : "Create your account"}
            </ButtonLink>
          }
          secondaryAction={
            <ButtonLink href="/stores" variant="outline" size="sm">
              Open Shops
            </ButtonLink>
          }
        />
      ) : null}

      {home.listings.length > 0 ? (
        <section className="space-y-6">
          <SectionHeader
            title="Marketplace"
            description="The newest listings from sellers across Link Store."
            action={<OpenLink href="/products">Open Marketplace</OpenLink>}
          />
          <ProductRail label="Marketplace listings">
            {home.listings.map((listing) => (
              <ProductCard key={listing.id} listing={listing} showBuy />
            ))}
          </ProductRail>
        </section>
      ) : null}

      {home.stores.length > 0 ? (
        <section className="space-y-6">
          <SectionHeader
            title="Shops"
            description="Every listing belongs to a seller. These are the shops behind them."
            action={<OpenLink href="/stores">Open Shops</OpenLink>}
          />
          <ProductRail itemClassName={SHOP_ITEM_CLASS} label="Shops">
            {home.stores.map((store) => (
              <ShopCard key={store.id} store={store} />
            ))}
          </ProductRail>
        </section>
      ) : null}

      {home.events.length > 0 ? (
        <section className="space-y-6">
          <SectionHeader
            title="Upcoming events"
            description="Concerts, workshops and conferences with tickets on sale."
            action={<OpenLink href="/events">Open Events</OpenLink>}
          />
          <div className={EVENT_GRID}>
            {home.events.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

/**
 * The marketplace reorganised around one category.
 *
 * Same three jobs as the default page, restricted to the segment: the feed, the
 * shops that sell in it, and the events ticketed under it. The atmosphere is
 * sampled from the segment's own imagery, which is the only place the
 * black-and-white interface bends.
 */
async function CategoryMarketplace({ category }: { category: CategoryNode }) {
  const { listings, stores, events } = await getCategoryMarketplace(category.id);
  const tintSource = listings.find((listing) => listing.imageUrl)?.imageUrl ?? null;

  const isEmpty = listings.length === 0 && stores.length === 0 && events.length === 0;

  return (
    <div className="relative isolate">
      {/* Atmosphere: very faint, derived from this segment's own photography. */}
      {tintSource ? (
        <AdaptiveTint className="-z-10 h-[32rem]" src={tintSource} strength={0.85} />
      ) : null}

      <div className="mx-auto w-full max-w-7xl space-y-16 px-4 py-16 sm:px-6">
        <section className="space-y-6 motion-safe:animate-rise">
          <SectionHeader
            icon={categoryIconName(category)}
            title={category.name}
            description="Everything published in this category, newest first."
            action={<OpenLink href={`/products?category=${category.id}`}>Open Marketplace</OpenLink>}
          />

          {listings.length > 0 ? (
            <ProductRail label={`${category.name} listings`} stagger>
              {listings.map((listing) => (
                <ProductCard key={listing.id} listing={listing} showBuy />
              ))}
            </ProductRail>
          ) : null}
        </section>

        {stores.length > 0 ? (
          <section className="space-y-6 motion-safe:animate-rise">
            <SectionHeader
              title={`Shops selling ${category.name}`}
              description="Open a shop to see everything that seller offers."
              action={
                <OpenLink href={`/stores?category=${category.slug}`}>Open Shops</OpenLink>
              }
            />
            <ProductRail itemClassName={SHOP_ITEM_CLASS} label={`${category.name} shops`} stagger>
              {stores.map((store) => (
                <ShopCard key={store.id} store={store} />
              ))}
            </ProductRail>
          </section>
        ) : null}

        {events.length > 0 ? (
          <section className="space-y-6 motion-safe:animate-rise">
            <SectionHeader
              title={`${category.name} events`}
              description="Tickets on sale in this part of the marketplace."
              action={<OpenLink href="/events">Open Events</OpenLink>}
            />
            <div className={EVENT_GRID}>
              {events.map((event, index) => (
                <div
                  className="motion-safe:animate-settle"
                  key={event.id}
                  style={{ animationDelay: `${Math.min(index, 6) * 45}ms` }}
                >
                  <EventCard event={event} />
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {isEmpty ? (
          <EmptyState
            icon={categoryIconName(category)}
            title={`Nothing published in ${category.name} yet`}
            description="No seller has listed anything in this category so far. Choose another category above, or browse the whole marketplace."
            action={
              <ButtonLink href="/" variant="primary" size="sm">
                Browse everything
              </ButtonLink>
            }
            secondaryAction={
              <ButtonLink href={`/products?category=${category.id}`} variant="outline" size="sm">
                Open in browse
              </ButtonLink>
            }
          />
        ) : null}
      </div>
    </div>
  );
}

/**
 * The placeholder the marketplace area holds while a segment is loading: rail
 * shaped, so the page does not jump when the real cards arrive.
 */
function MarketplaceSkeleton() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-16 px-4 py-16 sm:px-6">
      {[0, 1].map((section) => (
        <div className="space-y-6" key={section}>
          <div className="space-y-2">
            <div className="h-4 w-40 rounded-md bg-surface-secondary" />
            <div className="h-3 w-64 max-w-full rounded-md bg-surface-secondary/70" />
          </div>
          <div className="no-scrollbar flex gap-4 overflow-hidden py-2">
            {[0, 1, 2, 3].map((card) => (
              <div
                className="flex w-[19rem] shrink-0 flex-col gap-3 sm:w-[21rem] lg:w-[22rem]"
                key={card}
              >
                <div className="aspect-4/3 w-full rounded-xl bg-surface-secondary" />
                <div className="h-3 w-24 rounded-md bg-surface-secondary/70" />
                <div className="h-4 w-3/4 rounded-md bg-surface-secondary" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
