-- CreateEnum
CREATE TYPE "MarketplaceReportStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'DISMISSED');

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "avatarKey" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "contactEmail" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "position" TEXT;

-- AlterTable
ALTER TABLE "invitations" ADD COLUMN     "declineNote" TEXT,
ADD COLUMN     "declineReason" TEXT;

-- AlterTable
ALTER TABLE "ushers" ADD COLUMN     "physicalAttributes" JSONB;

-- CreateTable
CREATE TABLE "marketplace_reports" (
    "id" UUID NOT NULL,
    "reporterId" UUID NOT NULL,
    "eventId" UUID,
    "usherId" UUID,
    "reason" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "status" "MarketplaceReportStatus" NOT NULL DEFAULT 'OPEN',
    "reviewNote" TEXT,
    "reviewedById" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMPTZ(6),

    CONSTRAINT "marketplace_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "presentation_policies" (
    "category" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "presentation_policies_pkey" PRIMARY KEY ("category")
);

-- CreateIndex
CREATE INDEX "marketplace_reports_status_createdAt_id_idx" ON "marketplace_reports"("status", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "marketplace_reports_reporterId_eventId_key" ON "marketplace_reports"("reporterId", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "marketplace_reports_reporterId_usherId_key" ON "marketplace_reports"("reporterId", "usherId");

-- AddForeignKey
ALTER TABLE "marketplace_reports" ADD CONSTRAINT "marketplace_reports_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_reports" ADD CONSTRAINT "marketplace_reports_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_reports" ADD CONSTRAINT "marketplace_reports_usherId_fkey" FOREIGN KEY ("usherId") REFERENCES "ushers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_reports" ADD CONSTRAINT "marketplace_reports_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A report always targets exactly one job or worker.
ALTER TABLE "marketplace_reports" ADD CONSTRAINT "marketplace_report_target_check" CHECK (("eventId" IS NOT NULL)::int + ("usherId" IS NOT NULL)::int = 1);
