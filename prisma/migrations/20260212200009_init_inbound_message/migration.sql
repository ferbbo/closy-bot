-- CreateTable
CREATE TABLE "health_checks" (
    "id" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "health_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inbound_messages" (
    "id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "from" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "text" TEXT,
    "media_type" TEXT,
    "media_url" TEXT,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inbound_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inbound_messages_message_id_key" ON "inbound_messages"("message_id");

-- CreateIndex
CREATE INDEX "inbound_messages_from_idx" ON "inbound_messages"("from");

-- CreateIndex
CREATE INDEX "inbound_messages_timestamp_idx" ON "inbound_messages"("timestamp");
