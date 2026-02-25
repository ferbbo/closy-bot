-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "handoff_active" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "message_logs" ADD COLUMN     "source" TEXT;
