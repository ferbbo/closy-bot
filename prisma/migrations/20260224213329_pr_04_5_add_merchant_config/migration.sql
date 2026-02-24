-- AlterTable
ALTER TABLE "products" ALTER COLUMN "image_urls" DROP DEFAULT,
ALTER COLUMN "tags" DROP DEFAULT;

-- CreateTable
CREATE TABLE "merchant_configs" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "payment_methods" JSONB NOT NULL,
    "shipping_config" JSONB NOT NULL,
    "return_policy" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'COP',
    "order_code_prefix" TEXT NOT NULL DEFAULT 'ORD',
    "auto_confirm_cod" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "merchant_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "merchant_configs_merchant_id_key" ON "merchant_configs"("merchant_id");

-- AddForeignKey
ALTER TABLE "merchant_configs" ADD CONSTRAINT "merchant_configs_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
