-- Apply after 015_session_heartbeats.sql (safe to re-run)

GRANT SELECT, INSERT ON TABLE time_doctor.session_heartbeats TO alyson_time_doctor_api;
GRANT USAGE, SELECT ON SEQUENCE time_doctor.session_heartbeats_id_seq TO alyson_time_doctor_api;
