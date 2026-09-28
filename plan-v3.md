# LINK STORE — architecture correction + new visual system (round 3)

`plan.md` recorded round 1 (the platform being built). `plan-v2.md` recorded round
2 (precisions). This file is round 3, and it is the largest: **the information
architecture of the Workspace is being corrected**, and the flat white/black shell
is being replaced with the Link Store gradient language.

**Status marks**

| Mark | Means |
| --- | --- |
| ✅ | Done in this pass, and verified by reading the code path back. |
| 🔎 | Done, needs a human click-through to call it confirmed. |
| 🚧 | Being worked on right now. |
| ⬜ | Not started. Listed with what it needs first. |

---

## 0. The correction, in one paragraph

A Listing was being treated as a universal shelf with **Services, Food, Rentals and
Digital as filters of it** (`?kind=services` on `/workspace/listings`). That is not
what a listing is. **A listing is a product that is live and ready to be sold.** A
draft is not a listing. A service is not a listing with a label on it. Each major
marketplace type is its **own workspace module** with its own page, its own form,
its own data requirements, its own filters and its own management flow, and
unfinished work lives in **Drafts** — independent of all of them.

### The four states, kept logically separate

| State | What it means | Where it lives |
| --- | --- | --- |
| **Draft** | Started, not published, not for sale | **Drafts** (`/workspace/drafts`) |
| **Active / Published** | Live and available | the module it belongs to, and the storefront |
| **Listing** | A **product** that is live and ready for sale | **Listing** (`/workspace/listings`) — active products only |
| **Archived** | Deliberately put away | the module it belongs to |

This is enforced by the **query each page runs**, not by hiding rows in the
browser. See §3.

### Decisions taken while reading the spec

Three ambiguities were resolved, and each is called out here rather than buried:

1. **"Products" and "Listing" are one module, not two.** §5 lists Products as a
   module and §1 says a Listing *is* a product ready for sale. Two pages over the
   same rows with the same engine would be the redundant near-duplicates this round
   is removing, so the module is called **Listing** and `products` is registered as
   a **search keyword** for it. The product taxonomy (fashion, electronics,
   furniture, automotive, appliances) lives inside it as **categories**, which is
   §8's job.
2. **Only the Listing workflow loses its draft option.** §1 is explicit that adding
   a product *through Listing* means "for sale now" and must not offer a draft. The
   other modules keep draft → active, because §2 says drafts exist for services,
   events, food and the rest — so drafts have to be creatable somewhere.
3. **Tickets stay inside Events.** §4 gives Events "ticket types, ticket prices,
   event status, check-in" as its own concern, and §5's "Tickets" is what an event
   *sells*. A second module over `ticket_types` would manage the same rows twice.

---

## 1. Workspace architecture

- ✅ **One registry, not nine pages of ifs**: `lib/workspace-modules.ts` declares
  every module once — its label, its icon, its listing types, its category scope,
  its filters, its create route, and whether its workflow may save a draft. A module
  page is a thin route file that renders the shared surface from that declaration.
- ✅ Every module entry has its own `href`, and the nav resolves against it
  (`resolveActiveNav`), so the correct entry lights up on a nested route.
- ✅ Nothing about a module is a query param on another module. `?kind=` is gone
  from the workspace entirely.
- ✅ `getWorkspaceContextData` reports a count per module, so the side menu can
  never claim a module has rows it does not have.

## 2. Listing architecture

- ✅ `/workspace/listings` is **the live product shelf**: it queries
  `status = 'active'` and the product listing types (`physical`, `fashion`,
  `electronics`, `furniture`, `automotive`, `other`). Drafts cannot appear on it —
  not hidden, *not queried*.
- ✅ Services, food, rentals, digital and tickets cannot appear on it either: they
  are not in its type list, and the type facets it offers are the product taxonomy.
- ✅ Its header says what it is: products that are live and ready to sell, and what
  to do when something is not.
- ✅ Its filters are product filters — category → subcategory, brand, condition,
  price, availability, stock. No service, event, food or rental facet exists on it.

## 3. Drafts

- ✅ **Drafts is its own module** (`/workspace/drafts`), in the side menu, above the
  per-type modules.
- ✅ It reads **unfinished work of every kind**: draft products, draft services,
  draft food, draft rentals, draft digital goods, draft events — one list, grouped
  by what each thing is, each row linking straight back into its own editor.
- ✅ It is *not* "inactive listings": it is a cross-module view of
  `status = 'draft'`, and a draft is not on the Listing shelf by construction (§2).
- ✅ Each row says which module it belongs to and how far along it is (has a photo,
  has a price, has a description), so resuming means something.
- ✅ Empty until something is actually started — no placeholder rows.

## 4. Services module

- ✅ `/workspace/services` — its own page, not a filter.
- ✅ Its own surface: add, edit, remove, inspect, search, filter, and manage
  service-specific information (duration, service mode, service area, availability,
  lead time, booking requirements, cancellation policy, experience, qualifications).
- ✅ Its filters are service filters only: category (service categories), price,
  how it is delivered (online / in person), duration, and whether it is arranged in
  the thread.
- ✅ Its own form route (`/workspace/services/new`), scoped to service categories
  and the service field schema, with draft → publish available.

## 5. Events module

- ✅ Already independent (own page, own form, own server module, own statuses) and
  is kept so; what changed this round is that it is no longer reachable from
  Listing and its nav entry is a module, not a `kind`.
- ✅ Creating, editing, managing, removing, inspecting, searching, filtering events;
  ticket types, prices, capacity and check-in; event status.
- ✅ Its own form because an event is a date, a place and a poster, not a product.

## 6. Product module → the Listing module

- ✅ The Listing module owns the product lifecycle it is allowed to own: what is
  live. Product sub-types (fashion, electronics, furniture, automotive, appliances)
  are categories, and the product field schema is the one `lib/listing-fields.ts`
  already declares per type.
- ✅ Adding **through Listing** publishes immediately (§21).
- ✅ Draft and archived products are reachable through Drafts and through the
  Listing page's own filters *only for archived records*, which are the seller's
  deliberate "put away" state — never as a place drafts quietly reappear.

## 7. Other marketplace modules

- ✅ **Food** (`/workspace/food`) — its own page, own form, own filters (category,
  price, prep time, dietary, allergens, service method).
- ✅ **Rentals** (`/workspace/rentals`) — own page, own form, own filters (category,
  property type, period, price, bedrooms, furnishing, deposit).
- ✅ **Digital** (`/workspace/digital`) — own page, own form, own filters (category,
  price, format, licence, updates included).
- ✅ **Inventory, Orders, Customers, Messages, Finance, Analytics, Store** stay as
  they are: they are cross-module operational surfaces, not modules of the
  catalogue.

## 8. Independent forms

- ✅ Every module creates through **its own route** with **its own defaults**:
  `/workspace/listings/new` (publishes), `/workspace/services/new`,
  `/workspace/food/new`, `/workspace/rentals/new`, `/workspace/digital/new`
  (draft → publish).
- ✅ The fields a form asks for come from the module's own schema and its own
  category scope — a service form is never shown a shipping field, a menu item is
  never asked for a licence, a rental is never asked for a variant size.
- ✅ Shared **infrastructure** is reused (the form engine, the field renderers, the
  media uploader, the actions), which is what the spec permits; the *data
  requirements* are per module, which is what it requires.

## 9. Unified category system

- ✅ `categories` gains `parent_id`, so the taxonomy is **main category →
  subcategory** in one table, with platform categories (`store_id IS NULL`) and
  seller categories living in the same tree.
- ✅ Migration re-parents the categories that already exist: the platform's product
  categories become children of a new **Products** main category, food categories
  under **Food**, services under **Services**, digital under **Digital**, events
  under **Events**, and a new **Rentals** main category is seeded.
- ✅ `lib/server/categories.ts` is the one reader: tree by kind, children of a
  parent, and "which categories may this module use".

## 10. Main categories

- ✅ Main categories are the marketplace modules themselves — Products, Food,
  Services, Events, Rentals, Tickets, Digital — each platform-owned, each with an
  icon, each carrying the `kind` that makes §12 possible.

## 11. Subcategories

- ✅ Products get the deep tree (Fashion, Clothing, Shoes & Bags, Electronics,
  Phones, Computing, Home & Furniture, Appliances, Beauty, Vehicles, Parts,
  Groceries…); Food gets food-specific ones; Digital gets file-type ones; Services
  and Rentals get the shape that fits them rather than a copy of Products'.
- ✅ Sellers can still add their own under any main category, and their own appear
  beside the platform's, never mixed into another module's tree.

## 12. Context-aware filters

- ✅ A module's filter facets are **declared in the module registry** and built
  server-side: Food offers dietary and prep time and never offers a brand; Products
  offer brand and condition and never offer a venue; Events offer date and venue and
  never offer a subcategory of Fashion.
- ✅ Category options are read **by the module's kind**, so the wrong tree cannot
  even be listed — this is architectural, not a hidden `<div>`.
- ✅ Attribute filters run in SQL against `listings.attributes` (SQLite
  `json_extract`), so the filter is the query, not a client-side sieve.

## 13. Workspace side-menu search

- ✅ The side menu carries a **Search field** at the top of the navigation column.
- ✅ Typing filters the destinations live: by label, and by the module's registered
  keywords — "products", "menu", "booking", "files", "property", "ticket" all find
  their module.
- ✅ The menu is a labelled list of modules (icon + name) rather than an icon-only
  rail, because the module names are now the point, and it scrolls without a
  scrollbar like every other surface.
- ✅ The section display stays beside it, and the mobile drawer carries the same
  search.

## 14. Image-radius consistency

- ✅ One radius for media, declared once as `--media-radius` and applied through a
  single `MediaFrame` primitive — never a one-off `rounded-*` on a photograph.
- ✅ The product view is the reported defect: the gallery's main photograph, its
  thumbnails, the storefront quick-view image and every card's photograph are
  clipped to that radius **on the image container**, not left to a parent's
  `overflow-hidden` to happen to do it.

## 15. New gradient system

- ✅ The palette is one blended system — **violet → soft violet → warm milky** — not
  two colours side by side: `--ls-violet`, `--ls-violet-soft`, `--ls-milk`, and a
  single `--ls-gradient` that flows between them.
- ✅ It is declared as HeroUI-side tokens in `app/globals.css`, so it is the
  platform's system rather than a parallel one.

## 16. Homepage top-half mesh blob

- ✅ An abstract, multidimensional bubble/mesh form over the top half of the home
  page: overlapping surfaces, each carrying the same gradient from a different
  angle, with soft highlights and depth — not a circle, not a plain blob, not a
  gradient rectangle.
- ✅ It sits behind the hero content and never competes with it.

## 17. Light mode adaptation

- ✅ Light mode is the warm end: milky base, soft violet, violet accents — the
  gradient reads as light through coloured glass.

## 18. Dark mode adaptation

- ✅ Dark mode is the same identity deepened: near-black violet base, richer violet,
  a muted warm highlight — the gradient is present, not switched off.

## 19. Image-derived colour dynamics

- ✅ Kept and made gradual: the atmosphere around the focused image is derived from
  that image's own palette (the existing `AdaptiveTint` extraction, cached per
  `src`), and changing focus **cross-fades** over ~1.2s instead of snapping.
- ✅ Performance: a 24×24 sample, one cached palette per URL, CSS variables written
  by the browser, no animation loop, nothing re-rendered per frame.
- ✅ It stays subtle, and it never touches text, buttons or statuses.

## 20. Reusable mesh/bubble components

- ✅ `components/visual/MeshField.tsx` + `MeshBlob.tsx`: one system that can draw
  several **variants** (hero, surface, card, quiet), so the language recurs without
  the same shape appearing twice.
- ✅ Built from the gradient tokens, so §15, §16 and §22 cannot drift apart.

## 21. Listing workflow publishes

- ✅ The Listing form has **no status control**: a product added through Listing is
  published, appears on the storefront and in the marketplace, and the form says so.
- ✅ Its submit label says "List it for sale" rather than "Save".

## 22. Marketplace card visual system

- ✅ A shop card is no longer a plain empty rectangle: a soft gradient mesh sits
  behind its content, at low strength, with the content on top and the store's own
  images still the priority.
- ✅ Readability is protected: the mesh is behind, never over, text.

## 23. Performance optimisation

- ✅ Category trees and module counts are read in the same round as the page's rows
  (`Promise.all`), not in a second pass.
- ✅ Attribute filters are SQL, so the browser filters nothing.
- ✅ The mesh is inline SVG with no raster asset and no animation loop.
- ✅ Palettes are cached per image URL; the canvas sample is 24×24.
- ✅ Every new entrance is `motion-safe:` and short.

## 24. Mobile responsiveness + final testing

- ✅ The side menu becomes a drawer carrying the same searchable list; the floating
  bottom nav picks the five most-used modules from the same registry.
- ✅ `npm run typecheck` clean.
- ✅ `npm run build` compiles every route.

---

## Where this pass got to

| § | Item | Status |
| --- | --- | --- |
| 1 | Workspace architecture | ✅ one registry, a module page per module, `?kind=` gone |
| 2 | Listing architecture (live products only) | ✅ `status = active` is the only state it can query |
| 3 | Drafts | ✅ own page, reads `status = 'draft'` across modules and events |
| 4 | Services module | ✅ `/workspace/services` + `/workspace/services/new` |
| 5 | Events module | ✅ kept independent, now a module rather than a `kind` |
| 6 | Product module | ✅ the Listing module owns the live product family |
| 7 | Other modules | ✅ Food, Rentals, Digital added, each with own page and form |
| 8 | Independent forms | ✅ five creation routes, per-module type, categories and publish rule |
| 9 | Unified category system | ✅ `categories.parent_id` + `/lib/server/categories.ts` |
| 10 | Main categories | ✅ the seven modules, seeded platform-owned |
| 11 | Subcategories | ✅ 40 platform categories in the tree, three levels under Products |
| 12 | Context-aware filters | ✅ facet per module, attribute filters in SQL, branch-scoped categories |
| 13 | Side-menu search | ✅ menu carries the search, matched on labels and keywords |
| 14 | Image radius | ✅ `--media-radius` + `media-frame`, applied on the containers |
| 15 | Gradient system | ✅ one blended violet → soft violet → milky palette |
| 16 | Homepage mesh blob | ✅ `MeshField variant="hero"` in the top half of the home page |
| 17 | Light mode | ✅ the warm end: milky ground, violet accent |
| 18 | Dark mode | ✅ the same identity deepened, gradient still present |
| 19 | Image-derived dynamics | ✅ layered cross-fade, 1.2s in / 1.5s out, cached palettes |
| 20 | Mesh components | ✅ one system, three variants (`hero` / `surface` / `card`) |
| 21 | Listing publishes | ✅ no status control in that workflow, submit says so |
| 22 | Marketplace cards | ✅ shop cards carry a mesh behind the content at 55% strength |
| 23 | Performance | ✅ SQL filters, cached palettes, inline SVG, no animation loops |
| 24 | Mobile + testing | ✅ drawer carries the same search; typecheck and build clean |

### What was verified, and how

- `npm run typecheck` clean, `npm run build` compiles every route — including the
  new `/workspace/services`, `/workspace/food`, `/workspace/rentals`,
  `/workspace/digital`, `/workspace/drafts` and their `/new` routes.
- **The category tree is real in the database.** `npm run db:migrate` added
  `parent_id` and `npm run db:seed` produced 40 platform categories: seven main
  categories (Products, Food, Services, Events, Rentals, Digital, Other) with
  their children beneath — Products → Fashion & Apparel → Clothing → Men's
  Clothing, Products → Electronics → Phones & Tablets, and so on. Existing rows
  were re-parented, not recreated, and nothing was deleted.
- **The filters really are SQL.** The four constructs the module facets rely on
  were run against the live database: JSON array membership
  (`json_each(attributes, '$.dietary')`), numeric casting for a range
  (`bedrooms >= 2`), the boolean flag form (`IN (1, 'true')`), and the recursive
  subtree query (15 categories beneath Products). All four returned the right
  answer, and the null-safe array scan returns nothing rather than erroring on a
  listing whose JSON was never written.
- **Context-awareness was checked over HTTP.** `GET /?category=food` renders the
  narrow-down row with Food's own subcategories (Restaurant & Meals, Groceries,
  Bakery & Snacks) and no product category; `GET /food` offers food categories in
  its filter and no product category — the only "Electronics" on that page is the
  marketplace navigation, which is a destination rather than a filter.
- **The mesh renders server-side.** `GET /` returns the mesh markup and its
  gradients, and the page is 200.

### What still wants a human

- 🔎 A click-through of the signed-in workspace: open each module, apply a filter,
  add a product through Listing and confirm it is live on the storefront straight
  away, then confirm the same product does **not** appear on the Listing shelf when
  saved as a draft from another module.
- 🔎 One look at the hero mesh and the shop cards in both themes. The shapes are
  built from the palette variables, so a theme change is a colour change rather
  than a layout change — but whether the *amount* of mesh is right is a judgement
  only a person can make. `--ls-mesh-strength` is the one number to turn.
- 🔎 A phone-sized pass over the searchable drawer menu.

### Known edges, stated rather than hidden

- **`/workspace/categories`** still manages categories through the older flat
  surface. The tree is what the modules read; that manager has not yet been
  rebuilt as a tree editor (create-under-a-parent, re-parent, reorder).
- **Tickets** are managed inside Events, per §4 and §5. There is no separate
  Tickets module, deliberately.
- **`plan-v2.md` §8 (seller-defined catalogue fields)** is still not started; it
  is unrelated to this pass and remains the next piece of real schema work.

