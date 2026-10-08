-- Employee country for public-holiday credit (India / Pakistan / …).
-- Safe to re-run.

ALTER TABLE time_doctor.user_extensions
  ADD COLUMN IF NOT EXISTS country TEXT;

COMMENT ON COLUMN time_doctor.user_extensions.country IS
  'Country used to credit public holidays (e.g. India, Pakistan).';
