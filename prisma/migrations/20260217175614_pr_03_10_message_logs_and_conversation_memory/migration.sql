-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('IN', 'OUT');

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "last_intent" TEXT,
ADD COLUMN     "last_summarized_at" TIMESTAMP(3),
ADD COLUMN     "memory_facts" JSONB,
ADD COLUMN     "summary" TEXT;

-- CreateTable
CREATE TABLE "message_logs" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "provider_message_id" TEXT,
    "text" TEXT,
    "media_type" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "message_logs_conversation_id_created_at_idx" ON "message_logs"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "message_logs_expires_at_idx" ON "message_logs"("expires_at");

-- CreateIndex
CREATE INDEX "message_logs_merchant_id_idx" ON "message_logs"("merchant_id");

-- AddForeignKey
ALTER TABLE "message_logs" ADD CONSTRAINT "message_logs_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
