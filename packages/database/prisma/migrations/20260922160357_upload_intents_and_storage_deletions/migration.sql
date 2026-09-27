-- CreateTable
CREATE TABLE "upload_intents" (
    "key" TEXT NOT NULL,
    "stagingKey" TEXT NOT NULL,
    "ownerId" UUID NOT NULL,
    "scopeId" UUID NOT NULL,
    "purpose" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "attachExpiresAt" TIMESTAMPTZ(6) NOT NULL,
    "finalizedAt" TIMESTAMPTZ(6),
    "consumedBy" TEXT,
    "consumedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "upload_intents_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "storage_deletions" (
    "key" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(6),
    "lastError" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "storage_deletions_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "upload_intents_stagingKey_key" ON "upload_intents"("stagingKey");

-- CreateIndex
CREATE INDEX "upload_intents_ownerId_idx" ON "upload_intents"("ownerId");

-- CreateIndex
CREATE INDEX "upload_intents_consumedAt_attachExpiresAt_idx" ON "upload_intents"("consumedAt", "attachExpiresAt");

-- CreateIndex
CREATE INDEX "storage_deletions_completedAt_nextAttemptAt_idx" ON "storage_deletions"("completedAt", "nextAttemptAt");

