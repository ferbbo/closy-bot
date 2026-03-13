-- PR-03.5.2.1: Add weighted tsvector column for FTS ranking (name > description)
-- AC-01: Add search_text_weighted column & trigger
-- AC-02: GIN index on search_text_weighted

-- Step 1: Add tsvector column (nullable; trigger keeps it updated)
ALTER TABLE "products" ADD COLUMN "search_text_weighted" tsvector;

-- Step 2: Create trigger function with weights A=name, B=brand, C=tags, D=description
CREATE OR REPLACE FUNCTION products_set_search_text_weighted()
RETURNS trigger AS $$
BEGIN
  NEW.search_text_weighted :=
    setweight(to_tsvector('simple', COALESCE(NEW.name, '')), 'A') ||
    setweight(to_tsvector('simple', COALESCE(NEW.brand, '')), 'B') ||
    setweight(to_tsvector('simple', array_to_string(COALESCE(NEW.tags, '{}'), ' ')), 'C') ||
    setweight(to_tsvector('simple', COALESCE(NEW.description, '')), 'D');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 3: Create trigger on INSERT and UPDATE
CREATE TRIGGER products_search_text_weighted_update
BEFORE INSERT OR UPDATE ON "products"
FOR EACH ROW EXECUTE FUNCTION products_set_search_text_weighted();

-- Step 4: Populate existing rows using the same logic
UPDATE "products"
SET "search_text_weighted" =
  setweight(to_tsvector('simple', COALESCE(name, '')), 'A') ||
  setweight(to_tsvector('simple', COALESCE(brand, '')), 'B') ||
  setweight(to_tsvector('simple', array_to_string(COALESCE(tags, '{}'), ' ')), 'C') ||
  setweight(to_tsvector('simple', COALESCE(description, '')), 'D');

-- Step 5: GIN index on search_text_weighted for performance (AC-02)
CREATE INDEX "idx_product_search_text_weighted" ON "products" USING GIN ("search_text_weighted");
