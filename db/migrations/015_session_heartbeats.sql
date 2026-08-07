-- Session heartbeat telemetry (safe to re-run).
-- APPEND-ONLY liveness signals. Must NOT be used alone as an automatic hard stop
-- for time_logs.end_time (that under/over-records). Detection/flagging only;
-- closes require local durable evidence and/or employee/admin confirmation.

CREATE TABLE IF NOT EXISTS time_doctor.session_heartbeats (
  id            BIGSERIAL PRIMARY KEY,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  time_log_id   UUID
                REFERENCES time_doctor.time_logs(id) ON DELETE SET NULL,
  user_id       INTEGER NOT NULL
                REFERENCES tenant."user"(id) ON DELETE CASCADE,
  device_id     TEXT,
  workspace_id  INTEGER
                REFERENCES tenant.workspace(id) ON DELETE SET NULL,
  seen_at       TIMESTAMPTZ NOT NULL,
  reason        TEXT,
  agent_version TEXT,
  meta          JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_td_session_heartbeats_log_seen
  ON time_doctor.session_heartbeats (time_log_id, seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_td_session_heartbeats_user_seen
  ON time_doctor.session_heartbeats (user_id, seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_td_session_heartbeats_device_seen
  ON time_doctor.session_heartbeats (device_id, seen_at DESC)
  WHERE device_id IS NOT NULL;

COMMENT ON TABLE time_doctor.session_heartbeats IS
  'Append-only desktop liveness telemetry. Do not auto-close time_logs from seen_at alone.';
