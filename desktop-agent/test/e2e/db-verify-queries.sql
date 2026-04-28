-- ============================================================
-- TimeFlow Desktop Agent — Database Verification Queries (v2)
-- Run via Supabase MCP after test suite completes
-- Replace <USER_ID>, <SESSION_ID>, <TEST_START> with actual values
-- ============================================================

-- 1. Active sessions (should be 0 after all stops)
SELECT count(*) as active_sessions
FROM time_logs
WHERE user_id = '<USER_ID>' AND end_time IS NULL;

-- 2. Latest sessions from test run
SELECT id, project_id, start_time, end_time,
       EXTRACT(EPOCH FROM (end_time - start_time))::int as wall_clock_s,
       idle_seconds, status
FROM time_logs
WHERE user_id = '<USER_ID>' AND start_time >= '<TEST_START>'
ORDER BY start_time DESC;

-- 3. App logs for a session
SELECT app_name, window_title, duration_seconds, started_at, ended_at
FROM app_logs
WHERE user_id = '<USER_ID>' AND time_log_id = '<SESSION_ID>'
ORDER BY started_at;

-- 4. URL activity for a session
SELECT site_url, domain, browser, confidence, started_at, ended_at
FROM app_url_activity
WHERE user_id = '<USER_ID>' AND time_log_id = '<SESSION_ID>'
ORDER BY started_at;

-- 5. Idle logs for a session
SELECT idle_start, idle_end, duration_seconds
FROM idle_logs
WHERE user_id = '<USER_ID>' AND time_log_id = '<SESSION_ID>'
ORDER BY idle_start;

-- 6. Screenshots for a session
SELECT id, captured_at, activity_percent, mouse_clicks, keystrokes,
       mouse_movements, file_path
FROM screenshots
WHERE user_id = '<USER_ID>' AND time_log_id = '<SESSION_ID>'
ORDER BY captured_at;

-- 7. Today's summary
SELECT COUNT(*) as sessions_today,
  SUM(EXTRACT(EPOCH FROM (COALESCE(end_time, now()) - start_time)))::int as total_wall_clock_s,
  SUM(COALESCE(idle_seconds, 0)) as total_idle_s
FROM time_logs
WHERE user_id = '<USER_ID>'
  AND start_time >= (CURRENT_DATE AT TIME ZONE 'Asia/Qatar')
  AND start_time < (CURRENT_DATE AT TIME ZONE 'Asia/Qatar' + interval '1 day');

-- 8. Top apps today
SELECT app_name, COUNT(*) as log_count, SUM(duration_seconds) as total_seconds
FROM app_logs
WHERE user_id = '<USER_ID>' AND started_at >= (CURRENT_DATE AT TIME ZONE 'Asia/Qatar')
GROUP BY app_name ORDER BY total_seconds DESC NULLS LAST;

-- 9. Top domains today
SELECT domain, COUNT(*) as visits, browser
FROM app_url_activity
WHERE user_id = '<USER_ID>' AND started_at >= (CURRENT_DATE AT TIME ZONE 'Asia/Qatar')
GROUP BY domain, browser ORDER BY visits DESC;

-- 10. No duplicate active sessions (global constraint)
SELECT user_id, count(*) as active_count
FROM time_logs WHERE end_time IS NULL
GROUP BY user_id HAVING count(*) > 1;

-- 11. Idle log closed correctly
SELECT idle_start, idle_end,
       EXTRACT(EPOCH FROM (idle_end - idle_start))::int as computed_s,
       duration_seconds as stored_s
FROM idle_logs
WHERE user_id = '<USER_ID>' AND time_log_id = '<SESSION_ID>'
ORDER BY idle_start;

-- 12. Time accuracy on stopped session
SELECT id, start_time, end_time,
  EXTRACT(EPOCH FROM (end_time - start_time))::int as wall_clock_s,
  idle_seconds,
  EXTRACT(EPOCH FROM (end_time - start_time))::int - COALESCE(idle_seconds, 0) as active_s
FROM time_logs WHERE id = '<SESSION_ID>';

-- 13. All test sessions summed
SELECT COUNT(*) as session_count,
  SUM(EXTRACT(EPOCH FROM (end_time - start_time)))::int as total_wall_clock_s,
  SUM(COALESCE(idle_seconds, 0))::int as total_idle_s,
  SUM(EXTRACT(EPOCH FROM (end_time - start_time)))::int
    - SUM(COALESCE(idle_seconds, 0))::int as total_active_s
FROM time_logs
WHERE user_id = '<USER_ID>' AND start_time >= '<TEST_START>' AND end_time IS NOT NULL;

-- 14. Per-session breakdown
SELECT id, start_time, end_time,
  EXTRACT(EPOCH FROM (end_time - start_time))::int as wall_s,
  COALESCE(idle_seconds, 0) as idle_s,
  EXTRACT(EPOCH FROM (end_time - start_time))::int - COALESCE(idle_seconds, 0) as active_s
FROM time_logs
WHERE user_id = '<USER_ID>' AND start_time >= '<TEST_START>' AND end_time IS NOT NULL
ORDER BY start_time;

-- 15. Screenshot row from forced capture
SELECT id, captured_at, activity_percent, mouse_clicks, keystrokes,
       mouse_movements, file_path, time_log_id
FROM screenshots
WHERE user_id = '<USER_ID>' AND captured_at >= '<TEST_START>'
ORDER BY captured_at DESC LIMIT 5;

-- 16. No orphaned app_logs
SELECT al.id, al.time_log_id FROM app_logs al
LEFT JOIN time_logs tl ON tl.id = al.time_log_id
WHERE al.user_id = '<USER_ID>' AND al.started_at >= '<TEST_START>' AND tl.id IS NULL;

-- 17. No orphaned idle_logs
SELECT il.id, il.time_log_id FROM idle_logs il
LEFT JOIN time_logs tl ON tl.id = il.time_log_id
WHERE il.user_id = '<USER_ID>' AND il.idle_start >= '<TEST_START>' AND tl.id IS NULL;

-- 18. No orphaned screenshots
SELECT s.id, s.time_log_id FROM screenshots s
LEFT JOIN time_logs tl ON tl.id = s.time_log_id
WHERE s.user_id = '<USER_ID>' AND s.captured_at >= '<TEST_START>' AND tl.id IS NULL;
