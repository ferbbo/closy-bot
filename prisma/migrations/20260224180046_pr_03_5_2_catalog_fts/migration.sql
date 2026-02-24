-- PR-03.5.2: Add FTS fields to products
-- AlterTable
ALTER TABLE "products" ADD COLUMN     "brand" TEXT,
ADD COLUMN     "image_urls" TEXT[],
ADD COLUMN     "search_text" TEXT,
ADD COLUMN     "tags" TEXT[];

-- Generate initial search_text for existing products
UPDATE "products" 
SET "search_text" = 
  "name" || ' ' || 
  COALESCE("brand", '') || ' ' || 
  COALESCE("description", '') || ' ' || 
  array_to_string(COALESCE("tags", '{}'), ' ')
WHERE "search_text" IS NULL;

-- Create GIN index for full-text search with 'simple' config (Spanglish support)
CREATE INDEX "idx_product_search_fts" ON "products" USING GIN (to_tsvector('simple', COALESCE("search_text", '')));

