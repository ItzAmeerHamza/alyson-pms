-- Pace emails use MTD targets (35/70/105/140…). NUMERIC(4,2) maxes at 99.99 and
-- caused "numeric field overflow" on send for week 3+.
ALTER TABLE time_doctor.low_hours_email_log
  ALTER COLUMN hours_worked TYPE NUMERIC(8,2),
  ALTER COLUMN hours_threshold TYPE NUMERIC(8,2);
