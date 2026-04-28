-- This partial unique index already exists in the live database.
-- Adding it here for migration parity so the codebase reflects the actual schema.
-- It enforces that each user can have at most one active (unclosed) session.
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_session_per_user
  ON public.time_logs (user_id)
  WHERE end_time IS NULL;
