-- Record which agent build produced a session, and carry it into the audit trail.
--
-- time_log_events.agent_version has existed since 014 and was NULL on all 3,157
-- rows. 97% of those events are written by fn_time_log_events_audit, which runs
-- inside the database and cannot see anything about the HTTP request — so the
-- column could never be filled from there.
--
-- The build is a property of the session, not of an individual request: one
-- agent creates a time log and owns it for its lifetime. Storing it on the row
-- lets the trigger copy it onto every event for free, and makes "which version
-- wrote this bad row" answerable without joining anything.
--
-- Safe to re-run.

ALTER TABLE time_doctor.time_logs
  ADD COLUMN IF NOT EXISTS agent_version TEXT;

COMMENT ON COLUMN time_doctor.time_logs.agent_version IS
  'Desktop agent build that created this session. Copied onto every audit event.';

-- Backfill from the heartbeats those sessions already sent, where present.
UPDATE time_doctor.time_logs t
SET agent_version = h.agent_version
FROM (
  SELECT DISTINCT ON (time_log_id) time_log_id, agent_version
  FROM time_doctor.session_heartbeats
  WHERE agent_version IS NOT NULL
  ORDER BY time_log_id, seen_at DESC
) h
WHERE h.time_log_id = t.id
  AND t.agent_version IS NULL;

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
      user_id, time_log_id, workspace_id, action, source, device_id, agent_version,
      new_start_time, new_end_time, new_status, new_idle_seconds, new_deducted_seconds,
      duration_delta_seconds, shortened, meta
    ) VALUES (
      NEW.user_id, NEW.id, NEW.workspace_id, 'create', 'db-trigger', NEW.device_id, NEW.agent_version,
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
    user_id, time_log_id, workspace_id, action, source, device_id, agent_version,
    old_start_time, old_end_time, old_status, old_idle_seconds, old_deducted_seconds,
    new_start_time, new_end_time, new_status, new_idle_seconds, new_deducted_seconds,
    duration_delta_seconds, shortened, meta
  ) VALUES (
    NEW.user_id, NEW.id, NEW.workspace_id, act, 'db-trigger', NEW.device_id, NEW.agent_version,
    OLD.start_time, OLD.end_time, OLD.status,
    COALESCE(OLD.idle_seconds, 0), COALESCE(OLD.deducted_seconds, 0),
    NEW.start_time, NEW.end_time, NEW.status,
    COALESCE(NEW.idle_seconds, 0), COALESCE(NEW.deducted_seconds, 0),
    delta, did_shorten, jsonb_build_object('op', 'UPDATE')
  );

  RETURN NEW;
END;
$audit$;
