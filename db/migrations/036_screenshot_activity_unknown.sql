-- Screenshot activity can be unknown (safe to re-run).
-- A desktop agent with no working input hook sends NULL instead of 0%, so Pulse
-- does not count those shots as low activity / idle. Pulse queries already
-- treat NULL as "not low" and AVG() skips it.
-- Apply before deploying the backend that stores NULL; until then the old
-- backend keeps writing 0.

ALTER TABLE time_doctor.screenshots
  ALTER COLUMN activity_percent DROP NOT NULL,
  ALTER COLUMN focus_percent DROP NOT NULL;
