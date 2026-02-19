-- CreateEnum
CREATE TYPE "ChannelStatus" AS ENUM ('pending', 'connected', 'error');

-- AlterTable
ALTER TABLE "channels" ADD COLUMN     "last_webhook_at" TIMESTAMP(3),
ADD COLUMN     "status" "ChannelStatus" NOT NULL DEFAULT 'pending',
ADD COLUMN     "status_reason" TEXT,
ADD COLUMN     "waba_id" TEXT,
ADD COLUMN     "webhook_subscribed" BOOLEAN NOT NULL DEFAULT false;
