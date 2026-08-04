-- Apply on prod/stage after 014_time_log_events.sql
-- Grants for API role (safe to re-run)

GRANT SELECT, INSERT ON TABLE time_doctor.time_log_events TO alyson_time_doctor_api;
GRANT USAGE, SELECT ON SEQUENCE time_doctor.time_log_events_id_seq TO alyson_time_doctor_api;
