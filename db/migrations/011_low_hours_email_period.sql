-- Weekly Email Reporting: store period type + end date alongside work_date (week start).
ALTER TABLE time_doctor.low_hours_email_log
  ADD COLUMN IF NOT EXISTS period_type TEXT NOT NULL DEFAULT 'day';

ALTER TABLE time_doctor.low_hours_email_log
  ADD COLUMN IF NOT EXISTS period_end DATE;

UPDATE time_doctor.low_hours_email_log
SET period_end = work_date
WHERE period_end IS NULL;
