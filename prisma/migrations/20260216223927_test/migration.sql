-- CreateEnum
CREATE TYPE "Industry" AS ENUM ('ropa', 'belleza', 'minimarket');

-- AlterTable
ALTER TABLE "merchants" ADD COLUMN     "industry" "Industry",
ADD COLUMN     "playbook_config" JSONB;
