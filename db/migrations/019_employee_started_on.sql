-- Employee work start date for pacing / low-hours proration.
-- Days before started_on do not count toward expected hours.
-- Safe to re-run.

ALTER TABLE time_doctor.user_extensions
  ADD COLUMN IF NOT EXISTS started_on DATE;

COMMENT ON COLUMN time_doctor.user_extensions.started_on IS
  'First company work calendar day the employee is expected to track. Pace/weekly/daily expected hours ignore weekdays before this date.';

-- Backfill: use extension/created timestamp calendar date when missing.
UPDATE time_doctor.user_extensions ext
   SET started_on = COALESCE(
     ext.started_on,
     (COALESCE(ext.created_at, u.created::timestamptz) AT TIME ZONE 'UTC')::date
   )
  FROM tenant."user" u
 WHERE u.id = ext.user_id
   AND ext.started_on IS NULL;
