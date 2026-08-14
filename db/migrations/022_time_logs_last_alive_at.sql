-- Dead-man's switch on the session row itself.
--
-- The agent stamps last_alive_at every 10s while tracking. If it is frozen by a
-- lid close, killed, or loses power, the row already carries the moment it went
-- quiet — nothing has to be inferred at wake time, and nothing has to run on the
-- dead machine.
--
-- Why not just write end_time? Because "end_time IS NULL" is how open sessions
-- are identified across the API, Pulse and the desktop agent. This column is
-- purely additive: open stays open, and closing an orphan becomes
-- "end_time := last_alive_at" instead of "end_time := NOW()".

ALTER TABLE time_doctor.time_logs
  ADD COLUMN IF NOT EXISTS last_alive_at TIMESTAMPTZ;

COMMENT ON COLUMN time_doctor.time_logs.last_alive_at IS
  'Last moment the agent confirmed this session was alive (stamped ~every 10s). Billing ceiling for open rows.';

-- Sweep + reporting read this for every open row.
CREATE INDEX IF NOT EXISTS idx_td_time_logs_open_last_alive
  ON time_doctor.time_logs (last_alive_at)
  WHERE end_time IS NULL;

-- Backfill so existing open rows are not treated as "never alive". Best available
-- evidence today: newest heartbeat/capture, falling back to start_time.
UPDATE time_doctor.time_logs t
SET last_alive_at = GREATEST(
      t.start_time,
      COALESCE((SELECT MAX(h.seen_at)     FROM time_doctor.session_heartbeats h WHERE h.time_log_id = t.id), t.start_time),
      COALESCE((SELECT MAX(s.captured_at) FROM time_doctor.screenshots s        WHERE s.time_log_id = t.id), t.start_time),
      COALESCE((SELECT MAX(COALESCE(a.ended_at, a.started_at, a.timestamp))
                  FROM time_doctor.app_logs a WHERE a.time_log_id = t.id), t.start_time),
      COALESCE((SELECT MAX(COALESCE(u.ended_at, u.started_at))
                  FROM time_doctor.url_logs u WHERE u.time_log_id = t.id), t.start_time)
    )
WHERE t.last_alive_at IS NULL
  AND t.end_time IS NULL;
