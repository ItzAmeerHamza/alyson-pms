-- Tighten LOW activity: only screenshots under 10% count as LOW on reports.
-- Safe to re-run. Applies to all workspaces with time_doctor.workspace_settings.

BEGIN;

UPDATE time_doctor.workspace_settings
SET
  settings = jsonb_set(
    COALESCE(settings, '{}'::jsonb),
    '{low_activity_threshold}',
    '10'::jsonb,
    true
  ),
  updated_at = NOW()
WHERE COALESCE((settings->>'low_activity_threshold')::numeric, 30) > 10
   OR settings->>'low_activity_threshold' IS NULL;

COMMIT;

-- Verify
SELECT
  workspace_id,
  settings->>'low_activity_threshold' AS low_activity_threshold,
  settings->>'high_activity_threshold' AS high_activity_threshold,
  settings->>'screenshot_interval_minutes' AS screenshot_interval_minutes
FROM time_doctor.workspace_settings
ORDER BY workspace_id;
