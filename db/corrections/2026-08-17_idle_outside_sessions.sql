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
BEGIN;

-- idle_logs has no audit table, so keep the originals verbatim. Drop this table
-- once the correction has been reviewed and accepted.
CREATE TABLE IF NOT EXISTS time_doctor.idle_logs_backup_2026_08_17 AS
SELECT * FROM time_doctor.idle_logs WHERE FALSE;

CREATE TEMP TABLE idle_fix ON COMMIT DROP AS
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
SELECT id,
       idle_start,
       idle_end,
       GREATEST(idle_start, sess_start) AS new_start,
       LEAST(idle_end, sess_end)        AS new_end,
       (sess_start IS NULL
        OR LEAST(idle_end, sess_end) <= GREATEST(idle_start, sess_start)) AS drop_row
FROM bounded
WHERE sess_start IS NULL
   OR idle_start < sess_start
   OR idle_end   > sess_end;

-- Preserve every row this touches before changing it.
INSERT INTO time_doctor.idle_logs_backup_2026_08_17
SELECT il.* FROM time_doctor.idle_logs il JOIN idle_fix f ON f.id = il.id;

-- Idle that lies partly inside its session: keep the part that does.
UPDATE time_doctor.idle_logs il
SET idle_start       = f.new_start,
    idle_end         = f.new_end,
    duration_seconds = GREATEST(0, ROUND(EXTRACT(EPOCH FROM (f.new_end - f.new_start))))::int
FROM idle_fix f
WHERE f.id = il.id
  AND NOT f.drop_row;

-- Idle that lies entirely outside any session describes untracked time.
DELETE FROM time_doctor.idle_logs il
USING idle_fix f
WHERE f.id = il.id
  AND f.drop_row;

-- time_logs.idle_seconds is the agent's own per-session tally and was inflated
-- by the same periods. Rebuild it from the corrected rows so the fallback path
-- in Pulse (used when a day has no idle_logs) cannot reintroduce the old value.
UPDATE time_doctor.time_logs t
SET idle_seconds = COALESCE(c.total, 0),
    updated_at   = NOW()
FROM (
  SELECT DISTINCT il.time_log_id
  FROM time_doctor.idle_logs_backup_2026_08_17 il
  WHERE il.time_log_id IS NOT NULL
) affected
LEFT JOIN LATERAL (
  SELECT SUM(GREATEST(0, COALESCE(i2.duration_seconds, 0)))::int AS total
  FROM time_doctor.idle_logs i2
  WHERE i2.time_log_id = affected.time_log_id
) c ON TRUE
WHERE t.id = affected.time_log_id
  AND t.idle_seconds IS DISTINCT FROM COALESCE(c.total, 0);

-- Verify: this must return 0 before you commit. No idle period may start before
-- its session or end after it.
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
    AND i.idle_end   <= COALESCE(t.end_time, t.last_alive_at)
);

-- Sanity check the outcome for the worst-affected days before committing.
SELECT u.email,
       DATE(il.idle_start AT TIME ZONE 'America/Chicago') AS work_date,
       COUNT(*)                                          AS idle_periods,
       ROUND(SUM(il.duration_seconds) / 3600.0, 2)        AS idle_hours
FROM time_doctor.idle_logs il
JOIN tenant."user" u ON u.id = il.user_id
WHERE il.idle_start >= TIMESTAMP '2026-08-17 00:00' AT TIME ZONE 'America/Chicago'
GROUP BY u.email, work_date
ORDER BY idle_hours DESC;

-- If idle_rows_outside_any_session = 0 and STEP 1 looked right:
--   COMMIT;
-- Otherwise:
--   ROLLBACK;
