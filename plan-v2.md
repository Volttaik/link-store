# LINK STORE — precision pass (round 2)

This is the working checklist for the second pass: the asks that came after the
platform was already complete enough to run. `plan.md` remains the record of what
was built in round 1; this file is what changes now, and why.

**Status marks**

| Mark | Means |
| --- | --- |
| ✅ | Done in this pass, and verified by reading the code path back. |
| 🔎 | Done, needs a human click-through to call it confirmed. |
| 🚧 | Being worked on right now. |
| ⬜ | Not started. Listed with what it needs first. |

---

## 0. The asks, verbatim intent

| # | Ask | Where it lands |
| --- | --- | --- |
| 1 | Turn on email with the key already in the environment, so sign-in and account creation send real mail | §1 |
| 2 | Clear the database so a fresh account can be created | §1 |
| 3 | Brand mark: keep it simple, add a little detail at the centre so it reads as a link icon | §2 |
| 4 | Remove the top-half background SVG — not wanted | §2 |
| 5 | Workspace: data-heavy pages should not print their facets across the page. One **Filters** button (a panel, like the home page) plus a **Search** control. No scroll indicator | §3 |
| 6 | Image corners: curved everywhere, like the rest of the platform — some buying/storefront surfaces are square | §4 |
| 7 | Every listing type shows its **own** facts — a ticket is not a product, a rental is not a ticket | §5 |
| 8 | Communication-first ordering: a rental/service can be ordered through the thread, with payment up front available | §6 |
| 9 | Publish / unpublish the store from the Workspace side menu; drop the website field from storefront settings | §7 |
| 10 | Custom inputs: per-category control of which fields a form asks for and which facts a card shows, including seller-defined fields | §8 |
| 11 | Every processing button shows a spinner | §9 |

---

## 1. Mail, and a clean database

**Mail.** Sending was already wired through Resend's HTTP API (`lib/server/email.ts`)
and the authentication engine already demands verification:

- `lib/auth/server.ts` — `emailAndPassword.requireEmailVerification: true`,
  `autoSignIn: false`, `emailVerification.autoSignInAfterVerification: true`
- the one-time code is composed in our own shell (`sendSignInCodeEmail`) and
  every attempt is recorded in `email_deliveries` with `kind: "auth"`

So the work was proving the key in the environment actually sends — and that is
now verified against the running app, not against the provider in isolation:

- ✅ `RESEND_API_KEY` is present and live; `RESEND_FROM_EMAIL` is
  `LINK STORE <invoices@quizmi.space>` — a real verified domain, not
  `onboarding@resend.dev`
- ✅ `POST /api/auth/sign-up/email` → account created, `emailVerified: false`,
  **no session**, which is the correct starting state
- ✅ `POST /api/auth/email-otp/send-verification-otp` → `{"success": true}`, and the
  code email really went out: `email_deliveries` holds
  `kind: auth · status: sent · provider_id: 01a0ce03…` with our own subject line
  (`089043 is your LINK STORE code`) — composed by `sendSignInCodeEmail`, accepted
  by Resend. The recipient address is the account's own, so the message is in the
  inbox as proof
- ✅ Signing in with an unconfirmed account returns `403 EMAIL_NOT_VERIFIED`, which
  is what makes the panel send the code and move to the code step
- 🔎 The final leg — type the code, land in the workspace — by hand

**One bug this uncovered, and it was the important one.** Signing up in the
browser returned `403` while the same request from `curl` returned `200` — because
the browser posts from the Replit preview origin and the engine's
`trustedOrigins` named only `localhost`:

```
ERROR [Better Auth]: Invalid origin: https://67f089ca-…janeway.replit.dev
POST /api/auth/sign-up/email 403 in 2955ms
```

That is the origin check doing its job — it is what stops a stranger's page from
posting a sign-in to this server — but a preview hostname is not configuration,
it is handed to the process at runtime, and it changes with the workspace.

- ✅ `trustedOrigins` is now assembled: the configured app URL, `localhost` and
  `127.0.0.1` on the app's port, and every hostname this process was started with
  (`REPLIT_DOMAINS`, or the older singular `REPLIT_DEV_DOMAIN`) — each trusted
  exactly, plus its parent domain as a wildcard (`https://*.janeway.replit.dev`),
  so tomorrow's workspace URL works without editing a file
- ✅ The same hostnames are declared as `serverActions.allowedOrigins`, since a
  form post is checked against the request's own origin too — otherwise the next
  step after signing in (creating the store) would fail the same way for a
  different reason
- ✅ Verified from the preview origin itself, not just localhost: sign-up `200`,
  then the code request `{"success": true}` with
  `email_deliveries · status: sent · provider_id: 01a0ce09…`

**Database.** `data/linkstore.db` was reset so a brand-new account can be created
from scratch.

- ✅ Previous database moved aside to `data/linkstore.db.before-reset` (recoverable)
- ✅ `npm run db:migrate` reapplied the schema — 31 tables, every row gone
- ✅ `npm run db:seed` reapplied the 20 platform categories — reference data the
  browse UI reads; still **no** stores, listings, orders or metrics
- ✅ The verification account used to prove mail was deleted again afterwards, so
  the database is genuinely empty: 0 users, 0 sessions, 0 stores, 0 orders,
  0 mail records

---

## 2. Brand mark and the hero

### 2a. The mark — more detail, still simple

The mark stays one object: a link. What changes is that it now reads as a link
and not as a rounded rectangle, without becoming a picture.

- ✅ A strand now runs through the link's opening, at a right angle to its own
  axis, ending **inside** the band on both sides so the ends are never seen. The
  link reads as a link with something threaded through it rather than as a rounded
  rectangle with a slot in it
- ✅ It is drawn as a second `<path>` rather than a third subpath: under `evenodd`
  two overlapping subpaths *cancel*, so a merged strand would have punched its own
  hole at exactly the point where it has to look woven in
- ✅ Every coordinate is hand-computed from the 48-unit box — no `transform`, no
  mask, no group — and it is still `currentColor`, one `<svg>`, no raster asset,
  so it is crisp at 16px in a tab and at 96px on the auth card, in both themes

### 2b. The hero backdrop

The top-half link field is removed. The home hero keeps its own quiet depth
(a faint wash under the type) and nothing else: the marketplace underneath is the
design, and a texture competing with it was the problem.

- ✅ `components/visual/HeroBackdrop.tsx` deleted, its only call site removed
- ✅ `BackgroundPattern` (`grid` / `market`) is untouched — storefront covers and
  empty states still use it, and it is a different, much quieter thing

---

## 3. Workspace: one Filters button, not a row of facets

The rule from the marketplace is now the rule in the Workspace: a page carries
**one control that opens every choice**, and the counts that matter.

- ✅ The shared `WorkspaceFilterBar` exists: a **Search** button that reveals the
  field, a **Filters** button with an active-count badge, an **x → Clear all**,
  and every applied filter named as a removable chip underneath. Counts did not
  disappear — they moved into the options (`Published · 12`)
- ✅ The panel is a HeroUI modal with the real controls, and every change is a URL
  transition, so the results stay interactive while the next set is fetched
- ✅ Applied where the facets actually were:
  **Listings** (state, type, order, price range, in stock only, search),
  **Orders** (order state, payment, search),
  **Events** (state), **Reviews** (state)
- ✅ Pages that only *looked* like they had a wall of facets were left alone:
  Inventory and Customers had no facet row, and Analytics' 7/30/90-day period is
  three buttons in the page header — a period, not a filter
- ✅ No scroll indicator: the global rule already suppresses it for every element
  (`*::-webkit-scrollbar { display: none }` plus `scrollbar-width: none`), and the
  audited controls — filter panels, select popovers, rails, message threads — add
  none of their own

---

## 4. Image corners

Every image is a surface in this platform, and every surface has the same corner.
Square media is what makes the buying surfaces read as somebody else's website.

Every one of the 13 `<img>` sites in the app was read with its container, and
why they are clipped was checked in the CSS the app actually serves rather than
assumed:

- ✅ `.card` is `border-radius: min(32px, var(--radius-3xl))` = **24px**, and it
  sits in HeroUI's `components` layer while Tailwind's `overflow-hidden` is in
  `utilities` — declared *after* components by `@layer theme, base, components,
  utilities`, so utilities win and card media really is clipped
- ✅ Fixed: the two uploader previews (`MediaUploader`) were the only bare
  rectangles on the platform — a listing photo and a store logo with square
  corners. Both are `rounded-xl` now, matching the placeholders beside them
- ✅ Fixed: the **event cover** was the one square image on a buying surface — a
  full-bleed banner with no corner, which is what made a ticket page look like a
  different website. It is now a surface like any other: inside the page's own
  container at `rounded-2xl` with the tint behind it
- ✅ Everywhere else the media was already inside a rounded, clipping container:
  cart lines `rounded-xl`, storefront quick-view `rounded-3xl`, gallery thumbs on
  a HeroUI button (radius `calc(var(--radius) * 3)`), store-card tiles
  `rounded-xl`, workspace shelf cards `rounded-2xl`
- 🔎 If a surface still shows a square edge, name it — this is the one item where
  a screenshot beats an audit

---

## 5. Every product type shows its own facts

A ticket is not a product with a different label. Each type declares what it is
judged by, and the card shows that and nothing else.

| Type | The card leads with |
| --- | --- |
| Physical / fashion / electronics / furniture / automotive | photograph, price, stock state, delivery |
| Food | photograph, price, prep time, pickup or delivery |
| Service | provider, duration, service mode (online / onsite), booking availability |
| Digital | what the file is, size, instant delivery |
| Event ticket | date and time stamp, venue, ticket types from-price, seats left |
| Rental | the period and the unit (per day / per month), deposit, agency vs owner, and that it is arranged in the thread first |

- ✅ A **rental** type now exists end to end: `LISTING_TYPES`, the `key` icon, a
  Rentals marketplace section, the `/rentals` directory route, and a "Rentals"
  shelf in the workspace (`?kind=rentals`)
- ✅ `listingFacts()` in `lib/catalog.ts` decides the facts *per type*, ordered by
  what matters most: a rental leads with its period (and the deposit, and that it
  is agreed first), a service with its duration and whether it is online or in
  person, a menu item with its prep time, a digital product with instant delivery
  and the file itself, a ticket with admission and tickets left, and physical
  goods with options, delivery and stock
- ✅ `ListingCard` renders those facts, and it is the same card everywhere — home,
  marketplace, directories, storefront and search — so a listing cannot look like
  two different things in two places
- ✅ Cards now carry the listing's parsed `attributes` (plus the digital file named
  from `digital_assets`), which is what the per-type facts read; the JSON is
  parsed once in `mapListingCard`, so no surface has to know it is JSON

---

## 6. Ordering through the thread (rentals and services)

Some things are not bought in one click — a flat, a repair, a commission. Those
listings are agreed in the conversation, and payment is the agreement.

- ✅ `ordersInThread()` is the single rule: an explicit seller choice wins,
  otherwise a rental is agreed first — because that is what a rental is
- ✅ The seller sets it. The listing form gains **Arrange it in the thread first**
  for services and rentals, plus **Let by** (day / week / month / agreed) and a
  optional **Deposit** for rentals; all three are stored in the listing's own
  `attributes`, and the sticker price is the price for that period
- ✅ The listing page leads with the conversation for those listings — "Agreed with
  the owner first" for a rental, "Ask the seller first" for a service — using the
  existing `MessageSellerButton`, which opens the one thread per
  (store, buyer, listing) rather than scattering the question
- ✅ **Paying up front stays available**: the purchase panel is untouched and still
  sits below, so the thread is a way through, not a gate
- ✅ A payment on a thread-ordered listing fulfils through the same single path
  (`claimPayment`) — nothing about money changed

---

## 7. Publishing the store, and the settings that do not belong

- ✅ The side menu now carries the control itself, right under the shop's state
  badge: **Publish storefront** / **Unpublish storefront**, with its own spinner
  and its own success or refusal message in place
- ✅ It is the same action settings uses, including the refusal to publish a
  storefront with nothing live in it — so the menu cannot publish an empty shop
  that settings would have blocked
- ✅ The badge still tells the truth (Published / Draft, `@handle` beside it) and
  the result is re-read from the database after every toggle
- ✅ The **website** field is gone from all four places it lived: the settings form
  (and the form's own prop type), the settings page, `updateStoreProfileAction`,
  and the storefront's contact block. A shop here is reached at `/@handle`
- ✅ `stores.website_url` stays in the schema, unused, so nothing is destructive
  and the update path remains for any store that had filled it in

---

## 8. Custom inputs — the seller decides what is asked and what is shown

The seller picks the shape of their own catalogue, per category: which fields a
listing form asks for, and which of them a card shows. Definitions are the
seller's own; values live in the listing's existing `attributes` JSON.

- ⬜ New table `listing_field_definitions` (store, optional category, scope
  `form` | `card`, key, label, kind, options, required, position, visible)
- ⬜ New settings surface — **Catalogue fields** — to add, rename, reorder,
  toggle, or write a field, per category or for the whole store
- ⬜ The listing form reads the definitions it applies to, so an event asks for
  what an event needs and a shop selling only priced goods is not asked for
  fields it will never use
- ⬜ Cards render the visible definitions in order, after the type's own facts
- ⬜ Defaults are seeded from the built-in per-type facts (§5), so a seller who
  touches nothing sees exactly today's platform
- ⬜ Nothing is invented: an empty definition set means no extra fields, never
  placeholder content

---

## 9. Every processing control says it is working

- ✅ Every `<Button` in the app was audited against its pending wiring. The write
  and navigation controls all go through `SubmitButton`, `ActionButton` or
  `NavButton`, and the ones that bypass them report pending for themselves:
  register and sign-in (`AuthPanels`), the six-digit code step (`OtpForm`),
  Google sign-in, image and file uploads (with a real progress bar), cart
  quantity and remove (`CartLine`), checkout, buy-from-card, message send, the
  ticket scanner, filters and pagination. **No processing control was found
  unwired** — the sweep's finding is that the wiring was already complete
- ✅ What was wrong was visibility, and that is fixed: the ring's own rule went
  from `0.65` opacity at `0.85em` to full strength at `0.95em`, and the label
  steps back to `0.9` while it turns. At 12px and two-thirds opacity the state was
  technically present and practically invisible, which is the same as absent
- ✅ The mechanism is one rule for the whole platform
  (`.button[data-pending="true"]::before`) rather than a spinner passed in at
  each call site, so a control cannot forget to show one — it inherits it by
  being pending. React Aria is what sets `data-pending` from `isPending`, and the
  attribute is confirmed present

---

## 10. Where this pass got to

| # | Status |
| --- | --- |
| §1 mail + fresh database | ✅ done, verified live |
| §2 brand mark + hero | ✅ done |
| §3 workspace filter bar | ✅ done on every page that had a facet wall |
| §4 image corners | ✅ done, with the clipping rule verified in the served CSS |
| §5 per-type cards | ✅ done, including a new **rental** type |
| §6 ordering through the thread | ✅ done for services and rentals |
| §7 publish/unpublish + website field | ✅ done |
| §9 spinners | ✅ audited, made visible |
| §8 custom inputs | ⬜ **next** — the one item with real schema work and a new settings surface |

`npm run typecheck` is clean and `npm run build` compiles every route, including
`/rentals`.

### §8 — the shape I would build, before starting it

**Table** `listing_field_definitions`

| Column | Why |
| --- | --- |
| `id`, `store_id` | Scoped to one seller, never platform-wide |
| `category_id` (nullable) | Null = every category; set = only that category, which is what "applies to anything in that category" means |
| `scope` | `form` (asked when creating) or `card` (shown when browsed) — the same field can be both |
| `key` | Where the value lives inside `listings.attributes` — the existing JSON column, so no listing migration |
| `label`, `kind`, `options`, `required`, `position`, `visible` | What to render, how, in what order, and whether |

`kind` covers the honest minimum: text, long text, number, money, yes/no, choice,
date. Nothing about a custom field can change how a listing is *priced, taxed,
fulfilled or paid for* — that stays in the schema — because a form the seller
controls must not be able to break checkout.

**Surfaces**

1. **Settings → Catalogue fields** — add, rename, reorder, hide, or write a brand
   new field, per category or for the whole store
2. **The listing form** reads the definitions for its type and category and
   renders them after the built-in fields; the values are written into
   `attributes` under the field's `key`
3. **Cards** render the visible `card`-scope definitions after the type's own
   facts (§5), in the order the seller set
4. **Seeded defaults** come from the built-in per-type facts, so a seller who
   touches nothing sees exactly today's platform and can then start removing

**Not started, and deliberately so**: this changes the shape of every listing
form and every card, so it wants its own pass with its own click-through rather
than being bolted on at the end of this one.
