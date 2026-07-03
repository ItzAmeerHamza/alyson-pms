-- Time Doctor tables on shared revclouddb (palisade-be-stage)
-- Run in DBeaver against database: revclouddb
--
-- REUSE (do not duplicate):
--   tenant.user              — employees (integer id)
--   tenant.workspace         — org / workspace boundary
--   tenant.profile           — user profile rows
--   tenant.profile_workspace — membership + workspace_role
--
-- NEW (this migration):
--   time_doctor.*            — tracking, projects, pulse settings, extensions

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE SCHEMA IF NOT EXISTS time_doctor;

-- Pulse-specific fields without altering tenant.user (shared with palisade-be)
CREATE TABLE IF NOT EXISTS time_doctor.user_extensions (
  user_id         INTEGER PRIMARY KEY REFERENCES tenant."user"(id) ON DELETE CASCADE,
  workspace_id    INTEGER REFERENCES tenant.workspace(id) ON DELETE SET NULL,
  cognito_sub     TEXT UNIQUE,
  manager_id      INTEGER REFERENCES tenant."user"(id) ON DELETE SET NULL,
  pulse_role      TEXT NOT NULL DEFAULT 'employee'
                    CHECK (pulse_role IN ('admin', 'manager', 'team_leader', 'employee')),
  department      TEXT,
  location        TEXT,
  last_activity   TIMESTAMPTZ DEFAULT NOW(),
  paused_at       TIMESTAMPTZ,
  paused_by       INTEGER REFERENCES tenant."user"(id) ON DELETE SET NULL,
  pause_reason    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_td_user_ext_workspace ON time_doctor.user_extensions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_td_user_ext_manager ON time_doctor.user_extensions(manager_id);
CREATE INDEX IF NOT EXISTS idx_td_user_ext_cognito ON time_doctor.user_extensions(cognito_sub);

CREATE TABLE IF NOT EXISTS time_doctor.workspace_settings (
  workspace_id INTEGER PRIMARY KEY REFERENCES tenant.workspace(id) ON DELETE CASCADE,
  settings     JSONB NOT NULL DEFAULT '{
    "hours_threshold": 7,
    "high_activity_threshold": 60,
    "low_activity_threshold": 30,
    "screenshot_interval_minutes": 10
  }'::jsonb,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS time_doctor.projects (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  INTEGER NOT NULL REFERENCES tenant.workspace(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_td_projects_workspace ON time_doctor.projects(workspace_id);

CREATE TABLE IF NOT EXISTS time_doctor.employee_project_assignments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    INTEGER NOT NULL REFERENCES tenant."user"(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES time_doctor.projects(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, project_id)
);

CREATE TABLE IF NOT EXISTS time_doctor.time_logs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          INTEGER NOT NULL REFERENCES tenant."user"(id) ON DELETE CASCADE,
  project_id       UUID REFERENCES time_doctor.projects(id) ON DELETE SET NULL,
  workspace_id     INTEGER REFERENCES tenant.workspace(id) ON DELETE SET NULL,
  start_time       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_time         TIMESTAMPTZ,
  status           TEXT NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active', 'paused', 'completed', 'auto_closed')),
  idle_seconds     INTEGER NOT NULL DEFAULT 0,
  deducted_seconds INTEGER NOT NULL DEFAULT 0,
  device_id        TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_td_time_logs_user_start ON time_doctor.time_logs(user_id, start_time DESC);
CREATE INDEX IF NOT EXISTS idx_td_time_logs_workspace ON time_doctor.time_logs(workspace_id);

CREATE TABLE IF NOT EXISTS time_doctor.screenshots (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          INTEGER NOT NULL REFERENCES tenant."user"(id) ON DELETE CASCADE,
  time_log_id      UUID REFERENCES time_doctor.time_logs(id) ON DELETE SET NULL,
  workspace_id     INTEGER REFERENCES tenant.workspace(id) ON DELETE SET NULL,
  s3_key           TEXT,
  file_path        TEXT NOT NULL DEFAULT '',
  file_size        INTEGER,
  image_url        TEXT,
  captured_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  activity_percent INTEGER NOT NULL DEFAULT 0,
  focus_percent    INTEGER NOT NULL DEFAULT 0,
  mouse_clicks     INTEGER NOT NULL DEFAULT 0,
  keystrokes       INTEGER NOT NULL DEFAULT 0,
  mouse_movements  INTEGER NOT NULL DEFAULT 0,
  app_name         TEXT,
  window_title     TEXT,
  agent_version    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_td_screenshots_user_captured
  ON time_doctor.screenshots(user_id, captured_at DESC);

CREATE TABLE IF NOT EXISTS time_doctor.app_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      INTEGER NOT NULL REFERENCES tenant."user"(id) ON DELETE CASCADE,
  time_log_id  UUID REFERENCES time_doctor.time_logs(id) ON DELETE SET NULL,
  workspace_id INTEGER REFERENCES tenant.workspace(id) ON DELETE SET NULL,
  app_name     TEXT,
  window_title TEXT,
  started_at   TIMESTAMPTZ,
  ended_at     TIMESTAMPTZ,
  timestamp    TIMESTAMPTZ DEFAULT NOW(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_td_app_logs_user_started
  ON time_doctor.app_logs(user_id, started_at DESC);

-- Backend sync controller uses url_logs
CREATE TABLE IF NOT EXISTS time_doctor.url_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      INTEGER NOT NULL REFERENCES tenant."user"(id) ON DELETE CASCADE,
  time_log_id  UUID REFERENCES time_doctor.time_logs(id) ON DELETE SET NULL,
  workspace_id INTEGER REFERENCES tenant.workspace(id) ON DELETE SET NULL,
  site_url     TEXT NOT NULL,
  title        TEXT,
  domain       TEXT,
  browser      TEXT,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at     TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_td_url_logs_user_started
  ON time_doctor.url_logs(user_id, started_at DESC);

CREATE TABLE IF NOT EXISTS time_doctor.idle_logs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          INTEGER NOT NULL REFERENCES tenant."user"(id) ON DELETE CASCADE,
  time_log_id      UUID REFERENCES time_doctor.time_logs(id) ON DELETE SET NULL,
  project_id       UUID REFERENCES time_doctor.projects(id) ON DELETE SET NULL,
  workspace_id     INTEGER REFERENCES tenant.workspace(id) ON DELETE SET NULL,
  idle_start       TIMESTAMPTZ NOT NULL,
  idle_end         TIMESTAMPTZ,
  duration_seconds INTEGER,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS time_doctor.low_hours_email_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    INTEGER REFERENCES tenant.workspace(id) ON DELETE CASCADE,
  employee_id     INTEGER NOT NULL REFERENCES tenant."user"(id) ON DELETE CASCADE,
  employee_email  TEXT NOT NULL,
  manager_email   TEXT,
  work_date       DATE NOT NULL,
  hours_worked    NUMERIC(5,2) NOT NULL,
  hours_threshold NUMERIC(4,2) NOT NULL,
  sent_by         INTEGER REFERENCES tenant."user"(id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'sent',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_td_low_hours_workspace_date
  ON time_doctor.low_hours_email_log(workspace_id, work_date DESC);

CREATE OR REPLACE VIEW time_doctor.daily_activity_summary AS
SELECT
  tl.user_id,
  DATE(tl.start_time AT TIME ZONE 'UTC') AS activity_date,
  COUNT(*) AS sessions_count,
  SUM(EXTRACT(EPOCH FROM (COALESCE(tl.end_time, NOW()) - tl.start_time))) AS total_seconds,
  SUM(tl.idle_seconds) AS total_idle_seconds,
  AVG(s.activity_percent) AS avg_activity_percent,
  COUNT(s.id) AS screenshots_count
FROM time_doctor.time_logs tl
LEFT JOIN time_doctor.screenshots s ON s.time_log_id = tl.id
WHERE tl.start_time IS NOT NULL
GROUP BY tl.user_id, DATE(tl.start_time AT TIME ZONE 'UTC');

-- API user (adjust role name if your cluster differs)
GRANT USAGE ON SCHEMA time_doctor TO alyson_time_doctor_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA time_doctor TO alyson_time_doctor_api;
GRANT SELECT ON time_doctor.daily_activity_summary TO alyson_time_doctor_api;
ALTER DEFAULT PRIVILEGES IN SCHEMA time_doctor
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO alyson_time_doctor_api;

-- Read-only on shared identity tables (no writes from time doctor API)
GRANT USAGE ON SCHEMA tenant TO alyson_time_doctor_api;
GRANT SELECT ON tenant."user", tenant.workspace, tenant.profile, tenant.profile_workspace
  TO alyson_time_doctor_api;
