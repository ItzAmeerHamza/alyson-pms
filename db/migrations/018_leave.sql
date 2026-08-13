-- Pulse Leave module: inbox, personal/team events, audit + leave-sourced time credits.
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- Leave inbox (Gmail scan results)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS time_doctor.leave_inbox_messages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      INTEGER NOT NULL REFERENCES tenant.workspace(id) ON DELETE CASCADE,
  gmail_message_id  TEXT NOT NULL,
  gmail_thread_id   TEXT,
  from_address      TEXT,
  to_address        TEXT,
  subject           TEXT,
  snippet           TEXT,
  body_text         TEXT,
  received_at       TIMESTAMPTZ,
  classification    TEXT NOT NULL DEFAULT 'error'
                      CHECK (classification IN ('leave', 'noise', 'error', 'unmatched')),
  deepseek_json     JSONB,
  leave_event_id    UUID,
  scanned_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT leave_inbox_gmail_unique UNIQUE (workspace_id, gmail_message_id)
);

CREATE INDEX IF NOT EXISTS idx_td_leave_inbox_ws_scanned
  ON time_doctor.leave_inbox_messages (workspace_id, scanned_at DESC);

-- ---------------------------------------------------------------------------
-- Personal leave events
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS time_doctor.leave_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      INTEGER NOT NULL REFERENCES tenant.workspace(id) ON DELETE CASCADE,
  user_id           INTEGER NOT NULL REFERENCES tenant."user"(id) ON DELETE CASCADE,
  leave_type        TEXT NOT NULL
                      CHECK (leave_type IN ('annual', 'sick', 'personal', 'unpaid', 'other')),
  start_date        DATE NOT NULL,
  end_date          DATE NOT NULL,
  days              NUMERIC(6,1) NOT NULL DEFAULT 0,
  note              TEXT,
  source            TEXT NOT NULL DEFAULT 'manual'
                      CHECK (source IN ('email', 'manual')),
  status            TEXT NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active', 'voided')),
  gmail_message_id  TEXT,
  created_by        INTEGER NOT NULL REFERENCES tenant."user"(id) ON DELETE RESTRICT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  voided_at         TIMESTAMPTZ,
  voided_by         INTEGER REFERENCES tenant."user"(id) ON DELETE SET NULL,
  CONSTRAINT leave_events_date_order CHECK (end_date >= start_date),
  CONSTRAINT leave_events_gmail_unique UNIQUE (workspace_id, gmail_message_id)
);

CREATE INDEX IF NOT EXISTS idx_td_leave_events_ws_user
  ON time_doctor.leave_events (workspace_id, user_id, start_date);

CREATE INDEX IF NOT EXISTS idx_td_leave_events_ws_status
  ON time_doctor.leave_events (workspace_id, status, start_date);

-- ---------------------------------------------------------------------------
-- Team leave events (location / department fan-out)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS time_doctor.team_leave_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      INTEGER NOT NULL REFERENCES tenant.workspace(id) ON DELETE CASCADE,
  location          TEXT NOT NULL DEFAULT 'Unknown',
  team              TEXT NOT NULL DEFAULT 'Unassigned',
  leave_type        TEXT NOT NULL
                      CHECK (leave_type IN ('annual', 'sick', 'personal', 'unpaid', 'other')),
  start_date        DATE NOT NULL,
  end_date          DATE NOT NULL,
  days              NUMERIC(6,1) NOT NULL DEFAULT 0,
  note              TEXT,
  status            TEXT NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active', 'voided')),
  created_by        INTEGER NOT NULL REFERENCES tenant."user"(id) ON DELETE RESTRICT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  voided_at         TIMESTAMPTZ,
  voided_by         INTEGER REFERENCES tenant."user"(id) ON DELETE SET NULL,
  CONSTRAINT team_leave_events_date_order CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_td_team_leave_ws_dates
  ON time_doctor.team_leave_events (workspace_id, start_date, end_date);

-- ---------------------------------------------------------------------------
-- Audit log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS time_doctor.leave_audit_log (
  id                BIGSERIAL PRIMARY KEY,
  workspace_id      INTEGER NOT NULL REFERENCES tenant.workspace(id) ON DELETE CASCADE,
  op                TEXT NOT NULL,
  actor_user_id     INTEGER REFERENCES tenant."user"(id) ON DELETE SET NULL,
  detail            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_td_leave_audit_ws_created
  ON time_doctor.leave_audit_log (workspace_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- time_adjustments: leave source linkage (idempotent credits)
-- ---------------------------------------------------------------------------
ALTER TABLE time_doctor.time_adjustments
  ADD COLUMN IF NOT EXISTS source_type TEXT;

ALTER TABLE time_doctor.time_adjustments
  ADD COLUMN IF NOT EXISTS source_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS idx_td_time_adjustments_leave_source
  ON time_doctor.time_adjustments (workspace_id, user_id, work_date, source_type, source_id)
  WHERE source_type = 'leave' AND source_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_td_time_adjustments_leave_void_source
  ON time_doctor.time_adjustments (workspace_id, user_id, work_date, source_type, source_id)
  WHERE source_type = 'leave_void' AND source_id IS NOT NULL;

COMMENT ON TABLE time_doctor.leave_events IS
  'Personal leave ledger; active events credit +7h/weekday into time_adjustments.';
COMMENT ON TABLE time_doctor.leave_inbox_messages IS
  'Gmail DWD scan results for people-ops leave intake.';

-- FK from inbox → leave_events (added after leave_events exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leave_inbox_leave_event_fk'
  ) THEN
    ALTER TABLE time_doctor.leave_inbox_messages
      ADD CONSTRAINT leave_inbox_leave_event_fk
      FOREIGN KEY (leave_event_id) REFERENCES time_doctor.leave_events(id) ON DELETE SET NULL;
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE ON TABLE time_doctor.leave_inbox_messages TO alyson_time_doctor_api;
GRANT SELECT, INSERT, UPDATE ON TABLE time_doctor.leave_events TO alyson_time_doctor_api;
GRANT SELECT, INSERT, UPDATE ON TABLE time_doctor.team_leave_events TO alyson_time_doctor_api;
GRANT SELECT, INSERT ON TABLE time_doctor.leave_audit_log TO alyson_time_doctor_api;
GRANT USAGE, SELECT ON SEQUENCE time_doctor.leave_audit_log_id_seq TO alyson_time_doctor_api;
