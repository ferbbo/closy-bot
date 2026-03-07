-- Enable pg_trgm extension for trigram similarity search
-- Used as fallback when FTS doesn't find exact matches
-- Supports fuzzy matching: "busco jeans por favor" will match "jeans"

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create GIN index for trigram search on products.search_text
-- This speeds up similarity queries significantly
CREATE INDEX IF NOT EXISTS idx_products_search_text_trgm 
ON products USING GIN (search_text gin_trgm_ops);
