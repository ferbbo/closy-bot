-- PR-OB-01: Add MerchantStatus enum and status field to Merchant

-- CreateEnum
CREATE TYPE "MerchantStatus" AS ENUM ('onboarding', 'active', 'paused');

-- AlterTable: add status column with default 'onboarding'
ALTER TABLE "merchants" ADD COLUMN "status" "MerchantStatus" NOT NULL DEFAULT 'onboarding';
