-- Allow Pulse API to provision employees from Team Management (POST /pulse/users).
-- Run as a role that owns tenant.* (typically postgres / RDS master).
--
-- Palisade web sign-in requires tenant.account + tenant.profile + tenant.profile_workspace
-- in addition to tenant."user". Missing profiles produce:
--   profile_id in ()  → SQL error on /userManagement/signin
--
-- tenant."user" has AFTER INSERT trigger add_user_notification_settings →
-- tenant.add_notification_setings(), which inserts into user_notification_settings.

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
