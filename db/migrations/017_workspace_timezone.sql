-- Workspace / company work-day timezone (IANA).
-- Matches Time Doctor "Company Time Zone" — NOT each employee's personal timezone.
-- Desktop agent "today" clamp + Pulse day bucketing use this value.
-- Safe to re-run.
--
-- Example: Time Doctor Company Time Zone = Central (US & Canada)
-- → employees in Pakistan/India see the clock reset at ~10:00 / ~10:30 local
--   (Central midnight), same as Time Doctor.
--
--   UPDATE time_doctor.workspace_settings
--      SET settings = settings || '{"timezone":"America/Chicago"}'::jsonb
--    WHERE workspace_id = <id>;

UPDATE time_doctor.workspace_settings
   SET settings = COALESCE(settings, '{}'::jsonb) || '{"timezone":"America/Los_Angeles"}'::jsonb
 WHERE settings IS NULL
    OR settings->>'timezone' IS NULL
    OR btrim(settings->>'timezone') = '';

COMMENT ON COLUMN time_doctor.workspace_settings.settings IS
  'JSON: hours_threshold, activity thresholds, screenshot_interval_minutes, timezone (IANA company/work-day TZ; match Time Doctor Company Time Zone)';
