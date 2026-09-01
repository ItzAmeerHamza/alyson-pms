-- Desktop agent now takes 2 random screenshots per 10 minutes (12/hour).
-- Report math still uses screenshot_interval_minutes as seconds-per-shot (~5).
BEGIN;

UPDATE time_doctor.workspace_settings
SET settings = jsonb_set(
      COALESCE(settings, '{}'::jsonb),
      '{screenshot_interval_minutes}',
      '5'::jsonb,
      true
    ),
    updated_at = NOW()
WHERE COALESCE(settings->>'screenshot_interval_minutes', '') IN ('', '1', '10');

COMMIT;

SELECT workspace_id, settings->>'screenshot_interval_minutes' AS screenshot_interval_minutes, updated_at
FROM time_doctor.workspace_settings
ORDER BY workspace_id;
