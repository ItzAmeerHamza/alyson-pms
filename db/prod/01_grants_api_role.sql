-- Full grants for alyson_time_doctor_api on production.
-- Run as postgres / RDS master (table owner). Safe to re-run.
--
-- Includes:
--   - time_doctor schema CRUD + sequences (refresh after new tables)
--   - tenant write grants required for Pulse User Management invites (009)

-- Schema usage
GRANT USAGE ON SCHEMA time_doctor TO alyson_time_doctor_api;
GRANT USAGE ON SCHEMA tenant TO alyson_time_doctor_api;

-- time_doctor tables / views / sequences
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA time_doctor TO alyson_time_doctor_api;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA time_doctor TO alyson_time_doctor_api;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA time_doctor TO alyson_time_doctor_api;

ALTER DEFAULT PRIVILEGES IN SCHEMA time_doctor
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO alyson_time_doctor_api;
ALTER DEFAULT PRIVILEGES IN SCHEMA time_doctor
  GRANT USAGE, SELECT ON SEQUENCES TO alyson_time_doctor_api;

-- tenant: read identity + write for invite flow
GRANT SELECT ON tenant."user", tenant.workspace, tenant.profile, tenant.profile_workspace
  TO alyson_time_doctor_api;

GRANT SELECT, INSERT, UPDATE ON TABLE tenant."user" TO alyson_time_doctor_api;
GRANT USAGE, SELECT ON SEQUENCE tenant.user_id_seq TO alyson_time_doctor_api;

GRANT SELECT, INSERT, UPDATE ON TABLE tenant.user_notification_settings TO alyson_time_doctor_api;
GRANT USAGE, SELECT ON SEQUENCE tenant.user_notification_settings_id_seq TO alyson_time_doctor_api;

GRANT SELECT, INSERT, UPDATE ON TABLE tenant.account TO alyson_time_doctor_api;
GRANT USAGE, SELECT ON SEQUENCE tenant.account_id_seq TO alyson_time_doctor_api;

GRANT SELECT, INSERT, UPDATE ON TABLE tenant.profile TO alyson_time_doctor_api;
GRANT USAGE, SELECT ON SEQUENCE tenant.profile_id_seq TO alyson_time_doctor_api;

GRANT SELECT, INSERT, UPDATE ON TABLE tenant.profile_workspace TO alyson_time_doctor_api;
GRANT USAGE, SELECT ON SEQUENCE tenant.profile_workspace_id_seq TO alyson_time_doctor_api;
