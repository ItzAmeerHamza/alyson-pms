-- Backfill time_doctor.user_extensions for EXISTING Palisade users
--
-- Who this is for:
--   Users who already have full tenant.* data (account, profile, profile_workspace)
--   and could log into Palisade BEFORE Time Doctor schema existed.
--
-- Who this is NOT for:
--   Users you only inserted into tenant.user (e.g. bill@revcloud.com with no account).
--   Those need: scripts/backfill-tenant-user-bill.sql first (tenant tables).
--
-- What it does:
--   Creates time_doctor.user_extensions rows from existing profile_workspace membership.
--   Does NOT modify tenant.user, tenant.account, tenant.profile, etc.
--
-- Safe to re-run (ON CONFLICT DO NOTHING / COALESCE updates).

BEGIN;

-- Preview: Palisade users missing Time Doctor extension
SELECT
  u.id,
  u.email,
  a.id AS account_id,
  count(DISTINCT p.id) AS profile_count,
  count(DISTINCT pw.workspace_id) AS workspace_count
FROM tenant."user" u
LEFT JOIN tenant.account a ON a.user_id = u.id
LEFT JOIN tenant.profile p ON p.user_id = u.id
LEFT JOIN tenant.profile_workspace pw ON pw.profile_id = p.id AND coalesce(pw.active, true)
LEFT JOIN time_doctor.user_extensions ext ON ext.user_id = u.id
WHERE ext.user_id IS NULL
  AND a.id IS NOT NULL          -- has Palisade account (real legacy user)
  AND pw.workspace_id IS NOT NULL
GROUP BY u.id, u.email, a.id
ORDER BY u.id
LIMIT 100;

-- Insert extension for each legacy user (first active workspace from profile_workspace)
INSERT INTO time_doctor.user_extensions (user_id, workspace_id, pulse_role)
SELECT DISTINCT ON (u.id)
  u.id,
  pw.workspace_id,
  'employee'   -- default; promote admins manually if needed
FROM tenant."user" u
JOIN tenant.account a ON a.user_id = u.id
JOIN tenant.profile p ON p.user_id = u.id
JOIN tenant.profile_workspace pw ON pw.profile_id = p.id AND coalesce(pw.active, true)
LEFT JOIN time_doctor.user_extensions ext ON ext.user_id = u.id
WHERE ext.user_id IS NULL
ORDER BY u.id, pw.id;

-- Workspace settings (one row per workspace that has Time Doctor users)
INSERT INTO time_doctor.workspace_settings (workspace_id)
SELECT DISTINCT ext.workspace_id
FROM time_doctor.user_extensions ext
WHERE ext.workspace_id IS NOT NULL
ON CONFLICT (workspace_id) DO NOTHING;

COMMIT;

-- Verify
SELECT
  u.id,
  u.email,
  ext.workspace_id,
  ext.pulse_role,
  ext.cognito_sub,
  w.name AS workspace_name
FROM tenant."user" u
JOIN tenant.account a ON a.user_id = u.id
LEFT JOIN time_doctor.user_extensions ext ON ext.user_id = u.id
LEFT JOIN tenant.workspace w ON w.id = ext.workspace_id
ORDER BY u.id
LIMIT 50;
