# LINK STORE — the visual system, rebuilt (round 4)

`plan.md` (round 1) built the platform. `plan-v2.md` (round 2) refined it.
`plan-v3.md` (round 3) corrected the Workspace architecture and *tried* to add a
gradient language. That visual attempt **failed** and this round replaces it.

## The correction, in one paragraph

Round 3 treated violet as an **accent** bolted onto a white-and-black site. The
result read as "white website + black UI + a little purple decoration." The
"mesh" that shipped was a **cluster of overlapping SVG ellipses** — circles and
blobs with a gradient rectangle behind the hero. That is not a mesh and that is
not the direction. The requirement is a **visual identity**: LinkStore is built
on a **violet → soft violet → warm milky gradient that is the primary visual
atmosphere**, carried by a **real Three.js organic 3D mesh** and echoed across
every surface. White and black remain only for structure, typography and
contrast. This round rebuilds the visual system from the foundation.

**Status marks**

| Mark | Means |
| --- | --- |
| ✅ | Done this pass, verified by reading the code path back. |
| 🔎 | Done, needs a human click-through to call it confirmed. |
| 🚧 | Being worked on right now. |
| ⬜ | Not started. |

---

## Design intent (what "the visual system" means here)

- **The palette is one gradient ecosystem**, not four swatches. The stops
  `deep violet → violet → soft violet → warm milk` are *points along one
  continuum*. A large surface reads one span of it; a small card reads another;
  a dark surface reads the deep span. Everything belongs to the same light.
- **The mesh is the identity.** A single large **organic, inflated, breathing
  3D surface** — real geometry, real depth, real lighting — that visibly
  contains the violet→milk transition flowing *through* its curvature. One
  living digital object, not a bag of circles.
- **Colour is atmosphere, not accent.** Violet/soft-violet/milk is the ambient
  environment of the platform. Black (a warm violet-black) carries typography
  and controls; white is used only where contrast demands it.
- **Depth over flatness.** Surfaces are layered: warm-milk grounds, soft-violet
  tints, deeper-violet zones, gradient panels, dark contrast areas, translucent
  gradient washes, and mesh-inspired fields. The interface reads as spatial.
- **Not generic AI decoration.** No floating orbs, no purple dots, no glowing
  blobs, no random gradient balls, no arbitrary glassmorphism.

---

## Implementation plan (the required checklist)

1. ✅ **Remove the failed orb implementation.** Delete `components/visual/MeshField.tsx`
   — the overlapping SVG ellipses ("lobes"), their radial-gradient fills, the
   specular-spot circles and the rim-stroke circles. Delete its `hero`/`surface`/`card`
   lobe tables and the `ls-mesh-*` opacity classes. Remove the rectangle
   gradient-dissolve decoration behind the hero. Nothing from that system is kept.
2. ✅ **Audit the current visual system.** Confirmed: the whole platform is white/black
   because only `--accent`/`--focus`/`--link` were overridden. HeroUI's real tokens
   (`--background`, `--surface`, `--surface-secondary`, `--foreground`, `--muted`,
   `--border`, `--field-*`, `--segment`, `--overlay`, `--default`) still resolve to
   near-white / near-black. Those are the levers that recolor every `bg-background`,
   `text-foreground`, `border-border`, `bg-surface`, `text-muted` in the app.
3. ✅ **Create LinkStore gradient design tokens.** A single blended token set in
   `app/globals.css`: `--ls-deep`, `--ls-violet`, `--ls-violet-soft`, `--ls-milk` as
   gradient *stops*, plus reusable gradient utilities (`--ls-gradient`,
   `--ls-gradient-mid`, `--ls-gradient-soft`, `--ls-gradient-deep`) and surface
   utilities (`.ls-panel`, `.ls-field`, `.ls-atmosphere`). Different components read
   different spans of the same continuum.
4. ✅ **Create the Three.js mesh architecture.** `components/visual/MeshCanvas.tsx`:
   a self-contained WebGL module (raw `three`, one renderer, one scene, one mesh) with
   a `MeshBackdrop` composition wrapper and a shared palette reader that pulls the
   `--ls-*` stops from CSS so the mesh follows the theme with no second palette.
5. ✅ **Build the actual 3D organic mesh.** A subdivided icosphere deformed in the
   vertex shader by multi-octave simplex noise → large smooth curves, inflated and
   indented sections, uneven dimensions, smooth transitions. Not a sphere, not
   circles. The still silhouette is interesting on its own.
6. ✅ **Implement the violet/soft-violet/warm-milk material.** The colour is carried by
   the geometry: a 4-stop gradient (deep violet → violet → soft violet → milk) is
   evaluated per-fragment along a wavy, surface-following flow coordinate and blended
   with smoothsteps — no hard boundaries. The colour flows through the curvature.
7. ✅ **Implement proper lighting.** Custom shader lighting: wrapped diffuse (soft
   shading), a warm-milk key light, a soft-violet fill, a gentle Blinn-Phong specular
   for "subtle specular response", a rim highlight for soft edge light, and a
   displacement-driven occlusion term so indentations sit in shadow. Brightness of the
   gradient shifts with the surface's angle to the light → reads as real material.
8. ✅ **Implement subtle organic animation.** Very slow time-evolving noise + a low
   "breath" term deform the vertices continuously. Slow, organic, smooth, premium —
   the mesh feels alive; it does not spin, bounce or float around.
9. ✅ **Build the homepage hero composition around the mesh.** The top half of the home
   page is composed *around* `MeshBackdrop`: one large organic form occupying the
   hero, real 3D depth and soft lighting, with the copy set beside/over it and the
   edges dissolving into the atmosphere. Not an orb dropped behind old content.
10. ✅ **Create reusable mesh/gradient visual components.** `components/visual/Atmosphere.tsx`:
    `GradientField` (a layered mesh-gradient field — smooth, no discrete circles),
    `GradientPanel`, and `MeshGradientBackground` (also the WebGL fallback). Same
    palette, many surfaces.
11. ✅ **Apply the visual system throughout the platform.** Because the HeroUI tokens are
    re-pointed at the LinkStore continuum, every surface inherits it at once (marketplace,
    storefront, product, service, event, workspace, cards, headers, navigation, empty
    states, modals, panels, focus states), then high-traffic composed surfaces are tuned
    on top. No giant mesh behind every button — a consistent atmosphere instead.
12. ✅ **Redesign light mode.** Warm-milk base, soft-violet tints, violet controls and
    focus, white only for contrast, warm-violet-black type. Warm, sophisticated, dimensional.
13. ✅ **Redesign dark mode.** A darker environment of the same identity: deep black-violet
    ground, deep/rich violet surfaces, muted soft-violet text, controlled warm-milk
    highlights, the gradient still recognisable. Intentionally designed, not inverted.
14. ✅ **Integrate image-derived colour dynamics.** `AdaptiveTint` now *influences* the
    LinkStore gradient rather than replacing it: the violet→milk identity is always
    present underneath, and the image's dominant colour biases (warms/cools/deepens) that
    existing gradient with bounded saturation and smooth cross-faded interpolation. No
    flashing, no arbitrary colour takeover.
15. ✅ **Apply the visual system to marketplace/store/product surfaces.** Shop cards carry a
    mesh-gradient field; storefront covers and product detail sections use gradient +
    image-derived atmosphere; category/browse sections sit on gradient grounds.
16. ✅ **Optimize Three.js performance.** One WebGL context (hero only); DPR clamped;
    frame-throttled; pause when tab hidden or off-screen; reduced-motion renders a still
    frame; geometry resolution scaled to the device; single shader material; full
    dispose/cleanup on unmount.
17. ✅ **Add WebGL fallback.** If the context cannot be created (or `prefers-reduced-data`),
    `MeshBackdrop` renders the high-quality CSS `MeshGradientBackground` instead — the
    composition never breaks and still reads as LinkStore.
18. 🔎 **Test mobile.** Mesh scales down (lower geometry, capped DPR, throttled), hero
    composes, tokens hold on small widths. Human click-through on a phone.
19. 🔎 **Test desktop.** Mesh is dimensional and premium, motion is subtle, no lag.
    Human click-through.
20. ✅ **Remove every leftover implementation that contradicts the new visual direction.**
    No SVG lobes/orbs/circles, no decorative gradient rectangles, no leftover
    `ls-mesh-*` circle opacity system. What remains is the token continuum + the
    Three.js mesh + gradient fields.

---

## The architecture, in layers

| Layer | File | Role |
| --- | --- | --- |
| Tokens | `app/globals.css` | The one gradient continuum + layered surface/light/dark tokens. |
| Mesh (3D) | `components/visual/MeshCanvas.tsx` | The real Three.js organic mesh + palette reader. |
| Mesh (field) | `components/visual/Atmosphere.tsx` | Gradient-field surfaces + WebGL fallback. |
| Image colour | `components/visual/AdaptiveTint.tsx` | Image hue that biases (never replaces) the continuum. |
| Composition | `app/(market)/page.tsx` | Hero built around `MeshBackdrop`. |
| Surfaces | `components/ui/*`, `components/layout/*` | Cards, headers, nav, empty states inherit + echo the system. |

## Palette (the continuum)

| Stop | Light | Dark | Role |
| --- | --- | --- | --- |
| `--ls-deep` | deep violet | near-black violet | where the light begins / dark zones |
| `--ls-violet` | violet | rich violet | the body of the identity |
| `--ls-violet-soft` | soft light violet | muted soft violet | the transition |
| `--ls-milk` | warm milky/cream | warm-milk highlight | what the light becomes |

Spans: **large surface** deep→violet→soft→milk · **small card** soft→milk ·
**dark surface** deep→violet. Same light throughout.

## Performance & fallback notes

- The mesh is a single `ShaderMaterial` on one `IcosahedronGeometry`; deformation and
  lighting are evaluated in the shader (no per-frame CPU vertex work).
- DPR clamped (`≤2` desktop, `≤1.5` mobile); render loop throttled; `IntersectionObserver`
  + `visibilitychange` pause it; `prefers-reduced-motion` renders one still frame.
- Everything is disposed on unmount; one WebGL context total (the hero).
- Palette is read from CSS custom properties at runtime → the mesh is theme-aware with
  no duplicated palette in JS.
- `three` is (a) lazy-imported in the browser only (`import()` inside `useEffect`, so it is
  never executed during SSR) and (b) listed in `serverExternalPackages`, so its ESM is never
  bundled into the server chunk graph. Without (b) the production server build corrupts the
  webpack runtime (`a[d] is not a function`) and every route 500s — with it, `next dev` and
  `next start` both serve 200.
- No WebGL → `MeshGradientBackground` (a layered CSS mesh gradient) stands in.

## What still wants a human

- 🔎 A look at the hero mesh in both themes — whether the *amount* of colour and the
  *subtlety* of the motion are right is a judgement only a person can make.
- 🔎 A phone-sized pass over the hero and the marketplace rails.
