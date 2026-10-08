/**
 * One idle episode is one row, keyed by client id (hash of user + idle_start).
 * A later checkpoint with a longer idle_end must extend that row, not no-op
 * and keep a 30s slice that Pulse then drops (< 5 min).
 * Unique (user_id, idle_start) still catches old agents that mint a new id.
 */
export const UPSERT_IDLE_LOG_SQL = `
INSERT INTO time_doctor.idle_logs
  (id, user_id, time_log_id, idle_start, idle_end, duration_seconds, workspace_id)
VALUES ($1,$2,$3,$4,$5,$6,$7)
ON CONFLICT (id) DO UPDATE SET
  idle_end = GREATEST(time_doctor.idle_logs.idle_end, EXCLUDED.idle_end),
  duration_seconds = GREATEST(
    COALESCE(time_doctor.idle_logs.duration_seconds, 0),
    COALESCE(EXCLUDED.duration_seconds, 0)
  ),
  time_log_id = COALESCE(time_doctor.idle_logs.time_log_id, EXCLUDED.time_log_id)
`;

export const EXTEND_IDLE_LOG_BY_START_SQL = `
UPDATE time_doctor.idle_logs
   SET idle_end = GREATEST(idle_end, $1::timestamptz),
       duration_seconds = GREATEST(COALESCE(duration_seconds, 0), $2::int),
       time_log_id = COALESCE(time_log_id, $3)
 WHERE user_id = $4
   AND idle_start = $5::timestamptz
`;
