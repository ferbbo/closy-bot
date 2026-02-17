-- CreateEnum (PR-11: Playbook industry)
CREATE TYPE "Industry" AS ENUM ('ropa', 'belleza', 'minimarket');

-- AlterTable (PR-11: Add industry and playbook_config to merchants)
ALTER TABLE "merchants" ADD COLUMN "industry" "Industry",
ADD COLUMN "playbook_config" JSONB;
