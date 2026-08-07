-- Fix Palisade "Please complete the registration first." for seeded admins.
--
-- Root cause:
--   Cognito user can exist (CONFIRMED) while tenant.user / account / profile
--   rows are missing. Palisade /signin looks up tenant.user by email and
--   returns that error when the row is absent.
--
-- Migration 006 only creates missing tenant.user for bill@revcloud.com.
-- hamza@ / mohita@ were skipped if they were not already in tenant.user.
--
-- Run in DBeaver against revclouddb. Safe to re-run (idempotent).

BEGIN;

DO $$
DECLARE
  v_workspace_id INTEGER := 511; -- Revcloud
  v_email        TEXT;
  v_first_name   TEXT;
  v_last_name    TEXT;
  v_cognito_sub  TEXT;
  v_user_id      INTEGER;
  v_account_id   INTEGER;
  v_buyer_id     INTEGER;
  v_seller_id    INTEGER;
  v_row          RECORD;
BEGIN
  -- Cognito subs from us-west-2_ZL4ElZy4r (update if recreated)
  FOR v_row IN
    SELECT * FROM (VALUES
      ('hamza@cintara.ai',  'Hamza',  'Ameer', '38b143b0-e0f1-70c1-ff32-8a236ea2bd10'),
      ('mohita@cintara.ai', 'Mohita', 'Yadav', NULL::text)
    ) AS t(email, first_name, last_name, cognito_sub)
  LOOP
    v_email := lower(trim(v_row.email));
    v_first_name := v_row.first_name;
    v_last_name := v_row.last_name;
    v_cognito_sub := v_row.cognito_sub;

    SELECT u.id INTO v_user_id
    FROM tenant."user" u
    WHERE lower(u.email) = v_email
    LIMIT 1;

    IF v_user_id IS NULL THEN
      INSERT INTO tenant."user" (first_name, last_name, phone_number, email, active)
      VALUES (v_first_name, v_last_name, '', v_email, true)
      RETURNING id INTO v_user_id;
      RAISE NOTICE 'Created tenant.user id=% email=%', v_user_id, v_email;
    ELSE
      RAISE NOTICE 'tenant.user already exists id=% email=%', v_user_id, v_email;
    END IF;

    -- account (required by Palisade signin)
    SELECT a.id INTO v_account_id
    FROM tenant.account a
    WHERE a.user_id = v_user_id
    LIMIT 1;

    IF v_account_id IS NULL THEN
      INSERT INTO tenant.account (name, user_id, contact_name, contact_email, active)
      VALUES ('default', v_user_id, v_first_name, v_email, true)
      RETURNING id INTO v_account_id;
      RAISE NOTICE 'Created tenant.account id=% for %', v_account_id, v_email;
    END IF;

    -- buyer + seller profiles (same shape as Palisade signup)
    SELECT p.id INTO v_buyer_id
    FROM tenant.profile p
    WHERE p.user_id = v_user_id AND p.profile_type = 'buyer'
    LIMIT 1;

    IF v_buyer_id IS NULL THEN
      INSERT INTO tenant.profile (name, user_id, profile_type, email, active)
      VALUES (v_first_name, v_user_id, 'buyer', v_email, true)
      RETURNING id INTO v_buyer_id;
      RAISE NOTICE 'Created buyer profile id=% for %', v_buyer_id, v_email;
    END IF;

    SELECT p.id INTO v_seller_id
    FROM tenant.profile p
    WHERE p.user_id = v_user_id AND p.profile_type = 'seller'
    LIMIT 1;

    IF v_seller_id IS NULL THEN
      INSERT INTO tenant.profile (name, user_id, profile_type, email, active)
      VALUES (v_first_name, v_user_id, 'seller', v_email, true)
      RETURNING id INTO v_seller_id;
      RAISE NOTICE 'Created seller profile id=% for %', v_seller_id, v_email;
    END IF;

    -- workspace membership
    IF NOT EXISTS (
      SELECT 1 FROM tenant.profile_workspace pw
      WHERE pw.profile_id = v_buyer_id AND pw.workspace_id = v_workspace_id
    ) THEN
      INSERT INTO tenant.profile_workspace (
        profile_id, workspace_id, account_role, workspace_role, active
      )
      VALUES (v_buyer_id, v_workspace_id, 'owner', 'admin', true);
      RAISE NOTICE 'Linked buyer % to workspace %', v_email, v_workspace_id;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM tenant.profile_workspace pw
      WHERE pw.profile_id = v_seller_id AND pw.workspace_id = v_workspace_id
    ) THEN
      INSERT INTO tenant.profile_workspace (
        profile_id, workspace_id, account_role, workspace_role, active
      )
      VALUES (v_seller_id, v_workspace_id, 'seller', 'admin', true);
      RAISE NOTICE 'Linked seller % to workspace %', v_email, v_workspace_id;
    END IF;

    -- Pulse extension + cognito_sub (auto-link also happens on first Pulse API call)
    INSERT INTO time_doctor.user_extensions (user_id, workspace_id, cognito_sub, pulse_role)
    VALUES (v_user_id, v_workspace_id, v_cognito_sub, 'admin')
    ON CONFLICT (user_id) DO UPDATE SET
      workspace_id = EXCLUDED.workspace_id,
      pulse_role = 'admin',
      cognito_sub = COALESCE(EXCLUDED.cognito_sub, time_doctor.user_extensions.cognito_sub),
      updated_at = NOW();
  END LOOP;
END $$;

COMMIT;

-- Verify
SELECT
  u.id,
  u.email,
  (SELECT count(*) FROM tenant.account a WHERE a.user_id = u.id) AS accounts,
  (SELECT count(*) FROM tenant.profile p WHERE p.user_id = u.id) AS profiles,
  (SELECT count(*) FROM tenant.profile_workspace pw
     JOIN tenant.profile p ON p.id = pw.profile_id
    WHERE p.user_id = u.id) AS workspace_links,
  ext.workspace_id,
  ext.pulse_role,
  ext.cognito_sub
FROM tenant."user" u
LEFT JOIN time_doctor.user_extensions ext ON ext.user_id = u.id
WHERE lower(u.email) IN ('hamza@cintara.ai', 'mohita@cintara.ai', 'w@alyson.ai')
ORDER BY u.email;
