# Rush Cart quality audit — September 30, 2026

## Locked surfaces

No hero markup, cube, headline, spacing, background or hero CSS was edited.
The existing Workspace side menu and logo-led storefront composition were preserved.

## Confirmed issues addressed

- Product/Event validation now identifies a missing requirement, offers **Take me there**, scrolls/focuses the relevant section and highlights it without clearing form values. Reduced motion is respected.
- Active products require a current category and photo on both client and server. Incomplete drafts remain supported. Quick publishing cannot bypass these requirements.
- Editing uses the product's saved currency, not a shop currency changed after creation.
- Multiple product entry uses independent forms, per-form saves and errors. Saved product and option IDs are retained so repeated saves update rather than duplicate them. Uploads block saves and overlapping photo selection.
- Shop live search debounces only user edits, avoiding a URL-sync navigation loop; pending searches cancel on clear/submit. Marketplace/shop-directory search synchronizes with URL changes; clearing search updates the dataset. Price inputs reflect cleared URL state. Event cards say **Open Event**; event exploration uses shared product cards with shop context and a less cramped mobile grid.
- Privacy state is mounted once globally. Valid preferences survive navigation/reload using localStorage plus an essential cookie, choosing the newest valid saved record. Same-tab and cross-tab changes synchronize. Blocked persistence is reported rather than falsely claimed successful. There are currently no optional trackers to load.
- Foreground-stream notifications were replaced with native VAPID Web Push. Subscriptions are authenticated, session-bound, validated against supported browser push hosts, and never cache account responses. Messages, marketplace payment confirmation, seller paid orders and seller order-state changes invoke real server delivery. Expired endpoints are removed. Logout/session expiry prevents server delivery; the worker independently checks the current account before showing or following a notification.
- Upload-provider errors are logged server-side rather than exposing raw storage errors to sellers. Hidden-store help text now matches the actual private-store authorization rule.

## Existing implementations preserved and checked

One shared category tree supplies platform/product selectors; shop main-category slugs derive from those same canonical definitions. Retired catch-all categories remain readable but are not new selectable options. Removed commerce routes return Not Found and removed listing types are excluded from discovery. Events reference existing products via event_products, with store-ownership validation and a database insert guard. Stacked-card identity and reduced-motion rules already exist.

Transactional email already uses Rush Cart HTML/plain-text branding, the real logo as a CID attachment, production-URL safety checks and provider idempotency. See email-inventory.md for the supported trigger inventory and deliverability requirements. Old branding matches found in inspected components are comments, not rendered customer copy; historical database/cookie identifiers were not blindly renamed.

## Verification

- npm run typecheck: passed.
- npm test: 20 regression tests passed, including real disposable-database product create/edit/category/image/currency/status persistence, ownership, stable option identity, payment settlement/idempotency, email payload safety and mocked push delivery/session expiry/endpoint cleanup.
- npm run build: production compilation passed.
- npm run lint: no errors; existing warnings remain (mostly raw image optimization advice, unused code and hook cleanup).
- npm run test:journeys: disposable production server, real password sessions, account/cart/logout isolation and Chromium browser tests. Browser tests cover product validation focus, actual local image upload, creation, repeated save, independent failed form, editor reload, Event validation/create/edit/exploration, storefront editing/public reload, search/filter/category navigation, messaging and add-to-cart. Responsive geometry/card boundaries cover 12 routes at 320, 430, 768, 1280 and 1600px. Consent rejection/acceptance, cookie fallback and intentional settings changes are tested across reload/navigation.
- Browser audit captures uncaught runtime exceptions and HTTP 5xx responses. It is not a complete network/media waterfall or exhaustive visual review of every dialog/device.

## Not claimed complete / deployment dependencies

1. **Push activation** needs VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (a real mailto contact), public HTTPS and the additive push_subscriptions schema. No configured production database was migrated. Apply a reviewed migration with explicit approval; do not run the broad historical migration blindly against production. Real operating-system push appearance/click behavior still requires a deployed device test. Server delivery is bounded best-effort, not a durable retry queue. Safari/iOS has platform-specific installed-web-app requirements. The supported endpoint allowlist may need extending for additional browser push vendors.
2. **Payments** use Paystack-mocked settlement tests, not live charges. Real checkout depends on valid Paystack configuration and provider callbacks/webhook setup.
3. **Email** API requests are mocked. No live messages, DNS changes or inbox inspections were performed. Verified sender/DKIM/SPF/DMARC, public HTTPS app URL and recipient-side MIME/rendering checks remain operational dependencies.
4. **Storage** browser uploads were verified through the real local driver, not a live R2 bucket. Production requires working R2 credentials, durable media and appropriate CORS/public access.
5. Browser close/reopen consent was not tested with a persistent browser profile; durable storage survives page reload/navigation in tests. Permission grant and real external push delivery are not yet device-verified.
6. This is a substantial audit/fix pass, not exhaustive certification of every listed customer/seller workflow. Password reset inbox delivery, live payment completion, every messaging action and all account-switch client caches need further targeted coverage.
7. npm install reported two dependency vulnerabilities (one moderate, one high). No force/breaking dependency upgrades were applied without review.
