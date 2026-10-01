import { PRODUCT_CATEGORY_DEFINITIONS } from "./categories";
import { isIconName, type IconName } from "@/components/ui/Icon";

export type ListingType = "product";
export type FulfilmentMode = "shipping" | "pickup";
export type ListingTypeMeta = { value: ListingType; label: string; plural: string; fulfilment: FulfilmentMode; blurb: string; section: string | null };
export const LISTING_TYPES: ListingTypeMeta[] = [{ value: "product", label: "Product", plural: "Products", fulfilment: "shipping", blurb: "Add photos, a price and stock. Publish when you are ready.", section: "products" }];
export const LISTING_TYPE_MAP: Record<string, ListingTypeMeta> = { product: LISTING_TYPES[0] };
export function listingTypeMeta(_type?: string | null): ListingTypeMeta { return LISTING_TYPES[0]; }
export function listingTypeIcon(_type?: string | null): IconName { return "products"; }
export function listingTypesForSection(_section: string): ListingType[] { return ["product"]; }
export type ListingActionKind = "cart";
export type ListingActionMeta = { kind: ListingActionKind; label: string; icon: IconName };
export function listingActionMeta(_type?: string | null): ListingActionMeta { return { kind: "cart", label: "Add to Cart", icon: "cart" }; }
export function listingIsCartable(type?: string | null): boolean { return type === "product"; }
export const MARKETPLACE_SECTIONS: Array<{ slug: string; label: string; icon: IconName; types: ListingType[] }> = [{ slug: "products", label: "Products", icon: "products", types: ["product"] }];
export const STORE_CATEGORIES: Array<{ value: string; label: string; icon: IconName }> = PRODUCT_CATEGORY_DEFINITIONS.map(category => ({ value: category.slug, label: category.name, icon: category.icon }));
export function storeCategoryMeta(value?: string | null) { return STORE_CATEGORIES.find(category => category.value === value) ?? null; }
export function sectionIcon(slug?: string | null): IconName { return storeCategoryMeta(slug)?.icon ?? (slug === "events" ? "events" : "products"); }
export function categoryIconName(category: { icon?: string | null; slug?: string | null }): IconName { return isIconName(category.icon) ? category.icon : sectionIcon(category.slug); }
export type StatusTone = "default" | "primary" | "secondary" | "success" | "warning" | "danger";
export type StatusEntry<T extends string> = { value: T; label: string; tone: StatusTone; description?: string };
export const LISTING_STATUSES: Array<StatusEntry<"draft" | "active" | "archived">> = [
  { value: "draft", label: "Draft", tone: "default", description: "Only visible to you." },
  { value: "active", label: "Published", tone: "success", description: "Live on your storefront." },
  { value: "archived", label: "Unpublished", tone: "warning", description: "Hidden until you publish again." },
];
export const DISCOUNT_TYPES: Array<StatusEntry<"percentage" | "fixed">> = [{ value: "percentage", label: "Percentage off", tone: "primary" }, { value: "fixed", label: "Fixed amount off", tone: "secondary" }];
export const ORDER_STATUSES: Array<StatusEntry<"pending" | "paid" | "processing" | "fulfilled" | "cancelled" | "refunded">> = [
  { value: "pending", label: "Pending", tone: "warning" }, { value: "paid", label: "Paid", tone: "primary" },
  { value: "processing", label: "Processing", tone: "primary" }, { value: "fulfilled", label: "Fulfilled", tone: "success" },
  { value: "cancelled", label: "Cancelled", tone: "default" }, { value: "refunded", label: "Refunded", tone: "danger" },
];
export const PAYMENT_STATUSES: Array<StatusEntry<"unpaid" | "pending" | "paid" | "failed" | "refunded">> = [
  { value: "unpaid", label: "Unpaid", tone: "default" }, { value: "pending", label: "Awaiting payment", tone: "warning" },
  { value: "paid", label: "Paid", tone: "success" }, { value: "failed", label: "Failed", tone: "danger" }, { value: "refunded", label: "Refunded", tone: "primary" },
];
export const PAYMENT_REQUEST_STATUSES: Array<StatusEntry<"awaiting_payment" | "processing" | "paid" | "failed" | "expired" | "cancelled">> = [
  { value: "awaiting_payment", label: "Awaiting Payment", tone: "warning" }, { value: "processing", label: "Processing", tone: "primary" },
  { value: "paid", label: "Paid", tone: "success" }, { value: "failed", label: "Failed", tone: "danger" },
  { value: "expired", label: "Expired", tone: "default" }, { value: "cancelled", label: "Cancelled", tone: "default" },
];
export const EVENT_STATUSES: Array<StatusEntry<"draft" | "published" | "cancelled" | "completed">> = [
  { value: "draft", label: "Draft", tone: "default" }, { value: "published", label: "Published", tone: "success" },
  { value: "cancelled", label: "Unpublished", tone: "default" }, { value: "completed", label: "Ended", tone: "default" },
];
export const PAYOUT_STATUSES: Array<StatusEntry<"pending" | "processing" | "paid" | "failed">> = [
  { value: "pending", label: "Requested", tone: "warning" }, { value: "processing", label: "Processing", tone: "primary" },
  { value: "paid", label: "Paid out", tone: "success" }, { value: "failed", label: "Failed", tone: "danger" },
];
function tone(entries: StatusEntry<string>[], value?: string | null): StatusTone { return entries.find(entry => entry.value === value)?.tone ?? "default"; }
function label(entries: StatusEntry<string>[], value?: string | null): string { return entries.find(entry => entry.value === value)?.label ?? value ?? "—"; }
export const listingStatusTone = (value?: string | null) => tone(LISTING_STATUSES, value);
export const listingStatusLabel = (value?: string | null) => label(LISTING_STATUSES, value);
export const orderStatusTone = (value?: string | null) => tone(ORDER_STATUSES, value);
export const orderStatusLabel = (value?: string | null) => label(ORDER_STATUSES, value);
export const paymentStatusTone = (value?: string | null) => tone(PAYMENT_STATUSES, value);
export const paymentStatusLabel = (value?: string | null) => label(PAYMENT_STATUSES, value);
export const paymentRequestStatusTone = (value?: string | null) => tone(PAYMENT_REQUEST_STATUSES, value);
export const paymentRequestStatusLabel = (value?: string | null) => label(PAYMENT_REQUEST_STATUSES, value);
export const eventStatusTone = (value?: string | null) => tone(EVENT_STATUSES, value);
export const eventStatusLabel = (value?: string | null) => label(EVENT_STATUSES, value);
export const payoutStatusTone = (value?: string | null) => tone(PAYOUT_STATUSES, value);
export const payoutStatusLabel = (value?: string | null) => label(PAYOUT_STATUSES, value);
export type ShopDesignType = "products" | "events";
export const SHOP_DESIGN_TYPES: Array<{ value: ShopDesignType; label: string; welcomeLabel: string; icon: IconName; presentation: "shelf" | "posters"; description: string }> = [
  { value: "products", label: "Products", welcomeLabel: "Product", icon: "products", presentation: "shelf", description: "Lead with your products." },
  { value: "events", label: "Events", welcomeLabel: "Events", icon: "events", presentation: "posters", description: "Lead with curated product collections." },
];
export function shopDesignTypeFor(_type: string): ShopDesignType { return "products"; }
export function isShopDesignType(value: unknown): value is ShopDesignType { return value === "products" || value === "events"; }
export function shopDesignMeta(value?: string | null) { return SHOP_DESIGN_TYPES.find(entry => entry.value === value) ?? null; }
export function listingTypesForDesign(value: ShopDesignType): string[] { return value === "products" ? ["product"] : []; }
export function autoDesignType(counts: Partial<Record<ShopDesignType, number>>): ShopDesignType { return (counts.events ?? 0) > (counts.products ?? 0) ? "events" : "products"; }
export const DELIVERY_LADDER = ["preparing", "ready_to_ship", "shipped", "in_transit", "out_for_delivery", "delivered"] as const;
export const PICKUP_LADDER = ["preparing", "ready_for_pickup", "picked_up"] as const;
export const SHIPMENT_STATE_LABELS: Record<string, string> = { preparing: "Being prepared", ready_to_ship: "Ready to ship", shipped: "Shipped", in_transit: "In transit", out_for_delivery: "Out for delivery", delivered: "Delivered", ready_for_pickup: "Ready for pickup", picked_up: "Picked up", cancelled: "Cancelled" };
export const shipmentStatusTone = (value?: string | null): StatusTone => value === "delivered" || value === "picked_up" ? "success" : value === "cancelled" ? "danger" : value === "preparing" ? "warning" : "primary";
export type ListingFact = { key: string; icon: IconName; label: string; tone?: StatusTone };
export type ListingFactInput = { type: string; fulfilment: FulfilmentMode; stock: number; trackInventory: boolean; variantCount: number; attributes?: Record<string, unknown> | null; durationMinutes?: number | null; serviceMode?: string | null; prepTimeMinutes?: number | null };
export function ordersInThread(_input: { type: string; attributes?: Record<string, unknown> | null }): boolean { return false; }
export function listingFacts(input: ListingFactInput): ListingFact[] {
  const facts: ListingFact[] = [];
  if (input.variantCount > 1) facts.push({ key: "options", icon: "list", label: `${input.variantCount} options` });
  if (input.trackInventory) facts.push({ key: "stock", icon: "inventory", label: input.stock > 0 ? `${input.stock} in stock` : "Sold out", tone: input.stock > 0 ? "default" : "danger" });
  return facts;
}
