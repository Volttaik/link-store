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
import { RushFeatureCube } from "@/components/visual/RushFeatureCube";
import { AdaptiveTint } from "@/components/visual/AdaptiveTint";
import { getCurrentUser } from "@/lib/auth";
import { buildCategoryTree, flattenCategoryTree, type CategoryNode } from "@/lib/categories";
import { categoryIconName } from "@/lib/catalog";
import { ContextNotice } from "@/components/visual/Rearrange";
import {
  getCategoryMarketplace,
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
const SHOP_ITEM_CLASS = "w-[calc(100vw-3rem)] shrink-0 snap-start sm:w-[36rem] lg:w-[46rem]";
/** Events are a grid, not a rail: there are usually only a few, each is a date. */
const EVENT_GRID = "grid grid-cols-1 gap-10 2xl:grid-cols-2";

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


  return (
    <div className="relative isolate">
      {/* Rush Cart: a short discovery path that arrives, then rests. */}
      <section className="rush-hero relative isolate mx-auto grid max-w-7xl items-center gap-8 px-4 py-9 sm:px-6 sm:py-12 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="rush-atmosphere pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden="true"><span className="rush-orb rush-orb-one" /></div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Rush Cart</p>
          <div className="rush-headline relative mt-4 max-w-xl"><h1 className="rush-gradient rush-brand-headline">Get what you want<br /><span className="rush-headline-finish">quick and easy.</span></h1><span className="rush-trail" aria-hidden="true" /></div>
          <SearchForm action="/search" className="mt-6 flex max-w-lg items-center gap-2" buttonClassName="min-h-12 rounded-full px-5" label="Find it">
            <label className="flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-full bg-surface-secondary px-4 ring-1 ring-transparent focus-within:ring-accent"><Icon name="search" size={18} className="shrink-0 text-muted" /><input aria-label="Search the marketplace" name="q" type="search" enterKeyHint="search" placeholder="What are you looking for?" className="min-w-0 flex-1 bg-transparent py-3 text-base outline-none" /></label>
          </SearchForm>
          <div className="mt-5 flex flex-wrap gap-3"><ButtonLink href="/products" variant="primary" className="rounded-full">Explore Marketplace<Icon name="arrowRight" size={16} /></ButtonLink><ButtonLink href="/stores" variant="ghost" className="rounded-full">Find a shop</ButtonLink></div>
        </div>
        <RushFeatureCube />
      </section>

      {/* Category discovery — one control, and the segment it currently means.
          Separated from the hero by tonal contrast and spacing alone. */}
      <section>
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-4 sm:px-6">
          <BrowseCategories
            activeSlug={activeCategory?.slug ?? null}
            categories={flattenCategoryTree(categoryTree).map((category) => ({
              id: category.id,
              name: category.name,
              slug: category.slug,
              icon: category.icon,
            }))}
          />

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
              body: "Your products live in one catalogue. Events bring them together into curated collections.",
            },
            {
              icon: "creditCard" as const,
              title: "Get paid",
              body: "Secure checkout with Paystack. Receive confirmed orders and keep buyers updated.",
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
          description="Discover new products as stores open. Ready to sell? Create your storefront and publish your first product."
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
            description="Good finds from independent shops across Rush Cart."
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
            title="Events"
            description="Product collections from shops on Rush Cart."
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
              
              action={
                <OpenLink href={`/stores?category=${category.slug}`}>Open Shops</OpenLink>
              }
            />
            <ProductRail itemClassName={SHOP_ITEM_CLASS} label={`${category.name} shops`}>
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
              description="Curated product collections in this category."
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
