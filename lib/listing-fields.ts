/**
 * What each kind of listing is described by.
 *
 * A marketplace is not one form. A menu item needs ingredients and allergens, a
 * garment needs a fabric and a size, a flat needs bedrooms and a deposit, and a
 * service needs a duration and a service area. Forcing all of them through one
 * product form is what makes a small marketplace feel like a spreadsheet.
 *
 * This module is the single, declarative source of truth for those differences.
 * A listing type maps to a schema; the schema is a list of plain data — a key, a
 * label, a kind, its options — and nothing else. The form renders whatever the
 * schema says, so adding a field (or a whole new listing type) is a data change
 * here, never a change to the form component. That is what makes it scalable:
 * `ListingForm` has no per-type branches at all.
 *
 * **Values live in `listings.attributes`.** That JSON column already exists and
 * already carries the type-specific facts the cards read (`lib/catalog.ts`), so
 * every field here is additive: no migration, and a listing saved before a field
 * was introduced simply has no value for it. `key` is the property inside that
 * JSON object, which is why keys are short, stable and never renamed.
 *
 * Nothing in here can change how a listing is *priced, taxed, fulfilled or paid
 * for*. Those stay in real columns, so a seller's own vocabulary can never break
 * checkout.
 *
 * Field kinds are the honest minimum a listing actually needs:
 *
 * | Kind | Stored as | Used for |
 * | --- | --- | --- |
 * | `text` | string | brand, model, colour |
 * | `longText` | string | ingredients, house rules |
 * | `number` | number | bedrooms, mileage, weight |
 * | `money` | number (minor units) | deposit, service charge |
 * | `boolean` | boolean | furnished, pets allowed |
 * | `choice` | string | condition, property type |
 * | `multiChoice` | string[] | allergens, amenities |
 * | `date` | string (ISO) | available from, best before |
 */

import type { ListingType } from "./catalog";

export type ListingFieldKind =
  | "text"
  | "longText"
  | "number"
  | "money"
  | "boolean"
  | "choice"
  | "multiChoice"
  | "date";

export type ListingFieldOption = { value: string; label: string };

export type ListingFieldDef = {
  /** The property this field writes inside `listings.attributes`. */
  key: string;
  label: string;
  kind: ListingFieldKind;
  /** The card the form groups this field under. */
  group?: string;
  placeholder?: string;
  /** One line explaining what to put here, shown under the control. */
  description?: string;
  /** Required for `choice` / `multiChoice`. */
  options?: ListingFieldOption[];
  /** Unit shown after a `number` / `money` input (e.g. `kg`, `sqm`). */
  suffix?: string;
};

export type ListingFieldSchema = {
  /** The heading the type's own details are collected under. */
  title: string;
  /** One line on why these are asked for. */
  description: string;
  fields: ListingFieldDef[];
};

const CONDITION: ListingFieldOption[] = [
  { value: "new", label: "New" },
  { value: "like-new", label: "Like new" },
  { value: "used", label: "Used" },
  { value: "refurbished", label: "Refurbished" },
  { value: "for-parts", label: "For parts / not working" },
];

const COLOURS: ListingFieldOption[] = [
  { value: "black", label: "Black" },
  { value: "white", label: "White" },
  { value: "grey", label: "Grey" },
  { value: "beige", label: "Beige" },
  { value: "brown", label: "Brown" },
  { value: "red", label: "Red" },
  { value: "orange", label: "Orange" },
  { value: "yellow", label: "Yellow" },
  { value: "green", label: "Green" },
  { value: "blue", label: "Blue" },
  { value: "purple", label: "Purple" },
  { value: "pink", label: "Pink" },
  { value: "gold", label: "Gold" },
  { value: "silver", label: "Silver" },
  { value: "multi", label: "Multicoloured" },
];

/**
 * The schemas, per listing type.
 *
 * The fields are what the large marketplaces actually ask for, trimmed to what a
 * buyer genuinely uses to decide: identity (brand/make), the physical facts
 * (size, colour, material, dimensions), the state (condition), and the
 * practicalities (warranty, care, availability). Anything a *particular* seller
 * needs beyond this is what the per-store custom fields will add on top of this
 * registry, rather than bloating it for everyone.
 */
export const LISTING_FIELD_SCHEMAS: Record<ListingType, ListingFieldSchema> = {
  physical: {
    title: "Item details",
    description: "What this is, and what condition it is in.",
    fields: [
      { key: "brand", label: "Brand", kind: "text", group: "Identity", placeholder: "Nike" },
      { key: "condition", label: "Condition", kind: "choice", group: "Identity", options: CONDITION },
      { key: "model", label: "Model or part number", kind: "text", group: "Identity" },
      { key: "colour", label: "Colour", kind: "choice", group: "Appearance", options: COLOURS },
      { key: "material", label: "Material", kind: "text", group: "Appearance", placeholder: "Cotton, steel, oak…" },
      { key: "dimensions", label: "Dimensions", kind: "text", group: "Appearance", placeholder: "30 × 20 × 10 cm" },
      { key: "weight", label: "Weight", kind: "number", group: "Appearance", suffix: "kg" },
      { key: "warranty", label: "Warranty", kind: "text", group: "Buying", placeholder: "12 months" },
      { key: "countryOfOrigin", label: "Country of origin", kind: "text", group: "Buying" },
    ],
  },

  fashion: {
    title: "Garment details",
    description: "Sizes, fabric and who it is for, the details a shopper filters on.",
    fields: [
      { key: "brand", label: "Brand", kind: "text", group: "Identity" },
      { key: "clothingType", label: "Type", kind: "choice", group: "Identity", options: [
        { value: "tops", label: "Tops & shirts" },
        { value: "bottoms", label: "Trousers & bottoms" },
        { value: "dresses", label: "Dresses" },
        { value: "outerwear", label: "Outerwear" },
        { value: "footwear", label: "Footwear" },
        { value: "bags", label: "Bags" },
        { value: "accessories", label: "Accessories" },
      ] },
      { key: "audience", label: "Who it is for", kind: "choice", group: "Identity", options: [
        { value: "women", label: "Women" },
        { value: "men", label: "Men" },
        { value: "unisex", label: "Unisex" },
        { value: "girls", label: "Girls" },
        { value: "boys", label: "Boys" },
        { value: "baby", label: "Baby" },
      ] },
      { key: "sizes", label: "Sizes available", kind: "text", group: "Fit", placeholder: "S, M, L, XL", description: "Comma-separated. Variants below can carry their own stock per size." },
      { key: "fabric", label: "Fabric", kind: "text", group: "Fit", placeholder: "100% cotton" },
      { key: "fit", label: "Fit", kind: "choice", group: "Fit", options: [
        { value: "slim", label: "Slim" },
        { value: "regular", label: "Regular" },
        { value: "loose", label: "Loose / oversized" },
      ] },
      { key: "colour", label: "Colour", kind: "choice", group: "Fit", options: COLOURS },
      { key: "pattern", label: "Pattern", kind: "choice", group: "Fit", options: [
        { value: "solid", label: "Solid" },
        { value: "striped", label: "Striped" },
        { value: "checked", label: "Checked" },
        { value: "floral", label: "Floral" },
        { value: "printed", label: "Printed" },
      ] },
      { key: "condition", label: "Condition", kind: "choice", group: "Buying", options: CONDITION },
      { key: "careInstructions", label: "Care instructions", kind: "longText", group: "Buying", placeholder: "Machine wash cold, do not tumble dry" },
    ],
  },

  electronics: {
    title: "Device details",
    description: "The specifications a buyer compares before they choose.",
    fields: [
      { key: "brand", label: "Brand", kind: "text", group: "Identity" },
      { key: "model", label: "Model", kind: "text", group: "Identity" },
      { key: "condition", label: "Condition", kind: "choice", group: "Identity", options: CONDITION },
      { key: "colour", label: "Colour", kind: "choice", group: "Appearance", options: COLOURS },
      { key: "storage", label: "Storage or capacity", kind: "text", group: "Specification", placeholder: "256 GB" },
      { key: "connectivity", label: "Connectivity", kind: "multiChoice", group: "Specification", options: [
        { value: "wifi", label: "Wi-Fi" },
        { value: "bluetooth", label: "Bluetooth" },
        { value: "5g", label: "5G" },
        { value: "usb-c", label: "USB-C" },
        { value: "hdmi", label: "HDMI" },
        { value: "ethernet", label: "Ethernet" },
      ] },
      { key: "powerRating", label: "Power", kind: "text", group: "Specification", placeholder: "65 W" },
      { key: "included", label: "What's in the box", kind: "longText", group: "Buying" },
      { key: "warranty", label: "Warranty", kind: "text", group: "Buying", placeholder: "6 months" },
    ],
  },

  furniture: {
    title: "Furniture details",
    description: "Size, material and assembly, the details that decide whether it fits.",
    fields: [
      { key: "brand", label: "Brand or maker", kind: "text", group: "Identity" },
      { key: "room", label: "For", kind: "choice", group: "Identity", options: [
        { value: "living-room", label: "Living room" },
        { value: "bedroom", label: "Bedroom" },
        { value: "dining", label: "Dining room" },
        { value: "office", label: "Office" },
        { value: "outdoor", label: "Outdoor" },
        { value: "kitchen", label: "Kitchen" },
      ] },
      { key: "material", label: "Material", kind: "text", group: "Appearance", placeholder: "Oak, leather, rattan…" },
      { key: "colour", label: "Colour", kind: "choice", group: "Appearance", options: COLOURS },
      { key: "dimensions", label: "Dimensions", kind: "text", group: "Fit", placeholder: "W 180 × D 90 × H 75 cm" },
      { key: "weight", label: "Weight", kind: "number", group: "Fit", suffix: "kg" },
      { key: "assemblyRequired", label: "Assembly required", kind: "boolean", group: "Fit" },
      { key: "condition", label: "Condition", kind: "choice", group: "Buying", options: CONDITION },
    ],
  },

  automotive: {
    title: "Vehicle details",
    description: "The specification a buyer checks before they travel to see it.",
    fields: [
      { key: "make", label: "Make", kind: "text", group: "Identity", placeholder: "Toyota" },
      { key: "model", label: "Model", kind: "text", group: "Identity", placeholder: "Corolla" },
      { key: "year", label: "Year", kind: "number", group: "Identity" },
      { key: "condition", label: "Condition", kind: "choice", group: "Identity", options: CONDITION },
      { key: "mileage", label: "Mileage", kind: "number", group: "Specification", suffix: "km" },
      { key: "transmission", label: "Transmission", kind: "choice", group: "Specification", options: [
        { value: "automatic", label: "Automatic" },
        { value: "manual", label: "Manual" },
      ] },
      { key: "fuelType", label: "Fuel", kind: "choice", group: "Specification", options: [
        { value: "petrol", label: "Petrol" },
        { value: "diesel", label: "Diesel" },
        { value: "hybrid", label: "Hybrid" },
        { value: "electric", label: "Electric" },
        { value: "cng", label: "CNG" },
      ] },
      { key: "bodyType", label: "Body type", kind: "choice", group: "Specification", options: [
        { value: "sedan", label: "Sedan" },
        { value: "suv", label: "SUV" },
        { value: "hatchback", label: "Hatchback" },
        { value: "pickup", label: "Pickup" },
        { value: "bus", label: "Bus" },
        { value: "truck", label: "Truck" },
        { value: "motorcycle", label: "Motorcycle" },
      ] },
      { key: "colour", label: "Colour", kind: "choice", group: "Appearance", options: COLOURS },
      { key: "engineSize", label: "Engine size", kind: "text", group: "Appearance", placeholder: "1.8 L" },
      { key: "registered", label: "Registered and papers in order", kind: "boolean", group: "Buying" },
    ],
  },

  food: {
    title: "Menu details",
    description: "Ingredients, allergens and how it is served.",
    fields: [
      { key: "ingredients", label: "Ingredients", kind: "longText", group: "What's in it", placeholder: "Rice, tomatoes, pepper, chicken…" },
      { key: "allergens", label: "Allergens", kind: "multiChoice", group: "What's in it", options: [
        { value: "milk", label: "Milk" },
        { value: "egg", label: "Egg" },
        { value: "fish", label: "Fish" },
        { value: "shellfish", label: "Shellfish" },
        { value: "peanuts", label: "Peanuts" },
        { value: "tree-nuts", label: "Tree nuts" },
        { value: "soy", label: "Soy" },
        { value: "wheat", label: "Wheat / gluten" },
        { value: "sesame", label: "Sesame" },
      ] },
      { key: "dietary", label: "Suitable for", kind: "multiChoice", group: "What's in it", options: [
        { value: "vegetarian", label: "Vegetarian" },
        { value: "vegan", label: "Vegan" },
        { value: "halal", label: "Halal" },
        { value: "gluten-free", label: "Gluten free" },
        { value: "low-sugar", label: "Low sugar" },
      ] },
      { key: "portion", label: "Portion or size", kind: "choice", group: "Serving", options: [
        { value: "small", label: "Small" },
        { value: "regular", label: "Regular" },
        { value: "large", label: "Large" },
        { value: "family", label: "Family / sharing" },
        { value: "per-kg", label: "Sold by weight" },
      ] },
      { key: "serves", label: "Serves", kind: "number", group: "Serving", suffix: "people" },
      { key: "spiceLevel", label: "Spice level", kind: "choice", group: "Serving", options: [
        { value: "mild", label: "Mild" },
        { value: "medium", label: "Medium" },
        { value: "hot", label: "Hot" },
        { value: "extra-hot", label: "Extra hot" },
      ] },
      { key: "calories", label: "Calories", kind: "number", group: "Serving", suffix: "kcal" },
      { key: "availableFrom", label: "Available from", kind: "text", group: "Availability", placeholder: "08:00" },
      { key: "availableTo", label: "Available until", kind: "text", group: "Availability", placeholder: "21:00" },
      { key: "packaging", label: "Packaging", kind: "text", group: "Availability", placeholder: "Takeaway box" },
    ],
  },

  service: {
    title: "Service details",
    description: "Where you work, when, and what a buyer must bring or know.",
    fields: [
      { key: "serviceArea", label: "Service area", kind: "text", group: "Where", placeholder: "Lekki, Ikoyi and Victoria Island" },
      { key: "availability", label: "Availability", kind: "text", group: "When", placeholder: "Mon–Fri, 9am–5pm" },
      { key: "leadTime", label: "Lead time", kind: "text", group: "When", placeholder: "Book 2 days ahead" },
      { key: "bookingRequirements", label: "What the buyer should prepare", kind: "longText", group: "Before you book" },
      { key: "cancellationPolicy", label: "Cancellation policy", kind: "longText", group: "Before you book", placeholder: "Free cancellation up to 24 hours before" },
      { key: "experience", label: "Years of experience", kind: "number", group: "About you", suffix: "years" },
      { key: "qualifications", label: "Qualifications", kind: "text", group: "About you" },
      { key: "languages", label: "Languages", kind: "text", group: "About you", placeholder: "English, Yoruba" },
    ],
  },

  digital: {
    title: "File details",
    description: "What is delivered, and what opens it.",
    fields: [
      { key: "fileFormat", label: "Format", kind: "text", group: "The file", placeholder: "PDF, ZIP, MP4…" },
      { key: "fileSize", label: "Size", kind: "text", group: "The file", placeholder: "24 MB" },
      { key: "version", label: "Version", kind: "text", group: "The file", placeholder: "v2.1" },
      { key: "licenceType", label: "Licence", kind: "choice", group: "Usage", options: [
        { value: "personal", label: "Personal use" },
        { value: "commercial", label: "Commercial use" },
        { value: "extended", label: "Extended / resale" },
      ] },
      { key: "compatibility", label: "Works with", kind: "text", group: "Usage", placeholder: "Figma, Illustrator, Chrome" },
      { key: "includesUpdates", label: "Includes future updates", kind: "boolean", group: "Usage" },
      { key: "supportIncluded", label: "Support included", kind: "boolean", group: "Usage" },
    ],
  },

  rental: {
    title: "Letting details",
    description: "What is being let, and what a tenant needs to know.",
    fields: [
      { key: "propertyType", label: "Type of property", kind: "choice", group: "The property", options: [
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
      ] },
      { key: "bedrooms", label: "Bedrooms", kind: "number", group: "The property" },
      { key: "bathrooms", label: "Bathrooms", kind: "number", group: "The property" },
      { key: "size", label: "Size", kind: "text", group: "The property", placeholder: "120 sqm" },
      { key: "furnishing", label: "Furnishing", kind: "choice", group: "The property", options: [
        { value: "furnished", label: "Furnished" },
        { value: "semi-furnished", label: "Semi-furnished" },
        { value: "unfurnished", label: "Unfurnished" },
      ] },
      { key: "amenities", label: "Amenities", kind: "multiChoice", group: "The property", options: [
        { value: "power", label: "24-hour power" },
        { value: "water", label: "Borehole / water" },
        { value: "parking", label: "Parking" },
        { value: "security", label: "Security" },
        { value: "air-conditioning", label: "Air conditioning" },
        { value: "fitted-kitchen", label: "Fitted kitchen" },
        { value: "pool", label: "Swimming pool" },
        { value: "gym", label: "Gym" },
        { value: "lift", label: "Lift" },
        { value: "internet", label: "Internet ready" },
      ] },
      { key: "utilitiesIncluded", label: "Utilities included in the rent", kind: "boolean", group: "Terms" },
      { key: "petsAllowed", label: "Pets allowed", kind: "boolean", group: "Terms" },
      { key: "availableFrom", label: "Available from", kind: "date", group: "Terms" },
      { key: "minimumStay", label: "Minimum term", kind: "text", group: "Terms", placeholder: "6 months" },
    ],
  },

  /**
   * Cargo — bulk and wholesale.
   *
   * A cargo listing is judged by different facts from a unit product: what one
   * package actually is, how many units are inside it, what it weighs and how
   * many packages a buyer must take. So it has its own schema rather than
   * inheriting the single-item one and relying on a seller to explain the
   * difference in the description.
   */
  cargo: {
    title: "Cargo details",
    description: "What a package contains, and the terms of buying in bulk.",
    fields: [
      { key: "brand", label: "Brand or maker", kind: "text", group: "The goods", placeholder: "Pepsi" },
      {
        key: "packaging",
        label: "Packaging",
        kind: "choice",
        group: "The package",
        options: [
          { value: "carton", label: "Carton" },
          { value: "sack", label: "Sack / bag" },
          { value: "crate", label: "Crate" },
          { value: "pallet", label: "Pallet" },
          { value: "drum", label: "Drum / barrel" },
          { value: "bundle", label: "Bundle" },
          { value: "roll", label: "Roll" },
        ],
        description: "What one priced unit is — this is what the quantity at checkout counts.",
      },
      {
        key: "unitsPerPackage",
        label: "Units in one package",
        kind: "number",
        group: "The package",
        suffix: "units",
        placeholder: "24",
        description: "How many individual items are inside one carton, sack or crate.",
      },
      { key: "unitName", label: "What one unit is called", kind: "text", group: "The package", placeholder: "bottle, sachet, shirt" },
      {
        key: "minimumOrder",
        label: "Minimum order",
        kind: "number",
        group: "Buying in bulk",
        suffix: "packages",
        placeholder: "2",
      },
      {
        key: "wholesaleTier",
        label: "Best suited to",
        kind: "choice",
        group: "Buying in bulk",
        options: [
          { value: "retail", label: "Small retail" },
          { value: "wholesale", label: "Wholesale" },
          { value: "distributor", label: "Distributor / reseller" },
          { value: "institutional", label: "Institutional / catering" },
        ],
      },
      { key: "weight", label: "Weight per package", kind: "number", group: "Logistics", suffix: "kg" },
      { key: "dimensions", label: "Package dimensions", kind: "text", group: "Logistics", placeholder: "60 × 40 × 35 cm" },
      { key: "storage", label: "Storage", kind: "choice", group: "Logistics", options: [
        { value: "ambient", label: "Ambient / dry" },
        { value: "chilled", label: "Chilled" },
        { value: "frozen", label: "Frozen" },
        { value: "hazardous", label: "Hazardous" },
      ] },
      { key: "shelfLife", label: "Shelf life", kind: "text", group: "Logistics", placeholder: "6 months" },
      {
        key: "deliveryTerms",
        label: "Delivery terms",
        kind: "longText",
        group: "Terms",
        placeholder: "Delivered within Lagos in 2 days; collection from the warehouse on request.",
      },
      {
        key: "pickup",
        label: "Collection available",
        kind: "boolean",
        group: "Terms",
        description: "Tick when a buyer may collect the cargo in person instead of paying for delivery.",
      },
    ],
  },

  event_ticket: {
    title: "Admission details",
    description: "Which event this ticket admits to.",
    fields: [
      { key: "eventName", label: "Event name", kind: "text", group: "The event" },
      { key: "eventStartsAt", label: "Starts", kind: "date", group: "The event" },
      { key: "venue", label: "Venue", kind: "text", group: "The event" },
      { key: "admission", label: "Admission type", kind: "choice", group: "The ticket", options: [
        { value: "general", label: "General admission" },
        { value: "vip", label: "VIP" },
        { value: "table", label: "Table" },
        { value: "early-bird", label: "Early bird" },
        { value: "student", label: "Student" },
      ] },
      { key: "entryWindow", label: "Entry window", kind: "text", group: "The ticket", placeholder: "6pm – 9pm" },
    ],
  },

  other: {
    title: "Details",
    description: "Anything useful a buyer should know.",
    fields: [
      { key: "details", label: "Description of what this is", kind: "longText" },
      { key: "condition", label: "Condition", kind: "choice", options: CONDITION },
    ],
  },
};

/**
 * A listing's stored attributes, as a reader should see them.
 *
 * The stored form is a JSON object of machine keys (`unitsPerPackage: 24`), which
 * is the right thing to store and the wrong thing to print. This turns each key
 * back into the label its own type's schema gave it, resolves choice values to
 * the words a buyer chooses from, and states booleans as yes/no — so a cargo
 * listing says “Units in one package: 24 units” instead of
 * “unitsPerPackage: 24”, and every other type gains the same legibility.
 *
 * Keys the schema does not know about are still shown, labelled from the key
 * itself, because data the seller entered must never be hidden.
 */
export function describeListingAttributes(
  type: string | null | undefined,
  attributes: Record<string, unknown> | null | undefined,
): Array<{ key: string; label: string; value: string }> {
  if (!attributes) return [];

  const fields = new Map(listingFieldSchema(type).fields.map((field) => [field.key, field]));
  const describe = (key: string): string => key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/^./, (character) => character.toUpperCase());

  const out: Array<{ key: string; label: string; value: string }> = [];

  for (const [key, raw] of Object.entries(attributes)) {
    if (raw === null || raw === undefined || raw === "") continue;

    const field = fields.get(key);
    const label = field?.label ?? describe(key);
    const suffix = field?.suffix ? ` ${field.suffix}` : "";

    let value: string;

    if (typeof raw === "boolean") {
      value = raw ? "Yes" : "No";
    } else if (Array.isArray(raw)) {
      if (raw.length === 0) continue;
      value = raw
        .map((entry) => field?.options?.find((option) => option.value === entry)?.label ?? String(entry))
        .join(", ");
    } else if (field?.kind === "choice" || field?.kind === "multiChoice") {
      value = field?.options?.find((option) => option.value === raw)?.label ?? String(raw);
    } else if (field?.kind === "number" || field?.kind === "money") {
      value = `${String(raw)}${suffix}`;
    } else {
      value = String(raw);
    }

    out.push({ key, label, value });
  }

  return out;
}

export function listingFieldSchema(type: string | null | undefined): ListingFieldSchema {
  return (
    LISTING_FIELD_SCHEMAS[(type ?? "") as ListingType] ?? LISTING_FIELD_SCHEMAS.other
  );
}

/**
 * A listing's stored `attributes` reduced to the keys its type actually asks for.
 *
 * Seeding the form with only its own schema's keys keeps the JSON clean: the
 * structural facts that live in their own columns (and the handful of
 * communication flags the form manages itself) are never carried back in here,
 * so saving a listing cannot resurrect a stale value for a field the seller has
 * since stopped using.
 */
export function ownFieldValues(
  type: string | null | undefined,
  attributes: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  if (!attributes) return values;

  for (const field of listingFieldSchema(type).fields) {
    if (attributes[field.key] !== undefined) values[field.key] = attributes[field.key];
  }

  return values;
}
