-- Link an existing Palisade tenant.user into Alyson Pulse without Cognito re-invite.
-- Target: vinit@cintara.ai (tenant.user id 1194)
-- Manager: omer@cintara.ai
-- Projects: Data Engineering, Testing Alyson Time Doctor, Default Project
--
-- Safe to re-run (idempotent). Run as a role that can write tenant.* + time_doctor.*.
-- cognito_sub is left null if unknown — /auth/me auto-links it on first successful Pulse login.

BEGIN;

DO $$
DECLARE
  v_email          TEXT := 'vinit@cintara.ai';
  v_manager_email  TEXT := 'omer@cintara.ai';
  v_user_id        INTEGER;
  v_manager_id     INTEGER;
  v_workspace_id   INTEGER;
  v_buyer_id       INTEGER;
  v_account_id     INTEGER;
  v_project_id     UUID;
  v_project_name   TEXT;
BEGIN
  SELECT u.id INTO v_user_id
  FROM tenant."user" u
  WHERE lower(u.email) = lower(v_email)
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User % not found in tenant.user', v_email;
  END IF;

  SELECT u.id INTO v_manager_id
  FROM tenant."user" u
  WHERE lower(u.email) = lower(v_manager_email)
  LIMIT 1;

  IF v_manager_id IS NULL THEN
    RAISE EXCEPTION 'Manager % not found in tenant.user', v_manager_email;
  END IF;

  -- Prefer manager's Pulse workspace, else their active profile_workspace
  SELECT ext.workspace_id INTO v_workspace_id
  FROM time_doctor.user_extensions ext
  WHERE ext.user_id = v_manager_id
    AND ext.workspace_id IS NOT NULL
  LIMIT 1;

  IF v_workspace_id IS NULL THEN
    SELECT pw.workspace_id INTO v_workspace_id
    FROM tenant.profile p
    JOIN tenant.profile_workspace pw ON pw.profile_id = p.id
    WHERE p.user_id = v_manager_id
      AND coalesce(pw.active, true)
    ORDER BY pw.id
    LIMIT 1;
  END IF;

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Could not resolve workspace_id from manager %', v_manager_email;
  END IF;

  -- account (Palisade sign-in)
  SELECT a.id INTO v_account_id
  FROM tenant.account a
  WHERE a.user_id = v_user_id
  LIMIT 1;

  IF v_account_id IS NULL THEN
    INSERT INTO tenant.account (name, user_id, contact_name, contact_email, active)
    VALUES ('default', v_user_id, 'Vinit', v_email, true)
    RETURNING id INTO v_account_id;
  END IF;

  -- buyer profile
  SELECT p.id INTO v_buyer_id
  FROM tenant.profile p
  WHERE p.user_id = v_user_id AND p.profile_type = 'buyer'
  LIMIT 1;

  IF v_buyer_id IS NULL THEN
    INSERT INTO tenant.profile (name, user_id, profile_type, email, active)
    VALUES ('Vinit Solanki', v_user_id, 'buyer', v_email, true)
    RETURNING id INTO v_buyer_id;
  END IF;

  -- workspace membership
  IF NOT EXISTS (
    SELECT 1
    FROM tenant.profile_workspace pw
    WHERE pw.profile_id = v_buyer_id
      AND pw.workspace_id = v_workspace_id
  ) THEN
    INSERT INTO tenant.profile_workspace
      (profile_id, workspace_id, account_role, workspace_role, active)
    VALUES (v_buyer_id, v_workspace_id, 'buyer', 'member', true);
  END IF;

  -- Pulse extension: employee + manager
  INSERT INTO time_doctor.user_extensions
    (user_id, workspace_id, pulse_role, manager_id, created_at, updated_at)
  VALUES (v_user_id, v_workspace_id, 'employee', v_manager_id, NOW(), NOW())
  ON CONFLICT (user_id) DO UPDATE SET
    workspace_id = EXCLUDED.workspace_id,
    pulse_role = 'employee',
    manager_id = EXCLUDED.manager_id,
    updated_at = NOW();

  -- Project assignments (name match, case-insensitive; tolerate "Default Prtoject" typo)
  FOREACH v_project_name IN ARRAY ARRAY[
    'Data Engineering',
    'Testing Alyson Time Doctor',
    'Default Project'
  ]
  LOOP
    SELECT p.id INTO v_project_id
    FROM time_doctor.projects p
    WHERE p.workspace_id = v_workspace_id
      AND (
        lower(trim(p.name)) = lower(trim(v_project_name))
        OR (
          lower(v_project_name) = 'default project'
          AND lower(trim(p.name)) IN ('default project', 'default prtoject')
        )
      )
    LIMIT 1;

    IF v_project_id IS NULL THEN
      RAISE NOTICE 'Project "%" not found in workspace % — skipped', v_project_name, v_workspace_id;
    ELSE
      INSERT INTO time_doctor.employee_project_assignments (user_id, project_id, created_at)
      VALUES (v_user_id, v_project_id, NOW())
      ON CONFLICT (user_id, project_id) DO NOTHING;
      RAISE NOTICE 'Assigned project "%" (%)', v_project_name, v_project_id;
    END IF;
  END LOOP;

  RAISE NOTICE 'Linked % (user_id=%) workspace=% manager=% (%)',
    v_email, v_user_id, v_workspace_id, v_manager_email, v_manager_id;
END $$;

COMMIT;

-- Verify
SELECT
  u.id,
  u.email,
  ext.workspace_id,
  ext.pulse_role,
  ext.manager_id,
  m.email AS manager_email,
  ext.cognito_sub IS NOT NULL AS has_cognito_sub,
  (
    SELECT count(*) FROM tenant.profile_workspace pw
    JOIN tenant.profile p ON p.id = pw.profile_id
    WHERE p.user_id = u.id AND pw.workspace_id = ext.workspace_id
  ) AS workspace_links,
  (
    SELECT string_agg(p.name, ', ' ORDER BY p.name)
    FROM time_doctor.employee_project_assignments a
    JOIN time_doctor.projects p ON p.id = a.project_id
    WHERE a.user_id = u.id
  ) AS projects
FROM tenant."user" u
JOIN time_doctor.user_extensions ext ON ext.user_id = u.id
LEFT JOIN tenant."user" m ON m.id = ext.manager_id
WHERE lower(u.email) = 'vinit@cintara.ai';
