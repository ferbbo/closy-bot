-- PR-18: Add imageKey and imageUrl fields to Product for R2 storage
-- imageUrls[] is kept for backwards compatibility (deprecated)

ALTER TABLE "products" ADD COLUMN "image_key" TEXT;
ALTER TABLE "products" ADD COLUMN "image_url" TEXT;
