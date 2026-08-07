-- Bootstrap ONE production workspace for Alyson Pulse.
--
-- BEFORE RUNNING: set the three variables in the DO block below.
--   v_workspace_id  — prod tenant.workspace.id (NOT QA 511 unless prod really uses 511)
--   v_admin_email   — existing Palisade user who should be Pulse admin
--   v_project_name  — default project for desktop tracking
--
-- Does NOT copy QA tracking data. Safe to re-run (idempotent).

BEGIN;

DO $$
DECLARE
  -- ===================== EDIT THESE =====================
  v_workspace_id INTEGER := NULL;              -- e.g. 123
  v_admin_email  TEXT    := 'admin@example.com';
  v_project_name TEXT    := 'Default Project';
  -- ======================================================

  v_user_id     INTEGER;
  v_project_id  UUID;
  v_ws_name     TEXT;
BEGIN
  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Set v_workspace_id to your production tenant.workspace.id before running';
  END IF;

  SELECT w.name INTO v_ws_name
  FROM tenant.workspace w
  WHERE w.id = v_workspace_id;

  IF v_ws_name IS NULL THEN
    RAISE EXCEPTION 'Workspace id % not found in tenant.workspace', v_workspace_id;
  END IF;

  -- 1) Workspace Pulse settings (hours / activity / screenshot interval)
  INSERT INTO time_doctor.workspace_settings (workspace_id)
  VALUES (v_workspace_id)
  ON CONFLICT (workspace_id) DO NOTHING;

  RAISE NOTICE 'workspace_settings ready for % (%)', v_workspace_id, v_ws_name;

  -- 2) Admin must already exist in tenant.user (Palisade registration)
  SELECT u.id INTO v_user_id
  FROM tenant."user" u
  WHERE lower(u.email) = lower(trim(v_admin_email))
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION
      'Admin % not found in tenant.user on THIS database. Log into Palisade once or run an adapted 012 fix first.',
      v_admin_email;
  END IF;

  -- Ensure admin has workspace membership (buyer profile)
  IF NOT EXISTS (
    SELECT 1
    FROM tenant.profile p
    JOIN tenant.profile_workspace pw ON pw.profile_id = p.id
    WHERE p.user_id = v_user_id
      AND pw.workspace_id = v_workspace_id
      AND coalesce(pw.active, true)
  ) THEN
    RAISE EXCEPTION
      'Admin % has no active profile_workspace for workspace %. Link them in Palisade first.',
      v_admin_email, v_workspace_id;
  END IF;

  -- 3) Pulse extension + admin role (cognito_sub filled on first API login if null)
  INSERT INTO time_doctor.user_extensions (user_id, workspace_id, pulse_role)
  VALUES (v_user_id, v_workspace_id, 'admin')
  ON CONFLICT (user_id) DO UPDATE SET
    workspace_id = EXCLUDED.workspace_id,
    pulse_role = 'admin',
    updated_at = NOW();

  RAISE NOTICE 'Pulse admin: % (user_id=%)', v_admin_email, v_user_id;

  -- 4) Default project
  SELECT p.id INTO v_project_id
  FROM time_doctor.projects p
  WHERE p.workspace_id = v_workspace_id
    AND lower(trim(p.name)) = lower(trim(v_project_name))
  LIMIT 1;

  IF v_project_id IS NULL THEN
    v_project_id := gen_random_uuid();
    INSERT INTO time_doctor.projects (id, workspace_id, name, description)
    VALUES (
      v_project_id,
      v_workspace_id,
      v_project_name,
      'Default project for Alyson Pulse time tracking'
    );
    RAISE NOTICE 'Created project % (%)', v_project_name, v_project_id;
  END IF;

  INSERT INTO time_doctor.employee_project_assignments (user_id, project_id)
  VALUES (v_user_id, v_project_id)
  ON CONFLICT (user_id, project_id) DO NOTHING;

  -- 5) Optional: backfill extensions for OTHER users already in this workspace
  INSERT INTO time_doctor.user_extensions (user_id, workspace_id, pulse_role)
  SELECT DISTINCT ON (u.id)
    u.id,
    v_workspace_id,
    'employee'
  FROM tenant."user" u
  JOIN tenant.profile p ON p.user_id = u.id AND p.profile_type = 'buyer'
  JOIN tenant.profile_workspace pw ON pw.profile_id = p.id
    AND pw.workspace_id = v_workspace_id
    AND coalesce(pw.active, true)
  LEFT JOIN time_doctor.user_extensions ext ON ext.user_id = u.id
  WHERE ext.user_id IS NULL
    AND u.id <> v_user_id
  ORDER BY u.id
  ON CONFLICT (user_id) DO NOTHING;

  RAISE NOTICE 'Bootstrap complete for workspace %', v_workspace_id;
END $$;

COMMIT;

-- Quick peek (edit workspace filter if needed)
SELECT w.id AS workspace_id, w.name, ws.settings
FROM tenant.workspace w
LEFT JOIN time_doctor.workspace_settings ws ON ws.workspace_id = w.id
WHERE ws.workspace_id IS NOT NULL
ORDER BY w.id
LIMIT 20;

SELECT u.email, ext.pulse_role, ext.workspace_id, ext.cognito_sub IS NOT NULL AS has_cognito_sub
FROM time_doctor.user_extensions ext
JOIN tenant."user" u ON u.id = ext.user_id
WHERE ext.pulse_role = 'admin'
ORDER BY u.email;
