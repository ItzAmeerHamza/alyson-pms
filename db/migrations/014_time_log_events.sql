-- time_log_events audit trail (safe to re-run)
-- Use $audit$ quoting so DBeaver/clients don't mangle the function body.

CREATE TABLE IF NOT EXISTS time_doctor.time_log_events (
  id                   BIGSERIAL PRIMARY KEY,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id              INTEGER NOT NULL REFERENCES tenant."user"(id) ON DELETE CASCADE,
  time_log_id          UUID,
  workspace_id         INTEGER REFERENCES tenant.workspace(id) ON DELETE SET NULL,
  action               TEXT NOT NULL,
  source               TEXT NOT NULL DEFAULT 'db-trigger',
  device_id            TEXT,
  agent_version        TEXT,
  request_id           TEXT,
  old_start_time       TIMESTAMPTZ,
  old_end_time         TIMESTAMPTZ,
  old_status           TEXT,
  old_idle_seconds     INTEGER,
  old_deducted_seconds INTEGER,
  new_start_time       TIMESTAMPTZ,
  new_end_time         TIMESTAMPTZ,
  new_status           TEXT,
  new_idle_seconds     INTEGER,
  new_deducted_seconds INTEGER,
  duration_delta_seconds INTEGER,
  shortened            BOOLEAN NOT NULL DEFAULT FALSE,
  meta                 JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_td_time_log_events_user_created
  ON time_doctor.time_log_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_td_time_log_events_log_created
  ON time_doctor.time_log_events (time_log_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_td_time_log_events_shortened
  ON time_doctor.time_log_events (created_at DESC)
  WHERE shortened = TRUE;

CREATE OR REPLACE FUNCTION time_doctor.fn_time_log_events_audit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = time_doctor, pg_temp
AS $audit$
DECLARE
  old_dur INTEGER;
  new_dur INTEGER;
  delta INTEGER;
  did_shorten BOOLEAN;
  act TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO time_doctor.time_log_events (
      user_id, time_log_id, workspace_id, action, source, device_id,
      new_start_time, new_end_time, new_status, new_idle_seconds, new_deducted_seconds,
      duration_delta_seconds, shortened, meta
    ) VALUES (
      NEW.user_id, NEW.id, NEW.workspace_id, 'create', 'db-trigger', NEW.device_id,
      NEW.start_time, NEW.end_time, NEW.status,
      COALESCE(NEW.idle_seconds, 0), COALESCE(NEW.deducted_seconds, 0),
      NULL, FALSE, jsonb_build_object('op', 'INSERT')
    );
    RETURN NEW;
  END IF;

  -- Skip no-op updates
  IF NEW.start_time IS NOT DISTINCT FROM OLD.start_time
     AND NEW.end_time IS NOT DISTINCT FROM OLD.end_time
     AND NEW.status IS NOT DISTINCT FROM OLD.status
     AND COALESCE(NEW.idle_seconds, 0) IS NOT DISTINCT FROM COALESCE(OLD.idle_seconds, 0)
     AND COALESCE(NEW.deducted_seconds, 0) IS NOT DISTINCT FROM COALESCE(OLD.deducted_seconds, 0)
  THEN
    RETURN NEW;
  END IF;

  act := 'update';
  IF COALESCE(NEW.deducted_seconds, 0) > COALESCE(OLD.deducted_seconds, 0)
     AND NEW.end_time IS NOT DISTINCT FROM OLD.end_time THEN
    act := 'screenshot_deduct';
  END IF;
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    act := 'close';
  END IF;

  old_dur := NULL;
  IF OLD.end_time IS NOT NULL THEN
    old_dur := GREATEST(0, EXTRACT(EPOCH FROM (OLD.end_time - OLD.start_time))::int);
  END IF;

  new_dur := NULL;
  IF NEW.end_time IS NOT NULL THEN
    new_dur := GREATEST(0, EXTRACT(EPOCH FROM (NEW.end_time - NEW.start_time))::int);
  END IF;

  delta := NULL;
  did_shorten := FALSE;
  IF old_dur IS NOT NULL AND new_dur IS NOT NULL THEN
    delta := new_dur - old_dur;
    did_shorten := (delta < 0);
  END IF;
  IF OLD.end_time IS NOT NULL AND NEW.end_time IS NOT NULL AND NEW.end_time < OLD.end_time THEN
    did_shorten := TRUE;
  END IF;
  IF did_shorten THEN
    act := 'shorten';
  END IF;

  INSERT INTO time_doctor.time_log_events (
    user_id, time_log_id, workspace_id, action, source, device_id,
    old_start_time, old_end_time, old_status, old_idle_seconds, old_deducted_seconds,
    new_start_time, new_end_time, new_status, new_idle_seconds, new_deducted_seconds,
    duration_delta_seconds, shortened, meta
  ) VALUES (
    NEW.user_id, NEW.id, NEW.workspace_id, act, 'db-trigger', NEW.device_id,
    OLD.start_time, OLD.end_time, OLD.status,
    COALESCE(OLD.idle_seconds, 0), COALESCE(OLD.deducted_seconds, 0),
    NEW.start_time, NEW.end_time, NEW.status,
    COALESCE(NEW.idle_seconds, 0), COALESCE(NEW.deducted_seconds, 0),
    delta, did_shorten, jsonb_build_object('op', 'UPDATE')
  );

  RETURN NEW;
END;
$audit$;

DROP TRIGGER IF EXISTS trg_time_log_events_audit ON time_doctor.time_logs;

CREATE TRIGGER trg_time_log_events_audit
  AFTER INSERT OR UPDATE ON time_doctor.time_logs
  FOR EACH ROW
  EXECUTE PROCEDURE time_doctor.fn_time_log_events_audit();

GRANT SELECT, INSERT ON TABLE time_doctor.time_log_events TO alyson_time_doctor_api;
GRANT USAGE, SELECT ON SEQUENCE time_doctor.time_log_events_id_seq TO alyson_time_doctor_api;
