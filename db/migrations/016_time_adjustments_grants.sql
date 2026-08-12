-- Apply after 016_time_adjustments.sql
-- Grants for API role (safe to re-run)

GRANT SELECT, INSERT ON TABLE time_doctor.time_adjustments TO alyson_time_doctor_api;
