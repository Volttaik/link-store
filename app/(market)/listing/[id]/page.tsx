import { notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getListingDetail } from "@/lib/server/listings";
import { getStoreById } from "@/lib/server/stores";
import { ProductCard } from "@/components/cards/ProductCard";
import { ChatAvatar } from "@/components/chat/ChatAvatar";
import { PurchasePanel } from "@/components/marketplace/PurchasePanel";
import { ButtonLink } from "@/components/ui/controls";
import { MessageSellerButton } from "@/components/marketplace/MessageSellerButton";
import { listListings } from "@/lib/server/listings";
export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) { const product = await getListingDetail((await params).id); return { title: product?.title ?? "Product", description: product?.description?.slice(0, 150) }; }
export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const product = await getListingDetail((await params).id); if (!product) notFound();
  const [user, store] = await Promise.all([getCurrentUser(), getStoreById(product.storeId)]);
  const owner = Boolean(user && store?.user_id === user.id);
  if (!owner && (product.status !== "active" || !product.storePublished)) notFound();
  const related = (await listListings({ storeId: product.storeId, status: "active", limit: 5 })).filter(item => item.id !== product.id);
  return <main className="mx-auto max-w-7xl space-y-12 px-4 py-8 sm:px-6">
    <Link href={`/@${product.storeSlug}`} className="inline-flex items-center gap-3"><ChatAvatar name={product.storeName} src={product.storeLogoUrl} /><span className="text-sm font-medium">{product.storeName}</span></Link>
    <div className="grid items-start gap-8 lg:grid-cols-[1.2fr_1fr]">
      <div className="space-y-4">{product.images.length ? product.images.map(image => <img key={image.id} src={image.image_url} alt={image.alt ?? product.title} className="h-auto w-full rounded-3xl bg-surface-secondary" loading="lazy" />) : <div className="flex aspect-square items-center justify-center rounded-3xl bg-surface-secondary text-muted">No photo yet</div>}</div>
      <div className="space-y-6 lg:sticky lg:top-24"><div><p className="mb-2 text-xs uppercase tracking-widest text-muted">{product.categoryName ?? "Products"}</p><h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{product.title}</h1>{product.subtitle ? <p className="mt-2 text-muted">{product.subtitle}</p> : null}</div>
        <PurchasePanel listingId={product.id} type="product" currency={product.currency} basePrice={product.price} variants={product.variants} trackInventory={product.trackInventory} stock={product.stock} fulfilment={product.fulfilment} isSignedIn={Boolean(user)} />
        {product.description ? <p className="whitespace-pre-line text-sm leading-relaxed text-muted">{product.description}</p> : null}
        <div className="product-companion-actions flex flex-wrap items-start gap-3">
          {!owner ? <MessageSellerButton storeId={product.storeId} listingId={product.id} sellerName={product.storeName} label="Ask About This Product" /> : <ButtonLink href={`/workspace/listings/${product.id}`} variant="secondary">Edit product</ButtonLink>}
          <ButtonLink href={`/@${product.storeSlug}`} variant="outline">Open Shop</ButtonLink>
        </div>
      </div>
    </div>
    {related.length ? <section className="space-y-4"><p className="text-sm font-medium text-muted">More from <span className="text-foreground">{product.storeName}</span></p><div className="flex snap-x gap-4 overflow-x-auto pb-4">{related.map(item => <div key={item.id} className="w-64 shrink-0 snap-start"><ProductCard listing={item} showBuy /></div>)}</div></section> : null}
  </main>;
}
