-- Screenshot capture interval: stored in time_doctor.workspace_settings (not in app code).
-- Change anytime with:
--   UPDATE time_doctor.workspace_settings
--   SET settings = jsonb_set(settings, '{screenshot_interval_minutes}', '10'),
--       updated_at = NOW()
--   WHERE workspace_id = 510;
--
-- Desktop agents pick this up on login and every ~10 minutes (no redeploy needed).

BEGIN;

INSERT INTO time_doctor.workspace_settings (workspace_id)
SELECT 510
WHERE EXISTS (SELECT 1 FROM tenant.workspace WHERE id = 510)
ON CONFLICT (workspace_id) DO NOTHING;

UPDATE time_doctor.workspace_settings
SET settings = jsonb_set(
      COALESCE(settings, '{}'::jsonb),
      '{screenshot_interval_minutes}',
      '5'::jsonb,
      true
    ),
    updated_at = NOW()
WHERE workspace_id = 510;

COMMIT;

-- Verify
SELECT workspace_id, settings->>'screenshot_interval_minutes' AS screenshot_interval_minutes, updated_at
FROM time_doctor.workspace_settings
WHERE workspace_id = 510;
