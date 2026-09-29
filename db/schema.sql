-- ============================================================================
-- LINK STORE — Core schema (Turso / libSQL, SQLite dialect)
-- ----------------------------------------------------------------------------
-- Design principles:
--   * ONE reusable commerce engine. Product / food / service / digital / event
--     ticket are all rows in `listings` differentiated by `type` + `attributes`.
--     We never duplicate an entire subsystem per commerce category.
--   * An `order` can hold heterogeneous `order_items` (a t-shirt + a ticket + an
--     e-book in a single order).
--   * Money is stored in MINOR UNITS (kobo / cents) as INTEGER. Never floats.
--   * Turso stores metadata only. Files live in Cloudflare R2 (storage keys here).
--   * Timestamps are ISO-8601 UTC TEXT so lexical sort == chronological sort.
-- ============================================================================

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- Identity — the authentication engine's schema
-- ---------------------------------------------------------------------------
-- These four tables belong to the authentication engine (lib/auth/server.ts).
-- The engine creates them, and it is the only thing that writes authentication
-- data into them; the rest of LINK STORE reads them.
--
-- The engine's column names are mapped in its config, so `users` and `sessions`
-- keep the names and foreign keys the platform has always used — every
-- `stores.user_id`, `orders.user_id`, `carts.user_id` and `messages.sender_id`
-- still points at the same rows, with no copy and no second user store.
--
-- Timestamps are ISO-8601 TEXT and booleans are 0/1: exactly what the engine
-- stores on SQLite. There is no password column — sign-in is an emailed code or
-- Google, and anything else would be a credential waiting to leak.
CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  email           TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  email_verified  INTEGER NOT NULL DEFAULT 0,
  avatar_url      TEXT,
  phone           TEXT,
  role            TEXT NOT NULL DEFAULT 'user',     -- user | admin
  last_login_at   TEXT,
  -- The seller's handle. It can be used to sign in, and it is what a storefront
  -- greets — `displayUsername` keeps the capitalisation they typed.
  username        TEXT,
  displayUsername TEXT,
  -- Declared `date` because that is what the engine's schema declares, and it
  -- validates the types it finds its own columns in. SQLite still stores the
  -- ISO-8601 text untouched (the value is not numeric, so NUMERIC affinity
  -- leaves it alone), which is why these read back exactly as they are written.
  created_at      date NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      date NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS users_username_uidx ON users(username);

-- `token` is the value in the session cookie; the row is the record of who is
-- signed in, so deleting a user's rows is what signs them out everywhere.
CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  token      TEXT NOT NULL UNIQUE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ip         TEXT,
  user_agent TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS sessions_user_id_idx  ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires  ON sessions(expires_at);

-- A linked sign-in provider, with its tokens: Google today. An email code is
-- deliberately absent — it proves the address itself and leaves nothing behind
-- to be stolen later.
CREATE TABLE IF NOT EXISTS account (
  id                    TEXT PRIMARY KEY,
  accountId             TEXT NOT NULL,
  providerId            TEXT NOT NULL,
  userId                TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  accessToken           TEXT,
  refreshToken          TEXT,
  idToken               TEXT,
  accessTokenExpiresAt  TEXT,
  refreshTokenExpiresAt TEXT,
  scope                 TEXT,
  password              TEXT,
  createdAt             TEXT NOT NULL,
  updatedAt             TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS account_userId_idx ON account(userId);

-- Short-lived proofs: the one-time codes sent by email, and anything similar.
CREATE TABLE IF NOT EXISTS verification (
  id         TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value      TEXT NOT NULL,
  expiresAt  TEXT NOT NULL,
  createdAt  TEXT NOT NULL,
  updatedAt  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS verification_identifier_idx ON verification(identifier);

-- Registrations waiting to be proven.
--
-- An account does not exist until its email has been verified, so the details
-- of a registration in flight live HERE and nowhere else: nothing in `users`,
-- `account` or `sessions` is written before the emailed code is checked on the
-- server (see lib/auth/registration.ts). The password is held sealed (AES-GCM,
-- under a key derived from the server's session secret), the code itself is
-- never stored — only a keyed hash of it — and the row is consumed the moment
-- the account is created, or forgotten when it expires unproven.
CREATE TABLE IF NOT EXISTS pending_registrations (
  id                 TEXT PRIMARY KEY,
  email              TEXT NOT NULL UNIQUE,
  username           TEXT NOT NULL,
  name               TEXT NOT NULL,
  password_encrypted TEXT NOT NULL,
  otp_hash           TEXT NOT NULL,
  attempts           INTEGER NOT NULL DEFAULT 0,
  expires_at         TEXT NOT NULL,
  consumed_at        TEXT,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- Store (the seller workspace + public storefront, reachable at /@slug)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stores (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug              TEXT NOT NULL UNIQUE,             -- storefront handle, without "@"
  name              TEXT NOT NULL,
  tagline           TEXT,
  description       TEXT,
  logo_url          TEXT,
  banner_url        TEXT,
  primary_category  TEXT,                             -- fashion | food | electronics | ...
  currency          TEXT NOT NULL DEFAULT 'NGN',
  contact_email     TEXT,
  contact_phone     TEXT,
  website_url       TEXT,
  address           TEXT,
  city              TEXT,
  state             TEXT,
  country           TEXT DEFAULT 'Nigeria',
  socials           TEXT,                             -- JSON {instagram, x, whatsapp, ...}
  is_published      INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_stores_user  ON stores(user_id);
CREATE INDEX IF NOT EXISTS idx_stores_pub   ON stores(is_published, created_at);

CREATE TABLE IF NOT EXISTS store_settings (
  store_id              TEXT PRIMARY KEY REFERENCES stores(id) ON DELETE CASCADE,
  low_stock_threshold   INTEGER NOT NULL DEFAULT 5,
  order_prefix          TEXT NOT NULL DEFAULT 'LS',
  shipping_flat_fee     INTEGER NOT NULL DEFAULT 0,
  free_shipping_over    INTEGER,
  payout_bank_code      TEXT,
  payout_bank_name      TEXT,
  payout_account_number TEXT,
  payout_account_name   TEXT,
  storefront_sections   TEXT,                          -- JSON section ordering / toggles
  -- The shop's primary design type — how its storefront presents itself.
  -- NULL means "automatic": derived from what the shop actually sells.
  --   food | products | services | events | digital | rentals
  design_type     TEXT,
  -- Fulfilment: the seller's honest delivery estimate (a range, never a promise)
  -- and, for pickup sellers, where and when a buyer collects.
  delivery_estimate_min_days INTEGER NOT NULL DEFAULT 3,
  delivery_estimate_max_days INTEGER NOT NULL DEFAULT 5,
  pickup_location_name  TEXT,
  pickup_address        TEXT,
  pickup_hours          TEXT,
  pickup_instructions   TEXT,
  updated_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- ---------------------------------------------------------------------------
-- Categories (store_id NULL => platform-wide category; otherwise store-owned)
--
-- A tree, not a list: `parent_id` is what makes **main category → subcategory**
-- real rather than implied by position. The main categories correspond to the
-- Workspace modules (Products, Food, Services, Events, Rentals, Digital), which
-- is exactly what makes the interface context-aware: `kind` says which module a
-- category belongs to, so a Food page can only ever be offered food categories.
--
--   kind: general|product|food|service|digital|event|rental
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
  id         TEXT PRIMARY KEY,
  store_id   TEXT REFERENCES stores(id) ON DELETE CASCADE,
  parent_id  TEXT REFERENCES categories(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL,
  kind       TEXT NOT NULL DEFAULT 'general',
  icon       TEXT,
  position   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_categories_store  ON categories(store_id, position);
CREATE INDEX IF NOT EXISTS idx_categories_slug   ON categories(store_id, slug);
CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id, position);

-- ---------------------------------------------------------------------------
-- Listings — the universal sellable entity
--   type:       physical|fashion|electronics|furniture|automotive|food
--               |service|digital|event_ticket|rental|cargo|other
--   fulfilment: shipping|pickup|digital|booking|ticket|onsite
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS listings (
  id                TEXT PRIMARY KEY,
  store_id          TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  category_id       TEXT REFERENCES categories(id) ON DELETE SET NULL,
  type              TEXT NOT NULL,
  fulfilment        TEXT NOT NULL DEFAULT 'shipping',
  title             TEXT NOT NULL,
  slug              TEXT NOT NULL,
  subtitle          TEXT,
  description       TEXT,
  currency          TEXT NOT NULL DEFAULT 'NGN',
  price             INTEGER NOT NULL DEFAULT 0,        -- minor units
  compare_at_price  INTEGER,
  cost_price        INTEGER,
  sku               TEXT,
  track_inventory   INTEGER NOT NULL DEFAULT 1,
  stock             INTEGER NOT NULL DEFAULT 0,
  duration_minutes  INTEGER,                           -- services / bookings
  service_mode      TEXT,                              -- online|onsite|either
  prep_time_minutes INTEGER,                           -- food
  attributes        TEXT,                              -- JSON, type-specific metadata
  status            TEXT NOT NULL DEFAULT 'draft',     -- draft|active|archived
  is_featured       INTEGER NOT NULL DEFAULT 0,
  views_count       INTEGER NOT NULL DEFAULT 0,
  published_at      TEXT,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_listings_store_slug ON listings(store_id, slug);
CREATE INDEX IF NOT EXISTS idx_listings_store   ON listings(store_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_listings_type    ON listings(type, status, created_at);
CREATE INDEX IF NOT EXISTS idx_listings_cat     ON listings(category_id, status);
CREATE INDEX IF NOT EXISTS idx_listings_price   ON listings(status, price);

CREATE TABLE IF NOT EXISTS listing_images (
  id          TEXT PRIMARY KEY,
  listing_id  TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  image_url   TEXT NOT NULL,
  storage_key TEXT,
  alt         TEXT,
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_listing_images ON listing_images(listing_id, position);

CREATE TABLE IF NOT EXISTS listing_variants (
  id         TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  sku        TEXT,
  price      INTEGER,                                  -- NULL => inherit listing price
  stock      INTEGER NOT NULL DEFAULT 0,
  attributes TEXT,                                     -- JSON { size, color, ... }
  position   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_variants_listing ON listing_variants(listing_id, position);

CREATE TABLE IF NOT EXISTS digital_assets (
  id           TEXT PRIMARY KEY,
  listing_id   TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  storage_key  TEXT NOT NULL,                          -- R2 object key (never public)
  file_name    TEXT NOT NULL,
  content_type TEXT,
  file_size    INTEGER,
  version      INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_digital_assets ON digital_assets(listing_id);

-- ---------------------------------------------------------------------------
-- Events + ticketing
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS events (
  id              TEXT PRIMARY KEY,
  store_id        TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  listing_id      TEXT REFERENCES listings(id) ON DELETE SET NULL,
  title           TEXT NOT NULL,
  slug            TEXT NOT NULL,
  description     TEXT,
  cover_image_url TEXT,
  starts_at       TEXT NOT NULL,
  ends_at         TEXT,
  timezone        TEXT NOT NULL DEFAULT 'Africa/Lagos',
  venue_name      TEXT,
  address         TEXT,
  city            TEXT,
  state           TEXT,
  country         TEXT DEFAULT 'Nigeria',
  is_online       INTEGER NOT NULL DEFAULT 0,
  online_url      TEXT,
  capacity        INTEGER,
  status          TEXT NOT NULL DEFAULT 'draft',       -- draft|published|cancelled|completed
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_store_slug ON events(store_id, slug);
CREATE INDEX IF NOT EXISTS idx_events_store  ON events(store_id, status, starts_at);
CREATE INDEX IF NOT EXISTS idx_events_public ON events(status, starts_at);

CREATE TABLE IF NOT EXISTS ticket_types (
  id             TEXT PRIMARY KEY,
  event_id       TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  description    TEXT,
  price          INTEGER NOT NULL DEFAULT 0,
  currency       TEXT NOT NULL DEFAULT 'NGN',
  quantity_total INTEGER NOT NULL DEFAULT 0,
  quantity_sold  INTEGER NOT NULL DEFAULT 0,
  max_per_order  INTEGER NOT NULL DEFAULT 10,
  sales_start    TEXT,
  sales_end      TEXT,
  is_active      INTEGER NOT NULL DEFAULT 1,
  position       INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_ticket_types_event ON ticket_types(event_id, position);

-- ---------------------------------------------------------------------------
-- Customers (per store — a buyer is a customer of a specific storefront)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
  id           TEXT PRIMARY KEY,
  store_id     TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  user_id      TEXT REFERENCES users(id) ON DELETE SET NULL,
  email        TEXT NOT NULL,
  name         TEXT,
  phone        TEXT,
  orders_count INTEGER NOT NULL DEFAULT 0,
  total_spent  INTEGER NOT NULL DEFAULT 0,
  last_order_at TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_store_email ON customers(store_id, email);

-- ---------------------------------------------------------------------------
-- Cart (one basket per shopper, spanning as many stores as they shop from)
-- ---------------------------------------------------------------------------
-- A cart is one shopper's basket, and it can hold lines from any number of
-- stores. The seller of each line comes from its listing; checkout splits the
-- basket into one order (and one payment) per store, so money still reaches
-- each seller directly.
CREATE TABLE IF NOT EXISTS carts (
  id         TEXT PRIMARY KEY,
  token      TEXT NOT NULL UNIQUE,                     -- anonymous cart token (cookie)
  user_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
  status     TEXT NOT NULL DEFAULT 'active',           -- active|converted|abandoned
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_carts_user ON carts(user_id, status);

CREATE TABLE IF NOT EXISTS cart_items (
  id             TEXT PRIMARY KEY,
  cart_id        TEXT NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  listing_id     TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  variant_id     TEXT REFERENCES listing_variants(id) ON DELETE CASCADE,
  ticket_type_id TEXT REFERENCES ticket_types(id) ON DELETE CASCADE,
  quantity       INTEGER NOT NULL DEFAULT 1,
  unit_price     INTEGER NOT NULL,                     -- display snapshot; re-priced server-side at checkout
  currency       TEXT NOT NULL DEFAULT 'NGN',
  metadata       TEXT,                                 -- JSON (food add-ons, notes, ...)
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_cart_items ON cart_items(cart_id);

-- ---------------------------------------------------------------------------
-- Orders — heterogeneous order items, single payment, single store
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
  id              TEXT PRIMARY KEY,
  order_number    TEXT NOT NULL UNIQUE,
  store_id        TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  customer_id     TEXT REFERENCES customers(id) ON DELETE SET NULL,
  user_id         TEXT REFERENCES users(id) ON DELETE SET NULL,
  email           TEXT NOT NULL,
  customer_name   TEXT,
  phone           TEXT,
  currency        TEXT NOT NULL DEFAULT 'NGN',
  subtotal        INTEGER NOT NULL DEFAULT 0,
  discount_total  INTEGER NOT NULL DEFAULT 0,
  shipping_total  INTEGER NOT NULL DEFAULT 0,
  tax_total       INTEGER NOT NULL DEFAULT 0,
  total           INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'pending',     -- pending|paid|processing|fulfilled|cancelled|refunded
  payment_status  TEXT NOT NULL DEFAULT 'unpaid',      -- unpaid|pending|paid|failed|refunded
  discount_code   TEXT,
  customer_note   TEXT,
  shipping_address TEXT,                               -- JSON
  access_token    TEXT NOT NULL UNIQUE,                -- guest order lookup
  source          TEXT NOT NULL DEFAULT 'marketplace',
  -- How the buyer gets their goods, decided from the order's items at checkout:
  -- delivery | pickup | digital | none (tickets need no fulfilment).
  fulfilment_method TEXT NOT NULL DEFAULT 'delivery',
  -- The delivery estimate as it stood when the order was placed — a range the
  -- seller configured ("3–5 days"), never a promised date.
  estimated_delivery TEXT,
  -- Opaque receipt identifier: what the receipt's QR encodes. It is NOT the
  -- access token — scanning it opens a seller-scoped verification view, never
  -- the buyer's full receipt.
  receipt_code    TEXT UNIQUE,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  paid_at         TEXT,
  fulfilled_at    TEXT,
  cancelled_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_orders_store   ON orders(store_id, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_email   ON orders(email, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_payment ON orders(store_id, payment_status);

CREATE TABLE IF NOT EXISTS order_items (
  id                TEXT PRIMARY KEY,
  order_id          TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item_type         TEXT NOT NULL,                     -- product|food|service|digital|ticket
  listing_id        TEXT REFERENCES listings(id) ON DELETE SET NULL,
  variant_id        TEXT REFERENCES listing_variants(id) ON DELETE SET NULL,
  ticket_type_id    TEXT REFERENCES ticket_types(id) ON DELETE SET NULL,
  event_id          TEXT REFERENCES events(id) ON DELETE SET NULL,
  title             TEXT NOT NULL,
  variant_name      TEXT,
  unit_price        INTEGER NOT NULL DEFAULT 0,
  quantity          INTEGER NOT NULL DEFAULT 1,
  total             INTEGER NOT NULL DEFAULT 0,
  currency          TEXT NOT NULL DEFAULT 'NGN',
  metadata          TEXT,
  fulfilment_status TEXT NOT NULL DEFAULT 'unfulfilled', -- unfulfilled|fulfilled|cancelled
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

-- ---------------------------------------------------------------------------
-- Payments (Paystack) + money ledger
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
  id                 TEXT PRIMARY KEY,
  order_id           TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  store_id           TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  provider           TEXT NOT NULL DEFAULT 'paystack',
  reference          TEXT NOT NULL UNIQUE,
  provider_reference TEXT,
  authorization_url  TEXT,
  amount             INTEGER NOT NULL DEFAULT 0,
  currency           TEXT NOT NULL DEFAULT 'NGN',
  status             TEXT NOT NULL DEFAULT 'pending',   -- pending|success|failed|abandoned
  channel            TEXT,
  failure_reason     TEXT,
  raw_payload        TEXT,
  paid_at            TEXT,
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_store ON payments(store_id, status, created_at);

CREATE TABLE IF NOT EXISTS payouts (
  id           TEXT PRIMARY KEY,
  store_id     TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  amount       INTEGER NOT NULL DEFAULT 0,
  currency     TEXT NOT NULL DEFAULT 'NGN',
  status       TEXT NOT NULL DEFAULT 'pending',         -- pending|processing|paid|failed
  method       TEXT NOT NULL DEFAULT 'bank_transfer',
  reference    TEXT,
  destination  TEXT,                                    -- JSON snapshot of bank details
  notes        TEXT,
  requested_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  processed_at TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_payouts_store ON payouts(store_id, status, requested_at);

CREATE TABLE IF NOT EXISTS transactions (
  id            TEXT PRIMARY KEY,
  store_id      TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  order_id      TEXT REFERENCES orders(id) ON DELETE SET NULL,
  payment_id    TEXT REFERENCES payments(id) ON DELETE SET NULL,
  payout_id     TEXT REFERENCES payouts(id) ON DELETE SET NULL,
  type          TEXT NOT NULL,                          -- sale|platform_fee|refund|payout|adjustment
  direction     TEXT NOT NULL,                          -- credit|debit
  amount        INTEGER NOT NULL,
  currency      TEXT NOT NULL DEFAULT 'NGN',
  balance_after INTEGER NOT NULL DEFAULT 0,
  description   TEXT,
  reference     TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_txn_store ON transactions(store_id, created_at);
CREATE INDEX IF NOT EXISTS idx_txn_order ON transactions(order_id);

-- ---------------------------------------------------------------------------
-- Tickets issued after successful payment
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tickets (
  id             TEXT PRIMARY KEY,
  order_id       TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_item_id  TEXT REFERENCES order_items(id) ON DELETE CASCADE,
  event_id       TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  ticket_type_id TEXT REFERENCES ticket_types(id) ON DELETE SET NULL,
  store_id       TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  code           TEXT NOT NULL UNIQUE,
  holder_name    TEXT,
  holder_email   TEXT,
  -- The full ticket state machine. The database is authoritative: a ticket is
  -- valid exactly once, `used` is written only by the atomic door redemption,
  -- and a refunded or cancelled order voids its tickets at the same moment.
  --   valid      — live, may be admitted once
  --   used       — admitted at the door (was "checked_in"); a second scan is refused
  --   cancelled  — the order was cancelled before use
  --   refunded   — the order was refunded
  --   expired    — the event passed without the ticket being used
  --   void       — withdrawn by the seller; never admissible
  status         TEXT NOT NULL DEFAULT 'valid',
  checked_in_at  TEXT,                                  -- when it was used at the door
  -- The holder's trash. A ticket is never deleted when an event ends and never
  -- deleted by the platform: the holder moves it out of their normal inventory
  -- themselves (`deleted_at` set), keeps every fact about it, and can restore
  -- it. Nothing here ever changes the ticket's identity or its state machine.
  deleted_at     TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_tickets_order  ON tickets(order_id);
CREATE INDEX IF NOT EXISTS idx_tickets_event  ON tickets(event_id, status);
CREATE INDEX IF NOT EXISTS idx_tickets_holder ON tickets(store_id, deleted_at);

-- ---------------------------------------------------------------------------
-- Shipments — the fulfilment record behind tracking and pickup
-- ---------------------------------------------------------------------------
-- One shipment per order (delivery or pickup). It is the source of truth for
-- where an order stands on its way to the buyer, and every state change is an
-- action the SELLER takes — there is no GPS in this platform, so nothing here
-- ever invents movement. `current_location` is a seller-reported place with a
-- timestamp, not a live feed, and the buyer's tracking view says so.
--
--   delivery: preparing | ready_to_ship | shipped | in_transit
--             | out_for_delivery | delivered | cancelled
--   pickup:   preparing | ready_for_pickup | picked_up | cancelled
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shipments (
  id                 TEXT PRIMARY KEY,
  order_id           TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  store_id           TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  method             TEXT NOT NULL DEFAULT 'delivery',   -- delivery | pickup
  status             TEXT NOT NULL DEFAULT 'preparing',
  origin             TEXT,                               -- where it leaves from
  destination        TEXT,                               -- where it is going (or the pickup point)
  current_location   TEXT,                               -- seller-reported, with current_location_at
  current_location_at TEXT,                              -- when the seller last reported where things are
  current_lat        REAL,
  current_lng        REAL,
  -- Coordinates resolved from the reported place names, best-effort, purely so
  -- the map can draw the points that are known. NULL means "text only" — the
  -- interface then shows the place name without plotting it.
  origin_lat         REAL,
  origin_lng         REAL,
  destination_lat    REAL,
  destination_lng    REAL,
  carrier_note       TEXT,
  estimated_delivery TEXT,                               -- the honest range, e.g. "3–5 days"
  shipped_at         TEXT,
  delivered_at       TEXT,                               -- delivered, or picked up
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_shipments_order ON shipments(order_id);
CREATE INDEX IF NOT EXISTS idx_shipments_store ON shipments(store_id, status);

-- The timeline: one row per real state change, with the seller's own words and
-- the place they reported. This is what the buyer's tracking timeline renders.
CREATE TABLE IF NOT EXISTS shipment_events (
  id           TEXT PRIMARY KEY,
  shipment_id  TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  status       TEXT NOT NULL,
  title        TEXT NOT NULL,
  note         TEXT,
  location     TEXT,
  lat          REAL,
  lng          REAL,
  actor        TEXT NOT NULL DEFAULT 'seller',            -- seller | system
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_shipment_events ON shipment_events(shipment_id, created_at);

-- ---------------------------------------------------------------------------
-- Digital download grants (R2 keys are never exposed; downloads stream via API)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS downloads (
  id                 TEXT PRIMARY KEY,
  order_id           TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_item_id      TEXT NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  listing_id         TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  asset_id           TEXT REFERENCES digital_assets(id) ON DELETE CASCADE,
  token              TEXT NOT NULL UNIQUE,
  email              TEXT,
  download_count     INTEGER NOT NULL DEFAULT 0,
  max_downloads      INTEGER NOT NULL DEFAULT 10,
  expires_at         TEXT,
  last_downloaded_at TEXT,
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_downloads_order ON downloads(order_id);

-- ---------------------------------------------------------------------------
-- Inventory audit trail
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_movements (
  id          TEXT PRIMARY KEY,
  store_id    TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  listing_id  TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  variant_id  TEXT REFERENCES listing_variants(id) ON DELETE CASCADE,
  delta       INTEGER NOT NULL,
  reason      TEXT NOT NULL,                             -- sale|restock|adjustment|return|cancellation
  note        TEXT,
  reference   TEXT,
  stock_after INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_inventory_listing ON inventory_movements(listing_id, created_at);

-- ---------------------------------------------------------------------------
-- Discounts / promotions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS discounts (
  id           TEXT PRIMARY KEY,
  store_id     TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  code         TEXT,
  name         TEXT NOT NULL,
  type         TEXT NOT NULL DEFAULT 'percentage',       -- percentage|fixed
  value        INTEGER NOT NULL DEFAULT 0,               -- percent (0-100) or minor units
  min_subtotal INTEGER NOT NULL DEFAULT 0,
  usage_limit  INTEGER,
  used_count   INTEGER NOT NULL DEFAULT 0,
  scope        TEXT NOT NULL DEFAULT 'order',            -- order|listing
  listing_id   TEXT REFERENCES listings(id) ON DELETE CASCADE,
  starts_at    TEXT,
  ends_at      TEXT,
  is_active    INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_discounts_store ON discounts(store_id, is_active);
CREATE UNIQUE INDEX IF NOT EXISTS idx_discounts_code ON discounts(store_id, code) WHERE code IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Reviews
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reviews (
  id             TEXT PRIMARY KEY,
  store_id       TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  listing_id     TEXT REFERENCES listings(id) ON DELETE CASCADE,
  order_id       TEXT REFERENCES orders(id) ON DELETE SET NULL,
  customer_name  TEXT,
  customer_email TEXT,
  rating         INTEGER NOT NULL DEFAULT 5,
  title          TEXT,
  body           TEXT,
  status         TEXT NOT NULL DEFAULT 'published',      -- published|hidden
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_reviews_store   ON reviews(store_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_reviews_listing ON reviews(listing_id, status);

-- ---------------------------------------------------------------------------
-- Analytics — the single source of truth for every metric in the dashboard
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analytics_events (
  id          TEXT PRIMARY KEY,
  store_id    TEXT REFERENCES stores(id) ON DELETE CASCADE,
  listing_id  TEXT REFERENCES listings(id) ON DELETE CASCADE,
  event_type  TEXT NOT NULL,   -- store_view|listing_view|add_to_cart|checkout_start|purchase|search
  path        TEXT,
  referrer    TEXT,
  session_id  TEXT,
  user_id     TEXT,
  metadata    TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_analytics_store   ON analytics_events(store_id, event_type, created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_listing ON analytics_events(listing_id, event_type, created_at);

-- ---------------------------------------------------------------------------
-- Chat payment requests — a negotiated amount, agreed in a conversation
-- ---------------------------------------------------------------------------
-- The record of "we agreed on this price, pay it here". A seller sends one
-- into a thread — for a rental settled over chat, a custom food order, a
-- negotiated price on a product — and the buyer pays it from the payment card
-- in the same conversation. The agreed amount is written once and never
-- rewritten: the client cannot change it afterwards, and paying it never
-- changes the public price of the listing it relates to. The request is its
-- own state machine:
--
--   awaiting_payment — sent, nothing paid yet
--   processing       — a Paystack transaction has been initialized
--   paid             — verified server-side; exactly once
--   failed           — the last attempt was not successful; may be retried
--   expired          — its expiry passed before payment
--   cancelled        — the seller withdrew it before payment
--
-- `reference` is the Paystack transaction reference of the current attempt;
-- `order_id` is the order the payment settles into once the buyer commits to
-- paying (created at that moment, never before). Money truth is established
-- exactly as everywhere else: server-to-server verification, amount checked.
CREATE TABLE IF NOT EXISTS payment_requests (
  id                TEXT PRIMARY KEY,
  conversation_id   TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  store_id          TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  -- Who asked for the money, and who it was asked of. Both are read back from
  -- the database on every action — a client claim proves nothing.
  created_by        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- The product/listing this negotiated payment relates to, when there is one.
  -- Purely context: the listing's own price is never touched by this row.
  listing_id        TEXT REFERENCES listings(id) ON DELETE SET NULL,
  context_title     TEXT,
  context_image_url TEXT,
  -- What the card shows, frozen as it was agreed — never internal ids.
  seller_name       TEXT,
  original_amount   INTEGER,                              -- the listing's price, if any
  description       TEXT,
  amount            INTEGER NOT NULL,                     -- the agreed amount, minor units
  currency          TEXT NOT NULL DEFAULT 'NGN',
  status            TEXT NOT NULL DEFAULT 'awaiting_payment',
  reference         TEXT UNIQUE,                          -- Paystack reference, once initialized
  order_id          TEXT REFERENCES orders(id) ON DELETE SET NULL,
  expires_at        TEXT,
  paid_at           TEXT,
  cancelled_at      TEXT,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_payment_requests_conversation ON payment_requests(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_payment_requests_order        ON payment_requests(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_requests_recipient    ON payment_requests(recipient_user_id, status);

-- ---------------------------------------------------------------------------
-- Messages — one thread between a buyer and a store, optionally about a listing
--
-- A thread belongs to the store (the seller answers it) and to the buyer who
-- opened it. `listing_id` is what makes "ask about this service" concrete: the
-- thread starts from a listing and keeps that context for both sides.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conversations (
  id              TEXT PRIMARY KEY,
  store_id        TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  listing_id      TEXT REFERENCES listings(id) ON DELETE SET NULL,
  buyer_user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  buyer_name      TEXT,
  buyer_email     TEXT,
  subject         TEXT,
  last_message_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (store_id, buyer_user_id, listing_id)
);
CREATE INDEX IF NOT EXISTS idx_conversations_store ON conversations(store_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_buyer ON conversations(buyer_user_id, last_message_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body            TEXT NOT NULL,
  -- Rich media: a JSON array of {key, fileName, contentType, size}. The key is
  -- the storage key the sender uploaded — the server resolves the URL from it,
  -- so a client never supplies where media lives. Text-only messages leave it NULL.
  attachments     TEXT,
  -- A payment request card, when this message carries one: the message is the
  -- card's place in the conversation; the request is its immutable record.
  payment_request_id TEXT REFERENCES payment_requests(id) ON DELETE SET NULL,
  read_at         TEXT,
  -- The message's shared lifecycle: an edit keeps the message and stamps when
  -- the words changed; a delete-for-everyone keeps the row as a tombstone
  -- (content gone, timestamp kept) so both sides see the same quiet removal.
  edited_at               TEXT,
  deleted_for_everyone_at TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_unread       ON messages(conversation_id, read_at);
CREATE INDEX IF NOT EXISTS idx_messages_payment_request ON messages(payment_request_id);

-- One message in one person's view: "delete for me". The shared message row
-- and the other participant's copy are untouched — this is purely a viewer's
-- own visibility state, keyed by (message, user).
CREATE TABLE IF NOT EXISTS message_user_states (
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deleted_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (message_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_message_user_states_user ON message_user_states(user_id, message_id);

-- One conversation in one person's chat list: "delete my chat" and "clear my
-- chat" live here. Deleting is a state on my view of the thread (it surfaces
-- again if new activity arrives); clearing hides the history up to a point in
-- time. Neither ever touches the conversation itself or the other side's copy.
CREATE TABLE IF NOT EXISTS conversation_user_states (
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deleted_at      TEXT,
  cleared_at      TEXT,
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_conversation_user_states_user ON conversation_user_states(user_id, conversation_id);

-- ---------------------------------------------------------------------------
-- Email deliveries — every invoice and ticket email the platform attempted
--
-- Money and fulfilment are the source of truth, not the mail. So a send is
-- recorded as its own row with its own outcome: a seller can see that an
-- invoice went (or did not) and resend it, and a failure is never silent.
-- Rows are kept even when a send fails, and `provider_id` is the id Resend
-- returns for a delivered message.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS email_deliveries (
  id          TEXT PRIMARY KEY,
  order_id    TEXT REFERENCES orders(id) ON DELETE CASCADE,
  store_id    TEXT REFERENCES stores(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,   -- invoice | tickets | update | auth | welcome | password-reset |
                               -- password-changed | payment-request | payment-received |
                               -- payment-failed | payment-cancelled | seller-order | refund |
                               -- order-completed | order-cancelled | payout | event-update | message | test
  recipient   TEXT NOT NULL,
  subject     TEXT,
  status      TEXT NOT NULL,   -- sent | failed | skipped
  error       TEXT,
  provider_id TEXT,
  -- Idempotency: an event that must reach its recipient exactly once carries a
  -- key naming that event. A repeated trigger (a webhook and a callback racing,
  -- a retried action) sees the key and sends nothing. Keys live only on
  -- "sent" rows, so a failed send can always be retried.
  dedupe_key  TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_email_order ON email_deliveries(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_store ON email_deliveries(store_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_dedupe
  ON email_deliveries(dedupe_key) WHERE dedupe_key IS NOT NULL AND status = 'sent';
