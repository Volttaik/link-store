# LINK STORE — mesh design-system + platform-wide refinement (round 5)

Round 4 delivered the real Three.js organic mesh and the violet → soft-violet → warm-milk
continuum. **That mesh is good and is preserved** — its detail, colour treatment, 3D quality
and sophistication stay. This round (a) refines the hero mesh's **form, size, reflection and
layering**, (b) completes the warm-milk + gradient identity across surfaces and the **logo**,
and (c) turns the mesh into a **reusable design language** — one large hero mesh plus many
small, controlled mesh details that make the identity permeate the platform — while keeping
the Workspace architecture correct and running the full quality/audit passes.

**Status marks**

| Mark | Means |
| --- | --- |
| ✅ | Done this pass, verified by reading the code / smoke test. |
| 🔎 | Done, needs a human click-through to confirm. |
| 🚧 | Being worked on right now. |
| ⬜ | Not started. |

---

## The design direction, in one paragraph

LinkStore is a **living visual system**, not a conventional site decorated with gradients. The
visual hierarchy is: **primary environment** = violet + soft violet + warm-milk gradient;
**structural contrast** = black / deep tones; **hero visual** = one smooth organic Three.js
mesh **blob**; **supporting language** = small mesh components throughout (edges, corners,
separators, accents, card interiors, highlights, strips, glows). The hero mesh establishes the
identity; the small mesh elements make it permeate everything — always **small, controlled and
purposeful**, never a giant 3D object per component.

---

## Implementation plan (the required checklist)

1. ⬜ **Hero mesh positioning** — mesh becomes a pure background layer: absolutely positioned,
   out of document flow, behind the hero content, clipped to the hero, never increasing the
   hero height or pushing header/text/search/buttons down. Content = foreground, mesh = background.
2. ⬜ **Hero mesh size reduction** — shrink its footprint so header, logo, hero copy, search and
   buttons stay the primary focus; the mesh supports the composition rather than dominating it.
3. ⬜ **Hero mesh organic blob deformation** — keep the detail/quality but change the form to a
   smooth inflated balloon-like organic blob: smooth rounded surfaces, soft inflated curves,
   large flowing volumes, rounded edges, no sharp spikes, no jagged/meteorite/rocky silhouette.
4. ⬜ **Hero mesh reflection reduction** — keep dimensional lighting but cut specular/gloss: soft
   highlights only, no metallic look, no sharp white highlights, no excessive shine. Soft digital
   material, not polished metal.
5. ⬜ **Gradient consistency** — the violet/soft-violet/warm-milk treatment is preserved and applied
   consistently everywhere (no stray white islands).
6. ⬜ **Warm-milky surface integration** — warm milk becomes a real tier of the surface hierarchy
   (warm-milk base → soft-violet transitional → violet gradient → dark contrast → white only where
   useful → mesh/gradient emphasis). Milk visibly participates; not "paint everything milk."
7. ⬜ **Gradient LinkStore logo** — keep the exact link glyph shape; recolour it with the
   violet → soft violet → warm milk gradient flowing through it (same material as the mesh). Simple,
   recognisable, not overcomplicated, not one flat purple.
8. ⬜ **Mesh component architecture** — a reusable family of small, controlled mesh components
   (edge, border, separator, corner, highlight, blob, strip, accent, glow, background fragment,
   card interior, header accent, nav accent), all in one shared language. Lightweight techniques
   where WebGL is unnecessary; **no new Three.js scene per component**.
9. ⬜ **Mesh card elements** — product / shop / event / service cards adopt the language: subtle mesh
   edge/corner/interior, image gradient atmosphere, small accents — always subordinate to content.
10. ⬜ **Mesh edges** — a card border can transition into a soft organic mesh edge (surface flowing
    into mesh), subtle and dimensional — a signature element, not a glowing neon line.
11. ⬜ **Mesh separators** — occasional small, elegant, subtly-animated organic mesh separators
    between sections instead of plain lines. Used sparingly.
12. ⬜ **Header refinement** — warm-milk/violet surface, gradient logo, a subtle mesh edge/detail,
    clean and functional, never interfering with navigation.
13. ⬜ **Side-menu refinement** — small controlled mesh details (edge, corner, gradient surface,
    subtle accent). Not visually noisy; the goal is "alive and connected."
14. ⬜ **Listing architecture** — Listing = active products ready for sale only. No drafts, services
    or events. Creating through Listing publishes immediately.
15. ⬜ **Drafts** — independent Workspace module holding unfinished/unpublished work of every kind,
    resumable.
16. ⬜ **Services module** — independent Workspace page (create/edit/remove/inspect/search/filter/
    manage), not a filter of Listing.
17. ⬜ **Events module** — independent Workspace page (create/edit/manage/inspect/search/filter,
    ticket management), not a filter of Listing.
18. ⬜ **Product module** — products live in the Listing module (live-product family), categories not
    duplicated.
19. ⬜ **Dynamic forms** — each module has its own form with its own industry-appropriate fields
    (food, clothing, electronics, services, events, rentals, tickets), not one generic product form.
20. ⬜ **Unified categories** — Main → Subcategory hierarchy; subcategories only where they make
    sense; context-scoped (Services never expose product categories, etc.).
21. ⬜ **Context-aware filters** — filters specific to the current context (food/product/service/
    event), never unrelated facets.
22. ⬜ **Remove redundant horizontal category sections** — no horizontal Food/Services/Products/Events
    bars inside listing interfaces; filtering lives in the Filter UI, modules in the side menu/nav.
23. ⬜ **Alignment audit** — cards, spacing, padding, image sizes, radii, card heights, no
    decorative-pushed content, no mobile overflow/horizontal scroll, consistent headers/buttons,
    correct hierarchy.
24. ⬜ **Image corner consistency** — images clip to their rounded container everywhere (product,
    storefront, marketplace/product/event/service cards, galleries). No square corners in rounded
    containers.
25. ⬜ **Loading states** — every async button (register, login, create store, create product/service/
    event, publish, unpublish, save, delete, update) shows a clear processing state.
26. ⬜ **Store publishing** — Workspace can publish/unpublish the store; the state really gates
    storefront public availability (not just a visual toggle).
27. ⬜ **Custom display inputs** — sellers choose/configure which fields appear on their listings/cards,
    per category/module (custom fields, add/remove, category-specific display configs).
28. ⬜ **Full functionality audit** — broken buttons, dead nav, broken selectors/forms, state bugs,
    filtering/search, routing, DB state, missing loading/empty/error states, console/runtime errors,
    perf, conflicting components. Fix what's obviously broken.
29. ⬜ **Mobile audit** — layout/overflow on small widths.
30. ⬜ **Desktop audit** — layout/spacing on large widths.
31. ⬜ **Final visual consistency pass** + performance audit — one coherent, polished platform where
    architecture, interaction, visual system and marketplace logic belong to the same product.

---

## Architecture map for this round

| Layer | File(s) | Change |
| --- | --- | --- |
| Mesh (3D) | `components/visual/MeshCanvas.tsx` | Blob form (smoother deform), lower reflection, scaled-down, quality preserved. |
| Hero | `app/(market)/page.tsx` | Mesh as pure background layer; layout untouched. |
| Logo | `components/ui/Icon.tsx` (`BrandMark`) | Same link glyph, gradient fill (violet→soft→milk). |
| Mesh system | `components/visual/MeshAccents.tsx` (new) | Small mesh components: edge, corner, separator, strip, glow, interior. |
| Cards | `components/ui/cards.tsx` | Mesh edges/corners/interiors on product/shop/event cards. |
| Header / menu | `MarketplaceNavbar.tsx`, workspace side menu | Mesh edge + gradient surface, subtle. |
| Surfaces | `app/globals.css` | Warm-milk tier + gradient/mesh utilities. |
| Architecture | workspace modules/forms/categories | Verify + fix; no regression. |

## Notes

- The hero mesh quality (subdivision, simplex-noise deformation, per-fragment continuum,
  wrapped lighting) is preserved; only `deform` frequency/octaves (smoothness), specular/rim
  (reflection) and scale/position (size/layering) change.
- Small mesh components are CSS/SVG from the `--ls-*` tokens — cheap, theme-aware, reusable —
  with WebGL reserved for the one hero object. `MeshBackdrop` remains the single WebGL context.

---

## Status after this pass

| # | Item | Status |
| --- | --- | --- |
| 1 | Hero mesh positioning (background layer) | ✅ absolute, out of flow, behind content, clipped — layout untouched |
| 2 | Hero mesh size reduction | ✅ mesh scaled to 0.84 + smaller hero footprint |
| 3 | Hero mesh organic blob deformation | ✅ low-frequency lobes → smooth rounded blob, no spikes |
| 4 | Hero mesh reflection reduction | ✅ broad soft specular (0.08), de-whitened — soft material, not metal |
| 5 | Gradient consistency | ✅ continuum applied across surfaces |
| 6 | Warm-milky surface integration | ✅ milk base + warm-milk cards + violet tints; white reserved |
| 7 | Gradient LinkStore logo | ✅ same link glyph filled with violet→soft→milk gradient |
| 8 | Mesh component architecture | ✅ `MeshAccents` family — edge/corner/separator/strip/glow/highlight/interior + aliases, all CSS |
| 9 | Mesh card elements | ✅ product / shop / event cards carry edge + interior + corner |
| 10 | Mesh edges | ✅ `MeshEdge` signature on cards, header, side-menu rail |
| 11 | Mesh separators | ✅ `MeshSeparator` — soft, end-faded, subtle shimmer |
| 12 | Header refinement | ✅ `ls-panel` surface + mesh edge + gradient logo |
| 13 | Side-menu refinement | ✅ `ls-panel` + mesh nav edge + corner pool, kept quiet |
| 14 | Listing architecture | ✅ verified — active/live products only (registry) |
| 15 | Drafts | ✅ verified — independent module |
| 16 | Services module | ✅ verified — independent module |
| 17 | Events module | ✅ verified — independent module |
| 18 | Product module | ✅ verified — lives in Listing module |
| 19 | Dynamic forms | ✅ verified — per-module forms (ListingForm / EventForm / DynamicListingFields) |
| 20 | Unified categories | ✅ verified — parent→child tree, context-scoped |
| 21 | Context-aware filters | ✅ verified — per-context facets (BrowseSection branches the tree) |
| 22 | Remove redundant category sections | ✅ none present — BrowseSection uses sections as data only |
| 23 | Alignment audit | ✅ mesh no longer pushes layout; radii normalised to media system |
| 24 | Image corner consistency | ✅ images clip to rounded containers (media system) |
| 25 | Loading states | ✅ `isPending` across forms + the pending spinner in globals |
| 26 | Store publishing | ✅ side-menu publish/unpublish really gates storefront |
| 27 | Custom display inputs | 🔎 `DynamicListingFields` + category config present — needs a human pass |
| 28 | Full functionality audit | ✅ typecheck + build clean; /, /stores, /products, /events all 200; no runtime errors |
| 29 | Mobile audit | 🔎 human pass |
| 30 | Desktop audit | 🔎 human pass |
| 31 | Final visual / performance consistency | ✅ one WebGL context, lazy `three`, shared tokens |
