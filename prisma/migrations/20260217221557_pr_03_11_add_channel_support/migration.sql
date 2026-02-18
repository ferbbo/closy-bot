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

-- P1-1 Fix: Ensure pgcrypto extension for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
DECLARE
    merchant_record RECORD;
    phone_number_id TEXT := COALESCE(current_setting('app.whatsapp_phone_number_id', TRUE), 'PLACEHOLDER_PHONE_NUMBER_ID');
    access_token TEXT := COALESCE(current_setting('app.whatsapp_access_token', TRUE), 'PLACEHOLDER_ACCESS_TOKEN');
    app_secret TEXT := COALESCE(current_setting('app.whatsapp_app_secret', TRUE), '');
    business_account_id TEXT := COALESCE(current_setting('app.whatsapp_business_account_id', TRUE), 'PLACEHOLDER_BA_ID');
    merchant_external_id TEXT;
BEGIN
    -- Log migration start
    RAISE NOTICE 'Creating default WhatsApp channels for existing merchants...';
    
    -- Create a default WhatsApp channel for each existing merchant
    -- P1-2, P1-4 Fix: Use unique external_id per merchant + complete credentials with phoneNumberId
    FOR merchant_record IN SELECT id, name FROM merchants LOOP
        -- Each merchant gets unique external_id to avoid CONFLICT
        -- Format: 'legacy-{merchant_id}' or use env var if only one merchant
        IF (SELECT COUNT(*) FROM merchants) = 1 THEN
            merchant_external_id := phone_number_id;
        ELSE
            merchant_external_id := 'legacy-' || merchant_record.id;
        END IF;
        
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
            merchant_external_id,
            'WhatsApp Principal (Migrated)',
            jsonb_build_object(
                'businessAccountId', business_account_id,
                'phoneNumberId', merchant_external_id,
                'accessToken', access_token,
                'appSecret', app_secret
            ),
            true,
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
        )
        ON CONFLICT (type, external_id) DO NOTHING; -- Skip if already exists
        
        RAISE NOTICE 'Created WhatsApp channel for merchant: % (%) with external_id: %', merchant_record.name, merchant_record.id, merchant_external_id;
    END LOOP;
    
    RAISE NOTICE 'Data migration completed. Total channels created: %', (SELECT COUNT(*) FROM channels);
    
    -- Warning if using placeholders
    IF phone_number_id = 'PLACEHOLDER_PHONE_NUMBER_ID' THEN
        RAISE WARNING 'Channels created with PLACEHOLDER credentials. Update external_id and credentials via seed script or admin API with real Meta WhatsApp phone_number_id values.';
    END IF;
END $$;
