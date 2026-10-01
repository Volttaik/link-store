"use client";

import Link from "next/link";
import { useTransition } from "react";
import { ShopSearch } from "@/components/marketplace/ShopSearch";
import { PaginationBar } from "@/components/marketplace/BrowseFilters";
import { BrowseCategories } from "@/components/marketplace/BrowseCategories";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ProductCard } from "@/components/cards/ProductCard";
import { EventCard } from "@/components/cards/EventCard";
import { flattenCategoryTree, type CategoryNode } from "@/lib/categories";
import type { EventCardData, ListingCardData } from "@/lib/types";

type Section = { design: string; label: string; items: ListingCardData[] };
export function StorefrontShowcase({ storeName, sections, events, categories, results, total, page, currency, designType, composition = "studio" }: {
  results: ListingCardData[]; total: number; page: number; currency: string;
  storeName: string; sections: Section[]; events: EventCardData[]; categories: CategoryNode[]; designType?: string; composition?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const products = sections.flatMap(section => section.items);
  const category = params.get("category") ?? "all";
  const [pending, startTransition] = useTransition();
  const search = params.get("q") ?? "";
  const visible = results;
  const minimum = params.get("min") ?? "";
  const maximum = params.get("max") ?? "";
  const stock = params.get("stock") === "1";
  const edit = products.filter(product => product.isFeatured).slice(0, 3);
  const picks = edit.length ? edit : products.slice(0, 3);
  const filtering = category !== "all" || Boolean(search || minimum || maximum || stock);
  const update = (patch: Record<string, string | null>, replace = false) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(patch)) { if (!value || value === "all") next.delete(key); else next.set(key, value); }
    next.delete("page");
    startTransition(() => {
      const href = `${pathname}${next.size ? `?${next}` : ""}`;
      if (replace) router.replace(href, { scroll: false }); else router.push(href, { scroll: false });
    });
  };
  const collections = events.length ? <section id="collections" className="scroll-mt-24 space-y-6 pt-4" aria-label="Drops and collections">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs uppercase tracking-[0.18em] text-muted">Curated by {storeName}</p><h2 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">Drops & collections</h2></div><p className="max-w-xs text-sm text-muted">A closer look at the products that belong together.</p></div>
    <div className="grid min-w-0 gap-8 2xl:grid-cols-2">{events.map(event => <EventCard key={event.id} event={event} showProductCount={false} />)}</div>
  </section> : null;
  return <div className="space-y-10 sm:space-y-12">
    <div className="min-w-0 space-y-4" aria-label="Shop browsing">
      <ShopSearch search={search} category={category} min={minimum} max={maximum} stock={stock} currency={currency} categories={flattenCategoryTree(categories).filter(node => !node.own)} onUpdate={update} />
      <BrowseCategories categories={flattenCategoryTree(categories).filter(node => !node.own)} activeSlug={category} valueKey="id" label={`Categories in ${storeName}`} />
    </div>
    {designType === "events" ? collections : null}
    {!filtering && picks.length ? <section className="store-edit space-y-5" aria-label="The store edit">
      <div className="flex items-end justify-between gap-4"><div><p className="text-xs uppercase tracking-[0.18em] text-muted">Selected for you</p><h2 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">The {storeName} edit</h2></div><a href="#shop-catalogue" className="shrink-0 py-3 text-sm font-medium">Browse all ↓</a></div>
      <div className={`store-edit-grid grid items-start gap-5 ${composition === "editorial" ? "md:grid-cols-[1.25fr_1fr_1fr]" : "md:grid-cols-3"}`}>
        {picks.map((product, index) => <div key={product.id} className={`min-w-0 ${composition === "editorial" && index === 1 ? "md:pt-12" : composition === "gallery" && index === 2 ? "md:pt-8" : ""}`}><ProductCard listing={product} showStore={false} presentation="shop" /></div>)}
      </div>
    </section> : null}
    <section id="shop-catalogue" className="scroll-mt-24 space-y-6 pt-4" aria-label="Shop catalogue">
      <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs uppercase tracking-[0.18em] text-muted">Your next good find</p><h2 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">{category === "all" ? "Shop the collection" : flattenCategoryTree(categories).find(node => node.id === category)?.name ?? "Shop the collection"}</h2></div>
      </div>
      <div aria-busy={pending} aria-live="polite" className={`motion-safe:transition-opacity motion-safe:duration-150 ${pending ? "opacity-70" : "opacity-100"}`}>
        {pending ? <p role="status" className="mb-3 text-xs text-muted">Updating products…</p> : null}
        <div className="min-w-0">
          {visible.length ? <div className={`grid grid-cols-1 items-stretch gap-5 min-[540px]:grid-cols-2 ${composition === "gallery" ? "xl:gap-8" : "lg:grid-cols-3 xl:grid-cols-4"}`}>{visible.map(product => <ProductCard key={product.id} listing={product} showStore={false} presentation="shop" />)}</div> : <div className="rounded-2xl bg-surface-secondary px-5 py-12 text-center"><h3 className="font-semibold">{filtering ? "No products match this selection" : "The collection is on its way"}</h3><p className="mt-2 text-sm text-muted">{filtering ? "Try another category or clear your search." : "New products will appear here when the store publishes them."}</p>{filtering ? <Link href={pathname} scroll={false} className="mt-5 inline-flex min-h-11 items-center text-sm underline">View all products</Link> : null}</div>}
        </div>
      </div>
      <PaginationBar total={total} page={page} perPage={24} basePath={pathname} />
    </section>
    {designType !== "events" ? collections : null}
  </div>;
}
