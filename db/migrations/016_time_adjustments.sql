-- Admin manual time adjustments (Pacific work-day deltas).
-- Append-only: each admin add/remove is a new row (signed delta_seconds).
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS time_doctor.time_adjustments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    INTEGER NOT NULL REFERENCES tenant.workspace(id) ON DELETE CASCADE,
  user_id         INTEGER NOT NULL REFERENCES tenant."user"(id) ON DELETE CASCADE,
  work_date       DATE NOT NULL,
  delta_seconds   INTEGER NOT NULL,
  reason          TEXT NOT NULL,
  created_by      INTEGER NOT NULL REFERENCES tenant."user"(id) ON DELETE RESTRICT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT time_adjustments_delta_nonzero CHECK (delta_seconds <> 0),
  CONSTRAINT time_adjustments_reason_nonempty CHECK (length(trim(reason)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_td_time_adjustments_ws_user_date
  ON time_doctor.time_adjustments (workspace_id, user_id, work_date);

CREATE INDEX IF NOT EXISTS idx_td_time_adjustments_ws_date
  ON time_doctor.time_adjustments (workspace_id, work_date);

COMMENT ON TABLE time_doctor.time_adjustments IS
  'Org-admin signed time adjustments per employee Pacific work day. Day total = tracked + SUM(delta).';
