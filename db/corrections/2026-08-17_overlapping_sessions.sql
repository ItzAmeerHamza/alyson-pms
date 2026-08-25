-- Correction: sessions that overlap the next session on the same device.
--
-- Window: company work days Fri Aug 14 – Mon Aug 17 2026 (America/Chicago).
--
-- What this will NEVER do
--   * Move a start_time
--   * Lengthen a session
--   * Touch the latest session on that device (no next start) — live tracking
--     is left alone
--   * Touch a different device_id
--   * Cut a long real session because a short session sat in the middle of it
--
-- The unsafe case in the first draft
--   Session A 09:00–18:00 (real day). Session B 14:00–14:02 (glitch).
--   Clamping A to B.start would delete 14:00–18:00 of real work.
--   STEP 2 now refuses that: if B ended well before A, and A still has
--   screenshots / heartbeats / app / URL / last_alive AFTER B ended, A is kept.
--
-- What this WILL shorten
--   The desktop bug: Stop still in flight, a new session starts, the old row
--   stays open or is closed later. The later start is the next real session.
--   Minutes after that start stay on the later row. They are not deleted;
--   they stop being billed twice.
--
-- Run STEP 1 alone first. It changes nothing.

-- win_start = 2026-08-14 00:00 America/Chicago
-- win_end   = 2026-08-18 00:00 America/Chicago  (Tuesday, exclusive)


-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 1 — READ ONLY. Pairs we will clamp (safe).
-- ═══════════════════════════════════════════════════════════════════════════
WITH bounds AS (
  SELECT TIMESTAMP '2026-08-14 00:00' AT TIME ZONE 'America/Chicago' AS win_start,
         TIMESTAMP '2026-08-18 00:00' AT TIME ZONE 'America/Chicago' AS win_end
),
ordered AS (
  SELECT t.id, t.user_id, t.device_id, t.start_time, t.end_time, t.status,
         t.last_alive_at,
         LEAD(t.start_time) OVER w AS next_start,
         LEAD(t.end_time)   OVER w AS next_end
  FROM time_doctor.time_logs t
  WINDOW w AS (
    PARTITION BY t.user_id, COALESCE(t.device_id, '')
    ORDER BY t.start_time, t.id
  )
),
candidates AS (
  SELECT o.*
  FROM ordered o
  CROSS JOIN bounds b
  WHERE o.next_start IS NOT NULL
    AND COALESCE(o.end_time, 'infinity'::timestamptz) > o.next_start
    AND o.next_start < b.win_end
    AND COALESCE(o.end_time, o.next_start) > b.win_start
),
scored AS (
  SELECT c.*,
         GREATEST(
           c.start_time,
           COALESCE(c.last_alive_at, c.start_time),
           COALESCE((SELECT MAX(s.captured_at) FROM time_doctor.screenshots s
                     WHERE s.time_log_id = c.id), c.start_time),
           COALESCE((SELECT MAX(h.seen_at) FROM time_doctor.session_heartbeats h
                     WHERE h.time_log_id = c.id), c.start_time),
           COALESCE((SELECT MAX(COALESCE(a.ended_at, a.started_at, a.timestamp))
                     FROM time_doctor.app_logs a WHERE a.time_log_id = c.id), c.start_time),
           COALESCE((SELECT MAX(COALESCE(u.ended_at, u.started_at))
                     FROM time_doctor.url_logs u WHERE u.time_log_id = c.id), c.start_time)
         ) AS last_proof
  FROM candidates c
),
classified AS (
  SELECT s.*,
         (s.end_time IS NOT NULL
          AND s.next_end IS NOT NULL
          AND s.next_end < s.end_time - INTERVAL '2 minutes'
          AND s.last_proof > s.next_end + INTERVAL '2 minutes') AS skip_embedded_real_work
  FROM scored s
)
SELECT u.email,
       COUNT(*) AS sessions_affected,
       COUNT(*) FILTER (WHERE c.end_time IS NULL) AS still_open_orphans,
       ROUND(SUM(EXTRACT(EPOCH FROM (
         COALESCE(c.end_time, c.next_start) - GREATEST(c.start_time, c.next_start)
       ))) / 3600.0, 2) AS phantom_hours,
       MIN(c.start_time) AS earliest,
       MAX(c.start_time) AS latest
FROM classified c
JOIN tenant."user" u ON u.id = c.user_id
WHERE NOT c.skip_embedded_real_work
GROUP BY u.email
ORDER BY phantom_hours DESC;


-- STEP 1-held — READ ONLY. Overlaps we refuse to clamp (embedded next session
-- with proof of work on the earlier row after it ended). Must not be mixed
-- into STEP 2. If this is large, send it to engineering.
WITH bounds AS (
  SELECT TIMESTAMP '2026-08-14 00:00' AT TIME ZONE 'America/Chicago' AS win_start,
         TIMESTAMP '2026-08-18 00:00' AT TIME ZONE 'America/Chicago' AS win_end
),
ordered AS (
  SELECT t.id, t.user_id, t.device_id, t.start_time, t.end_time, t.last_alive_at,
         LEAD(t.start_time) OVER w AS next_start,
         LEAD(t.end_time)   OVER w AS next_end
  FROM time_doctor.time_logs t
  WINDOW w AS (
    PARTITION BY t.user_id, COALESCE(t.device_id, '')
    ORDER BY t.start_time, t.id
  )
),
candidates AS (
  SELECT o.*
  FROM ordered o
  CROSS JOIN bounds b
  WHERE o.next_start IS NOT NULL
    AND COALESCE(o.end_time, 'infinity'::timestamptz) > o.next_start
    AND o.next_start < b.win_end
    AND COALESCE(o.end_time, o.next_start) > b.win_start
),
scored AS (
  SELECT c.*,
         GREATEST(
           c.start_time,
           COALESCE(c.last_alive_at, c.start_time),
           COALESCE((SELECT MAX(s.captured_at) FROM time_doctor.screenshots s
                     WHERE s.time_log_id = c.id), c.start_time),
           COALESCE((SELECT MAX(h.seen_at) FROM time_doctor.session_heartbeats h
                     WHERE h.time_log_id = c.id), c.start_time),
           COALESCE((SELECT MAX(COALESCE(a.ended_at, a.started_at, a.timestamp))
                     FROM time_doctor.app_logs a WHERE a.time_log_id = c.id), c.start_time),
           COALESCE((SELECT MAX(COALESCE(u.ended_at, u.started_at))
                     FROM time_doctor.url_logs u WHERE u.time_log_id = c.id), c.start_time)
         ) AS last_proof
  FROM candidates c
)
SELECT u.email,
       s.id,
       s.start_time,
       s.end_time,
       s.next_start,
       s.next_end,
       s.last_proof,
       ROUND(EXTRACT(EPOCH FROM (
         COALESCE(s.end_time, s.next_start) - GREATEST(s.start_time, s.next_start)
       )) / 3600.0, 2) AS hours_we_will_not_cut
FROM scored s
JOIN tenant."user" u ON u.id = s.user_id
WHERE s.end_time IS NOT NULL
  AND s.next_end IS NOT NULL
  AND s.next_end < s.end_time - INTERVAL '2 minutes'
  AND s.last_proof > s.next_end + INTERVAL '2 minutes'
ORDER BY hours_we_will_not_cut DESC, u.email;


-- STEP 1b — READ ONLY. Same person, different device_id. Not clamped.
WITH bounds AS (
  SELECT TIMESTAMP '2026-08-14 00:00' AT TIME ZONE 'America/Chicago' AS win_start,
         TIMESTAMP '2026-08-18 00:00' AT TIME ZONE 'America/Chicago' AS win_end
),
ordered AS (
  SELECT t.id, t.user_id, t.device_id, t.start_time, t.end_time,
         LEAD(t.start_time) OVER (PARTITION BY t.user_id ORDER BY t.start_time, t.id) AS next_start,
         LEAD(t.device_id)  OVER (PARTITION BY t.user_id ORDER BY t.start_time, t.id) AS next_device
  FROM time_doctor.time_logs t
)
SELECT u.email,
       COUNT(*) AS sessions,
       ROUND(SUM(EXTRACT(EPOCH FROM (
         COALESCE(o.end_time, o.next_start) - GREATEST(o.start_time, o.next_start)
       ))) / 3600.0, 2) AS phantom_hours_if_ignored_device
FROM ordered o
CROSS JOIN bounds b
JOIN tenant."user" u ON u.id = o.user_id
WHERE o.next_start IS NOT NULL
  AND COALESCE(o.end_time, 'infinity'::timestamptz) > o.next_start
  AND COALESCE(o.device_id, '') IS DISTINCT FROM COALESCE(o.next_device, '')
  AND o.next_start < b.win_end
  AND COALESCE(o.end_time, o.next_start) > b.win_start
GROUP BY u.email
ORDER BY phantom_hours_if_ignored_device DESC;


-- STEP 1c — READ ONLY. Long sessions in this window with no overlap.
-- Not this fix.
WITH bounds AS (
  SELECT TIMESTAMP '2026-08-14 00:00' AT TIME ZONE 'America/Chicago' AS win_start,
         TIMESTAMP '2026-08-18 00:00' AT TIME ZONE 'America/Chicago' AS win_end
)
SELECT u.email,
       COUNT(*) AS long_sessions,
       ROUND(SUM(EXTRACT(EPOCH FROM (
         COALESCE(t.end_time, t.last_alive_at, NOW()) - t.start_time
       ))) / 3600.0, 2) AS billed_hours
FROM time_doctor.time_logs t
CROSS JOIN bounds b
JOIN tenant."user" u ON u.id = t.user_id
WHERE EXTRACT(EPOCH FROM (
        COALESCE(t.end_time, t.last_alive_at, NOW()) - t.start_time
      )) >= 6 * 3600
  AND t.start_time < b.win_end
  AND COALESCE(t.end_time, t.last_alive_at, NOW()) > b.win_start
  AND NOT EXISTS (
    SELECT 1
    FROM time_doctor.time_logs n
    WHERE n.user_id = t.user_id
      AND COALESCE(n.device_id, '') = COALESCE(t.device_id, '')
      AND n.id <> t.id
      AND n.start_time > t.start_time
      AND n.start_time < COALESCE(t.end_time, 'infinity'::timestamptz)
  )
GROUP BY u.email
ORDER BY billed_hours DESC;


-- Pair list STEP 2 would change. Review before STEP 2.
WITH bounds AS (
  SELECT TIMESTAMP '2026-08-14 00:00' AT TIME ZONE 'America/Chicago' AS win_start,
         TIMESTAMP '2026-08-18 00:00' AT TIME ZONE 'America/Chicago' AS win_end
),
ordered AS (
  SELECT t.id, t.user_id, t.device_id, t.start_time, t.end_time, t.status,
         t.last_alive_at,
         LEAD(t.start_time) OVER w AS next_start,
         LEAD(t.end_time)   OVER w AS next_end
  FROM time_doctor.time_logs t
  WINDOW w AS (
    PARTITION BY t.user_id, COALESCE(t.device_id, '')
    ORDER BY t.start_time, t.id
  )
),
candidates AS (
  SELECT o.*
  FROM ordered o
  CROSS JOIN bounds b
  WHERE o.next_start IS NOT NULL
    AND COALESCE(o.end_time, 'infinity'::timestamptz) > o.next_start
    AND o.next_start < b.win_end
    AND COALESCE(o.end_time, o.next_start) > b.win_start
),
scored AS (
  SELECT c.*,
         GREATEST(
           c.start_time,
           COALESCE(c.last_alive_at, c.start_time),
           COALESCE((SELECT MAX(s.captured_at) FROM time_doctor.screenshots s
                     WHERE s.time_log_id = c.id), c.start_time),
           COALESCE((SELECT MAX(h.seen_at) FROM time_doctor.session_heartbeats h
                     WHERE h.time_log_id = c.id), c.start_time),
           COALESCE((SELECT MAX(COALESCE(a.ended_at, a.started_at, a.timestamp))
                     FROM time_doctor.app_logs a WHERE a.time_log_id = c.id), c.start_time),
           COALESCE((SELECT MAX(COALESCE(u.ended_at, u.started_at))
                     FROM time_doctor.url_logs u WHERE u.time_log_id = c.id), c.start_time)
         ) AS last_proof
  FROM candidates c
)
SELECT u.email,
       s.id,
       s.start_time,
       s.end_time AS old_end,
       s.next_start AS new_end,
       s.status,
       ROUND(EXTRACT(EPOCH FROM (
         COALESCE(s.end_time, s.next_start) - GREATEST(s.start_time, s.next_start)
       )) / 3600.0, 2) AS phantom_hours
FROM scored s
JOIN tenant."user" u ON u.id = s.user_id
WHERE NOT (s.end_time IS NOT NULL
           AND s.next_end IS NOT NULL
           AND s.next_end < s.end_time - INTERVAL '2 minutes'
           AND s.last_proof > s.next_end + INTERVAL '2 minutes')
ORDER BY phantom_hours DESC, u.email, s.start_time;


-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 2 — THE CORRECTION. Run only after reviewing STEP 1 and STEP 1-held.
-- ═══════════════════════════════════════════════════════════════════════════

-- 2a. Plan + backup. Changes nothing in time_logs yet.
DROP TABLE IF EXISTS time_doctor.time_logs_overlap_fix_2026_08_17;

CREATE TABLE time_doctor.time_logs_overlap_fix_2026_08_17 AS
WITH bounds AS (
  SELECT TIMESTAMP '2026-08-14 00:00' AT TIME ZONE 'America/Chicago' AS win_start,
         TIMESTAMP '2026-08-18 00:00' AT TIME ZONE 'America/Chicago' AS win_end
),
ordered AS (
  SELECT t.id, t.user_id, t.workspace_id, t.device_id, t.start_time, t.end_time,
         t.status, t.last_alive_at, t.idle_seconds,
         LEAD(t.start_time) OVER w AS next_start,
         LEAD(t.end_time)   OVER w AS next_end
  FROM time_doctor.time_logs t
  WINDOW w AS (
    PARTITION BY t.user_id, COALESCE(t.device_id, '')
    ORDER BY t.start_time, t.id
  )
),
candidates AS (
  SELECT o.*
  FROM ordered o
  CROSS JOIN bounds b
  WHERE o.next_start IS NOT NULL
    AND COALESCE(o.end_time, 'infinity'::timestamptz) > o.next_start
    AND o.next_start < b.win_end
    AND COALESCE(o.end_time, o.next_start) > b.win_start
),
scored AS (
  SELECT c.*,
         GREATEST(
           c.start_time,
           COALESCE(c.last_alive_at, c.start_time),
           COALESCE((SELECT MAX(s.captured_at) FROM time_doctor.screenshots s
                     WHERE s.time_log_id = c.id), c.start_time),
           COALESCE((SELECT MAX(h.seen_at) FROM time_doctor.session_heartbeats h
                     WHERE h.time_log_id = c.id), c.start_time),
           COALESCE((SELECT MAX(COALESCE(a.ended_at, a.started_at, a.timestamp))
                     FROM time_doctor.app_logs a WHERE a.time_log_id = c.id), c.start_time),
           COALESCE((SELECT MAX(COALESCE(u.ended_at, u.started_at))
                     FROM time_doctor.url_logs u WHERE u.time_log_id = c.id), c.start_time)
         ) AS last_proof
  FROM candidates c
)
SELECT s.id,
       s.user_id,
       s.workspace_id,
       s.device_id,
       s.start_time,
       s.end_time        AS old_end_time,
       s.status          AS old_status,
       s.last_alive_at   AS old_last_alive_at,
       s.idle_seconds    AS old_idle_seconds,
       GREATEST(s.start_time, s.next_start) AS new_end_time,
       CASE WHEN s.end_time IS NULL THEN 'auto_closed' ELSE s.status END AS new_status
FROM scored s
WHERE NOT (s.end_time IS NOT NULL
           AND s.next_end IS NOT NULL
           AND s.next_end < s.end_time - INTERVAL '2 minutes'
           AND s.last_proof > s.next_end + INTERVAL '2 minutes');

-- 2b. Audit trail first.
INSERT INTO time_doctor.time_log_events
  (user_id, time_log_id, workspace_id, action, source, device_id, meta,
   old_start_time, old_end_time, old_status,
   new_start_time, new_end_time, new_status, shortened)
SELECT f.user_id, f.id, f.workspace_id,
       'admin_clamped_overlap', 'manual-correction-2026-08-17', f.device_id,
       jsonb_build_object(
         'reason', 'Session overlapped the next session on the same device',
         'rule', 'end_time clamped to next session start_time; skipped embedded real work',
         'window', '2026-08-14..2026-08-17 America/Chicago',
         'corrected_by', 'engineering'
       ),
       f.start_time, f.old_end_time, f.old_status,
       f.start_time, f.new_end_time, f.new_status, TRUE
FROM time_doctor.time_logs_overlap_fix_2026_08_17 f;

-- 2c. Clamp. Never moves start_time. Never lengthens.
UPDATE time_doctor.time_logs t
SET end_time      = f.new_end_time,
    status        = f.new_status,
    last_alive_at = CASE
                      WHEN t.last_alive_at IS NULL THEN t.last_alive_at
                      ELSE LEAST(t.last_alive_at, f.new_end_time)
                    END,
    updated_at    = NOW()
FROM time_doctor.time_logs_overlap_fix_2026_08_17 f
WHERE f.id = t.id
  AND COALESCE(t.end_time, 'infinity'::timestamptz) > f.new_end_time;

-- 2d. Idle past the new end — clip or drop.
UPDATE time_doctor.idle_logs il
SET idle_end         = LEAST(
                         GREATEST(
                           COALESCE(il.idle_end, il.idle_start),
                           il.idle_start + make_interval(secs => COALESCE(il.duration_seconds, 0))
                         ),
                         f.new_end_time
                       ),
    duration_seconds = GREATEST(
                         0,
                         FLOOR(EXTRACT(EPOCH FROM (
                           LEAST(
                             GREATEST(
                               COALESCE(il.idle_end, il.idle_start),
                               il.idle_start + make_interval(secs => COALESCE(il.duration_seconds, 0))
                             ),
                             f.new_end_time
                           ) - GREATEST(il.idle_start, t.start_time)
                         )))
                       )::int
FROM time_doctor.time_logs_overlap_fix_2026_08_17 f
JOIN time_doctor.time_logs t ON t.id = f.id
WHERE il.time_log_id = f.id
  AND il.idle_start < f.new_end_time
  AND GREATEST(
        COALESCE(il.idle_end, il.idle_start),
        il.idle_start + make_interval(secs => COALESCE(il.duration_seconds, 0))
      ) > f.new_end_time;

DELETE FROM time_doctor.idle_logs il
USING time_doctor.time_logs_overlap_fix_2026_08_17 f
WHERE il.time_log_id = f.id
  AND il.idle_start >= f.new_end_time;

-- 2e. Rebuild idle_seconds on touched sessions.
UPDATE time_doctor.time_logs t
SET idle_seconds = COALESCE(c.total, 0),
    updated_at   = NOW()
FROM time_doctor.time_logs_overlap_fix_2026_08_17 f
LEFT JOIN LATERAL (
  SELECT SUM(GREATEST(0, COALESCE(i2.duration_seconds, 0)))::int AS total
  FROM time_doctor.idle_logs i2
  WHERE i2.time_log_id = f.id
) c ON TRUE
WHERE t.id = f.id
  AND t.idle_seconds IS DISTINCT FROM COALESCE(c.total, 0);


-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 3 — VERIFY.
-- ═══════════════════════════════════════════════════════════════════════════

-- Safe overlaps left in the window. Must be 0.
-- Embedded-with-later-proof pairs are supposed to remain; they are not counted.
WITH bounds AS (
  SELECT TIMESTAMP '2026-08-14 00:00' AT TIME ZONE 'America/Chicago' AS win_start,
         TIMESTAMP '2026-08-18 00:00' AT TIME ZONE 'America/Chicago' AS win_end
),
ordered AS (
  SELECT t.id, t.end_time, t.last_alive_at, t.start_time,
         LEAD(t.start_time) OVER w AS next_start,
         LEAD(t.end_time)   OVER w AS next_end
  FROM time_doctor.time_logs t
  WINDOW w AS (
    PARTITION BY t.user_id, COALESCE(t.device_id, '')
    ORDER BY t.start_time, t.id
  )
),
candidates AS (
  SELECT o.*
  FROM ordered o
  CROSS JOIN bounds b
  WHERE o.next_start IS NOT NULL
    AND COALESCE(o.end_time, 'infinity'::timestamptz) > o.next_start
    AND o.next_start < b.win_end
    AND COALESCE(o.end_time, o.next_start) > b.win_start
),
scored AS (
  SELECT c.*,
         GREATEST(
           c.start_time,
           COALESCE(c.last_alive_at, c.start_time),
           COALESCE((SELECT MAX(s.captured_at) FROM time_doctor.screenshots s
                     WHERE s.time_log_id = c.id), c.start_time),
           COALESCE((SELECT MAX(h.seen_at) FROM time_doctor.session_heartbeats h
                     WHERE h.time_log_id = c.id), c.start_time),
           COALESCE((SELECT MAX(COALESCE(a.ended_at, a.started_at, a.timestamp))
                     FROM time_doctor.app_logs a WHERE a.time_log_id = c.id), c.start_time),
           COALESCE((SELECT MAX(COALESCE(u.ended_at, u.started_at))
                     FROM time_doctor.url_logs u WHERE u.time_log_id = c.id), c.start_time)
         ) AS last_proof
  FROM candidates c
)
SELECT COUNT(*) AS remaining_safe_overlaps_in_window
FROM scored s
WHERE NOT (s.end_time IS NOT NULL
           AND s.next_end IS NOT NULL
           AND s.next_end < s.end_time - INTERVAL '2 minutes'
           AND s.last_proof > s.next_end + INTERVAL '2 minutes');

SELECT u.email,
       COUNT(*) AS sessions_shortened,
       COUNT(*) FILTER (WHERE f.old_end_time IS NULL) AS orphans_closed,
       ROUND(SUM(EXTRACT(EPOCH FROM (
         COALESCE(f.old_end_time, f.new_end_time) - f.new_end_time
       ))) / 3600.0, 2) AS phantom_hours_removed
FROM time_doctor.time_logs_overlap_fix_2026_08_17 f
JOIN tenant."user" u ON u.id = f.user_id
GROUP BY u.email
ORDER BY phantom_hours_removed DESC;


-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 4 — ROLLBACK, only if verification looked wrong.
--   DROP TABLE time_doctor.time_logs_overlap_fix_2026_08_17;
-- ═══════════════════════════════════════════════════════════════════════════
-- UPDATE time_doctor.time_logs t
-- SET end_time      = f.old_end_time,
--     status        = f.old_status,
--     last_alive_at = f.old_last_alive_at,
--     idle_seconds  = f.old_idle_seconds,
--     updated_at    = NOW()
-- FROM time_doctor.time_logs_overlap_fix_2026_08_17 f
-- WHERE f.id = t.id;
