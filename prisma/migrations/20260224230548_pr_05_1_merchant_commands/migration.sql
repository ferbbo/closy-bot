-- CreateEnum
CREATE TYPE "ConversationType" AS ENUM ('CUSTOMER', 'MERCHANT_ADMIN');

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "type" "ConversationType" NOT NULL DEFAULT 'CUSTOMER';

-- AlterTable
ALTER TABLE "merchants" ADD COLUMN     "bot_paused" BOOLEAN NOT NULL DEFAULT false;
