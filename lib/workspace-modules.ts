/**
 * The Workspace modules — the correction, as data.
 *
 * A Listing used to be a universal shelf with Services, Food, Rentals and Digital
 * as **filters of it** (`?kind=services`). That is not what a listing is. A
 * listing is a **product that is live and ready to be sold**; a service is a
 * service; an event is a date, a place and a poster. Each of those is its own
 * module with its own page, its own form, its own data requirements, its own
 * filters and its own management flow.
 *
 * This file is that architecture, declared once. A module page is a thin route
 * file that renders the shared surface from the declaration below, so:
 *
 *   * a module cannot accidentally be given another module's categories (the
 *     category kind it reads is part of its declaration);
 *   * a filter cannot be forgotten on one page and remembered on another (the
 *     facets are declared, and the page renders what it is given);
 *   * the side menu, its search and the mobile navigation are all built from the
 *     same list, so a module cannot exist in one and not the others.
 *
 * ## The four states, kept apart
 *
 * | State | Meaning | Where it lives |
 * | --- | --- | --- |
 * | **Draft** | started, not published, not for sale | Drafts (`/workspace/drafts`) |
 * | **Active** | live and available | its module, and the storefront |
 * | **Listing** | a *product* that is live and ready for sale | Listing (`/workspace/listings`) |
 * | **Archived** | deliberately put away | its module |
 *
 * "Listing" is the products module: a product that is not live is not a listing,
 * so draft products are never on that shelf — not hidden, *not queried*. They are
 * in Drafts, which is what Drafts is for. `products` is registered as a search
 * keyword for it, so searching the menu for "products" finds it.
 */

import type { IconName } from "@/components/ui/Icon";
import type { CategoryKind } from "./categories";
import type { ListingType } from "./catalog";

/**
 * The product listing types — what the Listing module manages.
 *
 * "Products" is deliberately the whole family: a garment, a phone and a sofa are
 * products, and the difference between them is a **category** (Fashion &
 * Apparel, Electronics, Home & Furniture), which is what the category tree in
 * §8–§11 is for. A separate module per product flavour would be the same rows
 * managed twice.
 */
export const PRODUCT_TYPES: ListingType[] = [
  "physical",
  "fashion",
  "electronics",
  "furniture",
  "automotive",
  // Cargo is a product family of its own: the same module manages it, with its
  // own type, its own fields and its own packaging-based pricing, rather than a
  // label printed on an ordinary product.
  "cargo",
  "other",
];

/**
 * A filter a module offers.
 *
 * `param` is the URL parameter the control writes to, and it is the module's own
 * — so two modules can each have a "price" range without sharing state. Where the
 * filter reads a real column it says so; where it reads the listing's own
 * `attributes` JSON it says that instead. Either way the filtering happens in
 * **SQL**, not in the browser.
 */
export type ModuleFilter =
  | {
      kind: "category";
      param: string;
      label: string;
      description: string;
    }
  | {
      kind: "select";
      param: string;
      label: string;
      description?: string;
      /** The `listings` column this reads. */
      column: string;
      options: Array<{ value: string; label: string }>;
    }
  | {
      kind: "attributeSelect";
      param: string;
      label: string;
      description?: string;
      /** The key inside `listings.attributes`. */
      attribute: string;
      /** True when the value is an array (multi-choice), matched on any. */
      multi?: boolean;
      options: Array<{ value: string; label: string }>;
    }
  | {
      kind: "attributeText";
      param: string;
      label: string;
      description?: string;
      attribute: string;
    }
  | {
      kind: "range";
      param: string;
      label: string;
      description?: string;
      /** The `listings` column this reads. */
      column: string;
      /** Money in minor units, formatted with the store's currency. */
      money?: boolean;
      suffix?: string;
    }
  | {
      kind: "attributeRange";
      param: string;
      label: string;
      description?: string;
      attribute: string;
      suffix?: string;
    }
  | {
      kind: "switch";
      param: string;
      label: string;
      description?: string;
      /** `stock` reads the tracked stock; otherwise the named attribute flag. */
      source: "stock" | "attribute";
      attribute?: string;
    };

/** How a module's rows are created. */
export type ModuleWorkflow = {
  /** Where "Add …" goes. */
  href: string;
  /**
   * Whether this workflow may save something unpublished.
   *
   * Only the Listing workflow may not: adding through Listing means "I am
   * listing this product for sale now", so there is no draft in it. Every other
   * module keeps draft → publish, because that is where drafts come from.
   */
  allowsDraft: boolean;
  /** Whether saving through this workflow publishes immediately. */
  autoPublish: boolean;
  /** The submit label — the workflow says what it is doing. */
  submitLabel: string;
};

export type WorkspaceModule = {
  key: string;
  /** The name of the module, as the side menu says it. */
  label: string;
  /** Singular, for copy: `Add a service`. */
  noun: string;
  plural: string;
  blurb: string;
  icon: IconName;
  href: string;
  /** Words the side-menu search should match, beyond the label. */
  keywords: string[];
  /** Where its rows live. */
  source: "listings" | "events" | "drafts";
  /** The listing types it manages (empty for the event and drafts modules). */
  types: ListingType[];
  /** The branch of the category tree it may use. */
  categoryKind: CategoryKind;
  workflow: ModuleWorkflow;
  /** The facets it offers — and, by omission, the facets it does not. */
  filters: ModuleFilter[];
  /**
   * The states this module's shelf may show.
   *
   * This is where "a product that is not active should not appear in Listing"
   * stops being a UI decision and becomes a query one: Drafts is absent from the
   * Listing module's list, so its page cannot select drafts however the URL is
   * edited, and the query it runs never returns one.
   */
  allowedStatuses: Array<"active" | "draft" | "archived">;
  /** The state the shelf opens on. */
  defaultStatus: "active" | "draft" | "archived";
};

const CONDITION_OPTIONS = [
  { value: "new", label: "New" },
  { value: "like-new", label: "Like new" },
  { value: "used", label: "Used" },
  { value: "refurbished", label: "Refurbished" },
  { value: "for-parts", label: "For parts / not working" },
];

const SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "popular", label: "Most viewed" },
  { value: "title", label: "Name A–Z" },
] as const;

export const MODULE_SORT_OPTIONS = SORT_OPTIONS;

export const WORKSPACE_MODULES: WorkspaceModule[] = [
  {
    key: "listing",
    label: "Listing",
    noun: "product",
    plural: "products",
    blurb: "Products that are live and ready to sell.",
    icon: "products",
    href: "/workspace/listings",
    keywords: ["products", "product", "catalogue", "catalog", "goods", "stock", "shop", "listing"],
    source: "listings",
    types: PRODUCT_TYPES,
    categoryKind: "product",
    workflow: {
      href: "/workspace/listings/new",
      allowsDraft: false,
      autoPublish: true,
      submitLabel: "List it for sale",
    },
    // No drafts. Archived stays reachable, because putting something away is a
    // deliberate act by the seller and there is nowhere else it can be undone.
    allowedStatuses: ["active", "archived"],
    defaultStatus: "active",
    filters: [
      {
        kind: "category",
        param: "cat",
        label: "Category",
        description: "The branch of the product tree this is in, down to the leaf.",
      },
      {
        kind: "attributeText",
        param: "a_brand",
        label: "Brand or maker",
        description: "Matches the brand written on the product.",
        attribute: "brand",
      },
      {
        kind: "attributeSelect",
        param: "a_packaging",
        label: "Packaging",
        description: "For cargo — what one priced unit is.",
        attribute: "packaging",
        options: [
          { value: "carton", label: "Carton" },
          { value: "sack", label: "Sack / bag" },
          { value: "crate", label: "Crate" },
          { value: "pallet", label: "Pallet" },
          { value: "drum", label: "Drum / barrel" },
          { value: "bundle", label: "Bundle" },
          { value: "roll", label: "Roll" },
        ],
      },
      {
        kind: "attributeSelect",
        param: "a_condition",
        label: "Condition",
        description: "How used the item is.",
        attribute: "condition",
        options: CONDITION_OPTIONS,
      },
      {
        kind: "range",
        param: "min",
        label: "Price",
        description: "Leave either side empty for no limit.",
        column: "price",
        money: true,
      },
      {
        kind: "switch",
        param: "stock",
        label: "Available only",
        description: "Hide anything that has sold out.",
        source: "stock",
      },
    ],
  },

  {
    key: "services",
    label: "Services",
    noun: "service",
    plural: "services",
    blurb: "Bookings, repairs, consultations and work you deliver.",
    icon: "services",
    href: "/workspace/services",
    keywords: ["service", "booking", "bookings", "appointment", "consultation", "repair", "work"],
    source: "listings",
    types: ["service"],
    categoryKind: "service",
    workflow: {
      href: "/workspace/services/new",
      allowsDraft: true,
      autoPublish: false,
      submitLabel: "Save service",
    },
    allowedStatuses: ["active", "draft", "archived"],
    defaultStatus: "active",
    filters: [
      {
        kind: "category",
        param: "cat",
        label: "Service category",
        description: "What kind of work this is.",
      },
      {
        kind: "range",
        param: "min",
        label: "Price",
        description: "What you charge for it.",
        column: "price",
        money: true,
      },
      {
        kind: "select",
        param: "mode",
        label: "Delivered",
        description: "Whether the work happens online or in person.",
        column: "service_mode",
        options: [
          { value: "online", label: "Online" },
          { value: "onsite", label: "In person" },
          { value: "either", label: "Online or in person" },
        ],
      },
      {
        kind: "range",
        param: "dur",
        label: "Duration",
        description: "How long one session takes.",
        column: "duration_minutes",
        suffix: "min",
      },
      {
        kind: "attributeText",
        param: "a_area",
        label: "Service area",
        description: "Where you travel to or serve.",
        attribute: "serviceArea",
      },
      {
        kind: "switch",
        param: "chat",
        label: "Agreed in the thread",
        description: "Services arranged in a conversation before booking.",
        source: "attribute",
        attribute: "orderViaChat",
      },
    ],
  },

  {
    key: "food",
    label: "Food",
    noun: "menu item",
    plural: "menu items",
    blurb: "Meals, drinks and groceries with prep time.",
    icon: "food",
    href: "/workspace/food",
    keywords: ["food", "menu", "meal", "meals", "kitchen", "restaurant", "groceries", "drinks"],
    source: "listings",
    types: ["food"],
    categoryKind: "food",
    workflow: {
      href: "/workspace/food/new",
      allowsDraft: true,
      autoPublish: false,
      submitLabel: "Save menu item",
    },
    allowedStatuses: ["active", "draft", "archived"],
    defaultStatus: "active",
    filters: [
      {
        kind: "category",
        param: "cat",
        label: "Menu category",
        description: "Where this sits on the menu.",
      },
      {
        kind: "range",
        param: "min",
        label: "Price",
        description: "Leave either side empty for no limit.",
        column: "price",
        money: true,
      },
      {
        kind: "range",
        param: "prep",
        label: "Prep time",
        description: "How long the kitchen needs.",
        column: "prep_time_minutes",
        suffix: "min",
      },
      {
        kind: "attributeSelect",
        param: "a_dietary",
        label: "Suitable for",
        description: "Matches anything carrying any of the chosen diets.",
        attribute: "dietary",
        multi: true,
        options: [
          { value: "vegetarian", label: "Vegetarian" },
          { value: "vegan", label: "Vegan" },
          { value: "halal", label: "Halal" },
          { value: "gluten-free", label: "Gluten free" },
          { value: "low-sugar", label: "Low sugar" },
        ],
      },
      {
        kind: "attributeSelect",
        param: "a_allergens",
        label: "Allergens",
        description: "Find what to avoid.",
        attribute: "allergens",
        multi: true,
        options: [
          { value: "milk", label: "Milk" },
          { value: "egg", label: "Egg" },
          { value: "fish", label: "Fish" },
          { value: "shellfish", label: "Shellfish" },
          { value: "peanuts", label: "Peanuts" },
          { value: "tree-nuts", label: "Tree nuts" },
          { value: "soy", label: "Soy" },
          { value: "wheat", label: "Wheat / gluten" },
          { value: "sesame", label: "Sesame" },
        ],
      },
      {
        kind: "select",
        param: "method",
        label: "Method",
        description: "How the order reaches the customer.",
        column: "fulfilment",
        options: [
          { value: "pickup", label: "Pickup" },
          { value: "shipping", label: "Delivery" },
        ],
      },
    ],
  },

  {
    key: "events",
    label: "Events",
    noun: "event",
    plural: "events",
    blurb: "Ticketed events, ticket types and check-ins.",
    icon: "events",
    href: "/workspace/events",
    keywords: ["event", "events", "tickets", "ticket", "show", "concert", "workshop", "conference"],
    source: "events",
    types: ["event_ticket"],
    categoryKind: "event",
    workflow: {
      href: "/workspace/events/new",
      allowsDraft: true,
      autoPublish: false,
      submitLabel: "Save event",
    },
    allowedStatuses: ["active", "draft", "archived"],
    defaultStatus: "active",
    filters: [],
  },

  {
    key: "rentals",
    label: "Rentals",
    noun: "rental",
    plural: "rentals",
    blurb: "Property, vehicles and equipment let by the day or month.",
    icon: "key",
    href: "/workspace/rentals",
    keywords: [
      "rental",
      "rentals",
      "rent",
      "let",
      "property",
      "properties",
      "apartment",
      "flat",
      "house",
      "room",
      "lease",
    ],
    source: "listings",
    types: ["rental"],
    categoryKind: "rental",
    workflow: {
      href: "/workspace/rentals/new",
      allowsDraft: true,
      autoPublish: false,
      submitLabel: "Save rental",
    },
    allowedStatuses: ["active", "draft", "archived"],
    defaultStatus: "active",
    filters: [
      {
        kind: "category",
        param: "cat",
        label: "Property category",
        description: "What is being let.",
      },
      {
        kind: "range",
        param: "min",
        label: "Rent",
        description: "Per the period it is let over.",
        column: "price",
        money: true,
      },
      {
        kind: "attributeSelect",
        param: "a_propertyType",
        label: "Type",
        description: "The kind of property or equipment.",
        attribute: "propertyType",
        options: [
          { value: "apartment", label: "Apartment / flat" },
          { value: "house", label: "House" },
          { value: "room", label: "Room" },
          { value: "self-contained", label: "Self-contained" },
          { value: "office", label: "Office" },
          { value: "shop", label: "Shop / retail" },
          { value: "warehouse", label: "Warehouse" },
          { value: "land", label: "Land" },
          { value: "vehicle", label: "Vehicle" },
          { value: "equipment", label: "Equipment" },
        ],
      },
      {
        kind: "attributeSelect",
        param: "a_rentUnit",
        label: "Let by",
        description: "The period the rent is quoted over.",
        attribute: "rentUnit",
        options: [
          { value: "day", label: "Day" },
          { value: "week", label: "Week" },
          { value: "month", label: "Month" },
        ],
      },
      {
        kind: "attributeSelect",
        param: "a_furnishing",
        label: "Furnishing",
        description: "How it comes.",
        attribute: "furnishing",
        options: [
          { value: "furnished", label: "Furnished" },
          { value: "semi-furnished", label: "Semi-furnished" },
          { value: "unfurnished", label: "Unfurnished" },
        ],
      },
      {
        kind: "attributeRange",
        param: "a_bedrooms",
        label: "Bedrooms",
        description: "At least this many.",
        attribute: "bedrooms",
      },
      {
        kind: "switch",
        param: "stock",
        label: "Available only",
        description: "Hide anything already taken.",
        source: "stock",
      },
    ],
  },

  {
    key: "digital",
    label: "Digital",
    noun: "digital product",
    plural: "digital products",
    blurb: "Files delivered automatically after payment.",
    icon: "digital",
    href: "/workspace/digital",
    keywords: ["digital", "files", "file", "download", "template", "ebook", "course", "software"],
    source: "listings",
    types: ["digital"],
    categoryKind: "digital",
    workflow: {
      href: "/workspace/digital/new",
      allowsDraft: true,
      autoPublish: false,
      submitLabel: "Save digital product",
    },
    allowedStatuses: ["active", "draft", "archived"],
    defaultStatus: "active",
    filters: [
      {
        kind: "category",
        param: "cat",
        label: "Digital category",
        description: "What kind of file this is.",
      },
      {
        kind: "range",
        param: "min",
        label: "Price",
        description: "Leave either side empty for no limit.",
        column: "price",
        money: true,
      },
      {
        kind: "attributeText",
        param: "a_format",
        label: "Format",
        description: "PDF, ZIP, MP4, the files the buyer will open.",
        attribute: "fileFormat",
      },
      {
        kind: "attributeSelect",
        param: "a_licenceType",
        label: "Licence",
        description: "How the buyer may use it.",
        attribute: "licenceType",
        options: [
          { value: "personal", label: "Personal use" },
          { value: "commercial", label: "Commercial use" },
          { value: "extended", label: "Extended / resale" },
        ],
      },
      {
        kind: "switch",
        param: "a_updates",
        label: "Includes updates",
        description: "Only products with future updates included.",
        source: "attribute",
        attribute: "includesUpdates",
      },
    ],
  },

  {
    key: "drafts",
    label: "Drafts",
    noun: "draft",
    plural: "drafts",
    blurb: "Everything you have started and not yet published.",
    icon: "edit",
    href: "/workspace/drafts",
    keywords: ["draft", "drafts", "unfinished", "unpublished", "wip", "started", "not published"],
    source: "drafts",
    types: [],
    categoryKind: "general",
    workflow: {
      href: "/workspace/listings/new",
      allowsDraft: true,
      autoPublish: false,
      submitLabel: "Save draft",
    },
    // Drafts is the one surface that is *about* unpublished work, so every state
    // is in scope here — it is the page that makes the other modules' rule work.
    allowedStatuses: ["draft", "active", "archived"],
    defaultStatus: "draft",
    filters: [],
  },
];

export const MODULE_MAP: Record<string, WorkspaceModule> = Object.fromEntries(
  WORKSPACE_MODULES.map((module) => [module.key, module]),
);

export function workspaceModule(key: string | null | undefined): WorkspaceModule | null {
  return (key ? MODULE_MAP[key] : undefined) ?? null;
}

/**
 * The modules that manage listings rows — every module except the event and
 * drafts surfaces, which read their own tables.
 */
export const LISTING_MODULES = WORKSPACE_MODULES.filter(
  (module) => module.source === "listings",
);

/** The modules a seller can add something to, in menu order. */
export const CREATABLE_MODULES = WORKSPACE_MODULES.filter(
  (module) => module.source !== "drafts",
);

/**
 * The right module for a listing type — so a row is always shown under its own
 * module rather than under whichever page happens to query it.
 */
export function moduleForListingType(type: string): WorkspaceModule | null {
  return (
    LISTING_MODULES.find((module) => module.types.includes(type as ListingType)) ??
    MODULE_MAP.listing ??
    null
  );
}

/** The sort options every module's shelf offers, in the same order. */
export function isModuleSort(value: string | null | undefined): boolean {
  return SORT_OPTIONS.some((option) => option.value === value);
}

export type { CategoryKind };
