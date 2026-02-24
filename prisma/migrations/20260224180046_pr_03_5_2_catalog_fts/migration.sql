-- PR-03.5.2: Add FTS fields to products
-- AlterTable
ALTER TABLE "products" ADD COLUMN     "brand" TEXT,
ADD COLUMN     "image_urls" TEXT[] DEFAULT '{}',
ADD COLUMN     "search_text" TEXT,
ADD COLUMN     "tags" TEXT[] DEFAULT '{}';

-- Generate initial search_text for existing products (includes variants.name)
UPDATE "products" p
SET "search_text" = 
  p."name" || ' ' || 
  COALESCE(p."brand", '') || ' ' || 
  COALESCE(p."description", '') || ' ' || 
  array_to_string(COALESCE(p."tags", '{}'), ' ') || ' ' ||
  COALESCE(
    (SELECT string_agg(pv."name", ' ') 
     FROM "product_variants" pv 
     WHERE pv."product_id" = p."id"), 
    ''
  )
WHERE p."search_text" IS NULL;

-- Create GIN index for full-text search with 'simple' config (Spanglish support)
CREATE INDEX "idx_product_search_fts" ON "products" USING GIN (to_tsvector('simple', COALESCE("search_text", '')));

