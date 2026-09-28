/**
 * The LINK STORE taxonomy.
 *
 * Link Store is one commerce engine, not nine. Every sellable thing is a
 * listing whose `type` decides how it behaves at checkout (shipping vs ticket
 * vs download) and how the storefront presents it. This module is the single
 * source of truth for that taxonomy, shared by the marketplace and workspace.
 *
 * Platform-wide catalogue categories are data, not code — they are seeded by
 * `db/seed.sql` and read from the database at runtime.
 */

import { isIconName, type IconName } from "@/components/ui/Icon";

export type ListingType =
  | "physical"
  | "fashion"
  | "electronics"
  | "furniture"
  | "automotive"
  | "food"
  | "service"
  | "digital"
  | "event_ticket"
  | "rental"
  | "cargo"
  | "other";

export type FulfilmentMode =
  | "shipping"
  | "pickup"
  | "onsite"
  | "digital"
  | "booking"
  | "ticket";

export type ListingTypeMeta = {
  value: ListingType;
  /** Singular noun used in the workspace. */
  label: string;
  /** Plural noun used for navigation and empty states. */
  plural: string;
  /** Default fulfilment behaviour for this type. */
  fulfilment: FulfilmentMode;
  /** Short explanation shown when creating a listing. */
  blurb: string;
  /** Marketplace section this type belongs to (null = discovery only). */
  section: string | null;
};

export const LISTING_TYPES: ListingTypeMeta[] = [
  {
    value: "physical",
    label: "Physical product",
    plural: "Products",
    fulfilment: "shipping",
    blurb: "Ships to the customer. Stock can be tracked.",
    section: "products",
  },
  {
    value: "fashion",
    label: "Fashion item",
    plural: "Fashion",
    fulfilment: "shipping",
    blurb: "Clothing, shoes and accessories, with variants like size and colour.",
    section: "fashion",
  },
  {
    value: "electronics",
    label: "Electronics",
    plural: "Electronics",
    fulfilment: "shipping",
    blurb: "Phones, computers, gadgets and accessories.",
    section: "electronics",
  },
  {
    value: "furniture",
    label: "Furniture",
    plural: "Furniture",
    fulfilment: "shipping",
    blurb: "Home and office furniture, decor and fittings.",
    section: "furniture",
  },
  {
    value: "automotive",
    label: "Vehicle",
    plural: "Cars",
    fulfilment: "pickup",
    blurb: "Cars, bikes and parts, usually collected in person.",
    section: "cars",
  },
  {
    value: "food",
    label: "Menu item",
    plural: "Food",
    fulfilment: "pickup",
    blurb: "Meals, drinks and groceries with prep time and add-ons.",
    section: "food",
  },
  {
    value: "service",
    label: "Service",
    plural: "Services",
    fulfilment: "booking",
    blurb: "Work you deliver: design, repairs, consulting, beauty.",
    section: "services",
  },
  {
    value: "digital",
    label: "Digital product",
    plural: "Digital",
    fulfilment: "digital",
    blurb: "Files delivered after payment: templates, e-books, courses.",
    section: "digital",
  },
  {
    value: "event_ticket",
    label: "Event ticket",
    plural: "Tickets",
    fulfilment: "ticket",
    blurb: "Admission to an event, sold in ticket types.",
    section: "events",
  },
  {
    value: "rental",
    label: "Rental",
    plural: "Rentals",
    fulfilment: "onsite",
    blurb:
      "A flat, a car, equipment, let by the day, week or month. Rentals are agreed in the thread before anything is paid.",
    section: "rentals",
  },
  {
    /**
     * Bulk and wholesale. Deliberately its own type rather than a product with
     * "carton" written on it: a cargo line is priced and sold by the package
     * (a carton, a sack, a pallet), so the quantity a buyer enters means packs
     * of goods, not units of one, and the listing is described by the packaging,
     * the bulk quantity and the weight instead of a single-item spec sheet.
     */
    value: "cargo",
    label: "Cargo",
    plural: "Cargo",
    fulfilment: "shipping",
    blurb:
      "Bulk and wholesale: a carton, a sack, a pallet. Priced by the package, with its own packaging, quantity and weight.",
    section: "cargo",
  },
  {
    value: "other",
    label: "Other",
    plural: "Other",
    fulfilment: "shipping",
    blurb: "Anything else that can be traded.",
    section: null,
  },
];

export const LISTING_TYPE_MAP: Record<string, ListingTypeMeta> = Object.fromEntries(
  LISTING_TYPES.map((type) => [type.value, type]),
);

export function listingTypeMeta(type: string | null | undefined): ListingTypeMeta {
  return LISTING_TYPE_MAP[type ?? ""] ?? LISTING_TYPE_MAP.other;
}

/** The icon that represents a listing type wherever a type is shown. */
export function listingTypeIcon(type: string | null | undefined): IconName {
  const map: Record<string, IconName> = {
    physical: "products",
    fashion: "fashion",
    electronics: "electronics",
    furniture: "furniture",
    automotive: "vehicles",
    food: "food",
    service: "services",
    digital: "digital",
    event_ticket: "events",
    rental: "key",
    cargo: "inventory",
    other: "tag",
  };

  return map[type ?? ""] ?? "tag";
}

export function listingTypesForSection(sectionSlug: string): ListingType[] {
  return LISTING_TYPES.filter((type) => type.section === sectionSlug).map((type) => type.value);
}

/* -------------------------------------------------------------------------- */
/* Commerce actions — what a buyer actually does with each kind of listing      */
/* -------------------------------------------------------------------------- */

/**
 * The way each kind of listing is transacted.
 *
 * A button must say what really happens. A shirt is added to a cart, a meal is
 * ordered, an admission is bought as a ticket, a rental is opened and agreed in
 * a conversation, a service is booked. One generic "Buy" for all of them would
 * describe none of them, so the action is derived from the listing's own type —
 * the same source the checkout and fulfilment read — never from display text.
 */
export type ListingActionKind =
  /** A normal product: into the shopping cart → checkout → order. */
  | "cart"
  /** Food: ordered like a meal. Still backed by the order basket underneath. */
  | "order"
  /** Admission: bought directly — one individual ticket per admission. */
  | "ticket"
  /** A rental: opened and agreed with the seller in the conversation. */
  | "open"
  /** A service: ordered/booked through its own service flow. */
  | "book";

export type ListingActionMeta = {
  kind: ListingActionKind;
  /** The verb on the button — literally what happens when it is pressed. */
  label: string;
  icon: IconName;
};

const LISTING_ACTIONS: Record<ListingType, ListingActionMeta> = {
  physical: { kind: "cart", label: "Add to Cart", icon: "cart" },
  fashion: { kind: "cart", label: "Add to Cart", icon: "cart" },
  electronics: { kind: "cart", label: "Add to Cart", icon: "cart" },
  furniture: { kind: "cart", label: "Add to Cart", icon: "cart" },
  automotive: { kind: "cart", label: "Add to Cart", icon: "cart" },
  other: { kind: "cart", label: "Add to Cart", icon: "cart" },
  // Bulk goods are still physical products: packages go in the same basket.
  cargo: { kind: "cart", label: "Add to Cart", icon: "cart" },
  // Files are delivered after payment, but the act of buying one is still a
  // basket line followed by checkout.
  digital: { kind: "cart", label: "Add to Cart", icon: "cart" },
  food: { kind: "order", label: "Order", icon: "food" },
  service: { kind: "book", label: "Book Service", icon: "services" },
  event_ticket: { kind: "ticket", label: "Buy Ticket", icon: "ticket" },
  rental: { kind: "open", label: "Open Listing", icon: "key" },
};

/**
 * The primary action for a listing type — the one button a card shows.
 *
 * `attributes` is accepted for the seller's own overrides where they exist
 * (a service whose seller only takes enquiries still books through the same
 * button, which opens the listing where the conversation lives).
 */
export function listingActionMeta(type: string | null | undefined): ListingActionMeta {
  return LISTING_ACTIONS[listingTypeMeta(type).value];
}

/**
 * Whether this kind of listing may ever enter the shopping cart.
 *
 * The basket holds goods, meals and bookable services — everything whose flow
 * is "choose → checkout → pay → order/booking". Tickets are individual
 * admissions and rentals are agreements settled in a conversation, and neither
 * belongs in a basket: refusing here keeps the rule true at the data layer,
 * whatever any client asks for.
 */
export function listingIsCartable(type: string | null | undefined): boolean {
  const kind = listingActionMeta(type).kind;
  return kind === "cart" || kind === "order" || kind === "book";
}

/** Marketplace sections in the order they appear in public navigation. */
export const MARKETPLACE_SECTIONS: Array<{
  slug: string;
  label: string;
  icon: IconName;
  /** Empty array means "every sellable listing type". */
  types: ListingType[];
}> = [
  { slug: "products", label: "All products", icon: "grid", types: [] },
  { slug: "fashion", label: "Fashion", icon: "fashion", types: listingTypesForSection("fashion") },
  {
    slug: "electronics",
    label: "Electronics",
    icon: "electronics",
    types: listingTypesForSection("electronics"),
  },
  {
    slug: "furniture",
    label: "Furniture",
    icon: "furniture",
    types: listingTypesForSection("furniture"),
  },
  { slug: "food", label: "Food", icon: "food", types: listingTypesForSection("food") },
  {
    slug: "services",
    label: "Services",
    icon: "services",
    types: listingTypesForSection("services"),
  },
  { slug: "digital", label: "Digital", icon: "digital", types: listingTypesForSection("digital") },
  {
    slug: "rentals",
    label: "Rentals",
    icon: "key",
    types: listingTypesForSection("rentals"),
  },
  { slug: "cars", label: "Vehicles", icon: "vehicles", types: listingTypesForSection("cars") },
  { slug: "cargo", label: "Cargo", icon: "inventory", types: listingTypesForSection("cargo") },
];

/**
 * The icon for a marketplace section.
 *
 * Catalogue categories live in the database, but their iconography is part of
 * the interface and therefore lives in code — a category slug maps to one
 * consistent Lucide icon rather than a per-row emoji.
 */
export function sectionIcon(slug: string | null | undefined): IconName {
  const known = MARKETPLACE_SECTIONS.find((section) => section.slug === slug);
  if (known) return known.icon;

  const byCategory: Record<string, IconName> = {
    // Store categories
    fashion: "fashion",
    electronics: "electronics",
    home: "home",
    furniture: "furniture",
    food: "food",
    beauty: "beauty",
    services: "services",
    digital: "digital",
    events: "events",
    automotive: "vehicles",
    vehicles: "vehicles",
    general: "general",

    // Platform catalogue categories (see db/seed.sql)
    "shoes-bags": "fashion",
    "phones-tablets": "electronics",
    computing: "electronics",
    "home-furniture": "furniture",
    appliances: "home",
    groceries: "food",
    restaurant: "food",
    drinks: "food",
    "vehicle-parts": "vehicles",
    "professional-services": "services",
    repairs: "services",
    education: "services",
    "events-tickets": "events",
    "templates-design": "digital",
    "ebooks-courses": "digital",
    "software-files": "digital",
    other: "tag",
  };

  return byCategory[slug ?? ""] ?? "tag";
}

/**
 * The icon for a stored catalogue category.
 *
 * `categories.icon` holds an icon *name* (never an emoji). Anything unknown
 * falls back to a section icon derived from the category slug, so a category
 * can never render blank.
 */
export function categoryIconName(category: {
  icon?: string | null;
  slug?: string | null;
}): IconName {
  return isIconName(category.icon) ? category.icon : sectionIcon(category.slug);
}

/** Store categories a seller picks from when creating a storefront. */
export const STORE_CATEGORIES: Array<{ value: string; label: string; icon: IconName }> = [
  { value: "fashion", label: "Fashion & apparel", icon: "fashion" },
  { value: "electronics", label: "Electronics & gadgets", icon: "electronics" },
  { value: "home", label: "Home & furniture", icon: "furniture" },
  { value: "food", label: "Food & restaurant", icon: "food" },
  { value: "beauty", label: "Beauty & wellness", icon: "beauty" },
  { value: "services", label: "Professional services", icon: "services" },
  { value: "digital", label: "Digital products", icon: "digital" },
  { value: "events", label: "Events & entertainment", icon: "events" },
  { value: "automotive", label: "Automotive", icon: "vehicles" },
  { value: "general", label: "General marketplace", icon: "general" },
];

export function storeCategoryMeta(value: string | null | undefined) {
  return STORE_CATEGORIES.find((category) => category.value === value) ?? null;
}

export type StatusTone = "default" | "primary" | "secondary" | "success" | "warning" | "danger";

export type StatusEntry<T extends string> = {
  value: T;
  label: string;
  tone: StatusTone;
  description?: string;
};

export const LISTING_STATUSES: Array<StatusEntry<"draft" | "active" | "archived">> = [
  { value: "draft", label: "Draft", tone: "default", description: "Only visible to you." },
  {
    value: "active",
    label: "Published",
    tone: "success",
    description: "Live on your storefront and the marketplace.",
  },
  {
    value: "archived",
    label: "Archived",
    tone: "warning",
    description: "Hidden, but kept on record.",
  },
];

export const DISCOUNT_TYPES: Array<StatusEntry<"percentage" | "fixed">> = [
  { value: "percentage", label: "Percentage off", tone: "primary" },
  { value: "fixed", label: "Fixed amount off", tone: "secondary" },
];

export const ORDER_STATUSES: Array<
  StatusEntry<"pending" | "paid" | "processing" | "fulfilled" | "cancelled" | "refunded">
> = [
  { value: "pending", label: "Pending", tone: "warning" },
  { value: "paid", label: "Paid", tone: "primary" },
  { value: "processing", label: "Processing", tone: "primary" },
  { value: "fulfilled", label: "Fulfilled", tone: "success" },
  { value: "cancelled", label: "Cancelled", tone: "default" },
  { value: "refunded", label: "Refunded", tone: "danger" },
];

export const PAYMENT_STATUSES: Array<
  StatusEntry<"unpaid" | "pending" | "paid" | "failed" | "refunded">
> = [
  { value: "unpaid", label: "Unpaid", tone: "default" },
  { value: "pending", label: "Awaiting payment", tone: "warning" },
  { value: "paid", label: "Paid", tone: "success" },
  { value: "failed", label: "Failed", tone: "danger" },
  { value: "refunded", label: "Refunded", tone: "primary" },
];

/**
 * A chat payment request's life, in the words of the payment card:
 * "Awaiting Payment", "Processing", "Paid", "Failed", "Expired", "Cancelled".
 */
export const PAYMENT_REQUEST_STATUSES: Array<
  StatusEntry<"awaiting_payment" | "processing" | "paid" | "failed" | "expired" | "cancelled">
> = [
  { value: "awaiting_payment", label: "Awaiting Payment", tone: "warning" },
  { value: "processing", label: "Processing", tone: "primary" },
  { value: "paid", label: "Paid", tone: "success" },
  { value: "failed", label: "Failed", tone: "danger" },
  { value: "expired", label: "Expired", tone: "default" },
  { value: "cancelled", label: "Cancelled", tone: "default" },
];

export const paymentRequestStatusTone = (value: string | null | undefined): StatusTone =>
  findEntry(PAYMENT_REQUEST_STATUSES, value)?.tone ?? "default";
export const paymentRequestStatusLabel = (value: string | null | undefined): string =>
  findEntry(PAYMENT_REQUEST_STATUSES, value)?.label ?? value ?? "—";

export const EVENT_STATUSES: Array<
  StatusEntry<"draft" | "published" | "cancelled" | "completed">
> = [
  { value: "draft", label: "Draft", tone: "default" },
  { value: "published", label: "Published", tone: "success" },
  { value: "cancelled", label: "Cancelled", tone: "danger" },
  { value: "completed", label: "Completed", tone: "primary" },
];

export const PAYOUT_STATUSES: Array<
  StatusEntry<"pending" | "processing" | "paid" | "failed">
> = [
  { value: "pending", label: "Requested", tone: "warning" },
  { value: "processing", label: "Processing", tone: "primary" },
  { value: "paid", label: "Paid out", tone: "success" },
  { value: "failed", label: "Failed", tone: "danger" },
];

/* -------------------------------------------------------------------------- */
/* Shop design types — how a storefront presents what it sells                 */
/* -------------------------------------------------------------------------- */

/**
 * Every shop has a primary design type: the experience its storefront leads
 * with. It is derived from what the shop actually sells (see
 * `autoDesignType`) and the owner can override it in Shop Settings — an
 * override wins where the two disagree.
 */
export type ShopDesignType = "food" | "products" | "services" | "events" | "digital" | "rentals";

export const SHOP_DESIGN_TYPES: Array<{
  value: ShopDesignType;
  /** The compact selector label. */
  label: string;
  /** The word the welcome line uses: “the Product section”. */
  welcomeLabel: string;
  icon: IconName;
  /** How this kind of shop shows its wares — same system, different emphasis. */
  presentation: "menu" | "shelf" | "services" | "posters";
  description: string;
}> = [
  {
    value: "food",
    label: "Food",
    welcomeLabel: "Food",
    icon: "food",
    presentation: "menu",
    description: "Menu-first: dishes grouped like a menu, prices up front.",
  },
  {
    value: "products",
    label: "Products",
    welcomeLabel: "Product",
    icon: "products",
    presentation: "shelf",
    description: "Product-first: photography, prices and quick views.",
  },
  {
    value: "services",
    label: "Services",
    welcomeLabel: "Services",
    icon: "services",
    presentation: "services",
    description: "Service-first: what is included, how long it takes, how to book.",
  },
  {
    value: "events",
    label: "Events",
    welcomeLabel: "Events",
    icon: "events",
    presentation: "posters",
    description: "Event-first: posters, dates, venues and tickets.",
  },
  {
    value: "digital",
    label: "Digital",
    welcomeLabel: "Digital",
    icon: "digital",
    presentation: "shelf",
    description: "Downloads-first: files, formats and instant delivery.",
  },
  {
    value: "rentals",
    label: "Rentals",
    welcomeLabel: "Rental",
    icon: "categories",
    presentation: "shelf",
    description: "Rental-first: items, terms and collection.",
  },
];

const DESIGN_TYPE_BY_LISTING: Record<string, ShopDesignType> = {
  food: "food",
  physical: "products",
  fashion: "products",
  electronics: "products",
  furniture: "products",
  automotive: "products",
  cargo: "products",
  other: "products",
  service: "services",
  digital: "digital",
  event_ticket: "events",
  rental: "rentals",
};

/** Which design section a listing type belongs to. */
export function shopDesignTypeFor(listingType: string): ShopDesignType {
  return DESIGN_TYPE_BY_LISTING[listingType] ?? "products";
}

export function isShopDesignType(value: unknown): value is ShopDesignType {
  return SHOP_DESIGN_TYPES.some((entry) => entry.value === value);
}

export function shopDesignMeta(value: string | null | undefined) {
  return SHOP_DESIGN_TYPES.find((entry) => entry.value === value) ?? null;
}

/** The listing types one design section shows. */
export function listingTypesForDesign(value: ShopDesignType): string[] {
  return Object.entries(DESIGN_TYPE_BY_LISTING)
    .filter(([, section]) => section === value)
    .map(([type]) => type);
}

/**
 * The automatic primary design type: whichever part of the catalogue is
 * actually the biggest. Ties go to the more specific experience (food and
 * events before generic products).
 */
export function autoDesignType(
  counts: Partial<Record<ShopDesignType, number>>,
): ShopDesignType {
  const order: ShopDesignType[] = ["food", "events", "services", "digital", "rentals", "products"];
  let best: ShopDesignType = "products";
  let bestCount = -1;

  for (const key of order) {
    const count = counts[key] ?? 0;
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  }

  return best;
}

/* -------------------------------------------------------------------------- */
/* Fulfilment states — the vocabulary of delivery and pickup                   */
/* -------------------------------------------------------------------------- */

/** Delivery lifecycle — every state corresponds to a real seller action. */
export const DELIVERY_LADDER = [
  "preparing",
  "ready_to_ship",
  "shipped",
  "in_transit",
  "out_for_delivery",
  "delivered",
] as const;

/** Pickup lifecycle — collection is verified at the door, not assumed. */
export const PICKUP_LADDER = ["preparing", "ready_for_pickup", "picked_up"] as const;

export const SHIPMENT_STATE_LABELS: Record<string, string> = {
  preparing: "Being prepared",
  ready_to_ship: "Ready to ship",
  shipped: "Shipped",
  in_transit: "In transit",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  ready_for_pickup: "Ready for pickup",
  picked_up: "Picked up",
  cancelled: "Cancelled",
};

export const shipmentStatusTone = (value: string | null | undefined): StatusTone => {
  if (value === "delivered" || value === "picked_up") return "success";
  if (value === "cancelled") return "danger";
  if (value === "preparing") return "warning";
  return "primary";
};

/**
 * The ticket state machine, as the door speaks it: a ticket is admitted exactly
 * once (`valid → used`), and every other state is a refusal with a reason.
 */
export const TICKET_STATUSES: Array<
  StatusEntry<"valid" | "used" | "cancelled" | "refunded" | "expired" | "void">
> = [
  { value: "valid", label: "Valid", tone: "success" },
  { value: "used", label: "Used", tone: "primary" },
  { value: "cancelled", label: "Cancelled", tone: "default" },
  { value: "refunded", label: "Refunded", tone: "default" },
  { value: "expired", label: "Expired", tone: "default" },
  { value: "void", label: "Invalid", tone: "default" },
];

function findEntry<T extends { value: string; tone: StatusTone; label: string }>(
  list: T[],
  value: string | null | undefined,
): T | undefined {
  return list.find((entry) => entry.value === value);
}

export const listingStatusTone = (value: string | null | undefined): StatusTone =>
  findEntry(LISTING_STATUSES, value)?.tone ?? "default";
export const orderStatusTone = (value: string | null | undefined): StatusTone =>
  findEntry(ORDER_STATUSES, value)?.tone ?? "default";
export const paymentStatusTone = (value: string | null | undefined): StatusTone =>
  findEntry(PAYMENT_STATUSES, value)?.tone ?? "default";
export const eventStatusTone = (value: string | null | undefined): StatusTone =>
  findEntry(EVENT_STATUSES, value)?.tone ?? "default";
export const payoutStatusTone = (value: string | null | undefined): StatusTone =>
  findEntry(PAYOUT_STATUSES, value)?.tone ?? "default";

export const listingStatusLabel = (value: string | null | undefined): string =>
  findEntry(LISTING_STATUSES, value)?.label ?? value ?? "—";
export const orderStatusLabel = (value: string | null | undefined): string =>
  findEntry(ORDER_STATUSES, value)?.label ?? value ?? "—";
export const paymentStatusLabel = (value: string | null | undefined): string =>
  findEntry(PAYMENT_STATUSES, value)?.label ?? value ?? "—";
export const eventStatusLabel = (value: string | null | undefined): string =>
  findEntry(EVENT_STATUSES, value)?.label ?? value ?? "—";
export const payoutStatusLabel = (value: string | null | undefined): string =>
  findEntry(PAYOUT_STATUSES, value)?.label ?? value ?? "—";
export const ticketStatusTone = (value: string | null | undefined): StatusTone =>
  findEntry(TICKET_STATUSES, value)?.tone ?? "default";
export const ticketStatusLabel = (value: string | null | undefined): string =>
  findEntry(TICKET_STATUSES, value)?.label ?? value ?? "—";

/* -------------------------------------------------------------------------- */
/* What a listing *is*, per type                                              */
/* -------------------------------------------------------------------------- */

/**
 * A fact a card shows about a listing, and the icon that says what it is.
 *
 * `key` exists so React can keep a stable identity when a fact line is
 * reordered; nothing about the fact depends on it.
 */
export type ListingFact = {
  key: string;
  icon: IconName;
  label: string;
  /** Only ever set to say something is wrong — a sold-out or unavailable state. */
  tone?: StatusTone;
};

export type ListingFactInput = {
  type: string;
  fulfilment: FulfilmentMode;
  stock: number;
  trackInventory: boolean;
  variantCount: number;
  durationMinutes?: number | null;
  serviceMode?: string | null;
  prepTimeMinutes?: number | null;
  /** The listing's own `attributes` JSON, read defensively. */
  attributes?: Record<string, unknown> | null;
};

/** How the thing actually reaches the buyer, in one line, per fulfilment mode. */
const FULFILMENT_FACT: Record<FulfilmentMode, ListingFact> = {
  shipping: { key: "fulfilment", icon: "packageCheck", label: "Ships to the buyer" },
  pickup: { key: "fulfilment", icon: "storefront", label: "Collected in person" },
  onsite: { key: "fulfilment", icon: "mapPin", label: "Arranged in person" },
  digital: { key: "fulfilment", icon: "download", label: "Instant download after payment" },
  booking: { key: "fulfilment", icon: "clock", label: "Booked for a time" },
  ticket: { key: "fulfilment", icon: "ticket", label: "Admission by ticket" },
};

function humanMinutes(minutes: number): string {
  if (minutes >= 60 && minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  }
  return `${minutes} min`;
}

function attributeString(
  attributes: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  const value = attributes?.[key];
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number") return String(value);
  return null;
}

function attributeFlag(
  attributes: Record<string, unknown> | null | undefined,
  key: string,
): boolean {
  return attributes?.[key] === true;
}

/** ``Rented by the day`` — the period a rental is let over. */
function rentalPeriod(attributes: Record<string, unknown> | null | undefined): ListingFact {
  const unit = attributeString(attributes, "rentUnit") ?? attributeString(attributes, "rentPeriod");
  const clean = unit?.toLowerCase().replace(/[^a-z]/g, "") ?? "";
  const label =
    clean === "day" || clean === "daily"
      ? "Let by the day"
      : clean === "week" || clean === "weekly"
        ? "Let by the week"
        : clean === "month" || clean === "monthly"
          ? "Let by the month"
          : "Period agreed in the thread";

  return { key: "period", icon: "clock", label };
}

/**
 * Is this listing arranged in a conversation before it is paid for?
 *
 * Some things are agreed, not clicked: a flat, a repair, a commission. Those
 * listings lead with the thread — the buyer asks, the two of them settle it, and
 * payment follows. It is a default rather than a gate: a seller can turn it off,
 * and even when it is on, paying straight away stays available, so the thread is
 * one way through rather than the only way.
 *
 * The rule is: an explicit choice by the seller wins; otherwise a rental is
 * agreed first, because that is what a rental is.
 */
export function ordersInThread(input: {
  type: string;
  attributes?: Record<string, unknown> | null;
}): boolean {
  if (input.attributes?.orderViaChat === false) return false;
  if (input.attributes?.orderViaChat === true) return true;
  return input.type === "rental";
}

/**
 * The facts a card shows, decided by what the listing *is*.
 *
 * A ticket is not a product with a different word on it: what a shopper needs to
 * know about a ticket (when, where, how many are left) has nothing in common with
 * what they need to know about a rental (the period, the deposit, that the deal
 * is agreed in a conversation first) or a service (how long it takes, whether it
 * is online or in person). One shared card body could only ever say the things
 * true of everything, which is why it said nothing useful about anything.
 *
 * The list is ordered by what matters most, and the card takes the first few, so
 * the same function serves a full card on the marketplace and a tighter one in a
 * rail without a second rulebook. Nothing is invented: a fact that the listing
 * does not actually carry is simply not returned.
 */
export function listingFacts(input: ListingFactInput): ListingFact[] {
  const facts: ListingFact[] = [];
  const { attributes } = input;

  const soldOut = input.trackInventory && input.stock <= 0;
  const inStock = input.trackInventory && input.stock > 0;

  if (input.type === "rental") {
    facts.push(rentalPeriod(attributes));

    if (ordersInThread({ type: input.type, attributes })) {
      facts.push({ key: "thread", icon: "message", label: "Agreed in the thread first" });
    }
    if (attributeString(attributes, "deposit")) {
      facts.push({ key: "deposit", icon: "shield", label: "Deposit required" });
    }
    if (soldOut) facts.push({ key: "stock", icon: "alert", label: "Not available", tone: "danger" });

    return facts;
  }

  if (input.type === "service") {
    if (input.durationMinutes) {
      facts.push({
        key: "duration",
        icon: "clock",
        label: `${humanMinutes(input.durationMinutes)} of work`,
      });
    }

    const mode =
      input.serviceMode === "online"
        ? "Delivered online"
        : input.serviceMode === "onsite"
          ? "Delivered in person"
          : input.serviceMode === "either"
            ? "Online or in person"
            : null;
    if (mode) facts.push({ key: "mode", icon: "globe", label: mode });

    if (attributeFlag(attributes, "serviceChat")) {
      facts.push({ key: "chat", icon: "message", label: "Message the seller to book" });
    }

    return facts;
  }

  if (input.type === "food") {
    if (input.prepTimeMinutes) {
      facts.push({
        key: "prep",
        icon: "clock",
        label: `Ready in ${humanMinutes(input.prepTimeMinutes)}`,
      });
    }
    facts.push(FULFILMENT_FACT[input.fulfilment]);
    if (input.variantCount > 1) {
      facts.push({ key: "options", icon: "list", label: `${input.variantCount} options` });
    }
    return facts;
  }

  if (input.type === "digital") {
    facts.push(FULFILMENT_FACT.digital);

    const fileName = attributeString(attributes, "fileName");
    if (fileName) facts.push({ key: "file", icon: "file", label: fileName });
    if (soldOut) facts.push({ key: "stock", icon: "alert", label: "Sold out", tone: "danger" });

    return facts;
  }

  if (input.type === "cargo") {
    // What a bulk buyer asks first: what a package contains, how much comes in
    // one, and how much it weighs.
    const packaging = attributeString(attributes, "packaging");
    if (packaging) facts.push({ key: "packaging", icon: "inventory", label: `Sold by the ${packaging.toLowerCase()}` });

    const units = attributeString(attributes, "unitsPerPackage");
    if (units) facts.push({ key: "units", icon: "products", label: `${units} per package` });

    const weight = attributeString(attributes, "weight");
    if (weight) facts.push({ key: "weight", icon: "inventory", label: `${weight} kg per package` });

    const minimum = attributeString(attributes, "minimumOrder");
    if (minimum) facts.push({ key: "minimum", icon: "list", label: `Minimum ${minimum}` });

    facts.push(FULFILMENT_FACT[input.fulfilment]);

    if (soldOut) facts.push({ key: "stock", icon: "alert", label: "Sold out", tone: "danger" });
    else if (inStock) {
      facts.push({ key: "stock", icon: "inventory", label: `${input.stock} package(s) in stock` });
    }

    return facts;
  }

  if (input.type === "event_ticket") {
    facts.push(FULFILMENT_FACT.ticket);

    const startsAt = attributeString(attributes, "eventStartsAt");
    if (startsAt) {
      const when = new Date(startsAt);
      if (!Number.isNaN(when.getTime())) {
        facts.push({
          key: "starts",
          icon: "events",
          label: when.toLocaleDateString(undefined, { day: "numeric", month: "short" }),
        });
      }
    }

    if (soldOut) facts.push({ key: "stock", icon: "alert", label: "Sold out", tone: "danger" });
    else if (inStock) {
      facts.push({
        key: "stock",
        icon: "ticket",
        label: `${input.stock} ticket${input.stock === 1 ? "" : "s"} left`,
      });
    }

    return facts;
  }

  // Everything physical: the thing itself, how it arrives, and whether there is
  // any choice to make about it.
  if (input.variantCount > 1) {
    facts.push({ key: "options", icon: "list", label: `${input.variantCount} options` });
  }
  facts.push(FULFILMENT_FACT[input.fulfilment]);

  if (soldOut) facts.push({ key: "stock", icon: "alert", label: "Sold out", tone: "danger" });
  else if (inStock) {
    facts.push({
      key: "stock",
      icon: "inventory",
      label: `${input.stock} in stock`,
    });
  }

  if (ordersInThread({ type: input.type, attributes })) {
    facts.push({ key: "thread", icon: "message", label: "Ask before you buy" });
  }

  return facts;
}
