-- AlterTable
ALTER TABLE "channels" ADD COLUMN     "error_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "last_error_at" TIMESTAMP(3);
