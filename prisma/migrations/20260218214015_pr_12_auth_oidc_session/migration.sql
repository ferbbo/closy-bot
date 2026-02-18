-- CreateEnum
CREATE TYPE "OidcProvider" AS ENUM ('GOOGLE', 'MICROSOFT');

-- CreateTable
CREATE TABLE "merchant_identities" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "provider" "OidcProvider" NOT NULL,
    "oidc_subject" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "merchant_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "user_agent" TEXT,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "merchant_identities_merchant_id_idx" ON "merchant_identities"("merchant_id");

-- CreateIndex
CREATE INDEX "merchant_identities_email_idx" ON "merchant_identities"("email");

-- CreateIndex
CREATE UNIQUE INDEX "merchant_identities_provider_oidc_subject_key" ON "merchant_identities"("provider", "oidc_subject");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_session_id_key" ON "sessions"("session_id");

-- CreateIndex
CREATE INDEX "sessions_session_id_idx" ON "sessions"("session_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE INDEX "sessions_merchant_id_idx" ON "sessions"("merchant_id");

-- AddForeignKey
ALTER TABLE "merchant_identities" ADD CONSTRAINT "merchant_identities_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
