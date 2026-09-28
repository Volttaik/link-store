/** URL-safe slugs and storefront handles. */

/** Convert arbitrary text into a URL-safe slug. */
export function slugify(input: string, maxLength = 60): string {
  const base = input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['"’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/g, "");

  return base || "item";
}

/**
 * Storefront handles become the public link (`/@handle`), so they are held to
 * a stricter alphabet than listing slugs.
 */
export const HANDLE_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{1,28}[a-z0-9])$/;

const RESERVED_HANDLES = new Set([
  "admin", "api", "workspace", "login", "register", "logout", "cart", "checkout",
  "orders", "search", "stores", "products", "services", "events", "food", "digital",
  "categories", "about", "help", "support", "settings", "dashboard", "account",
  "pricing", "terms", "privacy", "st", "static", "public", "assets", "media", "files",
  "downloads", "signin", "signup", "me", "new", "explore",
]);

export function handleError(handle: string): string | null {
  const value = handle.trim().toLowerCase().replace(/^@/, "");
  if (value.length < 3) return "Handles must be at least 3 characters.";
  if (value.length > 30) return "Handles must be 30 characters or fewer.";
  if (!HANDLE_PATTERN.test(value)) {
    return "Use lowercase letters, numbers, and . _ - only (must start and end with a letter or number).";
  }
  if (RESERVED_HANDLES.has(value)) return "That handle is reserved by Link Store.";
  return null;
}

export function normalizeHandle(handle: string): string {
  return handle.trim().toLowerCase().replace(/^@/, "");
}

/** Public storefront path for a handle. */
export function storefrontPath(handle: string): string {
  return `/@${normalizeHandle(handle)}`;
}
