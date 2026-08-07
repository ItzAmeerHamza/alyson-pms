-- Production cutover verification.
-- Run after apply_schema.sh + 02_bootstrap_workspace.sql
-- Replace :ws with your prod workspace id, or use the SET below.

\set ON_ERROR_STOP on

-- Optional: set once per session
-- \set ws 123

\echo '=== 1) time_doctor tables ==='
SELECT tablename
FROM pg_tables
WHERE schemaname = 'time_doctor'
ORDER BY 1;

\echo '=== 2) Expected core tables present ==='
SELECT t AS missing_table
FROM unnest(ARRAY[
  'user_extensions',
  'workspace_settings',
  'projects',
  'employee_project_assignments',
  'time_logs',
  'screenshots',
  'app_logs',
  'app_url_activity',
  'idle_logs',
  'low_hours_email_log',
  'access_grants',
  'access_grant_targets'
]) AS t
WHERE NOT EXISTS (
  SELECT 1 FROM pg_tables
  WHERE schemaname = 'time_doctor' AND tablename = t
);

\echo '=== 3) AI + email period columns ==='
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'time_doctor'
  AND table_name = 'screenshots'
  AND column_name IN ('ai_analysis_status', 'vision_analysis', 'activity_type')
ORDER BY 1;

SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'time_doctor'
  AND table_name = 'low_hours_email_log'
  AND column_name IN ('period_type', 'period_end')
ORDER BY 1;

\echo '=== 4) API role grants on tenant.user ==='
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'tenant'
  AND table_name = 'user'
  AND grantee = 'alyson_time_doctor_api'
ORDER BY privilege_type;

\echo '=== 5) API role grants on time_doctor.user_extensions ==='
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'time_doctor'
  AND table_name = 'user_extensions'
  AND grantee = 'alyson_time_doctor_api'
ORDER BY privilege_type;

\echo '=== 6) Workspace settings (all Pulse-enabled workspaces) ==='
SELECT ws.workspace_id, w.name, ws.settings, ws.updated_at
FROM time_doctor.workspace_settings ws
JOIN tenant.workspace w ON w.id = ws.workspace_id
ORDER BY ws.workspace_id;

\echo '=== 7) Pulse admins ==='
SELECT u.id, u.email, ext.pulse_role, ext.workspace_id,
       ext.cognito_sub IS NOT NULL AS has_cognito_sub
FROM time_doctor.user_extensions ext
JOIN tenant."user" u ON u.id = ext.user_id
WHERE ext.pulse_role = 'admin'
ORDER BY u.email;

\echo '=== 8) Extension counts by workspace ==='
SELECT ext.workspace_id, w.name,
       count(*) AS users,
       count(*) FILTER (WHERE ext.pulse_role = 'admin') AS admins
FROM time_doctor.user_extensions ext
LEFT JOIN tenant.workspace w ON w.id = ext.workspace_id
GROUP BY ext.workspace_id, w.name
ORDER BY ext.workspace_id;

\echo '=== 9) Projects ==='
SELECT p.workspace_id, w.name AS workspace, p.id, p.name,
       (SELECT count(*) FROM time_doctor.employee_project_assignments a WHERE a.project_id = p.id) AS assignees
FROM time_doctor.projects p
JOIN tenant.workspace w ON w.id = p.workspace_id
ORDER BY p.workspace_id, p.name;

\echo 'Done. Failures to investigate:'
\echo '  - missing_table rows in section 2'
\echo '  - empty privilege lists in sections 4–5 (re-run 01_grants_api_role.sql as owner)'
\echo '  - no workspace_settings / no admins (run 02_bootstrap_workspace.sql)'
