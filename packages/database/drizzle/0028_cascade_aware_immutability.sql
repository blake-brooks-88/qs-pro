-- Cascade-aware immutability trigger for audit_logs
-- Replaces the blanket-block trigger from 0027 to allow:
--   1. FK CASCADE deletes (e.g. tenant deletion)
--   2. Retention purge when session flag is set

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

  RAISE EXCEPTION 'audit_logs table is immutable: % operations are not permitted', TG_OP;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
