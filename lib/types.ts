/**
 * Domain types.
 *
 * These mirror the SQL schema. SQLite hands back integers for booleans and
 * strings for timestamps, so the row types reflect what the driver returns;
 * repositories map rows into the view models at the bottom of this file when a
 * shape needs tidying for the UI.
 */

import type { FulfilmentMode, ListingType } from "./catalog";

export type { FulfilmentMode, ListingType };

// --- Identity ---------------------------------------------------------------

export type UserRole = "user" | "admin";

export type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  avatar_url: string | null;
  phone: string | null;
  role: UserRole;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
};

/** The authenticated principal handed to the UI — never includes the hash. */
export type SessionUser = {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: UserRole;
};

export type SessionRow = {
  id: string;
  user_id: string;
  user_agent: string | null;
  ip: string | null;
  expires_at: string;
  created_at: string;
};

// --- Store ------------------------------------------------------------------

export type StoreRow = {
  id: string;
  user_id: string;
  slug: string;
  name: string;
  tagline: string | null;
  description: string | null;
  logo_url: string | null;
  banner_url: string | null;
  primary_category: string | null;
  currency: string;
  contact_email: string | null;
  contact_phone: string | null;
  website_url: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  socials: string | null;
  is_published: number;
  created_at: string;
  updated_at: string;
};

export type StoreSettingsRow = {
  store_id: string;
  low_stock_threshold: number;
  order_prefix: string;
  shipping_flat_fee: number;
  free_shipping_over: number | null;
  payout_bank_code: string | null;
  payout_bank_name: string | null;
  payout_account_number: string | null;
  payout_account_name: string | null;
  storefront_sections: string | null;
  /** The seller's honest delivery estimate, in days — a range, never a promise. */
  delivery_estimate_min_days: number;
  delivery_estimate_max_days: number;
  /** Where and when a buyer collects a pickup order. */
  pickup_location_name: string | null;
  pickup_address: string | null;
  pickup_hours: string | null;
  pickup_instructions: string | null;
  /** The storefront's lead experience; null follows what the shop sells. */
  design_type: string | null;
  updated_at: string;
};

export type CategoryRow = {
  id: string;
  store_id: string | null;
  /** The category this one sits under. `null` means it is a main category. */
  parent_id: string | null;
  name: string;
  slug: string;
  kind: string;
  icon: string | null;
  position: number;
  created_at: string;
};

// --- Listings ---------------------------------------------------------------

export type ListingStatus = "draft" | "active" | "archived";

export type ListingRow = {
  id: string;
  store_id: string;
  category_id: string | null;
  type: string;
  fulfilment: FulfilmentMode;
  title: string;
  slug: string;
  subtitle: string | null;
  description: string | null;
  currency: string;
  price: number;
  compare_at_price: number | null;
  cost_price: number | null;
  sku: string | null;
  track_inventory: number;
  stock: number;
  duration_minutes: number | null;
  service_mode: string | null;
  prep_time_minutes: number | null;
  attributes: string | null;
  status: ListingStatus;
  is_featured: number;
  views_count: number;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

/** A message thread between a buyer and a store. */
export type ConversationRow = {
  id: string;
  store_id: string;
  listing_id: string | null;
  buyer_user_id: string;
  buyer_name: string | null;
  buyer_email: string | null;
  subject: string | null;
  last_message_at: string;
  created_at: string;
};

/** One piece of media attached to a message. The key is the storage key the
 * sender uploaded; the URL is always resolved server-side from it. */
export type MessageAttachment = {
  key: string;
  url: string;
  fileName: string;
  contentType: string;
  size: number;
};

export type MessageRow = {
  id: string;
  conversation_id: string;
  sender_user_id: string;
  body: string;
  /** JSON array of `MessageAttachment`, or NULL for text-only messages. */
  attachments: string | null;
  /** The payment request this message is the card for, when it carries one. */
  payment_request_id: string | null;
  read_at: string | null;
  /** When the sender last changed the words. */
  edited_at: string | null;
  /** The tombstone: removed for everyone, content gone, row kept. */
  deleted_for_everyone_at: string | null;
  created_at: string;
};

/**
 * A negotiated payment agreed in a conversation — the record behind the payment
 * card in the chat.
 *
 * The agreed `amount` is written once at creation and never rewritten: the
 * request is an immutable payment instruction, not an editable invoice, and
 * paying it never touches the public price of the listing it relates to.
 */
export type PaymentRequestRow = {
  id: string;
  conversation_id: string;
  store_id: string;
  /** The seller who asked for the money. */
  created_by: string;
  /** The buyer the request was sent to — the only account that can pay it. */
  recipient_user_id: string;
  /** The product/listing this negotiated payment relates to, when there is one. */
  listing_id: string | null;
  /** Context frozen as it was agreed — what the card shows, never internal ids. */
  context_title: string | null;
  context_image_url: string | null;
  seller_name: string | null;
  /** The listing's advertised price at creation, when there was a listing. */
  original_amount: number | null;
  description: string | null;
  /** The agreed amount in minor units. Immutable. */
  amount: number;
  currency: string;
  status: PaymentRequestStatus;
  /** The Paystack transaction reference of the current attempt. */
  reference: string | null;
  order_id: string | null;
  expires_at: string | null;
  paid_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PaymentRequestStatus =
  | "awaiting_payment"
  | "processing"
  | "paid"
  | "failed"
  | "expired"
  | "cancelled";

/** One message in one viewer's own view — "delete for me". */
export type MessageUserStateRow = {
  message_id: string;
  user_id: string;
  deleted_at: string | null;
  updated_at: string;
};

/** One conversation in one viewer's own chat list — delete / clear my chat. */
export type ConversationUserStateRow = {
  conversation_id: string;
  user_id: string;
  deleted_at: string | null;
  cleared_at: string | null;
  updated_at: string;
};

export type ListingImageRow = {
  id: string;
  listing_id: string;
  image_url: string;
  storage_key: string | null;
  alt: string | null;
  position: number;
  created_at: string;
};

export type ListingVariantRow = {
  id: string;
  listing_id: string;
  name: string;
  sku: string | null;
  price: number | null;
  stock: number;
  attributes: string | null;
  position: number;
  created_at: string;
};

export type DigitalAssetRow = {
  id: string;
  listing_id: string;
  storage_key: string;
  file_name: string;
  content_type: string | null;
  file_size: number | null;
  version: number;
  created_at: string;
};

/** A listing joined with its store and media — the shape the UI renders. */
export type ListingCardData = {
  id: string;
  storeId: string;
  storeName: string;
  storeSlug: string;
  storeLogoUrl: string | null;
  title: string;
  slug: string;
  type: string;
  fulfilment: FulfilmentMode;
  price: number;
  compareAtPrice: number | null;
  currency: string;
  imageUrl: string | null;
  categoryName: string | null;
  status: string;
  stock: number;
  trackInventory: boolean;
  isFeatured: boolean;
  /**
   * How many purchasable options this listing has. A card cannot choose an
   * option for the customer, so it sends them to the listing instead of adding
   * a price the customer never picked.
   */
  variantCount: number;
  viewsCount: number;
  createdAt: string;
  /**
   * The event a ticket listing sells admission to, when one is linked. A card's
   * "Buy Ticket" leads into that event's ticket purchase — never into a cart.
   */
  eventId: string | null;
  /**
   * The listing's type-specific metadata, already parsed: how long a service
   * runs, the period a rental is let over, the file a download delivers. Cards
   * read this rather than the raw column so no surface has to know JSON.
   */
  attributes: Record<string, unknown>;
  durationMinutes: number | null;
  serviceMode: string | null;
  prepTimeMinutes: number | null;
};

export type ListingDetail = ListingCardData & {
  subtitle: string | null;
  description: string | null;
  sku: string | null;
  images: ListingImageRow[];
  variants: ListingVariantRow[];
  digitalAssets: DigitalAssetRow[];
  categoryId: string | null;
  costPrice: number | null;
  storeCurrency: string;
  storeCity: string | null;
  storeCountry: string | null;
  storePublished: boolean;
  storeContactEmail: string | null;
  storeContactPhone: string | null;
  storeDescription: string | null;
  storeTagline: string | null;
};

// --- Events -----------------------------------------------------------------

export type EventRow = {
  id: string;
  store_id: string;
  listing_id: string | null;
  title: string;
  slug: string;
  description: string | null;
  cover_image_url: string | null;
  starts_at: string;
  ends_at: string | null;
  timezone: string;
  venue_name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  is_online: number;
  online_url: string | null;
  capacity: number | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export type TicketTypeRow = {
  id: string;
  event_id: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  quantity_total: number;
  quantity_sold: number;
  max_per_order: number;
  sales_start: string | null;
  sales_end: string | null;
  is_active: number;
  position: number;
  created_at: string;
};

export type EventCardData = {
  id: string;
  storeId: string;
  storeName: string;
  storeSlug: string;
  title: string;
  slug: string;
  description: string | null;
  coverImageUrl: string | null;
  startsAt: string;
  endsAt: string | null;
  venueName: string | null;
  city: string | null;
  country: string | null;
  isOnline: boolean;
  status: string;
  minPrice: number | null;
  currency: string;
  /** Tickets still on sale. */
  ticketsAvailable: number;
  /** Tickets sold, across every type. */
  ticketsSold: number;
  /** Tickets put up for sale, across every type. */
  ticketsTotal: number;
  /** Tickets scanned at the door. */
  checkedIn: number;
};

export type EventDetail = EventCardData & {
  timezone: string;
  address: string | null;
  state: string | null;
  onlineUrl: string | null;
  capacity: number | null;
  ticketTypes: TicketTypeRow[];
  storeLogoUrl: string | null;
  storeTagline: string | null;
};

// --- Commerce ---------------------------------------------------------------

export type CartRow = {
  id: string;
  token: string;
  user_id: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export type CartItemRow = {
  id: string;
  cart_id: string;
  listing_id: string;
  variant_id: string | null;
  ticket_type_id: string | null;
  quantity: number;
  unit_price: number;
  currency: string;
  metadata: string | null;
  created_at: string;
  updated_at: string;
};

export type CartItemView = {
  id: string;
  listingId: string;
  variantId: string | null;
  ticketTypeId: string | null;
  title: string;
  variantName: string | null;
  imageUrl: string | null;
  slug: string;
  type: string;
  fulfilment: FulfilmentMode;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  currency: string;
  /** Current authoritative price — differs from unitPrice if the seller changed it. */
  currentPrice: number;
  availableStock: number | null;
  trackInventory: boolean;
  status: string;
  eventId: string | null;
  eventTitle: string | null;
};

export type CartView = {
  id: string;
  currency: string;
  /** Every line in the basket, across every store. */
  items: CartItemView[];
  subtotal: number;
  itemCount: number;
  /**
   * The same lines grouped by the seller they would be ordered from. One group
   * becomes one order (and one payment) at checkout, so a basket can hold items
   * from several stores without ever paying a seller for another seller's goods.
   */
  groups: CartStoreGroup[];
  storeCount: number;
};

export type CartStoreGroup = {
  storeId: string;
  storeName: string;
  storeSlug: string;
  items: CartItemView[];
  subtotal: number;
  itemCount: number;
};

export type OrderStatus =
  | "pending"
  | "paid"
  | "processing"
  | "fulfilled"
  | "cancelled"
  | "refunded";

export type PaymentStatus = "unpaid" | "pending" | "paid" | "failed" | "refunded";

export type OrderRow = {
  id: string;
  order_number: string;
  store_id: string;
  customer_id: string | null;
  user_id: string | null;
  email: string;
  customer_name: string | null;
  phone: string | null;
  currency: string;
  subtotal: number;
  discount_total: number;
  shipping_total: number;
  tax_total: number;
  total: number;
  status: OrderStatus;
  payment_status: PaymentStatus;
  discount_code: string | null;
  customer_note: string | null;
  shipping_address: string | null;
  access_token: string;
  source: string;
  /** How the buyer gets their goods: delivery | pickup | digital | none. */
  fulfilment_method: "delivery" | "pickup" | "digital" | "none";
  /** The delivery estimate as it stood at purchase — "3–5 days", not a promise. */
  estimated_delivery: string | null;
  /** Opaque receipt identifier — what the receipt's QR encodes. */
  receipt_code: string | null;
  created_at: string;
  updated_at: string;
  paid_at: string | null;
  fulfilled_at: string | null;
  cancelled_at: string | null;
};

export type OrderItemRow = {
  id: string;
  order_id: string;
  item_type: string;
  listing_id: string | null;
  variant_id: string | null;
  ticket_type_id: string | null;
  event_id: string | null;
  title: string;
  variant_name: string | null;
  unit_price: number;
  quantity: number;
  total: number;
  currency: string;
  metadata: string | null;
  fulfilment_status: string;
  created_at: string;
};

export type OrderWithItems = OrderRow & {
  storeName: string;
  storeSlug: string;
  storeLogoUrl: string | null;
  items: OrderItemRow[];
};

export type PaymentRow = {
  id: string;
  order_id: string;
  store_id: string;
  provider: string;
  reference: string;
  provider_reference: string | null;
  authorization_url: string | null;
  amount: number;
  currency: string;
  status: "pending" | "success" | "failed" | "abandoned";
  channel: string | null;
  failure_reason: string | null;
  raw_payload: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TicketRow = {
  id: string;
  order_id: string;
  order_item_id: string | null;
  event_id: string;
  ticket_type_id: string | null;
  store_id: string;
  code: string;
  holder_name: string | null;
  holder_email: string | null;
  /**
   * The ticket state machine. `used` is written only by the atomic door
   * redemption; cancelled/refunded follow their order; expired is the event
   * passing; void is a withdrawal by the seller.
   */
  status: "valid" | "used" | "cancelled" | "refunded" | "expired" | "void";
  /** When it was used at the door. */
  checked_in_at: string | null;
  created_at: string;
};

/**
 * A ticket with the event and type it belongs to folded in.
 *
 * A ticket on its own is not much use to the person holding it or to the person
 * at the door: what matters is which event it opens and what kind of ticket it
 * is, so both queries that list tickets join those in.
 */
export type TicketWithEvent = TicketRow & {
  event_title: string | null;
  event_slug: string | null;
  event_starts_at: string | null;
  event_ends_at: string | null;
  event_venue: string | null;
  event_city: string | null;
  event_online: number | null;
  ticket_type_name: string | null;
  order_number: string | null;
  order_currency: string | null;
};

export type DownloadRow = {
  id: string;
  order_id: string;
  order_item_id: string;
  listing_id: string;
  asset_id: string | null;
  token: string;
  email: string | null;
  download_count: number;
  max_downloads: number;
  expires_at: string | null;
  last_downloaded_at: string | null;
  created_at: string;
};

// --- Finance / management ---------------------------------------------------

export type TransactionRow = {
  id: string;
  store_id: string;
  order_id: string | null;
  payment_id: string | null;
  payout_id: string | null;
  type: string;
  direction: "credit" | "debit";
  amount: number;
  currency: string;
  balance_after: number;
  description: string | null;
  reference: string | null;
  created_at: string;
};

export type PayoutRow = {
  id: string;
  store_id: string;
  amount: number;
  currency: string;
  status: "pending" | "processing" | "paid" | "failed";
  method: string;
  reference: string | null;
  destination: string | null;
  notes: string | null;
  requested_at: string;
  processed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CustomerRow = {
  id: string;
  store_id: string;
  user_id: string | null;
  email: string;
  name: string | null;
  phone: string | null;
  orders_count: number;
  total_spent: number;
  last_order_at: string | null;
  created_at: string;
  updated_at: string;
};

export type DiscountRow = {
  id: string;
  store_id: string;
  code: string | null;
  name: string;
  type: "percentage" | "fixed";
  value: number;
  min_subtotal: number;
  usage_limit: number | null;
  used_count: number;
  scope: "order" | "listing";
  listing_id: string | null;
  starts_at: string | null;
  ends_at: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
};

export type ReviewRow = {
  id: string;
  store_id: string;
  listing_id: string | null;
  order_id: string | null;
  customer_name: string | null;
  customer_email: string | null;
  rating: number;
  title: string | null;
  body: string | null;
  status: string;
  created_at: string;
};

export type InventoryMovementRow = {
  id: string;
  store_id: string;
  listing_id: string;
  variant_id: string | null;
  delta: number;
  reason: string;
  note: string | null;
  reference: string | null;
  stock_after: number;
  created_at: string;
};

// --- Results ----------------------------------------------------------------

/**
 * Server actions return this instead of throwing, so forms can render an
 * Alert with the real reason rather than a generic failure.
 */
export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function fail(error: string, fieldErrors?: Record<string, string>): ActionResult<never> {
  return { ok: false, error, fieldErrors };
}
