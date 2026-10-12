-- Desktop "Report an issue" inbox (safe to re-run)

CREATE TABLE IF NOT EXISTS time_doctor.issue_reports (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id              INTEGER NOT NULL REFERENCES tenant."user"(id) ON DELETE CASCADE,
  workspace_id         INTEGER REFERENCES tenant.workspace(id) ON DELETE SET NULL,
  category             TEXT NOT NULL
                         CHECK (category IN (
                           'tracking', 'screenshots', 'login', 'permissions', 'updates', 'other'
                         )),
  message              TEXT NOT NULL,
  include_diagnostics  BOOLEAN NOT NULL DEFAULT FALSE,
  diagnostics          TEXT,
  app_version          TEXT,
  platform             TEXT,
  os_summary           TEXT,
  reporter_email       TEXT,
  reporter_name        TEXT
);

CREATE INDEX IF NOT EXISTS idx_td_issue_reports_workspace_created
  ON time_doctor.issue_reports (workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_td_issue_reports_user_created
  ON time_doctor.issue_reports (user_id, created_at DESC);

GRANT SELECT, INSERT ON TABLE time_doctor.issue_reports TO alyson_time_doctor_api;
