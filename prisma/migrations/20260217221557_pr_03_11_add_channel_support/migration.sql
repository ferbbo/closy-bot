-- CreateEnum
CREATE TYPE "ChannelType" AS ENUM ('WHATSAPP', 'INSTAGRAM');

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "channel_id" TEXT;

-- AlterTable
ALTER TABLE "outbox_messages" ADD COLUMN     "channel_id" TEXT;

-- CreateTable
CREATE TABLE "channels" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "type" "ChannelType" NOT NULL,
    "external_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "credentials" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channels_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "channels_merchant_id_idx" ON "channels"("merchant_id");

-- CreateIndex
CREATE INDEX "channels_type_external_id_idx" ON "channels"("type", "external_id");

-- CreateIndex
CREATE INDEX "channels_is_active_idx" ON "channels"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "channels_type_external_id_key" ON "channels"("type", "external_id");

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbox_messages" ADD CONSTRAINT "outbox_messages_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channels" ADD CONSTRAINT "channels_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================================
-- Data Migration: Create default WHATSAPP channel for existing merchants
-- ============================================================================
-- Note: This uses placeholder values. After migration, admin must update channels
-- with real credentials via seed script or admin API.
-- In production, use environment-specific values or post-migration script.

DO $$
DECLARE
    merchant_record RECORD;
    phone_number_id TEXT := COALESCE(current_setting('app.whatsapp_phone_number_id', TRUE), 'PLACEHOLDER_PHONE_NUMBER_ID');
    access_token TEXT := COALESCE(current_setting('app.whatsapp_access_token', TRUE), 'PLACEHOLDER_ACCESS_TOKEN');
    app_secret TEXT := COALESCE(current_setting('app.whatsapp_app_secret', TRUE), '');
BEGIN
    -- Log migration start
    RAISE NOTICE 'Creating default WhatsApp channels for existing merchants...';
    
    -- Create a default WhatsApp channel for each existing merchant
    FOR merchant_record IN SELECT id, name FROM merchants LOOP
        INSERT INTO channels (
            id,
            merchant_id,
            type,
            external_id,
            display_name,
            credentials,
            is_active,
            created_at,
            updated_at
        ) VALUES (
            gen_random_uuid()::TEXT,
            merchant_record.id,
            'WHATSAPP',
            phone_number_id,
            'WhatsApp Principal',
            jsonb_build_object(
                'accessToken', access_token,
                'appSecret', app_secret
            ),
            true,
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
        )
        ON CONFLICT (type, external_id) DO NOTHING; -- Skip if already exists
        
        RAISE NOTICE 'Created WhatsApp channel for merchant: % (%)', merchant_record.name, merchant_record.id;
    END LOOP;
    
    RAISE NOTICE 'Data migration completed. Total channels created: %', (SELECT COUNT(*) FROM channels);
    
    -- Warning if using placeholders
    IF phone_number_id = 'PLACEHOLDER_PHONE_NUMBER_ID' THEN
        RAISE WARNING 'Channels created with PLACEHOLDER credentials. Update them via seed script or admin API.';
    END IF;
END $$;
