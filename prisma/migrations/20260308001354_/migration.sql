-- Migration applied to database (drift recovery placeholder)
-- Dropped index on products.search_text (removed in DB but not tracked locally)
DROP INDEX IF EXISTS "products_search_text_idx";
