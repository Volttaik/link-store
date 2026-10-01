import type { IconName } from "@/components/ui/Icon";
import type { CategoryKind } from "./categories";
import type { ListingType } from "./catalog";

export const PRODUCT_TYPES: ListingType[] = ["product"];
export type ModuleFilter =
  | { kind: "category"; param: string; label: string; description: string }
  | { kind: "select"; param: string; label: string; description?: string; column: string; options: Array<{ value: string; label: string }> }
  | { kind: "attributeSelect"; param: string; label: string; description?: string; attribute: string; multi?: boolean; options: Array<{ value: string; label: string }> }
  | { kind: "attributeText"; param: string; label: string; description?: string; attribute: string }
  | { kind: "range"; param: string; label: string; description?: string; column: string; money?: boolean; suffix?: string }
  | { kind: "attributeRange"; param: string; label: string; description?: string; attribute: string; suffix?: string }
  | { kind: "switch"; param: string; label: string; description?: string; source: "stock" | "attribute"; attribute?: string };
export type ModuleWorkflow = { href: string; allowsDraft: boolean; autoPublish: boolean; submitLabel: string };
export type WorkspaceModule = {
  key: string; label: string; noun: string; plural: string; blurb: string;
  icon: IconName; href: string; keywords: string[];
  source: "listings" | "events" | "drafts"; types: ListingType[];
  categoryKind: CategoryKind; workflow: ModuleWorkflow; filters: ModuleFilter[];
  allowedStatuses: Array<"active" | "draft" | "archived">;
  defaultStatus: "active" | "draft" | "archived";
};
export const MODULE_SORT_OPTIONS = [
  { value: "newest", label: "Newest first" }, { value: "oldest", label: "Oldest first" },
  { value: "price_desc", label: "Price: high to low" }, { value: "price_asc", label: "Price: low to high" },
  { value: "popular", label: "Most viewed" }, { value: "title", label: "Name A–Z" },
] as const;
export const WORKSPACE_MODULES: WorkspaceModule[] = [
  {
    key: "listing", label: "Products", noun: "product", plural: "products",
    blurb: "Manage your products.", icon: "products", href: "/workspace/listings",
    keywords: ["products", "product", "catalogue", "stock"], source: "listings", types: PRODUCT_TYPES,
    categoryKind: "product", workflow: { href: "/workspace/listings/new", allowsDraft: true, autoPublish: false, submitLabel: "Create product" },
    allowedStatuses: ["active", "draft", "archived"], defaultStatus: "active",
    filters: [
      { kind: "category", param: "cat", label: "Category", description: "Browse your product categories." },
      { kind: "range", param: "min", label: "Price", column: "price", money: true },
      { kind: "switch", param: "stock", label: "In stock only", source: "stock" },
    ],
  },
  {
    key: "events", label: "Events", noun: "event", plural: "events",
    blurb: "Curated collections of your products.", icon: "events", href: "/workspace/events",
    keywords: ["events", "collections", "campaigns", "drops", "sale"], source: "events", types: [],
    categoryKind: "product", workflow: { href: "/workspace/events/new", allowsDraft: true, autoPublish: false, submitLabel: "Save event" },
    allowedStatuses: ["active", "draft", "archived"], defaultStatus: "active", filters: [],
  },
  {
    key: "drafts", label: "Drafts", noun: "draft", plural: "drafts", blurb: "Products and Events you are still preparing.",
    icon: "edit", href: "/workspace/drafts", keywords: ["drafts", "unfinished", "unpublished"], source: "drafts", types: [],
    categoryKind: "product", workflow: { href: "/workspace/listings/new", allowsDraft: true, autoPublish: false, submitLabel: "Save draft" },
    allowedStatuses: ["draft", "active", "archived"], defaultStatus: "draft", filters: [],
  },
];
export const MODULE_MAP: Record<string, WorkspaceModule> = Object.fromEntries(WORKSPACE_MODULES.map(module => [module.key, module]));
export function workspaceModule(key: string | null | undefined): WorkspaceModule | null { return (key ? MODULE_MAP[key] : null) ?? null; }
export const LISTING_MODULES = WORKSPACE_MODULES.filter(module => module.source === "listings");
export const CREATABLE_MODULES = WORKSPACE_MODULES.filter(module => module.source !== "drafts");
export function moduleForListingType(type: string): WorkspaceModule | null { return type === "product" ? MODULE_MAP.listing : null; }
export function isModuleSort(value: string | null | undefined): boolean { return MODULE_SORT_OPTIONS.some(option => option.value === value); }
export type { CategoryKind };
