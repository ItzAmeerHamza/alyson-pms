-- First successful Pulse/Cognito sign-in (or desktop sync).
-- NULL = invite sent, they have not signed in yet.
-- Safe to re-run.

ALTER TABLE time_doctor.user_extensions
  ADD COLUMN IF NOT EXISTS signed_in_at TIMESTAMPTZ;

COMMENT ON COLUMN time_doctor.user_extensions.signed_in_at IS
  'First Pulse sign-in or desktop sync. NULL means invite sent, never signed in.';

-- Anyone who has tracked time has used the app.
UPDATE time_doctor.user_extensions ext
SET signed_in_at = COALESCE(ext.last_activity, ext.created_at, NOW())
WHERE ext.signed_in_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM time_doctor.time_logs t
    WHERE t.user_id = ext.user_id
    LIMIT 1
  );

-- last_activity moves after the row is created when they use desktop / API.
UPDATE time_doctor.user_extensions ext
SET signed_in_at = ext.last_activity
WHERE ext.signed_in_at IS NULL
  AND ext.last_activity IS NOT NULL
  AND ext.created_at IS NOT NULL
  AND ext.last_activity > ext.created_at + interval '2 minutes';

-- Legacy roster (older than 2 days, no pause) — treat as already signed in
-- so existing employees do not all land in Invited.
UPDATE time_doctor.user_extensions ext
SET signed_in_at = COALESCE(ext.last_activity, ext.created_at, NOW())
WHERE ext.signed_in_at IS NULL
  AND ext.created_at IS NOT NULL
  AND ext.created_at < NOW() - interval '2 days';
