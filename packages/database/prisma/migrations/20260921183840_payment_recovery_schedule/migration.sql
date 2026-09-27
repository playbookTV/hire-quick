-- AlterTable
ALTER TABLE "payment_operations" ADD COLUMN     "nextAttemptAt" TIMESTAMPTZ(6),
ADD COLUMN     "quarantinedAt" TIMESTAMPTZ(6),
ADD COLUMN     "recoveryAttempts" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "payment_operations_status_quarantinedAt_nextAttemptAt_idx" ON "payment_operations"("status", "quarantinedAt", "nextAttemptAt");
