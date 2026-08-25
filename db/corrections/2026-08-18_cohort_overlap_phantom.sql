-- Cohort overlap + phantom fix — Aug 10–16 2026 (America/Chicago).
--
-- Users: Garima, Fawad, Thirumalai, Awais, Bhupen, Sahil, Mohita, Hamza.
--
-- Why
--   Time Doctor export comparison showed Alyson double-billing the same minutes
--   on overlapping / near-duplicate sessions (largest: Fawad Aug 11 +6.13h
--   duplicate pair). Pulse daily hours already merge intervals, but raw session
--   sums, project rollups, and re-exports still overstate. No-proof tails also
--   leave phantom minutes after the last screenshot / heartbeat / app / URL.
--
-- What this WILL do
--   A. Overlap clamp on the same device: end_time := next session start_time
--      when the next session lasted >= 5 minutes (or is a near-duplicate with
--      the same end_time). Skips the "embedded glitch inside a real day" case
--      when the earlier row still has proof after the short next session ended.
--   B. Tail clip: if last proof is >30 minutes before end_time, move end_time
--      back to that proof. Never moves start_time. Never lengthens.
--
-- What this will NEVER do
--   * Touch users outside the cohort
--   * Touch the latest live session on a device (no next start) for overlaps
--   * Invent Time Doctor hours that Alyson never synced (e.g. Bhupen's missing days)
--
-- Run STEP 1 alone first. It changes nothing.
--
-- win_start = 2026-08-10 00:00 America/Chicago
-- win_end   = 2026-08-17 00:00 America/Chicago  (exclusive)


-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 1 — READ ONLY
-- ═══════════════════════════════════════════════════════════════════════════

-- 1A. Overlaps we will clamp (safe).
WITH bounds AS (
  SELECT TIMESTAMP '2026-08-10 00:00' AT TIME ZONE 'America/Chicago' AS win_start,
         TIMESTAMP '2026-08-17 00:00' AT TIME ZONE 'America/Chicago' AS win_end
),
cohort AS (
  SELECT id AS user_id, email
  FROM tenant."user"
  WHERE lower(email) IN (
    'garima@cintara.ai',
    'fawad@cintara.ai',
    'thirumalai@cintara.ai',
    'awais@cintara.ai',
    'bhupen@cintara.ai',
    'sahil.divekar@cintara.ai',
    'mohita@cintara.ai',
    'hamza@cintara.ai'
  )
),
ordered AS (
  SELECT t.id, t.user_id, t.device_id, t.start_time, t.end_time, t.status,
         t.last_alive_at,
         LEAD(t.start_time) OVER w AS next_start,
         LEAD(t.end_time)   OVER w AS next_end,
         LEAD(t.id)         OVER w AS next_id
  FROM time_doctor.time_logs t
  JOIN cohort c ON c.user_id = t.user_id
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
    AND o.start_time < b.win_end
    AND COALESCE(o.end_time, o.next_start) > b.win_start
    AND (
      -- Real next session (>= 5 min), or near-duplicate sharing the same end.
      (o.next_end IS NOT NULL AND o.next_end - o.next_start >= INTERVAL '5 minutes')
      OR (o.end_time IS NOT NULL AND o.next_end IS NOT NULL AND o.end_time = o.next_end
          AND o.next_start - o.start_time <= INTERVAL '2 seconds')
    )
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
          AND s.last_proof > s.next_end + INTERVAL '2 minutes'
          AND NOT (s.end_time = s.next_end
                   AND s.next_start - s.start_time <= INTERVAL '2 seconds')
         ) AS skip_embedded_real_work
  FROM scored s
)
SELECT co.email,
       c.id,
       c.next_id,
       c.start_time,
       c.end_time AS old_end,
       c.next_start AS new_end,
       ROUND(EXTRACT(EPOCH FROM (c.next_end - c.next_start)) / 60.0, 1) AS next_minutes,
       ROUND(EXTRACT(EPOCH FROM (
         COALESCE(c.end_time, c.next_start) - GREATEST(c.start_time, c.next_start)
       )) / 3600.0, 2) AS phantom_hours
FROM classified c
JOIN cohort co ON co.user_id = c.user_id
WHERE NOT c.skip_embedded_real_work
ORDER BY phantom_hours DESC, co.email, c.start_time;


-- 1B. No-proof tails we would clip.
WITH bounds AS (
  SELECT TIMESTAMP '2026-08-10 00:00' AT TIME ZONE 'America/Chicago' AS win_start,
         TIMESTAMP '2026-08-17 00:00' AT TIME ZONE 'America/Chicago' AS win_end
),
cohort AS (
  SELECT id AS user_id, email
  FROM tenant."user"
  WHERE lower(email) IN (
    'garima@cintara.ai',
    'fawad@cintara.ai',
    'thirumalai@cintara.ai',
    'awais@cintara.ai',
    'bhupen@cintara.ai',
    'sahil.divekar@cintara.ai',
    'mohita@cintara.ai',
    'hamza@cintara.ai'
  )
),
src AS (
  SELECT t.id, t.user_id, t.start_time, t.end_time, t.last_alive_at, t.status
  FROM time_doctor.time_logs t
  JOIN cohort c ON c.user_id = t.user_id
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
SELECT co.email,
       p.id,
       p.start_time,
       p.end_time AS old_end,
       p.last_proof AS new_end,
       ROUND(EXTRACT(EPOCH FROM (p.end_time - p.last_proof)) / 3600.0, 2) AS hours_we_would_cut
FROM proof p
JOIN cohort co ON co.user_id = p.user_id
WHERE p.last_proof > p.start_time + INTERVAL '2 minutes'
  AND p.last_proof < p.end_time - INTERVAL '30 minutes'
ORDER BY hours_we_would_cut DESC, co.email;


-- 1C. Overlaps we refuse (embedded next session with later proof on earlier row).
WITH bounds AS (
  SELECT TIMESTAMP '2026-08-10 00:00' AT TIME ZONE 'America/Chicago' AS win_start,
         TIMESTAMP '2026-08-17 00:00' AT TIME ZONE 'America/Chicago' AS win_end
),
cohort AS (
  SELECT id AS user_id, email
  FROM tenant."user"
  WHERE lower(email) IN (
    'garima@cintara.ai',
    'fawad@cintara.ai',
    'thirumalai@cintara.ai',
    'awais@cintara.ai',
    'bhupen@cintara.ai',
    'sahil.divekar@cintara.ai',
    'mohita@cintara.ai',
    'hamza@cintara.ai'
  )
),
ordered AS (
  SELECT t.id, t.user_id, t.start_time, t.end_time, t.last_alive_at,
         LEAD(t.start_time) OVER w AS next_start,
         LEAD(t.end_time)   OVER w AS next_end
  FROM time_doctor.time_logs t
  JOIN cohort c ON c.user_id = t.user_id
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
    AND o.start_time < b.win_end
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
SELECT co.email,
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
JOIN cohort co ON co.user_id = s.user_id
WHERE s.end_time IS NOT NULL
  AND s.next_end IS NOT NULL
  AND s.next_end < s.end_time - INTERVAL '2 minutes'
  AND s.last_proof > s.next_end + INTERVAL '2 minutes'
  AND NOT (s.end_time = s.next_end
           AND s.next_start - s.start_time <= INTERVAL '2 seconds')
ORDER BY hours_we_will_not_cut DESC;


-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 2 — THE CORRECTION. Run only after STEP 1A / 1B look right.
-- ═══════════════════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS time_doctor.cohort_overlap_phantom_fix_2026_08_18;

CREATE TABLE time_doctor.cohort_overlap_phantom_fix_2026_08_18 AS
WITH bounds AS (
  SELECT TIMESTAMP '2026-08-10 00:00' AT TIME ZONE 'America/Chicago' AS win_start,
         TIMESTAMP '2026-08-17 00:00' AT TIME ZONE 'America/Chicago' AS win_end
),
cohort AS (
  SELECT id AS user_id
  FROM tenant."user"
  WHERE lower(email) IN (
    'garima@cintara.ai',
    'fawad@cintara.ai',
    'thirumalai@cintara.ai',
    'awais@cintara.ai',
    'bhupen@cintara.ai',
    'sahil.divekar@cintara.ai',
    'mohita@cintara.ai',
    'hamza@cintara.ai'
  )
),
ordered AS (
  SELECT t.id, t.user_id, t.workspace_id, t.device_id, t.start_time, t.end_time,
         t.status, t.last_alive_at, t.idle_seconds,
         LEAD(t.start_time) OVER w AS next_start,
         LEAD(t.end_time)   OVER w AS next_end
  FROM time_doctor.time_logs t
  JOIN cohort c ON c.user_id = t.user_id
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
    AND o.start_time < b.win_end
    AND COALESCE(o.end_time, o.next_start) > b.win_start
    AND (
      (o.next_end IS NOT NULL AND o.next_end - o.next_start >= INTERVAL '5 minutes')
      OR (o.end_time IS NOT NULL AND o.next_end IS NOT NULL AND o.end_time = o.next_end
          AND o.next_start - o.start_time <= INTERVAL '2 seconds')
    )
    -- Refuse embedded real-work case (unless near-duplicate).
    AND NOT (
      o.end_time IS NOT NULL
      AND o.next_end IS NOT NULL
      AND o.next_end < o.end_time - INTERVAL '2 minutes'
      AND GREATEST(
            o.start_time,
            COALESCE(o.last_alive_at, o.start_time),
            COALESCE((SELECT MAX(s.captured_at) FROM time_doctor.screenshots s
                      WHERE s.time_log_id = o.id), o.start_time),
            COALESCE((SELECT MAX(h.seen_at) FROM time_doctor.session_heartbeats h
                      WHERE h.time_log_id = o.id), o.start_time),
            COALESCE((SELECT MAX(COALESCE(a.ended_at, a.started_at, a.timestamp))
                      FROM time_doctor.app_logs a WHERE a.time_log_id = o.id), o.start_time),
            COALESCE((SELECT MAX(COALESCE(u.ended_at, u.started_at))
                      FROM time_doctor.url_logs u WHERE u.time_log_id = o.id), o.start_time)
          ) > o.next_end + INTERVAL '2 minutes'
      AND NOT (o.end_time = o.next_end
               AND o.next_start - o.start_time <= INTERVAL '2 seconds')
    )
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
  SELECT id, MIN(proposed_end) AS new_end_time, STRING_AGG(reason, ',' ORDER BY reason) AS reasons
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
SELECT u.email,
       f.id,
       f.start_time,
       f.old_end_time,
       f.new_end_time,
       f.reasons,
       ROUND(EXTRACT(EPOCH FROM (
         COALESCE(f.old_end_time, f.new_end_time) - f.new_end_time
       )) / 3600.0, 2) AS hours_removed
FROM time_doctor.cohort_overlap_phantom_fix_2026_08_18 f
JOIN tenant."user" u ON u.id = f.user_id
ORDER BY hours_removed DESC, u.email;


-- 2b. Audit.
INSERT INTO time_doctor.time_log_events
  (user_id, time_log_id, workspace_id, action, source, device_id, meta,
   old_start_time, old_end_time, old_status,
   new_start_time, new_end_time, new_status, shortened)
SELECT f.user_id, f.id, f.workspace_id,
       'admin_cohort_overlap_phantom_fix', 'manual-correction-2026-08-18', f.device_id,
       jsonb_build_object(
         'reasons', f.reasons,
         'window', '2026-08-10..2026-08-16 America/Chicago',
         'cohort', 'garima,fawad,thirumalai,awais,bhupen,sahil,mohita,hamza',
         'corrected_by', 'engineering'
       ),
       f.start_time, f.old_end_time, f.old_status,
       f.start_time, f.new_end_time, f.new_status, TRUE
FROM time_doctor.cohort_overlap_phantom_fix_2026_08_18 f;

-- 2c. Apply.
UPDATE time_doctor.time_logs t
SET end_time      = f.new_end_time,
    status        = f.new_status,
    last_alive_at = CASE
                      WHEN t.last_alive_at IS NULL THEN t.last_alive_at
                      ELSE LEAST(t.last_alive_at, f.new_end_time)
                    END,
    updated_at    = NOW()
FROM time_doctor.cohort_overlap_phantom_fix_2026_08_18 f
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
FROM time_doctor.cohort_overlap_phantom_fix_2026_08_18 f
JOIN time_doctor.time_logs t ON t.id = f.id
WHERE il.time_log_id = f.id
  AND il.idle_start < f.new_end_time
  AND GREATEST(
        COALESCE(il.idle_end, il.idle_start),
        il.idle_start + make_interval(secs => COALESCE(il.duration_seconds, 0))
      ) > f.new_end_time;

DELETE FROM time_doctor.idle_logs il
USING time_doctor.cohort_overlap_phantom_fix_2026_08_18 f
WHERE il.time_log_id = f.id
  AND il.idle_start >= f.new_end_time;

UPDATE time_doctor.time_logs t
SET idle_seconds = COALESCE(c.total, 0),
    updated_at   = NOW()
FROM time_doctor.cohort_overlap_phantom_fix_2026_08_18 f
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

-- Must be 0: remaining safe overlaps in cohort + window.
WITH bounds AS (
  SELECT TIMESTAMP '2026-08-10 00:00' AT TIME ZONE 'America/Chicago' AS win_start,
         TIMESTAMP '2026-08-17 00:00' AT TIME ZONE 'America/Chicago' AS win_end
),
cohort AS (
  SELECT id AS user_id
  FROM tenant."user"
  WHERE lower(email) IN (
    'garima@cintara.ai',
    'fawad@cintara.ai',
    'thirumalai@cintara.ai',
    'awais@cintara.ai',
    'bhupen@cintara.ai',
    'sahil.divekar@cintara.ai',
    'mohita@cintara.ai',
    'hamza@cintara.ai'
  )
),
ordered AS (
  SELECT t.end_time, t.start_time, t.last_alive_at, t.id,
         LEAD(t.start_time) OVER w AS next_start,
         LEAD(t.end_time)   OVER w AS next_end
  FROM time_doctor.time_logs t
  JOIN cohort c ON c.user_id = t.user_id
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
    AND o.start_time < b.win_end
    AND COALESCE(o.end_time, o.next_start) > b.win_start
    AND o.next_end IS NOT NULL
    AND o.next_end - o.next_start >= INTERVAL '5 minutes'
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
SELECT COUNT(*) AS remaining_safe_overlaps
FROM scored s
WHERE NOT (s.end_time IS NOT NULL
           AND s.next_end IS NOT NULL
           AND s.next_end < s.end_time - INTERVAL '2 minutes'
           AND s.last_proof > s.next_end + INTERVAL '2 minutes');

SELECT u.email,
       COUNT(*) AS sessions_shortened,
       ROUND(SUM(EXTRACT(EPOCH FROM (
         COALESCE(f.old_end_time, f.new_end_time) - f.new_end_time
       ))) / 3600.0, 2) AS hours_removed,
       STRING_AGG(DISTINCT f.reasons, ', ') AS reasons
FROM time_doctor.cohort_overlap_phantom_fix_2026_08_18 f
JOIN tenant."user" u ON u.id = f.user_id
GROUP BY u.email
ORDER BY hours_removed DESC;


-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 4 — ROLLBACK
--   DROP TABLE time_doctor.cohort_overlap_phantom_fix_2026_08_18;
-- ═══════════════════════════════════════════════════════════════════════════
-- UPDATE time_doctor.time_logs t
-- SET end_time      = f.old_end_time,
--     status        = f.old_status,
--     last_alive_at = f.old_last_alive_at,
--     idle_seconds  = f.old_idle_seconds,
--     updated_at    = NOW()
-- FROM time_doctor.cohort_overlap_phantom_fix_2026_08_18 f
-- WHERE f.id = t.id;
