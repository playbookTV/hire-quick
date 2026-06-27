-- The audit log is append-only and tamper-evident: entryHash covers actorId, so
-- a referential action (ON DELETE SET NULL) mutating actorId would silently
-- break the hash chain when an actor user is deleted. Drop the FK and keep
-- actorId as a denormalized, immutable reference (the actorId index is retained).

-- DropForeignKey
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_actorId_fkey";
