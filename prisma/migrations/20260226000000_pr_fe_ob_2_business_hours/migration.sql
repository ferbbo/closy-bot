-- PR-FE-OB-2: Add businessHours to merchant_configs (AC-07)
-- AlterTable
ALTER TABLE "merchant_configs" ADD COLUMN "business_hours" VARCHAR(200);
