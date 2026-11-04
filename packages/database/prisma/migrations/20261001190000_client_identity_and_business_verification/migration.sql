-- CreateEnum
CREATE TYPE "ClientAccountType" AS ENUM ('INDIVIDUAL', 'BUSINESS');

-- CreateEnum
CREATE TYPE "BusinessVerifyState" AS ENUM ('NOT_STARTED', 'PENDING', 'VERIFIED', 'REJECTED');

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "accountType" "ClientAccountType",
ADD COLUMN     "businessVerificationStatus" "BusinessVerifyState" NOT NULL DEFAULT 'NOT_STARTED',
ADD COLUMN     "businessVerifiedAt" TIMESTAMPTZ(6),
ADD COLUMN     "kycAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "verificationStatus" "UsherVerifyState" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "verifiedAt" TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "usher_verifications" ADD COLUMN     "clientId" UUID,
ALTER COLUMN "usherId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "business_verifications" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "registeredName" TEXT NOT NULL,
    "registrationNumber" TEXT NOT NULL,
    "businessType" TEXT NOT NULL,
    "representativeRole" TEXT NOT NULL,
    "authorizationKey" TEXT,
    "status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "registryStatus" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "registryName" TEXT,
    "providerJobId" TEXT,
    "environment" TEXT NOT NULL,
    "reviewedById" UUID,
    "reviewNote" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMPTZ(6),

    CONSTRAINT "business_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "business_verifications_clientId_createdAt_idx" ON "business_verifications"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "usher_verifications_clientId_idx" ON "usher_verifications"("clientId");

-- AddForeignKey
ALTER TABLE "business_verifications" ADD CONSTRAINT "business_verifications_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_verifications" ADD CONSTRAINT "business_verifications_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usher_verifications" ADD CONSTRAINT "usher_verifications_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve all existing usher decisions; each attempt belongs to one account.
ALTER TABLE "usher_verifications" ADD CONSTRAINT "identity_verification_one_subject"
CHECK (("usherId" IS NOT NULL)::int + ("clientId" IS NOT NULL)::int = 1);
