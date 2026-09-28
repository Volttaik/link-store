-- ============================================================================
-- LINK STORE — platform reference data: the category tree.
--
-- These are the platform-wide browse categories. They are *not* fake
-- marketplace content: they contain no products, no stores, and no metrics.
-- `store_id IS NULL` marks a category as platform-owned; sellers may add their
-- own categories alongside them.
--
-- **The tree has two ideas in it, and they are not the same idea.**
--
--   1. A **main category** is a marketplace module: Products, Food, Services,
--      Events, Rentals, Digital. It has no parent, and its `kind` is the module
--      it belongs to. This is what makes the interface context-aware — a Food
--      page is handed the food tree and can never be offered a car part.
--   2. A **subcategory** is part of that module's own vocabulary, however deep
--      it needs to go: Products → Fashion & Apparel → Clothing → Men's Clothing.
--
-- So `kind` is inherited down the tree rather than repeated: every descendant of
-- Products is kind `product`, whatever its name.
--
-- `icon` holds an icon *name* from the application icon registry
-- (components/ui/Icon.tsx) — never an emoji. Unknown names fall back to the
-- icon for the category slug, so this column can never render blank.
--
-- Deterministic ids keep this idempotent (INSERT OR IGNORE). The UPDATE
-- statements at the end re-parent rows seeded by earlier passes, which is what
-- turns an existing flat catalogue into this tree without deleting anything.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Main categories — the marketplace modules.
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO categories (id, store_id, parent_id, name, slug, kind, icon, position) VALUES
  ('cat_main_products', NULL, NULL, 'Products', 'products', 'product', 'products', 1),
  ('cat_main_food',     NULL, NULL, 'Food',     'food',     'food',    'food',     2),
  ('cat_main_services', NULL, NULL, 'Services', 'services', 'service', 'services', 3),
  ('cat_main_events',   NULL, NULL, 'Events',   'events',   'event',   'events',   4),
  ('cat_main_rentals',  NULL, NULL, 'Rentals',  'rentals',  'rental',  'key',      5),
  ('cat_main_digital',  NULL, NULL, 'Digital',  'digital',  'digital', 'digital',  6),
  ('cat_platform_other', NULL, NULL, 'Other',   'other',    'general', 'tag',      7);

-- ---------------------------------------------------------------------------
-- Products — the deep tree, because products cover the most ground.
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO categories (id, store_id, parent_id, name, slug, kind, icon, position) VALUES
  ('cat_platform_fashion',     NULL, 'cat_main_products', 'Fashion & Apparel',      'fashion',            'product', 'fashion',     1),
  ('cat_platform_clothing',    NULL, 'cat_main_products', 'Clothing',               'clothing',           'product', 'fashion',     2),
  ('cat_platform_menswear',    NULL, 'cat_main_products', 'Men''s Clothing',        'mens-clothing',      'product', 'fashion',     3),
  ('cat_platform_womenswear',  NULL, 'cat_main_products', 'Women''s Clothing',      'womens-clothing',    'product', 'fashion',     4),
  ('cat_platform_shoes',       NULL, 'cat_main_products', 'Shoes & Bags',           'shoes-bags',         'product', 'fashion',     5),
  ('cat_platform_accessories', NULL, 'cat_main_products', 'Accessories',            'accessories',        'product', 'tag',         6),
  ('cat_platform_beauty',      NULL, 'cat_main_products', 'Beauty & Personal Care', 'beauty',             'product', 'beauty',      7),
  ('cat_platform_home',        NULL, 'cat_main_products', 'Home & Furniture',       'home-furniture',     'product', 'furniture',   8),
  ('cat_platform_appliances',  NULL, 'cat_main_products', 'Home Appliances',        'appliances',         'product', 'home',        9),
  ('cat_platform_electronics', NULL, 'cat_main_products', 'Electronics',            'electronics',        'product', 'electronics', 10),
  ('cat_platform_phones',      NULL, 'cat_main_products', 'Phones & Tablets',       'phones-tablets',     'product', 'electronics', 11),
  ('cat_platform_computing',   NULL, 'cat_main_products', 'Computing',              'computing',          'product', 'electronics', 12),
  ('cat_platform_vehicles',    NULL, 'cat_main_products', 'Vehicles',               'vehicles',           'product', 'vehicles',    13),
  ('cat_platform_parts',       NULL, 'cat_main_products', 'Vehicle Parts',          'vehicle-parts',      'product', 'vehicles',    14);

-- ---------------------------------------------------------------------------
-- Food
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO categories (id, store_id, parent_id, name, slug, kind, icon, position) VALUES
  ('cat_platform_restaurant', NULL, 'cat_main_food', 'Restaurant & Meals', 'restaurant', 'food', 'food', 1),
  ('cat_platform_groceries',  NULL, 'cat_main_food', 'Groceries',          'groceries',  'food', 'food', 2),
  ('cat_platform_drinks',     NULL, 'cat_main_food', 'Drinks & Beverages', 'drinks',     'food', 'food', 3),
  ('cat_platform_bakery',     NULL, 'cat_main_food', 'Bakery & Snacks',    'bakery',     'food', 'food', 4);

-- ---------------------------------------------------------------------------
-- Services
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO categories (id, store_id, parent_id, name, slug, kind, icon, position) VALUES
  ('cat_platform_proservices', NULL, 'cat_main_services', 'Professional Services', 'professional-services', 'service', 'services', 1),
  ('cat_platform_repairs',     NULL, 'cat_main_services', 'Repairs & Maintenance', 'repairs',               'service', 'services', 2),
  ('cat_platform_education',   NULL, 'cat_main_services', 'Education & Tutoring',  'education',             'service', 'services', 3),
  ('cat_platform_wellness',    NULL, 'cat_main_services', 'Beauty & Wellness',     'wellness',              'service', 'beauty',   4);

-- ---------------------------------------------------------------------------
-- Events
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO categories (id, store_id, parent_id, name, slug, kind, icon, position) VALUES
  ('cat_platform_events',   NULL, 'cat_main_events', 'Concerts & Shows',    'events-tickets', 'event', 'events', 1),
  ('cat_platform_workshops', NULL, 'cat_main_events', 'Workshops & Classes', 'workshops',      'event', 'events', 2),
  ('cat_platform_conferences', NULL, 'cat_main_events', 'Conferences',       'conferences',    'event', 'events', 3);

-- ---------------------------------------------------------------------------
-- Rentals — let by the day, the week or the month.
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO categories (id, store_id, parent_id, name, slug, kind, icon, position) VALUES
  ('cat_platform_apartments', NULL, 'cat_main_rentals', 'Apartments & Flats', 'apartments', 'rental', 'key', 1),
  ('cat_platform_houses',     NULL, 'cat_main_rentals', 'Houses',             'houses',     'rental', 'home', 2),
  ('cat_platform_rooms',      NULL, 'cat_main_rentals', 'Rooms',              'rooms',      'rental', 'key',  3),
  ('cat_platform_commercial', NULL, 'cat_main_rentals', 'Shops & Offices',    'commercial', 'rental', 'shop', 4),
  ('cat_platform_equipment',  NULL, 'cat_main_rentals', 'Equipment & Vehicles', 'equipment', 'rental', 'vehicles', 5);

-- ---------------------------------------------------------------------------
-- Digital
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO categories (id, store_id, parent_id, name, slug, kind, icon, position) VALUES
  ('cat_platform_templates', NULL, 'cat_main_digital', 'Templates & Design', 'templates-design', 'digital', 'digital', 1),
  ('cat_platform_ebooks',    NULL, 'cat_main_digital', 'E-books & Courses',  'ebooks-courses',   'digital', 'digital', 2),
  ('cat_platform_software',  NULL, 'cat_main_digital', 'Software & Files',   'software-files',   'digital', 'digital', 3);

-- ---------------------------------------------------------------------------
-- The tree is finished by re-parenting, not by inserting again.
--
-- `INSERT OR IGNORE` deliberately leaves an existing row alone, so a category
-- seeded by an earlier pass keeps its id, its name and its `kind` — and gets the
-- parent it was always missing. This is the statement that turns the flat
-- catalogue of round 1 and 2 into the tree above, with nothing deleted.
-- ---------------------------------------------------------------------------
UPDATE categories SET parent_id = 'cat_main_products'
  WHERE store_id IS NULL AND kind = 'product' AND parent_id IS NULL
    AND id <> 'cat_main_products';
UPDATE categories SET parent_id = 'cat_main_food'
  WHERE store_id IS NULL AND kind = 'food' AND parent_id IS NULL
    AND id <> 'cat_main_food';
UPDATE categories SET parent_id = 'cat_main_services'
  WHERE store_id IS NULL AND kind = 'service' AND parent_id IS NULL
    AND id <> 'cat_main_services';
UPDATE categories SET parent_id = 'cat_main_events'
  WHERE store_id IS NULL AND kind = 'event' AND parent_id IS NULL
    AND id <> 'cat_main_events';
UPDATE categories SET parent_id = 'cat_main_digital'
  WHERE store_id IS NULL AND kind = 'digital' AND parent_id IS NULL
    AND id <> 'cat_main_digital';
UPDATE categories SET parent_id = 'cat_main_rentals'
  WHERE store_id IS NULL AND kind = 'rental' AND parent_id IS NULL
    AND id <> 'cat_main_rentals';

-- A third level under two product branches, so the tree can express
-- Products → Fashion & Apparel → Clothing → Men's Clothing (§10 of the spec).
UPDATE categories SET parent_id = 'cat_platform_fashion'
  WHERE store_id IS NULL AND slug IN ('clothing', 'mens-clothing', 'womens-clothing')
    AND id <> 'cat_platform_fashion';
UPDATE categories SET parent_id = 'cat_platform_electronics'
  WHERE store_id IS NULL AND slug IN ('phones-tablets', 'computing');
