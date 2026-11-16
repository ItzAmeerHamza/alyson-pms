-- LAST_PROOF_OF_LIFE looks up the newest screenshot / app / URL row for one
-- session. Those tables were only indexed by user + time, so a leftover close
-- or a queued retry without frozen_end scanned the whole table. Heartbeats
-- already have (time_log_id, seen_at).

CREATE INDEX IF NOT EXISTS idx_td_screenshots_time_log_captured
  ON time_doctor.screenshots (time_log_id, captured_at DESC)
  WHERE time_log_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_td_app_logs_time_log
  ON time_doctor.app_logs (time_log_id)
  WHERE time_log_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_td_url_logs_time_log
  ON time_doctor.url_logs (time_log_id)
  WHERE time_log_id IS NOT NULL;

COMMENT ON INDEX time_doctor.idx_td_screenshots_time_log_captured IS
  'Supports LAST_PROOF_OF_LIFE MAX(captured_at) by session.';
COMMENT ON INDEX time_doctor.idx_td_app_logs_time_log IS
  'Supports LAST_PROOF_OF_LIFE MAX(ended_at/started_at) by session.';
COMMENT ON INDEX time_doctor.idx_td_url_logs_time_log IS
  'Supports LAST_PROOF_OF_LIFE MAX(ended_at/started_at) by session.';
