import { LEGAL_PAGES } from "./legal-content";
import { resendConfig } from "@/lib/env";
import { notFound } from "next/navigation";
import { ChatAvatar } from "@/components/chat/ChatAvatar";
import { ShopCard } from "@/components/cards/ShopCard";
import { RatingStars, SectionHeader } from "@/components/ui/atoms";
import { ButtonLink } from "@/components/ui/controls";
import { StorefrontShowcase } from "@/components/marketplace/StorefrontShowcase";
import { MessageSellerButton } from "@/components/marketplace/MessageSellerButton";
import { EmptyState, InfoNote } from "@/components/ui/feedback";
import { getCurrentUser } from "@/lib/auth";
import { getStorefront, storeNeighbourhood } from "@/lib/server/discovery";
import { getStoreRating } from "@/lib/server/management";
import { recordAnalyticsEvent } from "@/lib/server/insights";
import { listListings, countListings, type ListingQuery } from "@/lib/server/listings";
import { parseMoneyToMinor } from "@/lib/money";
import { pickParam, type RawSearchParams } from "@/components/marketplace/BrowseSection";
import { categorySubtreeIdList, listCategoryTree } from "@/lib/server/categories";
import { storeCategoryMeta } from "@/lib/catalog";
export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }) {
  const slug = decodeURIComponent((await params).handle).replace(/^@/, "").toLowerCase();
  if (LEGAL_PAGES[slug]) return { title: LEGAL_PAGES[slug].title, description: LEGAL_PAGES[slug].intro };
  const shop = await getStorefront(slug);
  return { title: shop?.store.name ?? "Storefront", description: shop?.store.tagline ?? shop?.store.description?.slice(0, 150) };
}
export default async function StorefrontPage({ params, searchParams }: { params: Promise<{ handle: string }>; searchParams: Promise<RawSearchParams> }) {
  const handle = decodeURIComponent((await params).handle);
  const legal = LEGAL_PAGES[handle];
  if (legal) return <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
    <h1 className="text-3xl font-semibold tracking-tight">{legal.title}</h1><p className="mt-3 text-sm leading-relaxed text-muted">{legal.intro}</p>
    <p className="mt-2 text-xs text-muted">Rush Cart · Updated September 30, 2026</p>
    <div className="mt-8 space-y-7">{legal.sections.map(section => <section key={section.heading}><h2 className="text-lg font-semibold">{section.heading}</h2><p className="mt-2 text-sm leading-7 text-muted">{section.text}</p></section>)}</div>
    {handle === "support" && /^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/.test(resendConfig.replyTo) ? <a className="mt-6 inline-block underline" href={`mailto:${resendConfig.replyTo}`}>Email Rush Cart support</a> : null}
    <nav className="mt-10 flex flex-wrap gap-4 text-xs underline" aria-label="Legal and help">{Object.entries(LEGAL_PAGES).map(([slug, page]) => <a key={slug} href={`/${slug}`}>{page.title}</a>)}</nav>
  </main>;
  if (!handle.startsWith("@")) notFound();
  const shop = await getStorefront(handle.slice(1).toLowerCase()); if (!shop) notFound();
  const { store, sections, events, designType } = shop;
  const [user, rating, neighbours, categoryTree] = await Promise.all([getCurrentUser(), getStoreRating(store.id), storeNeighbourhood(store.id, 4), listCategoryTree(store.id, "product")]);
  const owner = Boolean(user && user.id === store.user_id); if (!store.is_published && !owner) notFound();
  if (!owner) await recordAnalyticsEvent({ storeId: store.id, eventType: "store_view", userId: user?.id ?? null });
  const filters = await searchParams;
  const requestedCategory = pickParam(filters, "category");
  const page = Math.max(1, Number.parseInt(pickParam(filters, "page") ?? "1", 10) || 1);
  const query: ListingQuery = { storeId: store.id, status: "active", search: pickParam(filters, "q"), categoryIds: requestedCategory ? await categorySubtreeIdList(requestedCategory) : undefined, minPrice: parseMoneyToMinor(pickParam(filters, "min") ?? "", store.currency) ?? undefined, maxPrice: parseMoneyToMinor(pickParam(filters, "max") ?? "", store.currency) ?? undefined, inStockOnly: pickParam(filters, "stock") === "1" };
  const [results, total] = await Promise.all([listListings({ ...query, limit: 24, offset: (page - 1) * 24 }), countListings(query)]);
  const category = storeCategoryMeta(store.primary_category);
  const composition = ["fashion", "clothing", "shoes", "accessories", "beauty"].includes(store.primary_category ?? "") ? "editorial" : store.primary_category === "home" ? "gallery" : "studio";
  return <main className={`storefront storefront-${composition} mx-auto max-w-7xl px-4 pb-12 sm:px-6`}>
    <header className="store-identity py-6">
      <div className="min-w-0 max-w-3xl space-y-4">
        <div className="flex items-center gap-4"><ChatAvatar name={store.name} src={store.logo_url} size={72} /><div className="min-w-0"><p className="text-xs uppercase tracking-[0.16em] text-muted">{category?.label ?? ""}</p><h1 className="mt-2 break-words text-3xl font-semibold tracking-tight sm:text-4xl">{store.name}</h1><p className="mt-2 text-xs text-muted">@{store.slug}{store.city ? ` · ${store.city}` : ""}</p></div></div>
        {store.tagline ? <p className="max-w-lg text-xl leading-snug tracking-tight sm:text-2xl">{store.tagline}</p> : null}
        {store.description ? <p className="max-w-lg whitespace-pre-line text-sm leading-7 text-muted">{store.description}</p> : null}
        <RatingStars rating={rating.average} count={rating.count} />
        <div className="flex flex-wrap items-start gap-3">{owner ? <ButtonLink href="/workspace/settings" variant="secondary">Manage store</ButtonLink> : <MessageSellerButton storeId={store.id} sellerName={store.name} label="Message store" />}<ButtonLink href="#products" variant="outline">Shop products ↓</ButtonLink></div>
      </div>
    </header>
    {owner && !store.is_published ? <div className="mt-4"><InfoNote tone="warning" title="Your store is not public yet">Publish your store when your products are ready.</InfoNote></div> : null}
    <div id="products" className="scroll-mt-20 pt-3"><StorefrontShowcase results={results} total={total} page={page} currency={store.currency} categories={categoryTree} storeName={store.name} sections={sections} events={events} designType={designType} composition={composition} /></div>
    {!sections.length && !events.length ? <EmptyState title="Something good is on the way" description={owner ? "Create and publish your first product to open your shop." : "This store is preparing its collection. Check back soon."} action={owner ? <ButtonLink href="/workspace/listings/new">Create product</ButtonLink> : undefined} /> : null}
    {neighbours.length ? <section className="mt-12 space-y-5 pt-8"><SectionHeader title="More stores to discover" /><div className="flex snap-x gap-6 overflow-x-auto pb-4">{neighbours.map(store => <div key={store.id} className="w-[calc(100vw-3rem)] shrink-0 snap-start sm:w-[36rem] lg:w-[46rem]"><ShopCard store={store} /></div>)}</div></section> : null}
  </main>;
}
