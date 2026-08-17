-- Pulse now asks, for each screenshot, whether it was taken during an idle
-- period, so that a low-activity shot inside idle is not charged as
-- non-effective time a second time on top of the idle itself.
--
-- That question is asked once per screenshot row, and screenshots arrive once
-- per minute per user, so it needs an index to answer from. idle_logs had none
-- at all — every lookup was a sequential scan of the whole table.
--
-- (user_id, idle_start) matches the lookup shape: filter to the user, then
-- range-scan their periods by start time. idle_end is included so the overlap
-- test is answered from the index without touching the heap.

CREATE INDEX IF NOT EXISTS idx_td_idle_logs_user_start
  ON time_doctor.idle_logs (user_id, idle_start)
  INCLUDE (idle_end, duration_seconds);

COMMENT ON INDEX time_doctor.idx_td_idle_logs_user_start IS
  'Supports the per-screenshot idle-overlap test in Pulse effective-time reporting.';
