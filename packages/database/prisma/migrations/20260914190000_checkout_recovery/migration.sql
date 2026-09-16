CREATE TYPE "CheckoutState" AS ENUM ('CREATED', 'INITIALIZING', 'READY', 'REVIEW', 'EXPIRED', 'PAID', 'REFUND_PENDING', 'REFUNDED');

CREATE TABLE "checkouts" (
  "orderId" UUID NOT NULL,
  "reference" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "authorizationUrl" TEXT,
  "state" "CheckoutState" NOT NULL DEFAULT 'CREATED',
  "attemptedAt" TIMESTAMPTZ(6),
  "expiresAt" TIMESTAMPTZ(6) NOT NULL,
  "lastCheckedAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "checkouts_pkey" PRIMARY KEY ("orderId"),
  CONSTRAINT "checkouts_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "checkouts_reference_key" ON "checkouts"("reference");
CREATE INDEX "checkouts_state_expiresAt_idx" ON "checkouts"("state", "expiresAt");
