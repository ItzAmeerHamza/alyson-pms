-- Leave inbox statuses + half-day (AlysonHR intake parity).
-- Safe to re-run.

ALTER TABLE time_doctor.leave_events
  ADD COLUMN IF NOT EXISTS half_day BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN time_doctor.leave_events.half_day IS
  'True when leave is a half weekday (0.5 days). Pacing/leave credit uses half of daily hours.';

-- Expand inbox classification / queue status values
ALTER TABLE time_doctor.leave_inbox_messages
  DROP CONSTRAINT IF EXISTS leave_inbox_messages_classification_check;

ALTER TABLE time_doctor.leave_inbox_messages
  ADD CONSTRAINT leave_inbox_messages_classification_check
  CHECK (classification IN (
    'pending',
    'approved',
    'rejected',
    'unmatched',
    'duplicate',
    'not_leave',
    'extraction_failed',
    -- legacy values from 018
    'leave',
    'noise',
    'error'
  ));

-- Migrate legacy labels → HR queue statuses
UPDATE time_doctor.leave_inbox_messages
   SET classification = 'approved'
 WHERE classification = 'leave';

UPDATE time_doctor.leave_inbox_messages
   SET classification = 'not_leave'
 WHERE classification = 'noise';

UPDATE time_doctor.leave_inbox_messages
   SET classification = 'extraction_failed'
 WHERE classification = 'error';
