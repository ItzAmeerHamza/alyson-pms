-- Allow Pulse API to create/rename tenant.workspace from Workspace Settings.
-- Run as a role that owns tenant.* (typically postgres / RDS master).
-- Safe to re-run.

GRANT SELECT, INSERT, UPDATE ON TABLE tenant.workspace TO alyson_time_doctor_api;
GRANT USAGE, SELECT ON SEQUENCE tenant.workspace_id_seq TO alyson_time_doctor_api;
