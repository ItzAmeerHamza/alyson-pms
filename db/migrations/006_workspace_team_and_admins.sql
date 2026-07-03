-- Revcloud workspace team setup
--
-- Adds 6 employees to tenant.* (user, account, profile, profile_workspace)
-- plus time_doctor.* (user_extensions, project assignment).
-- Also promotes Bill, Mohita, Hamza to Pulse admin.
--
-- Run in DBeaver against revclouddb.
--
-- Prerequisites:
--   Each email must exist in Cognito (us-west-2_ZL4ElZy4r) OR user signs up via Palisade.
--   On first login, cognito_sub links automatically in time_doctor.user_extensions.
--
-- Safe to re-run: skips existing tenant.user rows; upserts extensions and workspace membership.

BEGIN;

DO $$
DECLARE
  -- ===================== CONFIG =====================
  v_workspace_id   INTEGER := 511;   -- Revcloud workspace
  v_workspace_name TEXT    := 'Revcloud';

  v_admin_emails   TEXT[] := ARRAY[
    'hamza@cintara.ai',
    'mohita@cintara.ai',
    'bill@revcloud.com'
  ];

  v_default_project_name TEXT := 'Revcloud — Default Project';
  v_test_project_name    TEXT := 'Testing Alyson Time Doctor';
  v_bill_email           TEXT := 'bill@revcloud.com';

  -- 6 Revcloud employees (tenant.* + time_doctor.*)
  v_new_users      JSONB := '[
    {"first_name": "Vinit",  "last_name": "",          "email": "vinit@cintara.ai",       "phone": "+15555510601"},
    {"first_name": "Aryan",  "last_name": "",          "email": "aryan@cintara.ai",       "phone": "+15555510602"},
    {"first_name": "Omer",   "last_name": "",          "email": "omer@cintara.ai",        "phone": "+15555510603"},
    {"first_name": "Thirumalai", "last_name": "",      "email": "thirumalai@cintara.ai",  "phone": "+15555510604"},
    {"first_name": "Alyson", "last_name": "Client",    "email": "alysonclient@cintara.ai","phone": "+15555510605"},
    {"first_name": "Fawad",  "last_name": "",          "email": "fawad@cintara.ai",       "phone": "+15555510606"}
  ]'::jsonb;
  -- ==================================================

  v_default_project_id UUID;
  v_test_project_id    UUID;
  v_user_id        INTEGER;
  v_profile_id     INTEGER;
  v_account_id     INTEGER;
  v_profile_name   TEXT;
  v_first_name     TEXT;
  v_last_name      TEXT;
  v_email          TEXT;
  v_phone          TEXT;
  v_row            JSONB;
  v_promoted       INTEGER := 0;
  v_created        INTEGER := 0;
  v_linked         INTEGER := 0;
  v_assigned       INTEGER := 0;
  v_bill_moved     INTEGER := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM tenant.workspace w
    WHERE w.id = v_workspace_id
       OR lower(w.name) = lower(v_workspace_name)
  ) THEN
    RAISE EXCEPTION 'Workspace % (%) not found', v_workspace_id, v_workspace_name;
  END IF;

  INSERT INTO time_doctor.workspace_settings (workspace_id)
  VALUES (v_workspace_id)
  ON CONFLICT (workspace_id) DO NOTHING;

  SELECT p.id INTO v_default_project_id
  FROM time_doctor.projects p
  WHERE p.workspace_id = v_workspace_id
    AND lower(trim(p.name)) = lower(trim(v_default_project_name))
  LIMIT 1;

  IF v_default_project_id IS NULL THEN
    v_default_project_id := gen_random_uuid();
    INSERT INTO time_doctor.projects (id, workspace_id, name, description)
    VALUES (
      v_default_project_id,
      v_workspace_id,
      v_default_project_name,
      'Default Revcloud project for time tracking'
    );
    RAISE NOTICE 'Created project: %', v_default_project_name;
  END IF;

  -- Revcloud test project (exact name — separate from workspace 510 "Test Alyson Time Doctor")
  SELECT p.id INTO v_test_project_id
  FROM time_doctor.projects p
  WHERE p.workspace_id = v_workspace_id
    AND lower(trim(p.name)) = lower(trim(v_test_project_name))
  LIMIT 1;

  IF v_test_project_id IS NULL THEN
    v_test_project_id := gen_random_uuid();
    INSERT INTO time_doctor.projects (id, workspace_id, name, description)
    VALUES (
      v_test_project_id,
      v_workspace_id,
      v_test_project_name,
      'Testing project for Alyson Time Doctor desktop agent (Revcloud)'
    );
    RAISE NOTICE 'Created project: %', v_test_project_name;
  END IF;

  -- Move Bill (and ensure all admins) into Revcloud workspace 511 — tenant.* + time_doctor.*
  FOREACH v_email IN ARRAY v_admin_emails
  LOOP
    v_email := lower(trim(v_email));

    SELECT u.id INTO v_user_id
    FROM tenant."user" u
    WHERE lower(u.email) = v_email;

    IF v_user_id IS NULL AND v_email = lower(v_bill_email) THEN
      INSERT INTO tenant."user" (first_name, last_name, phone_number, email, active)
      VALUES ('Bill', 'Revcloud', '+15555510510', v_email, true)
      RETURNING id INTO v_user_id;
      v_created := v_created + 1;
      RAISE NOTICE 'Created tenant.user for Bill id=%', v_user_id;
    END IF;

    IF v_user_id IS NULL THEN
      RAISE NOTICE 'Admin % not found in tenant.user — skipping workspace link', v_email;
      CONTINUE;
    END IF;

    v_first_name := split_part(v_email, '@', 1);
    v_profile_name := initcap(v_first_name);

    SELECT a.id INTO v_account_id
    FROM tenant.account a
    WHERE a.user_id = v_user_id
    LIMIT 1;

    IF v_account_id IS NULL THEN
      INSERT INTO tenant.account (name, user_id, contact_name, contact_email, active)
      VALUES ('default', v_user_id, v_profile_name, v_email, true)
      RETURNING id INTO v_account_id;
    END IF;

    SELECT p.id INTO v_profile_id
    FROM tenant.profile p
    WHERE p.user_id = v_user_id AND p.profile_type = 'buyer'
    LIMIT 1;

    IF v_profile_id IS NULL THEN
      INSERT INTO tenant.profile (name, user_id, profile_type, email, active)
      VALUES (v_profile_name, v_user_id, 'buyer', v_email, true)
      RETURNING id INTO v_profile_id;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM tenant.profile_workspace pw
      WHERE pw.profile_id = v_profile_id
        AND pw.workspace_id = v_workspace_id
    ) THEN
      INSERT INTO tenant.profile_workspace (
        profile_id, workspace_id, account_role, workspace_role, active
      )
      VALUES (v_profile_id, v_workspace_id, 'owner', 'admin', true);
      v_linked := v_linked + 1;
      IF v_email = lower(v_bill_email) THEN
        v_bill_moved := 1;
        RAISE NOTICE 'Bill linked to Revcloud workspace %', v_workspace_id;
      END IF;
    END IF;

    INSERT INTO time_doctor.user_extensions (user_id, workspace_id, pulse_role)
    VALUES (v_user_id, v_workspace_id, 'admin')
    ON CONFLICT (user_id) DO UPDATE SET
      workspace_id = v_workspace_id,
      pulse_role = 'admin',
      updated_at = NOW();

    IF v_email = lower(v_bill_email) THEN
      v_bill_moved := 1;
    END IF;

    INSERT INTO time_doctor.employee_project_assignments (user_id, project_id)
    VALUES
      (v_user_id, v_default_project_id),
      (v_user_id, v_test_project_id)
    ON CONFLICT (user_id, project_id) DO NOTHING;
  END LOOP;

  v_promoted := coalesce(array_length(v_admin_emails, 1), 0);

  -- Backfill extensions for existing Palisade users already in this workspace
  INSERT INTO time_doctor.user_extensions (user_id, workspace_id, pulse_role)
  SELECT u.id, v_workspace_id,
         CASE WHEN lower(u.email) = ANY (SELECT lower(e) FROM unnest(v_admin_emails) AS e)
              THEN 'admin' ELSE 'employee' END
  FROM tenant."user" u
  LEFT JOIN time_doctor.user_extensions ext ON ext.user_id = u.id
  JOIN tenant.profile p ON p.user_id = u.id AND p.profile_type = 'buyer'
  JOIN tenant.profile_workspace pw ON pw.profile_id = p.id
    AND pw.workspace_id = v_workspace_id
    AND coalesce(pw.active, true)
  WHERE ext.user_id IS NULL
  ON CONFLICT (user_id) DO NOTHING;

  -- Add each Revcloud employee
  FOR v_row IN SELECT * FROM jsonb_array_elements(v_new_users)
  LOOP
    v_email      := lower(trim(v_row->>'email'));
    v_first_name := coalesce(v_row->>'first_name', initcap(split_part(v_email, '@', 1)));
    v_last_name  := coalesce(v_row->>'last_name', '');
    v_phone      := coalesce(v_row->>'phone', '+15555550000');
    v_profile_name := trim(v_first_name || ' ' || v_last_name);

    IF v_email IS NULL OR v_email = '' THEN
      CONTINUE;
    END IF;

    SELECT u.id INTO v_user_id
    FROM tenant."user" u
    WHERE lower(u.email) = v_email;

    -- tenant.user
    IF v_user_id IS NULL THEN
      INSERT INTO tenant."user" (first_name, last_name, phone_number, email, active)
      VALUES (v_first_name, v_last_name, v_phone, v_email, true)
      RETURNING id INTO v_user_id;
      v_created := v_created + 1;
      RAISE NOTICE 'Created tenant.user id=% email=%', v_user_id, v_email;
    END IF;

    -- tenant.account (required for Palisade auth flows)
    SELECT a.id INTO v_account_id
    FROM tenant.account a
    WHERE a.user_id = v_user_id
    LIMIT 1;

    IF v_account_id IS NULL THEN
      INSERT INTO tenant.account (name, user_id, contact_name, contact_email, active)
      VALUES ('default', v_user_id, v_first_name, v_email, true)
      RETURNING id INTO v_account_id;
      RAISE NOTICE 'Created tenant.account id=% for user=%', v_account_id, v_email;
    END IF;

    -- tenant.profile (buyer)
    SELECT p.id INTO v_profile_id
    FROM tenant.profile p
    WHERE p.user_id = v_user_id AND p.profile_type = 'buyer'
    LIMIT 1;

    IF v_profile_id IS NULL THEN
      INSERT INTO tenant.profile (name, user_id, profile_type, email, active)
      VALUES (v_profile_name, v_user_id, 'buyer', v_email, true)
      RETURNING id INTO v_profile_id;
      RAISE NOTICE 'Created tenant.profile (buyer) id=% for user=%', v_profile_id, v_email;
    END IF;

    -- tenant.profile_workspace (Revcloud membership)
    IF NOT EXISTS (
      SELECT 1 FROM tenant.profile_workspace pw
      WHERE pw.profile_id = v_profile_id
        AND pw.workspace_id = v_workspace_id
    ) THEN
      INSERT INTO tenant.profile_workspace (
        profile_id, workspace_id, account_role, workspace_role, active
      )
      VALUES (v_profile_id, v_workspace_id, 'buyer', 'member', true);
      v_linked := v_linked + 1;
      RAISE NOTICE 'Linked % to Revcloud workspace %', v_email, v_workspace_id;
    END IF;

    -- time_doctor.user_extensions
    INSERT INTO time_doctor.user_extensions (user_id, workspace_id, pulse_role)
    VALUES (v_user_id, v_workspace_id, 'employee')
    ON CONFLICT (user_id) DO UPDATE SET
      workspace_id = EXCLUDED.workspace_id,
      updated_at = NOW();

    -- time_doctor project assignments (desktop agent — both projects)
    INSERT INTO time_doctor.employee_project_assignments (user_id, project_id)
    VALUES
      (v_user_id, v_default_project_id),
      (v_user_id, v_test_project_id)
    ON CONFLICT (user_id, project_id) DO NOTHING;

    v_assigned := v_assigned + 1;
  END LOOP;

  RAISE NOTICE 'Complete. workspace=%, admins=%, bill_on_511=%, new_users=%,
    workspace_links_added=%, users_processed=%, projects=[%, %]',
    v_workspace_id, v_promoted, v_bill_moved, v_created, v_linked, v_assigned,
    v_default_project_name, v_test_project_name;
END $$;

COMMIT;

-- Verify the 6 Revcloud employees
SELECT
  u.id AS tenant_user_id,
  u.email,
  u.first_name,
  u.last_name,
  a.id AS account_id,
  p.id AS buyer_profile_id,
  pw.workspace_id,
  pw.account_role,
  pw.workspace_role,
  ext.pulse_role,
  ext.cognito_sub,
  (
    SELECT count(*)::int
    FROM time_doctor.employee_project_assignments epa
    WHERE epa.user_id = u.id
  ) AS project_count,
  (
    SELECT string_agg(p.name, ', ' ORDER BY p.name)
    FROM time_doctor.employee_project_assignments epa
    JOIN time_doctor.projects p ON p.id = epa.project_id
    WHERE epa.user_id = u.id
  ) AS assigned_projects
FROM tenant."user" u
LEFT JOIN tenant.account a ON a.user_id = u.id
LEFT JOIN tenant.profile p ON p.user_id = u.id AND p.profile_type = 'buyer'
LEFT JOIN tenant.profile_workspace pw ON pw.profile_id = p.id AND pw.workspace_id = 511
LEFT JOIN time_doctor.user_extensions ext ON ext.user_id = u.id
WHERE lower(u.email) IN (
  'vinit@cintara.ai',
  'aryan@cintara.ai',
  'omer@cintara.ai',
  'thirumalai@cintara.ai',
  'alysonclient@cintara.ai',
  'fawad@cintara.ai'
)
ORDER BY u.email;

-- Verify admins (workspace 511 + 2 projects each)
SELECT
  u.id,
  u.email,
  ext.pulse_role,
  ext.workspace_id,
  pw.workspace_id AS profile_workspace_id,
  (
    SELECT count(*)::int
    FROM time_doctor.employee_project_assignments epa
    JOIN time_doctor.projects p ON p.id = epa.project_id
    WHERE epa.user_id = u.id AND p.workspace_id = 511
  ) AS revcloud_project_count,
  (
    SELECT string_agg(p.name, ', ' ORDER BY p.name)
    FROM time_doctor.employee_project_assignments epa
    JOIN time_doctor.projects p ON p.id = epa.project_id
    WHERE epa.user_id = u.id AND p.workspace_id = 511
  ) AS revcloud_projects
FROM tenant."user" u
JOIN time_doctor.user_extensions ext ON ext.user_id = u.id
LEFT JOIN tenant.profile pr ON pr.user_id = u.id AND pr.profile_type = 'buyer'
LEFT JOIN tenant.profile_workspace pw ON pw.profile_id = pr.id AND pw.workspace_id = 511
WHERE lower(u.email) IN ('hamza@cintara.ai', 'mohita@cintara.ai', 'bill@revcloud.com')
ORDER BY u.email;

-- Verify Revcloud projects in workspace 511
SELECT p.id, p.name, p.description,
       (SELECT count(*) FROM time_doctor.employee_project_assignments epa WHERE epa.project_id = p.id) AS assigned_users
FROM time_doctor.projects p
WHERE p.workspace_id = 511
ORDER BY p.name;
