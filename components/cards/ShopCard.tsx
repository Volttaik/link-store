import Link from "next/link";
import { ChatAvatar } from "@/components/chat/ChatAvatar";
import { Icon } from "@/components/ui/Icon";
import { ProductImage } from "@/components/marketplace/ProductImage";
import { storeCategoryMeta } from "@/lib/catalog";
import { formatMoney } from "@/lib/money";
import type { StoreCard as StoreCardData } from "@/lib/server/discovery";

/**
 * The shop card — a storefront as one discovery object.
 *
 * A shop is a place, not a product with a name attached, so this is cut as an
 * editorial storefront: the shop's own sign (its picture and its name), the
 * word the seller puts on the door, a window of the shop's **own** photography,
 * and the way in. The card is the visual object — there is no surface behind
 * it and no second card inside it; the page background runs straight through,
 * and the composition holds itself up with space and hierarchy. One hairline
 * of the platform's accent trio traces the card's edge (a quiet, still
 * extension of the `.ls-edge` treatment) so the card reads as one finished
 * object.
 *
 * The window is real listings and nothing else: a dominant product with
 * supporting ones, drawn from the seller's published photography. A shop with
 * nothing photographed yet gets no window rather than a row of empty boxes, and
 * nothing in the card counts, ages or rates anything the seller has not said.
 *
 * Nothing here moves on its own. There is no carousel and no autoplay: a
 * product is opened only by tapping it, and the shop only by choosing
 * **Open Shop**. In a narrow card the product window is a contained,
 * hand-scrolled shelf inside the card — it can never scroll the page or leave
 * the card's edge.
 */
export function ShopCard({ store }: {
  store: StoreCardData; rating?: number | null; ratingCount?: number;
}) {
  const category = storeCategoryMeta(store.primaryCategory);
  const products = store.gallery.slice(0, 4);
  const story = store.tagline?.trim() || store.description?.trim() || null;
  const place = [store.city, store.country].filter(Boolean).join(", ");

  return <article data-shop-card={store.slug} className="shop-discovery">
    <div className="shop-discovery-identity">
      <Link href={`/@${store.slug}`} className="shop-discovery-sign ls-focus-ring no-underline">
        <ChatAvatar name={store.name} src={store.logoUrl} size={88} className="shop-discovery-logo" />
        <div className="min-w-0">
          {category ? <p className="shop-discovery-kind">{category.label}</p> : null}
          <h3 className="shop-discovery-name text-foreground">{store.name}</h3>
        </div>
      </Link>
      {story ? <p className="shop-discovery-story">{story}</p> : null}
      <div className="shop-discovery-foot">
        <Link href={`/@${store.slug}`} className="shop-discovery-door ls-focus-ring">Open Shop<Icon name="arrowRight" size={16} /></Link>
        {place ? <span className="shop-discovery-place">{place}</span> : null}
      </div>
    </div>

    {products.length ? <nav aria-label={`Products from ${store.name}`} className="shop-discovery-gallery" data-previews={products.length}>
      {products.map((product, index) => <Link key={product.id} href={`/listing/${product.id}`} aria-label={`${product.title} from ${store.name}`} className={`shop-discovery-product shop-discovery-product-${index} ls-focus-ring no-underline`}>
        <span className="shop-discovery-frame"><ProductImage src={product.imageUrl} title={product.title} /></span>
        <span className="shop-discovery-caption"><span className="shop-discovery-title">{product.title}</span><span className="shop-discovery-price">{formatMoney(product.price, product.currency)}</span></span>
      </Link>)}
    </nav> : null}
  </article>;
}
