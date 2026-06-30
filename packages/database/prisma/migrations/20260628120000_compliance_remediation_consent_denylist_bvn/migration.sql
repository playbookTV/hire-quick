-- CreateEnum
CREATE TYPE "ConsentPurpose" AS ENUM ('PUSH_NOTIFICATIONS', 'MARKETING_EMAIL', 'SMS');

-- CreateEnum
CREATE TYPE "ConsentSource" AS ENUM ('EXPLICIT', 'LEGITIMATE_INTEREST');

-- AlterTable
ALTER TABLE "bank_accounts" ADD COLUMN     "bvnVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "bvnVerifiedAt" TIMESTAMPTZ(6);

-- CreateTable
CREATE TABLE "revoked_tokens" (
    "jti" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "revoked_tokens_pkey" PRIMARY KEY ("jti")
);

-- CreateTable
CREATE TABLE "consent_records" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "purpose" "ConsentPurpose" NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "source" "ConsentSource" NOT NULL DEFAULT 'EXPLICIT',
    "grantedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawnAt" TIMESTAMPTZ(6),
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "consent_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policy_acceptances" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "documentKey" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "acceptedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policy_acceptances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "revoked_tokens_userId_idx" ON "revoked_tokens"("userId");

-- CreateIndex
CREATE INDEX "revoked_tokens_expiresAt_idx" ON "revoked_tokens"("expiresAt");

-- CreateIndex
CREATE INDEX "consent_records_userId_idx" ON "consent_records"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "consent_records_userId_purpose_key" ON "consent_records"("userId", "purpose");

-- CreateIndex
CREATE INDEX "policy_acceptances_userId_idx" ON "policy_acceptances"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "policy_acceptances_userId_documentKey_version_key" ON "policy_acceptances"("userId", "documentKey", "version");

-- AddForeignKey
ALTER TABLE "revoked_tokens" ADD CONSTRAINT "revoked_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_acceptances" ADD CONSTRAINT "policy_acceptances_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

