-- Limited delegated access: admin grants a user screenshots+reports for specific employees.

CREATE TABLE IF NOT EXISTS time_doctor.access_grants (
  id              SERIAL PRIMARY KEY,
  workspace_id    INTEGER NOT NULL REFERENCES tenant.workspace(id) ON DELETE CASCADE,
  grantee_user_id INTEGER NOT NULL REFERENCES tenant."user"(id) ON DELETE CASCADE,
  granted_by      INTEGER NOT NULL REFERENCES tenant."user"(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, grantee_user_id)
);

CREATE INDEX IF NOT EXISTS idx_td_access_grants_grantee
  ON time_doctor.access_grants(grantee_user_id);

CREATE INDEX IF NOT EXISTS idx_td_access_grants_workspace
  ON time_doctor.access_grants(workspace_id);

CREATE TABLE IF NOT EXISTS time_doctor.access_grant_targets (
  grant_id       INTEGER NOT NULL REFERENCES time_doctor.access_grants(id) ON DELETE CASCADE,
  target_user_id INTEGER NOT NULL REFERENCES tenant."user"(id) ON DELETE CASCADE,
  PRIMARY KEY (grant_id, target_user_id)
);

CREATE INDEX IF NOT EXISTS idx_td_access_grant_targets_target
  ON time_doctor.access_grant_targets(target_user_id);
