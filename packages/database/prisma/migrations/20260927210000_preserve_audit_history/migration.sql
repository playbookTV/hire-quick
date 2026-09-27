-- TRD §14: enforce append-only audit history at the storage boundary.
-- Preserve existing history exactly, even when it is already damaged.
-- The owning migration role can still alter DDL; this is not an independent
-- cryptographic anchor or a defence against a privileged database owner.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE FUNCTION reject_audit_history_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit history is append-only' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER audit_logs_preserve_history
BEFORE UPDATE OR DELETE OR TRUNCATE ON audit_logs
FOR EACH STATEMENT EXECUTE FUNCTION reject_audit_history_mutation();

-- Writers advance lastHash, but must never remove the durable anchor.
CREATE TRIGGER audit_head_preserve_history
BEFORE DELETE OR TRUNCATE ON audit_chain_head
FOR EACH STATEMENT EXECUTE FUNCTION reject_audit_history_mutation();

ALTER TABLE audit_logs ENABLE ALWAYS TRIGGER audit_logs_preserve_history;
ALTER TABLE audit_chain_head ENABLE ALWAYS TRIGGER audit_head_preserve_history;

COMMIT;
