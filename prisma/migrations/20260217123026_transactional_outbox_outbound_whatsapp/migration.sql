-- CreateEnum
CREATE TYPE "OutboxChannel" AS ENUM ('WHATSAPP');

-- CreateEnum
CREATE TYPE "OutboxMessageType" AS ENUM ('SEND_TEXT');

-- CreateEnum
CREATE TYPE "OutboxMessageStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "outbox_messages" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "channel" "OutboxChannel" NOT NULL,
    "type" "OutboxMessageType" NOT NULL,
    "to" TEXT NOT NULL,
    "payload_json" JSONB NOT NULL,
    "dedupe_key" TEXT,
    "status" "OutboxMessageStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_retry_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_at" TIMESTAMP(3),
    "locked_by" TEXT,
    "last_error" TEXT,
    "provider_message_id" TEXT,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outbox_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "outbox_messages_merchant_id_idx" ON "outbox_messages"("merchant_id");

-- CreateIndex
CREATE INDEX "outbox_messages_status_next_retry_at_idx" ON "outbox_messages"("status", "next_retry_at");

-- CreateIndex
CREATE UNIQUE INDEX "outbox_messages_merchant_id_dedupe_key_key" ON "outbox_messages"("merchant_id", "dedupe_key");

-- AddForeignKey
ALTER TABLE "outbox_messages" ADD CONSTRAINT "outbox_messages_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
