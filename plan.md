# LINK STORE — build plan and verification checklist

One link, everything you sell. This document is the single checklist for the
whole platform: what exists, what it is wired to, and what is still open.

**How to read the status column**

| Mark | Means |
| --- | --- |
| ✅ | Implemented, and the code path was read end to end in this pass. |
| 🔎 | Implemented; needs a live click-through by a person to call it confirmed. |
| ⬜ | Not built yet. Listed with what it needs first. |

Last updated: after the side-menu, filter and text pass.

---

## 0. Stack — what everything is actually built on

| Piece | Choice | Notes |
| --- | --- | --- |
| Framework | Next.js 15 (App Router) + React 19 | Server components for reads, server actions for writes. |
| Database | Turso / libSQL (local file in development) | 31 tables, `npm run db:migrate` applies `db/schema.sql` idempotently. |
| UI | HeroUI v3 + Tailwind v4 | HeroUI owns the design system; the brand layer only overrides the accent hue. |
| Auth engine | Better Auth 1.7.5 over Kysely + `kysely-libsql` | Owns identities, passwords, sessions, OAuth and codes. Writes the app's existing `users`/`sessions` tables through field mapping, so no foreign key moved. |
| Auth interface | Our own components (`components/auth/*`) | HeroUI only. No Better Auth UI package is installed, and the engine's screens are never shown. |
| Storage | Cloudflare R2, local disk fallback | `storageDriver` in `lib/env.ts`; uploads work before R2 is configured. |
| Payments | Paystack | Server-side verification + webhook; never a client-side "paid". |
| Email | Resend (HTTP API, no SDK) | `RESEND_API_KEY`; sender on a verified domain. |
| Realtime | Server-sent events | `/api/messages/stream`, polling rows newer than the last. |
| QR codes | `qrcode` | Ticket QR generated per attendee, in the email. |

---

## 1. Foundation

- ✅ **Database schema** — 29 tables: listings, listing_images, listing_variants,
  categories, inventory_movements, stores, store_settings, users, sessions,
  customers, carts, cart_items, orders, order_items, payments, payouts,
  transactions, discounts, reviews, events, ticket_types, tickets, downloads,
  digital_assets, conversations, messages, email_deliveries, analytics_events,
  schema_migrations.
- ✅ **Migrations are idempotent** — every statement is `CREATE ... IF NOT EXISTS`,
  plus targeted rebuilds for columns that changed shape.
- ✅ **Auth** — register, log in, log out, session cookies, `requireStore()` guard.
  🔎 Live sign-in round trip.
- ✅ **Authorization everywhere it matters** — order, message, listing and payout
  reads are scoped by store or buyer id, never by id alone. A guessed id reads
  nothing.
- ✅ **Storage** — `/api/uploads` writes to R2 when configured, local disk
  otherwise; `/api/files/[...key]` serves it.
- ✅ **Error boundaries** — Workspace and Marketplace both replace only the page
  segment on failure, with a retry. No stack traces reach a seller or shopper.
- ✅ **Loading states** — `loading.tsx` for Workspace and the shop directory;
  the shell stays mounted so nothing blanks out.

## 2. Shell and navigation

- ✅ **Marketplace navbar** — search, cart count, account menu, theme toggle,
  mobile drawer, bottom navigation.
- ✅ **Workspace shell** — fixed side menu from `lg`, drawer below it (97vw), and
  the five most-used destinations in the floating bottom nav.
- ✅ **Workspace side menu is two areas, side by side** — the header spans the
  top; the option rail sits beside the section display at *every* width, never
  underneath. `.ls-menu` in `app/globals.css` owns that grid.
- ✅ **Side menu is 56rem wide (64rem at xl)** — the rail is 5.5rem of icon
  buttons, the display takes the rest. Nothing is compressed to fit.
- ✅ **No dots, dividers or connectors between options** — the rail is buttons in
  a column. Nothing is drawn between them.
- ✅ **Current-page marker is neutral, not coloured** — a slim bar on the rail's
  edge plus a heavier label, in the same ink as the rest of the menu. The green
  dot is gone; no colour is introduced to say "you are here".
- ✅ **No account card at the bottom of the menu** — a block that only filled
  space was removed, so the display card owns the full height. Those actions
  live in the header's account menu.
- ✅ **Selecting an option previews, it does not navigate** — pressing an area
  points the display at it; the display's **Open <area>** button is what enters
  the page. When the area shown is the page already being viewed, the button is
  replaced with "You are viewing this area."
- ✅ **Icons are concept-specific** — Workspace is stacked layers, Dashboard is a
  segmented layout, Shop/Storefront is a bag, Marketplace is a basket, Products
  is a box. No two neighbouring destinations share a glyph.
- ✅ **Spinners on every data control** — `NavButton` for navigations,
  `SubmitButton` (form actions) and `ActionButton` (server actions) for writes;
  plus search, filters, pagination, tabs, checkout discount, cart quantity and
  remove. See §9 for the sweep that finished this.

## 3. Selling

- ✅ **Create a listing** — type (product/service/food/digital/event), category,
  title, subtitle, description, price, compare-at, cost price, SKU, stock and
  tracking, variants, photos, status.
- ✅ **Several at once** — batch mode: a line per listing (name, price, compare-at,
  stock) with duplicate and remove, shared type/photos/status, sequential save
  with a live "saving 3 of 6" count and an honest partial-failure message.
- ✅ **Pricing** — price, compare-at, cost price per listing, and per-variant.
- ✅ **Discounts** — discount codes with scope and value, applied at checkout.
- ✅ **Services** — duration, service mode (online/onsite/either), prep time, and
  **"Let buyers message me"**, stored in `attributes.serviceChat`, which is what
  puts the Message button on the listing.
- ✅ **Inventory** — stock per listing and per variant, low-stock threshold from
  store settings, stock movements recorded in `inventory_movements`.
- ✅ **Listings management** — list, filter by status/type, edit, archive.
- ✅ **Categories** — seller-facing category management.
- ✅ **Reviews** — seller view of reviews received.
- ✅ **Events** — venue, dates, capacity, cover, ticket types with prices and
  quantities, publish/draft/cancelled/completed.

## 4. Buying

- ✅ **Marketplace home** — hero, collections, rails, stores, events, and its own
  adaptive tint taken from the imagery on show.
- ✅ **Directories** — products, shops, events, services, digital, food, plus
  fashion/electronics/cars/furniture collections.
- ✅ **Filters** — one **Filters** button per directory opens every choice: sort
  order, type, category, price range, in-stock. The separate sort dropdown that
  used to sit beside it is gone; ordering now lives inside the panel.
- ✅ **Listing detail** — gallery, price, variants, stock state, seller, reviews,
  delivery facts, add to cart, and Message the seller where the seller allowed it.
- ✅ **Storefront** — store identity, banner, listings, about, contact, published
  state.
- ✅ **Cart** — one universal cart across the marketplace, storefronts and events;
  quantity edits, remove, sellable-state and price-change warnings, per-store
  grouping.
- ✅ **Checkout** — contact and address, delivery vs pickup, discount code,
  customer note, order review, then payment.
- ✅ **Payment** — Paystack, verified server-side; `/checkout/callback` and
  `/api/payments/paystack/webhook` both funnel into one claim step, so a payment
  can only be fulfilled once.
- ✅ **Fulfilment on payment** — order marked paid, stock decremented, tickets
  issued per attendee, digital download grants created, customer totals updated,
  ledger written.
- ✅ **Invoices by email** — an invoice per paid order with the real line items,
  variants, discount, delivery, tax, totals, shipping address and a tracking
  link.
- ✅ **Ticket emails** — one QR per attendee, with the code printed as text too.
- ✅ **Receipt log** — every send recorded in `email_deliveries`; the order page
  shows per-attempt status (Sent / Not sent / Failed), the recipient, the time
  and the error, with **Send receipt again**.
- ✅ **Guest order lookup** — `/orders/[token]` for a buyer without an account.
- ✅ **Buyer order history** — `/orders` with statuses.

## 5. Money

- ✅ **Ledger** — every sale, platform fee and payout as a `transactions` row;
  balances derive from rows, never a stored total.
- ✅ **Finance section** — available balance, requested in payouts, recent
  activity, payout account details.
- ✅ **Payout requests** — requested against the available balance, recorded in
  `payouts`, history shown.
- ✅ **Platform fee** — `PLATFORM_FEE_PERCENT`, itemised per transaction.

## 6. Messaging

- ✅ **Threads** — `conversations` is unique per (store, buyer, listing), so
  pressing "Message the seller" twice reuses the thread instead of scattering the
  question.
- ✅ **Entry point** — the Message button on a listing whose seller enabled it;
  a signed-out visitor is sent to sign in and returned to the listing.
- ✅ **Sending** — `POST /api/messages`, accepted only from a party to the thread.
- ✅ **Live delivery** — `GET /api/messages/stream`, SSE, ~2.5s poll, `ready`
  event, keep-alive pings, automatic retry on the client.
- ✅ **Thread list** — `/workspace/messages`, newest activity first, each row
  naming the counterpart and the listing it is about.
- ✅ **Thread page** — `/workspace/messages/[id]`, chat bubbles, live/reconnecting
  indicator, composer with a pending Send, ⌘/Ctrl+Enter to send.
- ✅ **Unread** — incoming messages marked read when the thread is opened; the
  side-menu display shows a per-thread unread count.
- ✅ **In the Workspace** — Messages is a real destination in the rail, with its
  own preview panel listing the latest conversations.
- ⬜ **Email notification for a new message** — the seller is only told inside
  the app. Resend is wired, so this is a small follow-up: send on first unread
  after a delay, respecting a per-store setting.

## 7. Events and tickets

- ✅ **Publish an event** — with ticket types, prices and quantities.
- ✅ **Sell tickets** — through the same cart and checkout as everything else.
- ✅ **Ticket identity** — one ticket row per attendee, each with its own code
  (`LS-xxxxxxxx`) and its own QR.
- ✅ **Check-in** — `/workspace/events/[id]/check-in` validates a code and records
  the scan; the ticket goes `valid → checked_in` once, and a second scan says so.
- ✅ **Attendance** — event page shows sales and check-ins.

## 8. Admin

- ✅ **Platform admin** — stores and users listings, plus admin controls.
- ✅ **Admin shell** — same design language, no seller-only blocks.

## 9. The visual system

- ✅ **Adaptive colour** — `AdaptiveTint` averages the dominant hue of the image
  being viewed and washes the surface behind it. Live on the marketplace home,
  listing detail, event detail, and the storefront header — which resolves its
  source in order: banner, then logo, then the first published product, then the
  first event cover, so a store is never untinted for want of a banner. Media is
  served same-origin, so the canvas is never tainted and the hue actually
  resolves.
- ✅ **Focus transitions** — `FocusRegion` sharpens content in on arrival, keyed
  on the path only, so filtering never re-blurs a grid. Now on both the
  Marketplace and the Workspace.
- ✅ **Segment transition** — the side menu's display card rises and settles when
  the picked area changes, and nothing else in the layout moves.
- ✅ **No scrollbars anywhere** — a global rule suppresses the indicator while
  scrolling keeps working; no hard edges through a surface.
- ✅ **Spacing over density** — cards, product rails and panels were loosened
  rather than compressed; horizontal continuation is used before shrinking.
- ✅ **Text weight floor** — body text is medium (500) platform-wide, so single
  line labels stay legible against tinted, image-driven surfaces, while headings
  and figures keep their heavier weights.
- ✅ **Dashboard copy is one line** — duplicated and restated explanations in the
  Workspace overview were cut back; each card says its thing once.
- ✅ **Every data surface is designed for its own subject** — there is no shared
  row template. A product is a shelf card because it is judged by its
  photograph; an order is a dated receipt because it is a document; stock is a
  level bar because the question is "how close am I to running out"; an event is
  a poster with a date stamp because that is what it is; a customer is a rank
  with a share bar because the question is "who is worth keeping". See §10.
  An earlier attempt at one generic table for all six was removed, along with
  the unused `DataRowCard` it was based on.
- ✅ **Filters are one control, not two** — the sort selector that sat beside the
  Filters button in both directories is gone; ordering now lives inside the
  filter panel with everything else.
- ✅ **Honest empty states** — an empty area says so and offers the action that
  fills it. No seeded or sample records anywhere: if the database is empty, the
  UI is empty.

## 10. Layout audit — what each surface is, and why

The rule: the shape of a page comes from what the data *is* and what the person
came to do — never from a template applied to six different things.

| Surface | Its design, and the reason for it | State |
| --- | --- | --- |
| Workspace → Listings | **A shelf.** Merchandising cards on a responsive grid: image-led, price as the largest text, listing state stamped on the cover, one coloured stock line, actions on the card's footer. A shelf header carries the counts that matter (in this view, units in stock, sold out) and the search. | ✅ Rebuilt |
| Workspace → Orders | **A dated ledger.** Grouped by the day each order arrived — Today / Yesterday / a date — each day totalled with its paid count and revenue, and every row showing a three-mark fulfilment rail (Paid → Processing → Fulfilled). Cancelled orders say they stopped. Orders are documents with a date. | ✅ Rebuilt |
| Workspace → Inventory | **Stock health.** One page-wide scale so bars are comparable, the seller's low-stock line drawn on every bar, listings split into "Needs attention" (out or low) and everything tracked, and movements shown as a timeline with a spine rather than a table. Answers "what is about to stop selling?" | ✅ Rebuilt |
| Workspace → Events | **Posters on a calendar.** Cover image with the date stamped on it like a flyer, ticket sales as a progress bar with released/sold/checked-in figures, and the list split into Coming up and Already happened with past events dimmed. | ✅ Rebuilt |
| Workspace → Customers | **A ranking.** Ordered by lifetime value, ranked, each person carrying a share bar measured against the best customer, repeat buyers marked, plus repeat-revenue stats. The answer to "who is worth keeping?" | ✅ Rebuilt |
| Workspace → Dashboard | Copy cut to one line per card; no restated explanations. | ✅ Rebuilt |
| Buyer → Orders | **Receipts.** One sentence of plain language per order saying what is happening and what happens next, written for the buyer not the seller, with reference, items and amount beneath it. A different audience, so a deliberately different page. | ✅ Rebuilt |
| Buyer → Order detail, cart, checkout, listing detail, storefront | Not rebuilt in this pass — next in the queue. | 🔎 |
| Workspace → Finance, Analytics, Discounts, Reviews, Categories | Not rebuilt in this pass — next in the queue. | 🔎 |

## 11. Authentication — engine, interface, overlay

Two layers, deliberately separate.

**Engine** (`lib/auth/server.ts`, Better Auth 1.7.5): identities, passwords,
sessions, accounts, OAuth, one-time codes, rate limiting. It talks to the app's
own libSQL client, so there is one database and one identity table.

**Interface** (`components/auth/*`): every pixel. Built from the same HeroUI
components as the rest of the platform — the engine's own screens and branding
are never shown.

| Piece | What it is |
|---|---|
| `AuthProvider` | Mounted once in `app/providers.tsx`; any screen can `open("sign-in")` |
| `AuthDialog` | The overlay: blurred backdrop, opens over whatever is on screen |
| `AuthPanels` | Sign-in (email + password) and create-account (email, username, password, confirm) |
| `OtpForm` | Six digits in one strip: auto-advance, backspace, arrows, paste, resend, expiry |
| `AuthNotice` | Every error/notice/expiry state, in our words, never the engine's |
| `GoogleAuthButton` | Our HeroUI button with Google's real four-colour mark |
| `/auth/continue` | The one place that decides onboarding vs workspace, and merges a guest cart |

The overlay opens in place from the navbar, the mobile pill, the drawer and
“Message the seller”; reaching `/sign-in` directly renders the same overlay, so
deep links and protected-page redirects still land somewhere sensible.

### Data model

`users` and `sessions` are the engine's tables, **mapped onto the names the
platform already used** (`user.modelName` / `user.fields`, `session.modelName` /
`session.fields`). Every `stores.user_id`, `orders.user_id`, `carts.user_id`,
`conversations` and `messages` row therefore still points at the same identity —
no copy, no second user store, no rewritten foreign keys. Columns the engine
adds for us: `email_verified`, `username`, `displayUsername`. Retired:
`password_hash`.

### What was verified, how

Every call the UI makes was exercised against the running app:

| Flow | Result |
|---|---|
| Create account | `sign-up/email` → account created, **no session**, `emailVerified: false` |
| Sign in before confirming | `403 EMAIL_NOT_VERIFIED` → the panel sends a code and moves to the code step |
| Confirm with code | session issued by the engine (`autoSignInAfterVerification`) |
| Sign in with password | `200` |
| Sign in with username | `200` |
| Sign in with a code (account with no password) | `200` — the existing account still has a way in |
| Protected pages | `/workspace` and children `200` with a session; without one, middleware → `/sign-in?next=` |
| No store yet | `/auth/continue` → `/workspace/onboarding`; with a store → `/workspace` |
| Emails | Send through our Resend layer, logged in `email_deliveries` as `kind: auth` |
| Engine schema check | `"up to date"`, no mismatch warnings — `created_at`/`updated_at` are declared `date`, which needed a `users` table rebuild in `db/migrate.mjs` |

The existing account (one store, one listing) survived the migration intact and
signs in with a code.

### Not done

1. ⬜ **Google credentials** — `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` are not
   set, so the button is hidden (deliberately: a button that leads to a broken
   handshake is worse than none). Redirect URI to register in Google Cloud:
   `http://localhost:5000/api/auth/callback/google` (and the production origin).
2. ⬜ **Username in settings** — the engine's `updateUser` can set one; accounts
   that predate usernames have none until that field exists.
3. ⬜ **Forgot password** — an account with a password has no reset screen yet;
   “Email me a code instead” currently works, but resets should be explicit.

## 12. Open items, in the order I would take them

1. ⬜ **Message email notification** (§6) — Resend is already wired.
2. ⬜ **Storefront segmentation animation** — cards moving into the detail view
   rather than the page being replaced, and sections animating between views.
3. ⬜ **Service purchase follow-up** — after buying a service, offer the thread
   with the seller.
4. ⬜ **Payout execution** — requests are recorded and balances move; sending the
   money to the bank needs the Paystack transfer API and a provider decision.
5. 🔎 **A full purchase, clicked through by hand** — add to cart, checkout, pay,
   invoice in the inbox, seller order, payout, ticket check-in. Every piece is
   built and wired; nothing replaces a real end-to-end run with real money.
6. ✅ **Auth rework** — done (§11): Better Auth engine, our own HeroUI overlay.
