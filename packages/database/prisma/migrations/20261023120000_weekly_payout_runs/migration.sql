-- CreateEnum
CREATE TYPE "PayoutRunStatus" AS ENUM ('DRAFT', 'AWAITING_APPROVAL', 'APPROVED', 'EXECUTED', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'PAYOUT_SENT';
ALTER TYPE "NotificationType" ADD VALUE 'PAYOUT_FAILED';

-- AlterTable
ALTER TABLE "ushers" ADD COLUMN     "payoutAccountSetAt" TIMESTAMPTZ(6),
ADD COLUMN     "payoutBankAccountId" UUID;

-- AlterTable
ALTER TABLE "withdrawals" ADD COLUMN     "payoutRunId" UUID;

-- CreateTable
CREATE TABLE "payout_runs" (
    "id" UUID NOT NULL,
    "periodKey" TEXT NOT NULL,
    "status" "PayoutRunStatus" NOT NULL DEFAULT 'DRAFT',
    "builtAt" TIMESTAMPTZ(6) NOT NULL,
    "lines" JSONB NOT NULL,
    "excluded" JSONB NOT NULL,
    "skipped" JSONB,
    "linesHash" TEXT NOT NULL,
    "submittedById" UUID,
    "submittedAt" TIMESTAMPTZ(6),
    "approvedById" UUID,
    "approvedAt" TIMESTAMPTZ(6),
    "executedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payout_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payout_runs_periodKey_key" ON "payout_runs"("periodKey");

-- CreateIndex
CREATE INDEX "payout_runs_status_idx" ON "payout_runs"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ushers_payoutBankAccountId_key" ON "ushers"("payoutBankAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "withdrawals_payoutRunId_walletId_key" ON "withdrawals"("payoutRunId", "walletId");

-- AddForeignKey
ALTER TABLE "ushers" ADD CONSTRAINT "ushers_payoutBankAccountId_fkey" FOREIGN KEY ("payoutBankAccountId") REFERENCES "bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_payoutRunId_fkey" FOREIGN KEY ("payoutRunId") REFERENCES "payout_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_runs" ADD CONSTRAINT "payout_runs_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_runs" ADD CONSTRAINT "payout_runs_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Backfill: give each usher a payout account, so the first weekly run can pay
-- existing wallets. Uses the newest verified account that has a transfer
-- recipient. Dating it from the account's creation keeps long-held accounts
-- from being flagged as newly chosen.
UPDATE "ushers" AS u
SET "payoutBankAccountId" = b."id",
    "payoutAccountSetAt" = b."createdAt"
FROM (
  SELECT DISTINCT ON ("usherId") "id", "usherId", "createdAt"
  FROM "bank_accounts"
  WHERE "verified" AND "paystackRecipientCode" IS NOT NULL
  ORDER BY "usherId", "createdAt" DESC, "id" DESC
) AS b
WHERE b."usherId" = u."id" AND u."payoutBankAccountId" IS NULL;
