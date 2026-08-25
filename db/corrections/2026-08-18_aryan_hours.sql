-- Aryan Sawant (aryan@cintara.ai) — Aug 10–17 2026 (America/Chicago).
--
-- His Pulse week is ~95h. Almost all of that is a chain of sessions that
-- never stopped overnight. Only ~6h is the same minutes billed twice.
--
-- This file does two safe things. It does not void overnight sessions that
-- have screenshots / heartbeats all the way to end_time — those stay billed.
--
-- A. Overlap clamp, only when the NEXT session lasted >= 5 minutes.
--    Catches 3ec57ed3 (17:08–23:12) wrapping 573fb604 (17:09–22:45) = 5.6h
--    twice. Does NOT clamp 63a38ba5 (7h) onto a 2-minute glitch at 08:43.
--
-- B. Tail clip: if the last screenshot / heartbeat / app / URL on that row
--    is more than 30 minutes before end_time, move end_time back to that
--    proof. last_alive_at equal to start_time is ignored (missing stamp,
--    not a zero-length day).
--
-- Never moves start_time. Never lengthens. Never touches a live row with
-- no next session (his current active tracker).
--
-- Run STEP 1 alone first. It changes nothing.

-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 1 — READ ONLY. What we would change.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1A. Overlaps we will clamp (next session lasted >= 5 minutes).
WITH bounds AS (
  SELECT TIMESTAMP '2026-08-10 00:00' AT TIME ZONE 'America/Chicago' AS win_start,
         TIMESTAMP '2026-08-18 00:00' AT TIME ZONE 'America/Chicago' AS win_end
),
u AS (
  SELECT id AS user_id FROM tenant."user" WHERE email ILIKE 'aryan@cintara.ai'
),
ordered AS (
  SELECT t.id, t.user_id, t.device_id, t.start_time, t.end_time, t.status,
         LEAD(t.start_time) OVER w AS next_start,
         LEAD(t.end_time)   OVER w AS next_end,
         LEAD(t.id)         OVER w AS next_id
  FROM time_doctor.time_logs t
  JOIN u ON u.user_id = t.user_id
  WINDOW w AS (
    PARTITION BY t.user_id, COALESCE(t.device_id, '')
    ORDER BY t.start_time, t.id
  )
)
SELECT o.id,
       o.start_time,
       o.end_time AS old_end,
       o.next_start AS new_end,
       o.next_id,
       ROUND(EXTRACT(EPOCH FROM (o.next_end - o.next_start)) / 60.0, 1) AS next_minutes,
       ROUND(EXTRACT(EPOCH FROM (
         COALESCE(o.end_time, o.next_start) - o.next_start
       )) / 3600.0, 2) AS phantom_hours
FROM ordered o
CROSS JOIN bounds b
WHERE o.next_start IS NOT NULL
  AND COALESCE(o.end_time, 'infinity'::timestamptz) > o.next_start
  AND o.next_end IS NOT NULL
  AND o.next_end - o.next_start >= INTERVAL '5 minutes'
  AND o.start_time < b.win_end
  AND COALESCE(o.end_time, o.next_start) > b.win_start
ORDER BY phantom_hours DESC;


-- 1B. Tails with no proof of life (would clip end_time back).
WITH bounds AS (
  SELECT TIMESTAMP '2026-08-10 00:00' AT TIME ZONE 'America/Chicago' AS win_start,
         TIMESTAMP '2026-08-18 00:00' AT TIME ZONE 'America/Chicago' AS win_end
),
u AS (
  SELECT id AS user_id FROM tenant."user" WHERE email ILIKE 'aryan@cintara.ai'
),
src AS (
  SELECT t.id, t.start_time, t.end_time, t.last_alive_at, t.status
  FROM time_doctor.time_logs t
  JOIN u ON u.user_id = t.user_id
  CROSS JOIN bounds b
  WHERE t.end_time IS NOT NULL
    AND t.start_time < b.win_end
    AND t.end_time > b.win_start
    AND t.end_time - t.start_time >= INTERVAL '30 minutes'
),
proof AS (
  SELECT s.*,
         GREATEST(
           s.start_time,
           CASE
             WHEN s.last_alive_at IS NOT NULL
              AND s.last_alive_at > s.start_time + INTERVAL '2 minutes'
             THEN s.last_alive_at
             ELSE s.start_time
           END,
           COALESCE((SELECT MAX(x.captured_at) FROM time_doctor.screenshots x
                     WHERE x.time_log_id = s.id), s.start_time),
           COALESCE((SELECT MAX(h.seen_at) FROM time_doctor.session_heartbeats h
                     WHERE h.time_log_id = s.id), s.start_time),
           COALESCE((SELECT MAX(COALESCE(a.ended_at, a.started_at, a.timestamp))
                     FROM time_doctor.app_logs a WHERE a.time_log_id = s.id), s.start_time),
           COALESCE((SELECT MAX(COALESCE(ul.ended_at, ul.started_at))
                     FROM time_doctor.url_logs ul WHERE ul.time_log_id = s.id), s.start_time)
         ) AS last_proof
  FROM src s
)
SELECT id,
       start_time,
       end_time AS old_end,
       last_proof AS new_end,
       ROUND(EXTRACT(EPOCH FROM (end_time - last_proof)) / 3600.0, 2) AS hours_we_would_cut
FROM proof
WHERE last_proof > start_time + INTERVAL '2 minutes'
  AND last_proof < end_time - INTERVAL '30 minutes'
ORDER BY hours_we_would_cut DESC;


-- 1C. Overlaps we refuse (next session shorter than 5 minutes).
-- 63a38ba5 / 38e269c8 live here. Do not clamp these.
WITH bounds AS (
  SELECT TIMESTAMP '2026-08-10 00:00' AT TIME ZONE 'America/Chicago' AS win_start,
         TIMESTAMP '2026-08-18 00:00' AT TIME ZONE 'America/Chicago' AS win_end
),
u AS (
  SELECT id AS user_id FROM tenant."user" WHERE email ILIKE 'aryan@cintara.ai'
),
ordered AS (
  SELECT t.id, t.start_time, t.end_time,
         LEAD(t.start_time) OVER w AS next_start,
         LEAD(t.end_time)   OVER w AS next_end
  FROM time_doctor.time_logs t
  JOIN u ON u.user_id = t.user_id
  WINDOW w AS (
    PARTITION BY t.user_id, COALESCE(t.device_id, '')
    ORDER BY t.start_time, t.id
  )
)
SELECT o.id,
       o.start_time,
       o.end_time,
       o.next_start,
       ROUND(EXTRACT(EPOCH FROM (o.next_end - o.next_start)) / 60.0, 1) AS next_minutes,
       ROUND(EXTRACT(EPOCH FROM (o.end_time - o.next_start)) / 3600.0, 2) AS hours_we_will_not_cut
FROM ordered o
CROSS JOIN bounds b
WHERE o.next_start IS NOT NULL
  AND o.end_time > o.next_start
  AND o.next_end IS NOT NULL
  AND o.next_end - o.next_start < INTERVAL '5 minutes'
  AND o.start_time < b.win_end
  AND o.end_time > b.win_start
ORDER BY hours_we_will_not_cut DESC;


-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 2 — THE CORRECTION. Run only after STEP 1A / 1B look right.
-- ═══════════════════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS time_doctor.aryan_hours_fix_2026_08_18;

CREATE TABLE time_doctor.aryan_hours_fix_2026_08_18 AS
WITH bounds AS (
  SELECT TIMESTAMP '2026-08-10 00:00' AT TIME ZONE 'America/Chicago' AS win_start,
         TIMESTAMP '2026-08-18 00:00' AT TIME ZONE 'America/Chicago' AS win_end
),
u AS (
  SELECT id AS user_id FROM tenant."user" WHERE email ILIKE 'aryan@cintara.ai'
),
ordered AS (
  SELECT t.id, t.user_id, t.workspace_id, t.device_id, t.start_time, t.end_time,
         t.status, t.last_alive_at, t.idle_seconds,
         LEAD(t.start_time) OVER w AS next_start,
         LEAD(t.end_time)   OVER w AS next_end
  FROM time_doctor.time_logs t
  JOIN u ON u.user_id = t.user_id
  WINDOW w AS (
    PARTITION BY t.user_id, COALESCE(t.device_id, '')
    ORDER BY t.start_time, t.id
  )
),
overlap AS (
  SELECT o.id,
         GREATEST(o.start_time, o.next_start) AS proposed_end,
         'overlap'::text AS reason
  FROM ordered o
  CROSS JOIN bounds b
  WHERE o.next_start IS NOT NULL
    AND COALESCE(o.end_time, 'infinity'::timestamptz) > o.next_start
    AND o.next_end IS NOT NULL
    AND o.next_end - o.next_start >= INTERVAL '5 minutes'
    AND o.start_time < b.win_end
    AND COALESCE(o.end_time, o.next_start) > b.win_start
),
proof AS (
  SELECT o.id,
         GREATEST(
           o.start_time,
           CASE
             WHEN o.last_alive_at IS NOT NULL
              AND o.last_alive_at > o.start_time + INTERVAL '2 minutes'
             THEN o.last_alive_at
             ELSE o.start_time
           END,
           COALESCE((SELECT MAX(x.captured_at) FROM time_doctor.screenshots x
                     WHERE x.time_log_id = o.id), o.start_time),
           COALESCE((SELECT MAX(h.seen_at) FROM time_doctor.session_heartbeats h
                     WHERE h.time_log_id = o.id), o.start_time),
           COALESCE((SELECT MAX(COALESCE(a.ended_at, a.started_at, a.timestamp))
                     FROM time_doctor.app_logs a WHERE a.time_log_id = o.id), o.start_time),
           COALESCE((SELECT MAX(COALESCE(ul.ended_at, ul.started_at))
                     FROM time_doctor.url_logs ul WHERE ul.time_log_id = o.id), o.start_time)
         ) AS last_proof
  FROM ordered o
  CROSS JOIN bounds b
  WHERE o.end_time IS NOT NULL
    AND o.end_time - o.start_time >= INTERVAL '30 minutes'
    AND o.start_time < b.win_end
    AND o.end_time > b.win_start
),
tail AS (
  SELECT p.id,
         p.last_proof AS proposed_end,
         'no_proof_tail'::text AS reason
  FROM proof p
  JOIN ordered o ON o.id = p.id
  WHERE p.last_proof > o.start_time + INTERVAL '2 minutes'
    AND p.last_proof < o.end_time - INTERVAL '30 minutes'
),
proposed AS (
  SELECT id, MIN(proposed_end) AS new_end_time, STRING_AGG(reason, ',') AS reasons
  FROM (
    SELECT * FROM overlap
    UNION ALL
    SELECT * FROM tail
  ) x
  GROUP BY id
)
SELECT t.id,
       t.user_id,
       t.workspace_id,
       t.device_id,
       t.start_time,
       t.end_time      AS old_end_time,
       t.status        AS old_status,
       t.last_alive_at AS old_last_alive_at,
       t.idle_seconds  AS old_idle_seconds,
       GREATEST(t.start_time, p.new_end_time) AS new_end_time,
       CASE WHEN t.end_time IS NULL THEN 'auto_closed' ELSE t.status END AS new_status,
       p.reasons
FROM proposed p
JOIN time_doctor.time_logs t ON t.id = p.id
WHERE GREATEST(t.start_time, p.new_end_time)
        < COALESCE(t.end_time, 'infinity'::timestamptz);

-- Review the plan before 2b.
SELECT f.id, f.start_time, f.old_end_time, f.new_end_time, f.reasons,
       ROUND(EXTRACT(EPOCH FROM (
         COALESCE(f.old_end_time, f.new_end_time) - f.new_end_time
       )) / 3600.0, 2) AS hours_removed
FROM time_doctor.aryan_hours_fix_2026_08_18 f
ORDER BY hours_removed DESC;


-- 2b. Audit.
INSERT INTO time_doctor.time_log_events
  (user_id, time_log_id, workspace_id, action, source, device_id, meta,
   old_start_time, old_end_time, old_status,
   new_start_time, new_end_time, new_status, shortened)
SELECT f.user_id, f.id, f.workspace_id,
       'admin_aryan_hours_fix', 'manual-correction-2026-08-18', f.device_id,
       jsonb_build_object(
         'reasons', f.reasons,
         'window', '2026-08-10..2026-08-17 America/Chicago',
         'corrected_by', 'engineering'
       ),
       f.start_time, f.old_end_time, f.old_status,
       f.start_time, f.new_end_time, f.new_status, TRUE
FROM time_doctor.aryan_hours_fix_2026_08_18 f;

-- 2c. Apply.
UPDATE time_doctor.time_logs t
SET end_time      = f.new_end_time,
    status        = f.new_status,
    last_alive_at = CASE
                      WHEN t.last_alive_at IS NULL THEN t.last_alive_at
                      ELSE LEAST(t.last_alive_at, f.new_end_time)
                    END,
    updated_at    = NOW()
FROM time_doctor.aryan_hours_fix_2026_08_18 f
WHERE f.id = t.id
  AND COALESCE(t.end_time, 'infinity'::timestamptz) > f.new_end_time;

-- 2d. Idle past the new end.
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
FROM time_doctor.aryan_hours_fix_2026_08_18 f
JOIN time_doctor.time_logs t ON t.id = f.id
WHERE il.time_log_id = f.id
  AND il.idle_start < f.new_end_time
  AND GREATEST(
        COALESCE(il.idle_end, il.idle_start),
        il.idle_start + make_interval(secs => COALESCE(il.duration_seconds, 0))
      ) > f.new_end_time;

DELETE FROM time_doctor.idle_logs il
USING time_doctor.aryan_hours_fix_2026_08_18 f
WHERE il.time_log_id = f.id
  AND il.idle_start >= f.new_end_time;

UPDATE time_doctor.time_logs t
SET idle_seconds = COALESCE(c.total, 0),
    updated_at   = NOW()
FROM time_doctor.aryan_hours_fix_2026_08_18 f
LEFT JOIN LATERAL (
  SELECT SUM(GREATEST(0, COALESCE(i2.duration_seconds, 0)))::int AS total
  FROM time_doctor.idle_logs i2
  WHERE i2.time_log_id = f.id
) c ON TRUE
WHERE t.id = f.id
  AND t.idle_seconds IS DISTINCT FROM COALESCE(c.total, 0);


-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 3 — VERIFY
-- ═══════════════════════════════════════════════════════════════════════════

-- Must be 0: no remaining 5-minute-next overlaps in the window.
WITH bounds AS (
  SELECT TIMESTAMP '2026-08-10 00:00' AT TIME ZONE 'America/Chicago' AS win_start,
         TIMESTAMP '2026-08-18 00:00' AT TIME ZONE 'America/Chicago' AS win_end
),
u AS (
  SELECT id AS user_id FROM tenant."user" WHERE email ILIKE 'aryan@cintara.ai'
),
ordered AS (
  SELECT t.end_time,
         LEAD(t.start_time) OVER w AS next_start,
         LEAD(t.end_time)   OVER w AS next_end
  FROM time_doctor.time_logs t
  JOIN u ON u.user_id = t.user_id
  WINDOW w AS (
    PARTITION BY t.user_id, COALESCE(t.device_id, '')
    ORDER BY t.start_time, t.id
  )
)
SELECT COUNT(*) AS remaining_real_overlaps
FROM ordered o
CROSS JOIN bounds b
WHERE o.next_start IS NOT NULL
  AND COALESCE(o.end_time, 'infinity'::timestamptz) > o.next_start
  AND o.next_end IS NOT NULL
  AND o.next_end - o.next_start >= INTERVAL '5 minutes';

SELECT ROUND(SUM(EXTRACT(EPOCH FROM (
         COALESCE(f.old_end_time, f.new_end_time) - f.new_end_time
       ))) / 3600.0, 2) AS hours_removed
FROM time_doctor.aryan_hours_fix_2026_08_18 f;


-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 4 — ROLLBACK
--   DROP TABLE time_doctor.aryan_hours_fix_2026_08_18;
-- ═══════════════════════════════════════════════════════════════════════════
-- UPDATE time_doctor.time_logs t
-- SET end_time      = f.old_end_time,
--     status        = f.old_status,
--     last_alive_at = f.old_last_alive_at,
--     idle_seconds  = f.old_idle_seconds,
--     updated_at    = NOW()
-- FROM time_doctor.aryan_hours_fix_2026_08_18 f
-- WHERE f.id = t.id;
