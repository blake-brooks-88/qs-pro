-- Allow anonymization UPDATEs and retention-purge DELETEs on audit_logs
-- Extends the cascade-aware trigger from 0028 to also permit:
--   3. UPDATE when session flag app.audit_anonymize = 'on' (GDPR user deletion)

CREATE OR REPLACE FUNCTION audit_logs_immutable()
RETURNS TRIGGER AS $$
BEGIN
  -- Allow FK cascades (Postgres implements CASCADE via internal triggers).
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;

  -- Allow retention purge only when explicitly enabled for this session.
  IF TG_OP = 'DELETE' AND current_setting('app.audit_retention_purge', true) = 'on' THEN
    RETURN OLD;
  END IF;

  -- Allow anonymization updates (GDPR user deletion nullifies PII fields).
  IF TG_OP = 'UPDATE' AND current_setting('app.audit_anonymize', true) = 'on' THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'audit_logs table is immutable: % operations are not permitted', TG_OP;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
