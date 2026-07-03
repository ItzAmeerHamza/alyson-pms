-- Seed test project for desktop agent (workspace 510, Bill / bill@revcloud.com)
-- Run in DBeaver on revclouddb after 002_time_doctor_schema.sql
--
-- Bill's tenant.user id (adjust if different):
--   SELECT u.id FROM tenant."user" u WHERE lower(u.email) = 'bill@revcloud.com';

BEGIN;

DO $$
DECLARE
  v_project_id   UUID := 'a1111111-1111-4111-a111-111111111111';
  v_workspace_id INTEGER := 510;
  v_user_id      INTEGER;
  v_user_email   TEXT := 'bill@revcloud.com';
BEGIN
  SELECT u.id INTO v_user_id
  FROM tenant."user" u
  WHERE lower(u.email) = lower(v_user_email);

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User % not found in tenant.user', v_user_email;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM tenant.workspace WHERE id = v_workspace_id) THEN
    RAISE EXCEPTION 'Workspace % not found', v_workspace_id;
  END IF;

  INSERT INTO time_doctor.projects (id, workspace_id, name, description)
  VALUES (
    v_project_id,
    v_workspace_id,
    'Test Alyson Time Doctor',
    'Seed project for desktop agent time tracking'
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    workspace_id = EXCLUDED.workspace_id,
    updated_at = NOW();

  INSERT INTO time_doctor.employee_project_assignments (user_id, project_id)
  VALUES (v_user_id, v_project_id)
  ON CONFLICT (user_id, project_id) DO NOTHING;

  RAISE NOTICE 'Project seeded for user_id=% project_id=%', v_user_id, v_project_id;
END $$;

COMMIT;

-- Verify
SELECT p.id, p.name, p.workspace_id, epa.user_id, u.email
FROM time_doctor.projects p
JOIN time_doctor.employee_project_assignments epa ON epa.project_id = p.id
JOIN tenant."user" u ON u.id = epa.user_id
WHERE p.name = 'Test Alyson Time Doctor';
