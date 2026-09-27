-- CreateEnum
CREATE TYPE "VerificationMethod" AS ENUM ('DOCUMENT', 'BIOMETRIC');

-- CreateEnum
CREATE TYPE "VerificationRejectReason" AS ENUM ('UNCLEAR_ID', 'SELFIE_MISMATCH', 'LIVENESS_FAILED', 'ID_NOT_FOUND', 'NAME_MISMATCH', 'WATCHLISTED', 'EXPIRED_DOCUMENT', 'POOR_IMAGE', 'OTHER');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'APPLICATION_RECEIVED';

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "state" TEXT;

-- AlterTable
ALTER TABLE "ushers" ADD COLUMN     "state" TEXT,
ADD COLUMN     "verifiedAt" TIMESTAMPTZ(6),
ADD COLUMN     "kycAttempts" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "usher_verifications" ALTER COLUMN "idDocumentUrl" DROP NOT NULL,
ALTER COLUMN "selfieUrl" DROP NOT NULL,
ADD COLUMN     "method" "VerificationMethod" NOT NULL DEFAULT 'DOCUMENT',
ADD COLUMN     "reasonCode" "VerificationRejectReason",
ADD COLUMN     "provider" TEXT,
ADD COLUMN     "dojahReferenceId" TEXT,
ADD COLUMN     "nin" TEXT,
ADD COLUMN     "bvn" TEXT,
ADD COLUMN     "livenessPassed" BOOLEAN,
ADD COLUMN     "faceMatchScore" DOUBLE PRECISION,
ADD COLUMN     "watchListed" BOOLEAN,
ADD COLUMN     "govPhotoKey" TEXT,
ADD COLUMN     "govLookup" JSONB;

-- CreateIndex
CREATE INDEX "events_state_idx" ON "events"("state");

-- CreateIndex
CREATE INDEX "usher_verifications_dojahReferenceId_idx" ON "usher_verifications"("dojahReferenceId");
