export type ListingFieldKind = "text" | "longText" | "number" | "money" | "boolean" | "choice" | "multiChoice" | "date";
export type ListingFieldOption = { value: string; label: string };
export type ListingFieldDef = { key: string; label: string; kind: ListingFieldKind; group?: string; placeholder?: string; description?: string; options?: ListingFieldOption[]; suffix?: string };
export type ListingFieldSchema = { title: string; description: string; fields: ListingFieldDef[] };
export const LISTING_FIELD_SCHEMAS = { product: { title: "Product details", description: "", fields: [] } };
export function listingFieldSchema(_type?: string | null): ListingFieldSchema { return LISTING_FIELD_SCHEMAS.product; }
export function ownFieldValues(_type?: string | null, values?: Record<string, unknown> | null): Record<string, unknown> { return { ...(values ?? {}) }; }
