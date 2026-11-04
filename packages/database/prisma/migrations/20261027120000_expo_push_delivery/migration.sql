-- Push now goes through Expo's push service. FCM registration tokens cannot be
-- delivered there; the mobile app never registered devices before this release,
-- so this removes at most manually registered rows. Devices re-register with
-- Expo tokens on their next launch.
DELETE FROM "device_tokens" WHERE "fcmToken" NOT LIKE 'Expo%PushToken[%';

-- AlterTable
ALTER TABLE "device_tokens" RENAME COLUMN "fcmToken" TO "token";

-- RenameIndex
ALTER INDEX "device_tokens_fcmToken_key" RENAME TO "device_tokens_token_key";

-- CreateTable
CREATE TABLE "push_tickets" (
    "id" TEXT NOT NULL,
    "deviceTokenId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "userId" UUID NOT NULL,
    "jobAlerts" BOOLEAN NOT NULL DEFAULT true,
    "reminders" BOOLEAN NOT NULL DEFAULT true,
    "messages" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "notification_dispatches" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "dedupeKey" TEXT,
    "targetType" TEXT,
    "targetId" TEXT,
    "sentAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openedAt" TIMESTAMPTZ(6),
    "action" TEXT,

    CONSTRAINT "notification_dispatches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "push_tickets_createdAt_idx" ON "push_tickets"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "notification_dispatches_dedupeKey_key" ON "notification_dispatches"("dedupeKey");

-- CreateIndex
CREATE INDEX "notification_dispatches_userId_sentAt_idx" ON "notification_dispatches"("userId", "sentAt");

-- CreateIndex
CREATE INDEX "notification_dispatches_sentAt_idx" ON "notification_dispatches"("sentAt");

-- AddForeignKey
ALTER TABLE "push_tickets" ADD CONSTRAINT "push_tickets_deviceTokenId_fkey" FOREIGN KEY ("deviceTokenId") REFERENCES "device_tokens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_dispatches" ADD CONSTRAINT "notification_dispatches_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

