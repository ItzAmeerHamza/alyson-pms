-- Country-wide public holidays as team leave.
-- Safe to re-run.

ALTER TABLE time_doctor.team_leave_events
  ADD COLUMN IF NOT EXISTS country TEXT;

COMMENT ON COLUMN time_doctor.team_leave_events.country IS
  'When set, credit every active employee in this country. Location/department matching is skipped.';

ALTER TABLE time_doctor.team_leave_events
  DROP CONSTRAINT IF EXISTS team_leave_events_leave_type_check;

ALTER TABLE time_doctor.team_leave_events
  ADD CONSTRAINT team_leave_events_leave_type_check
  CHECK (leave_type IN ('annual', 'sick', 'personal', 'unpaid', 'other', 'holiday'));

CREATE INDEX IF NOT EXISTS idx_td_team_leave_holiday_country
  ON time_doctor.team_leave_events (workspace_id, country, start_date, end_date)
  WHERE status = 'active' AND country IS NOT NULL;
