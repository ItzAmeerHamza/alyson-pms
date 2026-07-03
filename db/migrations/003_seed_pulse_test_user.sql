-- Seed one Pulse / Time Doctor test user on revclouddb
--
-- BEFORE RUNNING — edit the values in the CONFIG block below.
-- STEP 0 (optional): pick a workspace
--   SELECT id, name, account_id FROM tenant.workspace ORDER BY id LIMIT 20;
--
-- This script WRITES to tenant.* (shared Palisade tables) + time_doctor.*
-- Run once per test user. Change email/phone if you get a unique violation.
--
-- Auth: Cognito only — do NOT set tenant.user.password. On first API login,
-- cognito_sub is stored in time_doctor.user_extensions (after backend remap).

BEGIN;

DO $$
DECLARE
  -- ===================== CONFIG — EDIT THESE =====================
  v_workspace_id   INTEGER := 510;
  v_first_name     TEXT    := 'Bill';
  v_last_name      TEXT    := 'Revcloud';
  v_phone_number   TEXT    := '+15555510510';              -- required NOT NULL on tenant.user
  v_email          TEXT    := 'bill@revcloud.com';         -- must match Cognito login email
  v_pulse_role     TEXT    := 'admin';
  -- ===============================================================
  v_user_id        INTEGER;
  v_profile_id     INTEGER;
  v_profile_name   TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tenant.workspace WHERE id = v_workspace_id) THEN
    RAISE EXCEPTION 'workspace_id % does not exist — run SELECT id, name FROM tenant.workspace', v_workspace_id;
  END IF;

  IF EXISTS (SELECT 1 FROM tenant."user" WHERE lower(email) = lower(v_email)) THEN
    RAISE EXCEPTION 'email % already exists in tenant.user — use a different email or seed from existing id', v_email;
  END IF;

  v_profile_name := trim(v_first_name || ' ' || v_last_name);

  INSERT INTO tenant."user" (
    first_name,
    last_name,
    phone_number,
    email,
    active
  )
  VALUES (
    v_first_name,
    v_last_name,
    v_phone_number,
    lower(v_email),
    true
  )
  RETURNING id INTO v_user_id;

  INSERT INTO tenant.profile (
    name,
    user_id,
    profile_type,
    email,
    active
  )
  VALUES (
    v_profile_name,
    v_user_id,
    'buyer',
    lower(v_email),
    true
  )
  RETURNING id INTO v_profile_id;

  INSERT INTO tenant.profile_workspace (
    profile_id,
    workspace_id,
    account_role,
    workspace_role,
    active
  )
  VALUES (
    v_profile_id,
    v_workspace_id,
    'owner',
    'admin',
    true
  );

  INSERT INTO time_doctor.user_extensions (
    user_id,
    workspace_id,
    pulse_role
  )
  VALUES (
    v_user_id,
    v_workspace_id,
    v_pulse_role
  );

  INSERT INTO time_doctor.workspace_settings (workspace_id)
  VALUES (v_workspace_id)
  ON CONFLICT (workspace_id) DO NOTHING;

  RAISE NOTICE 'Done. tenant.user.id = %, workspace_id = %, email = %',
    v_user_id, v_workspace_id, lower(v_email);
END $$;

COMMIT;

-- Verify
SELECT
  u.id AS tenant_user_id,
  u.email,
  u.first_name,
  u.last_name,
  ext.workspace_id,
  ext.pulse_role,
  ext.cognito_sub,
  w.name AS workspace_name
FROM tenant."user" u
JOIN time_doctor.user_extensions ext ON ext.user_id = u.id
JOIN tenant.workspace w ON w.id = ext.workspace_id
WHERE lower(u.email) = lower('bill@revcloud.com');
