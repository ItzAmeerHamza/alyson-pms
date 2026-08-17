-- Correction: idle periods that fall outside the session they were charged to.
--
-- The agent derived idle start from the OS idle counter, which measures time
-- since the last input on the machine. That counter knows nothing about
-- sessions and keeps running while the lid is shut, so two things went wrong:
--
--   * A machine left untouched overnight reported the whole night on the next
--     poll. One row recorded 43,054s (11.96h) of idle, written three seconds
--     BEFORE its session even started, against a day that tracked 6,835s.
--   * A machine asleep mid-session reported the sleep as idle on waking. One
--     row recorded 19,018s (5.28h) against a day that tracked 10,179s.
--
-- Reports compute non_effective = min(total, low_activity + idle), so idle
-- larger than the tracked day forces every tracked minute to read
-- non-effective. Four employees showed 0% effective on 2026-08-17.
--
-- Rule: idle is a description of time already being tracked, so an idle period
-- may not extend beyond the session that contains it. Each row is clipped to
-- the intersection of itself and its session; rows with no intersection
-- describe time nobody was tracking and are removed.
--
-- Prevention is in the agent (enhanced-idle-monitor.js now clamps idle start to
-- session start, discards idle written with no session open, and credits idle
-- only up to the last check before a sleep gap). This file only cleans up rows
-- that were already written wrong.
--
-- Run STEP 1 alone first. It changes nothing.

-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 1 — READ ONLY. Which rows are wrong, for whom, and by how much?
-- ═══════════════════════════════════════════════════════════════════════════
WITH idle AS (
  SELECT il.id,
         il.user_id,
         il.time_log_id,
         il.idle_start,
         GREATEST(
           COALESCE(il.idle_end, il.idle_start),
           il.idle_start + make_interval(secs => COALESCE(il.duration_seconds, 0))
         ) AS idle_end
  FROM time_doctor.idle_logs il
),
-- The session named on the row, when it still exists.
named AS (
  SELECT i.*,
         t.start_time                              AS sess_start,
         COALESCE(t.end_time, t.last_alive_at)     AS sess_end
  FROM idle i
  LEFT JOIN time_doctor.time_logs t ON t.id = i.time_log_id
),
-- Rows with no usable session fall back to whichever of that user's sessions
-- the period actually overlaps most — the one it should have been charged to.
bounded AS (
  SELECT n.id, n.user_id, n.idle_start, n.idle_end,
         COALESCE(n.sess_start, x.start_time) AS sess_start,
         COALESCE(n.sess_end,   x.sess_end)   AS sess_end
  FROM named n
  LEFT JOIN LATERAL (
    SELECT t.start_time,
           COALESCE(t.end_time, t.last_alive_at) AS sess_end
    FROM time_doctor.time_logs t
    WHERE t.user_id = n.user_id
      AND t.start_time < n.idle_end
      AND COALESCE(t.end_time, t.last_alive_at) > n.idle_start
    ORDER BY LEAST(COALESCE(t.end_time, t.last_alive_at), n.idle_end)
           - GREATEST(t.start_time, n.idle_start) DESC
    LIMIT 1
  ) x ON n.sess_start IS NULL
)
SELECT u.email,
       COUNT(*) FILTER (
         WHERE sess_start IS NULL
            OR LEAST(idle_end, sess_end) <= GREATEST(idle_start, sess_start)
       ) AS rows_to_delete,
       COUNT(*) FILTER (
         WHERE sess_start IS NOT NULL
           AND LEAST(idle_end, sess_end) > GREATEST(idle_start, sess_start)
       ) AS rows_to_clip,
       ROUND(SUM(
         EXTRACT(EPOCH FROM (idle_end - idle_start))
         - GREATEST(
             0,
             EXTRACT(EPOCH FROM (
               LEAST(idle_end, COALESCE(sess_end, idle_start))
               - GREATEST(idle_start, COALESCE(sess_start, idle_end))
             ))
           )
       ) / 3600.0, 2) AS untracked_idle_hours_removed,
       MAX(EXTRACT(EPOCH FROM (idle_end - idle_start))) AS largest_period_seconds
FROM bounded b
JOIN tenant."user" u ON u.id = b.user_id
WHERE sess_start IS NULL
   OR idle_start < sess_start
   OR idle_end   > sess_end
GROUP BY u.email
ORDER BY untracked_idle_hours_removed DESC;


-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 2 — THE CORRECTION. Run only after reviewing STEP 1.
--
-- Optional: restrict to a recent window by uncommenting the idle_start bound in
-- the `idle` CTE below, so older closed payroll periods stay untouched.
-- ═══════════════════════════════════════════════════════════════════════════
-- 2a. Decide what happens to every affected row, and keep its original values in
--     the same table. idle_logs has no audit table, so this is both the backup
--     and the driver for the statements below. It is a real table rather than a
--     temp one so the plan survives between statements — a GUI client with
--     autocommit on would drop a temp table at the first statement boundary and
--     take the plan with it. Section 4 restores from it if anything looks wrong.
DROP TABLE IF EXISTS time_doctor.idle_logs_fix_2026_08_17;

CREATE TABLE time_doctor.idle_logs_fix_2026_08_17 AS
WITH idle AS (
  SELECT il.id,
         il.user_id,
         il.time_log_id,
         il.idle_start,
         GREATEST(
           COALESCE(il.idle_end, il.idle_start),
           il.idle_start + make_interval(secs => COALESCE(il.duration_seconds, 0))
         ) AS idle_end
  FROM time_doctor.idle_logs il
  -- AND il.idle_start >= TIMESTAMP '2026-08-01 00:00' AT TIME ZONE 'America/Chicago'
),
named AS (
  SELECT i.*,
         t.start_time                          AS sess_start,
         COALESCE(t.end_time, t.last_alive_at) AS sess_end
  FROM idle i
  LEFT JOIN time_doctor.time_logs t ON t.id = i.time_log_id
),
bounded AS (
  SELECT n.id, n.user_id, n.idle_start, n.idle_end,
         COALESCE(n.sess_start, x.start_time) AS sess_start,
         COALESCE(n.sess_end,   x.sess_end)   AS sess_end
  FROM named n
  LEFT JOIN LATERAL (
    SELECT t.start_time,
           COALESCE(t.end_time, t.last_alive_at) AS sess_end
    FROM time_doctor.time_logs t
    WHERE t.user_id = n.user_id
      AND t.start_time < n.idle_end
      AND COALESCE(t.end_time, t.last_alive_at) > n.idle_start
    ORDER BY LEAST(COALESCE(t.end_time, t.last_alive_at), n.idle_end)
           - GREATEST(t.start_time, n.idle_start) DESC
    LIMIT 1
  ) x ON n.sess_start IS NULL
)
SELECT il.id,
       il.user_id,
       il.time_log_id,
       il.project_id,
       il.workspace_id,
       il.created_at,
       il.idle_start       AS old_idle_start,
       il.idle_end         AS old_idle_end,
       il.duration_seconds AS old_duration_seconds,
       GREATEST(b.idle_start, b.sess_start) AS new_start,
       -- A session with neither end_time nor last_alive_at gives no upper bound.
       -- Without the COALESCE, LEAST() returns NULL there and the row would be
       -- backed up and then left half-corrected. Fall back to the period's own
       -- end so only the start is clipped.
       LEAST(b.idle_end, COALESCE(b.sess_end, b.idle_end)) AS new_end,
       (b.sess_start IS NULL
        OR LEAST(b.idle_end, COALESCE(b.sess_end, b.idle_end))
           <= GREATEST(b.idle_start, b.sess_start)) AS drop_row
FROM bounded b
JOIN time_doctor.idle_logs il ON il.id = b.id
WHERE b.sess_start IS NULL
   OR b.idle_start < b.sess_start
   OR b.idle_end   > b.sess_end;

-- 2b. Idle that lies partly inside its session: keep the part that does.
UPDATE time_doctor.idle_logs il
SET idle_start       = f.new_start,
    idle_end         = f.new_end,
    duration_seconds = GREATEST(0, ROUND(EXTRACT(EPOCH FROM (f.new_end - f.new_start))))::int
FROM time_doctor.idle_logs_fix_2026_08_17 f
WHERE f.id = il.id
  AND NOT f.drop_row;

-- 2c. Idle that lies entirely outside any session describes untracked time.
DELETE FROM time_doctor.idle_logs il
USING time_doctor.idle_logs_fix_2026_08_17 f
WHERE f.id = il.id
  AND f.drop_row;

-- 2d. time_logs.idle_seconds is the agent's own per-session tally and was
-- inflated by the same periods. Rebuild it from the corrected rows so the
-- fallback path in Pulse (used when a day has no idle_logs) cannot reintroduce
-- the old value.
UPDATE time_doctor.time_logs t
SET idle_seconds = COALESCE(c.total, 0),
    updated_at   = NOW()
FROM (
  SELECT DISTINCT il.time_log_id
  FROM time_doctor.idle_logs_fix_2026_08_17 il
  WHERE il.time_log_id IS NOT NULL
) affected
LEFT JOIN LATERAL (
  SELECT SUM(GREATEST(0, COALESCE(i2.duration_seconds, 0)))::int AS total
  FROM time_doctor.idle_logs i2
  WHERE i2.time_log_id = affected.time_log_id
) c ON TRUE
WHERE t.id = affected.time_log_id
  AND t.idle_seconds IS DISTINCT FROM COALESCE(c.total, 0);

-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 3 — VERIFY. Run after the statements above.
-- ═══════════════════════════════════════════════════════════════════════════

-- Must return 0. No idle period may start before its session or end after it.
WITH idle AS (
  SELECT il.id, il.user_id, il.idle_start,
         GREATEST(
           COALESCE(il.idle_end, il.idle_start),
           il.idle_start + make_interval(secs => COALESCE(il.duration_seconds, 0))
         ) AS idle_end
  FROM time_doctor.idle_logs il
)
SELECT COUNT(*) AS idle_rows_outside_any_session
FROM idle i
WHERE NOT EXISTS (
  SELECT 1
  FROM time_doctor.time_logs t
  WHERE t.user_id = i.user_id
    AND i.idle_start >= t.start_time
    -- A session still open with no liveness stamp has no known end, so it
    -- cannot bound anything. Without 'infinity' the COALESCE returns NULL, the
    -- comparison is never true, and correctly clipped rows get reported here as
    -- failures.
    AND i.idle_end <= COALESCE(t.end_time, t.last_alive_at, 'infinity'::timestamptz)
);

-- What actually changed, per employee.
SELECT u.email,
       COUNT(*) FILTER (WHERE f.drop_row)     AS rows_deleted,
       COUNT(*) FILTER (WHERE NOT f.drop_row) AS rows_clipped,
       ROUND(SUM(
         EXTRACT(EPOCH FROM (
           GREATEST(COALESCE(f.old_idle_end, f.old_idle_start),
                    f.old_idle_start + make_interval(secs => COALESCE(f.old_duration_seconds, 0)))
           - f.old_idle_start))
         - CASE WHEN f.drop_row THEN 0
                ELSE EXTRACT(EPOCH FROM (f.new_end - f.new_start)) END
       ) / 3600.0, 2) AS idle_hours_removed
FROM time_doctor.idle_logs_fix_2026_08_17 f
JOIN tenant."user" u ON u.id = f.user_id
GROUP BY u.email
ORDER BY idle_hours_removed DESC;


-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 4 — ROLLBACK, only if the verification looked wrong.
--
-- Restores every touched row to exactly what it was. Safe to run more than once.
-- Once you are satisfied, drop the plan table to finish:
--   DROP TABLE time_doctor.idle_logs_fix_2026_08_17;
-- ═══════════════════════════════════════════════════════════════════════════
-- UPDATE time_doctor.idle_logs il
-- SET idle_start       = f.old_idle_start,
--     idle_end         = f.old_idle_end,
--     duration_seconds = f.old_duration_seconds
-- FROM time_doctor.idle_logs_fix_2026_08_17 f
-- WHERE f.id = il.id AND NOT f.drop_row;
--
-- INSERT INTO time_doctor.idle_logs
--   (id, user_id, time_log_id, project_id, workspace_id,
--    idle_start, idle_end, duration_seconds, created_at)
-- SELECT f.id, f.user_id, f.time_log_id, f.project_id, f.workspace_id,
--        f.old_idle_start, f.old_idle_end, f.old_duration_seconds, f.created_at
-- FROM time_doctor.idle_logs_fix_2026_08_17 f
-- WHERE f.drop_row
--   AND NOT EXISTS (SELECT 1 FROM time_doctor.idle_logs x WHERE x.id = f.id);
