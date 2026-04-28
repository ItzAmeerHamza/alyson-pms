-- The existing unique index uses WHERE end_time IS NULL, but the desktop agent
-- heartbeat updates end_time every 2 minutes on active sessions, making the
-- constraint ineffective. Change to use status = 'active' instead.

-- Step 1: Drop the broken index
DROP INDEX IF EXISTS idx_one_active_session_per_user;

-- Step 2: Close duplicate active sessions - keep only the most recent per user
WITH ranked AS (
  SELECT id, user_id, start_time, end_time,
         ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY start_time DESC) AS rn
  FROM time_logs
  WHERE status = 'active'
)
UPDATE time_logs
SET status = 'completed',
    end_time = COALESCE(time_logs.end_time, time_logs.start_time)
FROM ranked
WHERE time_logs.id = ranked.id
  AND ranked.rn > 1;

-- Step 3: Create the correct unique index using status instead of end_time
CREATE UNIQUE INDEX idx_one_active_session_per_user
  ON public.time_logs (user_id)
  WHERE status = 'active';
