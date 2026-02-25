-- CreateEnum
CREATE TYPE "HandoffStatus" AS ENUM ('pending', 'active', 'resolved');

-- CreateTable
CREATE TABLE "handoffs" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "summary_json" JSONB NOT NULL,
    "status" "HandoffStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "handoffs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "handoffs_conversation_id_status_idx" ON "handoffs"("conversation_id", "status");

-- AddForeignKey
ALTER TABLE "handoffs" ADD CONSTRAINT "handoffs_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
