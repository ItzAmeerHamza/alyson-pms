-- Ahsan Zafar (user_id 1201, workspace 511) — leftover-Meet phantom, Chicago week.
--
-- Pulse (America/Chicago wall, matches the daily cards):
--   Wed 26  ~36m     (not in the Aug 27–30 time_logs export; preview will show it)
--   Thu 27  14h 48m  screenshot-backed all day — DO NOT wipe
--   Fri 28   6h 12m  screenshot-backed; optional mid-gap note in STEP 3
--   Sat 29  10h 48m  leftover Meet after lid-close ~20:01 PKT — THIS is the phantom
--   Sun 30   6h 24m  screenshots every minute until manual stop 16:26 PKT
--
-- Confirmed phantom (desktop logs + zero screenshots after last proof):
--   b1592b09  clip end to last screenshot 2026-08-29 15:01:24Z (~1.68h tail)
--   91e7cdbd  no screenshots — collapse to zero
--   59366784  no screenshots — collapse to zero
--   3e4f859c  no screenshots — collapse to zero
--   9da236bb  no screenshots — collapse to zero
--   442246bd  no screenshots — collapse to zero
--   Total removed ≈ 4.6h, all on Chicago Saturday 2026-08-29.
--
-- Run STEP 1 alone first. It changes nothing.
-- Review the plan, then run STEP 2 inside the transaction and COMMIT.


-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 1 — READ ONLY
-- ═══════════════════════════════════════════════════════════════════════════

-- 1A. Every Ahsan session that overlaps Chicago Aug 26–30 (what Pulse shows).
SELECT
  t.id,
  t.status,
  t.start_time AT TIME ZONE 'America/Chicago' AS start_cdt,
  t.end_time   AT TIME ZONE 'America/Chicago' AS end_cdt,
  t.start_time AT TIME ZONE 'Asia/Karachi'    AS start_pkt,
  t.end_time   AT TIME ZONE 'Asia/Karachi'    AS end_pkt,
  ROUND(EXTRACT(EPOCH FROM (t.end_time - t.start_time)) / 3600.0, 2) AS hours,
  t.idle_seconds,
  (SELECT MAX(s.captured_at) FROM time_doctor.screenshots s WHERE s.time_log_id = t.id)
    AS last_screenshot
FROM time_doctor.time_logs t
WHERE t.user_id = 1201
  AND t.workspace_id = 511
  AND t.start_time <  TIMESTAMPTZ '2026-08-31 00:00:00 America/Chicago'
  AND COALESCE(t.end_time, t.last_alive_at, NOW())
        > TIMESTAMPTZ '2026-08-26 00:00:00 America/Chicago'
ORDER BY t.start_time;

-- 1B. Chicago-day wall totals (same merge Pulse uses, before any edit).
WITH bounds AS (
  SELECT d::date AS work_date
  FROM generate_series(
         DATE '2026-08-26',
         DATE '2026-08-30',
         INTERVAL '1 day'
       ) AS d
),
clipped AS (
  SELECT
    b.work_date,
    GREATEST(t.start_time, (b.work_date::timestamp AT TIME ZONE 'America/Chicago')) AS clip_start,
    LEAST(
      COALESCE(t.end_time, t.last_alive_at, NOW()),
      ((b.work_date + 1)::timestamp AT TIME ZONE 'America/Chicago')
    ) AS clip_end
  FROM time_doctor.time_logs t
  CROSS JOIN bounds b
  WHERE t.user_id = 1201
    AND t.workspace_id = 511
    AND t.start_time <  ((b.work_date + 1)::timestamp AT TIME ZONE 'America/Chicago')
    AND COALESCE(t.end_time, t.last_alive_at, NOW())
          > (b.work_date::timestamp AT TIME ZONE 'America/Chicago')
)
SELECT
  work_date,
  ROUND(SUM(EXTRACT(EPOCH FROM (clip_end - clip_start))) / 3600.0, 2) AS tracked_h
FROM clipped
WHERE clip_end > clip_start
GROUP BY work_date
ORDER BY work_date;

-- 1C. Plan. Prod screenshots are not joined to these time_log_ids, so
-- last_proof falls back to start_time. For b1592b09 we clip to the last
-- desktop-log screenshot instead of zeroing the whole session.
-- Expect ~4.6h removed, Saturday only.
WITH plan AS (
  SELECT * FROM (VALUES
    ('b1592b09-25de-49e9-948e-8957c10709a7'::uuid,
     TIMESTAMPTZ '2026-08-29 15:01:24+00'),  -- last agent screenshot 20:01 PKT
    ('91e7cdbd-5de6-4a61-9d92-98cf0d60ae97'::uuid, NULL),
    ('59366784-4006-46ea-9a97-e4d28b8b810d'::uuid, NULL),
    ('3e4f859c-eb49-46f8-b4e1-e522f34483d8'::uuid, NULL),
    ('9da236bb-ab5e-4bea-a7fd-6d7efb5e9396'::uuid, NULL),
    ('442246bd-c765-4266-b1b6-6f1a7e19bb96'::uuid, NULL)
  ) AS p(id, clip_end)
)
SELECT
  t.id,
  t.start_time AT TIME ZONE 'America/Chicago' AS start_cdt,
  t.end_time   AT TIME ZONE 'America/Chicago' AS old_end_cdt,
  COALESCE(p.clip_end, t.start_time) AT TIME ZONE 'America/Chicago' AS new_end_cdt,
  ROUND(EXTRACT(EPOCH FROM (
    t.end_time - COALESCE(p.clip_end, t.start_time)
  )) / 3600.0, 2) AS hours_removed
FROM time_doctor.time_logs t
JOIN plan p ON p.id = t.id
WHERE t.user_id = 1201
ORDER BY t.start_time;


-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 2 — APPLY. Review 1C, then run this block and COMMIT.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DROP TABLE IF EXISTS time_doctor.ahsan_1201_phantom_fix_2026_08_31;

CREATE TABLE time_doctor.ahsan_1201_phantom_fix_2026_08_31 AS
WITH plan AS (
  SELECT * FROM (VALUES
    ('b1592b09-25de-49e9-948e-8957c10709a7'::uuid,
     TIMESTAMPTZ '2026-08-29 15:01:24+00', 'no_proof_tail'),
    ('91e7cdbd-5de6-4a61-9d92-98cf0d60ae97'::uuid, NULL, 'no_proof_session'),
    ('59366784-4006-46ea-9a97-e4d28b8b810d'::uuid, NULL, 'no_proof_session'),
    ('3e4f859c-eb49-46f8-b4e1-e522f34483d8'::uuid, NULL, 'no_proof_session'),
    ('9da236bb-ab5e-4bea-a7fd-6d7efb5e9396'::uuid, NULL, 'no_proof_session'),
    ('442246bd-c765-4266-b1b6-6f1a7e19bb96'::uuid, NULL, 'no_proof_session')
  ) AS p(id, clip_end, reason)
)
SELECT
  t.id, t.user_id, t.workspace_id, t.device_id,
  t.start_time,
  t.end_time      AS old_end_time,
  t.status        AS old_status,
  t.last_alive_at AS old_last_alive_at,
  t.idle_seconds  AS old_idle_seconds,
  COALESCE(p.clip_end, t.start_time) AS new_end_time,
  p.reason
FROM time_doctor.time_logs t
JOIN plan p ON p.id = t.id
WHERE t.user_id = 1201
  AND t.workspace_id = 511
  AND t.end_time IS NOT NULL
  AND t.end_time > COALESCE(p.clip_end, t.start_time);

-- Review backup rows before UPDATE.
SELECT id, reason,
       old_end_time, new_end_time,
       ROUND(EXTRACT(EPOCH FROM (old_end_time - new_end_time)) / 3600.0, 2) AS hours_removed
FROM time_doctor.ahsan_1201_phantom_fix_2026_08_31
ORDER BY start_time;

INSERT INTO time_doctor.time_log_events
  (user_id, time_log_id, workspace_id, action, source, device_id, meta,
   old_start_time, old_end_time, old_status,
   new_start_time, new_end_time, new_status, shortened)
SELECT f.user_id, f.id, f.workspace_id,
       'admin_ahsan_leftover_meet_phantom',
       'manual-correction-2026-08-31',
       f.device_id,
       jsonb_build_object(
         'reason', f.reason,
         'user', 'ahsan user_id=1201',
         'window', '2026-08-29 leftover Meet after lid-close',
         'corrected_by', 'engineering'
       ),
       f.start_time, f.old_end_time, f.old_status,
       f.start_time, f.new_end_time, f.old_status, TRUE
FROM time_doctor.ahsan_1201_phantom_fix_2026_08_31 f;

UPDATE time_doctor.time_logs t
SET end_time      = f.new_end_time,
    last_alive_at = CASE
                      WHEN t.last_alive_at IS NULL THEN t.last_alive_at
                      ELSE LEAST(t.last_alive_at, f.new_end_time)
                    END,
    updated_at    = NOW()
FROM time_doctor.ahsan_1201_phantom_fix_2026_08_31 f
WHERE f.id = t.id
  AND t.user_id = 1201
  AND COALESCE(t.end_time, 'infinity'::timestamptz) > f.new_end_time;

-- ── AFTER (Saturday should drop ~4.6h; Thu/Fri/Sun unchanged) ─────────────
WITH bounds AS (
  SELECT d::date AS work_date
  FROM generate_series(DATE '2026-08-26', DATE '2026-08-30', INTERVAL '1 day') AS d
),
clipped AS (
  SELECT
    b.work_date,
    GREATEST(t.start_time, (b.work_date::timestamp AT TIME ZONE 'America/Chicago')) AS clip_start,
    LEAST(
      COALESCE(t.end_time, t.last_alive_at, NOW()),
      ((b.work_date + 1)::timestamp AT TIME ZONE 'America/Chicago')
    ) AS clip_end
  FROM time_doctor.time_logs t
  CROSS JOIN bounds b
  WHERE t.user_id = 1201
    AND t.workspace_id = 511
    AND t.start_time <  ((b.work_date + 1)::timestamp AT TIME ZONE 'America/Chicago')
    AND COALESCE(t.end_time, t.last_alive_at, NOW())
          > (b.work_date::timestamp AT TIME ZONE 'America/Chicago')
)
SELECT
  work_date,
  ROUND(SUM(EXTRACT(EPOCH FROM (clip_end - clip_start))) / 3600.0, 2) AS tracked_h
FROM clipped
WHERE clip_end > clip_start
GROUP BY work_date
ORDER BY work_date;

COMMIT;


-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 3 — OPTIONAL. Friday 28 mid-session screenshot hole (18:28–20:43 PKT).
-- Session 01e143d0 kept running 135 min with no screenshots. Pulse still
-- counts that hole because end_time is after the gap. Deduct via adjustment
-- so we do not destroy the real work after 20:43 PKT.
-- ═══════════════════════════════════════════════════════════════════════════

-- BEGIN;
--
-- INSERT INTO time_doctor.time_adjustments
--   (id, workspace_id, user_id, work_date, delta_seconds, reason,
--    created_by, source_type, source_id)
-- SELECT
--   '20260828-1201-a01e-143d-0gap8125sec'::uuid,
--   511,
--   1201,
--   DATE '2026-08-28',
--   -8125,
--   'Remove 135m screenshot gap 18:28–20:43 PKT inside 01e143d0 (leftover Meet / lid).',
--   COALESCE(
--     (SELECT created_by FROM time_doctor.time_adjustments
--       WHERE workspace_id = 511 ORDER BY created_at DESC LIMIT 1),
--     (SELECT u.id FROM tenant."user" u
--        JOIN time_doctor.user_extensions ext ON ext.user_id = u.id
--       WHERE ext.workspace_id = 511 AND ext.pulse_role = 'admin'
--       ORDER BY u.id LIMIT 1)
--   ),
--   'manual-correction',
--   '20260828-1201-a01e-143d-0gap8125sec'::uuid
-- WHERE NOT EXISTS (
--   SELECT 1 FROM time_doctor.time_adjustments
--   WHERE id = '20260828-1201-a01e-143d-0gap8125sec'::uuid
--      OR source_id = '20260828-1201-a01e-143d-0gap8125sec'::uuid
-- );
--
-- COMMIT;


-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 4 — SCREENSHOT CLEANUP (RDS only). Does not change Pulse hours.
--
-- Deletes Ahsan shots that belong to the leftover-Meet clip:
--   A. time_log_id is one of the 6 fixed sessions AND captured_at > new end
--   B. time_log_id is a collapsed (no-proof) session
--   C. any 1201 shot in the lid-close gap
--        2026-08-29 15:01:24Z (20:01 PKT) → 2026-08-29 23:36:00Z (04:36 PKT wake)
--
-- Does NOT delete Thu/Fri work, b1592b09 19:24–20:01 PKT, or Sunday-after-wake
-- shots on 45dd9203 / 9e274866.
-- Does NOT touch S3 (Pulse hides a shot when the RDS row is gone).
-- Does NOT increment deducted_seconds (hours already clipped in STEP 2).
--
-- Run 4A alone first. Paste the counts. Then run 4B if the numbers look right.
-- ═══════════════════════════════════════════════════════════════════════════

-- 4A. READ ONLY — what we will delete.
WITH clip AS (
  SELECT id, new_end_time, reason
  FROM time_doctor.ahsan_1201_phantom_fix_2026_08_31
),
marked AS (
  SELECT
    s.id,
    s.time_log_id,
    s.captured_at,
    s.app_name,
    s.window_title,
    s.s3_key,
    CASE
      WHEN c.reason = 'no_proof_session' THEN 'collapsed_session'
      WHEN c.id IS NOT NULL AND s.captured_at > c.new_end_time THEN 'after_clipped_end'
      WHEN s.captured_at >  TIMESTAMPTZ '2026-08-29 15:01:24+00'
       AND s.captured_at <  TIMESTAMPTZ '2026-08-29 23:36:00+00'
      THEN 'lid_close_gap'
    END AS why
  FROM time_doctor.screenshots s
  LEFT JOIN clip c ON c.id = s.time_log_id
  WHERE s.user_id = 1201
    AND s.workspace_id = 511
    AND (
      c.reason = 'no_proof_session'
      OR (c.id IS NOT NULL AND s.captured_at > c.new_end_time)
      OR (
        s.captured_at > TIMESTAMPTZ '2026-08-29 15:01:24+00'
        AND s.captured_at < TIMESTAMPTZ '2026-08-29 23:36:00+00'
      )
    )
)
SELECT why, COUNT(*) AS shots
FROM marked
GROUP BY why
ORDER BY why;

-- 4A detail (optional).
-- SELECT id, time_log_id,
--        captured_at AT TIME ZONE 'Asia/Karachi' AS captured_pkt,
--        app_name, why
-- FROM (
--   ...same marked CTE...
-- ) x
-- ORDER BY captured_at;


-- 4B. APPLY. Review 4A counts, then run this block and COMMIT.

BEGIN;

DROP TABLE IF EXISTS time_doctor.ahsan_1201_screenshot_cleanup_2026_08_31;

CREATE TABLE time_doctor.ahsan_1201_screenshot_cleanup_2026_08_31 AS
WITH clip AS (
  SELECT id, new_end_time, reason
  FROM time_doctor.ahsan_1201_phantom_fix_2026_08_31
)
SELECT
  s.id,
  s.user_id,
  s.workspace_id,
  s.time_log_id,
  s.captured_at,
  s.app_name,
  s.window_title,
  s.s3_key,
  s.thumb_s3_key,
  CASE
    WHEN c.reason = 'no_proof_session' THEN 'collapsed_session'
    WHEN c.id IS NOT NULL AND s.captured_at > c.new_end_time THEN 'after_clipped_end'
    ELSE 'lid_close_gap'
  END AS why
FROM time_doctor.screenshots s
LEFT JOIN clip c ON c.id = s.time_log_id
WHERE s.user_id = 1201
  AND s.workspace_id = 511
  AND (
    c.reason = 'no_proof_session'
    OR (c.id IS NOT NULL AND s.captured_at > c.new_end_time)
    OR (
      s.captured_at > TIMESTAMPTZ '2026-08-29 15:01:24+00'
      AND s.captured_at < TIMESTAMPTZ '2026-08-29 23:36:00+00'
    )
  );

SELECT why, COUNT(*) AS shots
FROM time_doctor.ahsan_1201_screenshot_cleanup_2026_08_31
GROUP BY why
ORDER BY why;

DELETE FROM time_doctor.screenshots s
USING time_doctor.ahsan_1201_screenshot_cleanup_2026_08_31 b
WHERE s.id = b.id
  AND s.user_id = 1201;

-- leftover rows for these 6 sessions should be 0 (or only b1592b09 before 20:01 PKT)
SELECT t.id, COUNT(s.id) AS shots_left
FROM time_doctor.time_logs t
LEFT JOIN time_doctor.screenshots s ON s.time_log_id = t.id
WHERE t.id IN (
  'b1592b09-25de-49e9-948e-8957c10709a7',
  '91e7cdbd-5de6-4a61-9d92-98cf0d60ae97',
  '59366784-4006-46ea-9a97-e4d28b8b810d',
  '3e4f859c-eb49-46f8-b4e1-e522f34483d8',
  '9da236bb-ab5e-4bea-a7fd-6d7efb5e9396',
  '442246bd-c765-4266-b1b6-6f1a7e19bb96'
)
GROUP BY t.id;

COMMIT;


-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 5 — Remaining phantom (Thu overnight + all of Sunday).
--
-- Pulse targets:
--   Thu 27  11h     (now 14.79h) — leftover Meet after 23:37 PKT
--   Sat 29  ~6.16h  already at the 6h cap after STEP 2 — do not touch
--   Sun 30  0h      (now 6.44h) — leftover Meet / Cursor, no real Sunday
--
-- Thursday kept through 9377ad1c (ends 23:37 PKT) = 11.01h.
-- Zero these three (Chicago Thursday, 3.78h):
--   23a210ec  23:46–00:09 PKT
--   9746abd2  00:25–02:00 PKT
--   aba9baa5  02:18–04:07 PKT
-- Zero Sunday:
--   9e274866  10:00–16:26 PKT (entire Sunday Pulse card)
-- Clip 34s of 45dd9203 that crossed Chicago midnight onto Sunday.
--
-- 45dd9203 (04:27–10:00 PKT Sunday) stays on Saturday Chicago (~5.55h).
-- If you meant "Sunday PKT = 0" as well, say so — Saturday would drop to ~0.6h.
--
-- Run 5A, then 5B, then 5C. Do not run STEP 3.
-- ═══════════════════════════════════════════════════════════════════════════

-- 5A. READ ONLY — time plan.
WITH plan AS (
  SELECT * FROM (VALUES
    ('23a210ec-76c6-4f8f-977f-f81e83655b47'::uuid, NULL),
    ('9746abd2-e28e-4ecf-8cb9-ee0cf7eeab50'::uuid, NULL),
    ('aba9baa5-7257-41fa-bd56-915a774a1f5d'::uuid, NULL),
    ('9e274866-14d2-471c-a8c3-9732d380bb00'::uuid, NULL),
    ('45dd9203-9723-4d13-9925-c7b4ba084c94'::uuid,
     TIMESTAMPTZ '2026-08-30 00:00:00 America/Chicago')
  ) AS p(id, clip_end)
)
SELECT
  t.id,
  t.start_time AT TIME ZONE 'America/Chicago' AS start_cdt,
  t.end_time   AT TIME ZONE 'America/Chicago' AS old_end_cdt,
  COALESCE(p.clip_end, t.start_time) AT TIME ZONE 'America/Chicago' AS new_end_cdt,
  ROUND(EXTRACT(EPOCH FROM (
    t.end_time - COALESCE(p.clip_end, t.start_time)
  )) / 3600.0, 2) AS hours_removed
FROM time_doctor.time_logs t
JOIN plan p ON p.id = t.id
WHERE t.user_id = 1201
  AND t.end_time > COALESCE(p.clip_end, t.start_time)
ORDER BY t.start_time;


-- 5B. APPLY time clips. Review 5A, then run through COMMIT.

BEGIN;

DROP TABLE IF EXISTS time_doctor.ahsan_1201_phantom_fix_2026_08_31_b;

CREATE TABLE time_doctor.ahsan_1201_phantom_fix_2026_08_31_b AS
WITH plan AS (
  SELECT * FROM (VALUES
    ('23a210ec-76c6-4f8f-977f-f81e83655b47'::uuid, NULL, 'thu_after_23_37_pkt'),
    ('9746abd2-e28e-4ecf-8cb9-ee0cf7eeab50'::uuid, NULL, 'thu_after_23_37_pkt'),
    ('aba9baa5-7257-41fa-bd56-915a774a1f5d'::uuid, NULL, 'thu_after_23_37_pkt'),
    ('9e274866-14d2-471c-a8c3-9732d380bb00'::uuid, NULL, 'sunday_leftover_meet'),
    ('45dd9203-9723-4d13-9925-c7b4ba084c94'::uuid,
     TIMESTAMPTZ '2026-08-30 00:00:00 America/Chicago', 'clip_sun_midnight')
  ) AS p(id, clip_end, reason)
)
SELECT
  t.id, t.user_id, t.workspace_id, t.device_id,
  t.start_time,
  t.end_time AS old_end_time,
  t.status   AS old_status,
  COALESCE(p.clip_end, t.start_time) AS new_end_time,
  p.reason
FROM time_doctor.time_logs t
JOIN plan p ON p.id = t.id
WHERE t.user_id = 1201
  AND t.workspace_id = 511
  AND t.end_time IS NOT NULL
  AND t.end_time > COALESCE(p.clip_end, t.start_time);

SELECT id, reason, old_end_time, new_end_time,
       ROUND(EXTRACT(EPOCH FROM (old_end_time - new_end_time)) / 3600.0, 2) AS hours_removed
FROM time_doctor.ahsan_1201_phantom_fix_2026_08_31_b
ORDER BY start_time;

INSERT INTO time_doctor.time_log_events
  (user_id, time_log_id, workspace_id, action, source, device_id, meta,
   old_start_time, old_end_time, old_status,
   new_start_time, new_end_time, new_status, shortened)
SELECT f.user_id, f.id, f.workspace_id,
       'admin_ahsan_leftover_meet_phantom',
       'manual-correction-2026-08-31-b',
       f.device_id,
       jsonb_build_object('reason', f.reason, 'corrected_by', 'engineering'),
       f.start_time, f.old_end_time, f.old_status,
       f.start_time, f.new_end_time, f.old_status, TRUE
FROM time_doctor.ahsan_1201_phantom_fix_2026_08_31_b f;

UPDATE time_doctor.time_logs t
SET end_time      = f.new_end_time,
    last_alive_at = CASE
                      WHEN t.last_alive_at IS NULL THEN t.last_alive_at
                      ELSE LEAST(t.last_alive_at, f.new_end_time)
                    END,
    updated_at    = NOW()
FROM time_doctor.ahsan_1201_phantom_fix_2026_08_31_b f
WHERE f.id = t.id
  AND t.user_id = 1201;

WITH bounds AS (
  SELECT d::date AS work_date
  FROM generate_series(DATE '2026-08-26', DATE '2026-08-30', INTERVAL '1 day') AS d
),
clipped AS (
  SELECT
    b.work_date,
    GREATEST(t.start_time, (b.work_date::timestamp AT TIME ZONE 'America/Chicago')) AS clip_start,
    LEAST(
      COALESCE(t.end_time, t.last_alive_at, NOW()),
      ((b.work_date + 1)::timestamp AT TIME ZONE 'America/Chicago')
    ) AS clip_end
  FROM time_doctor.time_logs t
  CROSS JOIN bounds b
  WHERE t.user_id = 1201
    AND t.workspace_id = 511
    AND t.start_time <  ((b.work_date + 1)::timestamp AT TIME ZONE 'America/Chicago')
    AND COALESCE(t.end_time, t.last_alive_at, NOW())
          > (b.work_date::timestamp AT TIME ZONE 'America/Chicago')
)
SELECT work_date,
       ROUND(SUM(EXTRACT(EPOCH FROM (clip_end - clip_start))) / 3600.0, 2) AS tracked_h
FROM clipped
WHERE clip_end > clip_start
GROUP BY work_date
ORDER BY work_date;

COMMIT;


-- 5C. READ ONLY — screenshots to delete (hours already removed in 5B).
--   Thu overnight: 23:46 PKT 27 Aug → before Friday start 16:46 PKT
--   All of Sunday Chicago (00:00 CDT 30 Aug onward)
SELECT
  CASE
    WHEN s.captured_at >= TIMESTAMPTZ '2026-08-27 18:46:29+00'
     AND s.captured_at <  TIMESTAMPTZ '2026-08-28 11:46:32+00'
    THEN 'thu_overnight'
    WHEN s.captured_at >= TIMESTAMPTZ '2026-08-30 00:00:00 America/Chicago'
    THEN 'sunday'
  END AS why,
  COUNT(*) AS shots,
  MIN(s.captured_at AT TIME ZONE 'Asia/Karachi') AS first_pkt,
  MAX(s.captured_at AT TIME ZONE 'Asia/Karachi') AS last_pkt
FROM time_doctor.screenshots s
WHERE s.user_id = 1201
  AND s.workspace_id = 511
  AND (
    (s.captured_at >= TIMESTAMPTZ '2026-08-27 18:46:29+00'
     AND s.captured_at <  TIMESTAMPTZ '2026-08-28 11:46:32+00')
    OR s.captured_at >= TIMESTAMPTZ '2026-08-30 00:00:00 America/Chicago'
  )
GROUP BY 1
ORDER BY 1;


-- 5D. APPLY screenshot delete. Review 5C counts, then COMMIT.

BEGIN;

DROP TABLE IF EXISTS time_doctor.ahsan_1201_screenshot_cleanup_2026_08_31_b;

CREATE TABLE time_doctor.ahsan_1201_screenshot_cleanup_2026_08_31_b AS
SELECT
  s.id, s.user_id, s.workspace_id, s.time_log_id,
  s.captured_at, s.app_name, s.window_title, s.s3_key, s.thumb_s3_key,
  CASE
    WHEN s.captured_at >= TIMESTAMPTZ '2026-08-27 18:46:29+00'
     AND s.captured_at <  TIMESTAMPTZ '2026-08-28 11:46:32+00'
    THEN 'thu_overnight'
    ELSE 'sunday'
  END AS why
FROM time_doctor.screenshots s
WHERE s.user_id = 1201
  AND s.workspace_id = 511
  AND (
    (s.captured_at >= TIMESTAMPTZ '2026-08-27 18:46:29+00'
     AND s.captured_at <  TIMESTAMPTZ '2026-08-28 11:46:32+00')
    OR s.captured_at >= TIMESTAMPTZ '2026-08-30 00:00:00 America/Chicago'
  );

SELECT why, COUNT(*) AS shots
FROM time_doctor.ahsan_1201_screenshot_cleanup_2026_08_31_b
GROUP BY why;

DELETE FROM time_doctor.screenshots s
USING time_doctor.ahsan_1201_screenshot_cleanup_2026_08_31_b b
WHERE s.id = b.id
  AND s.user_id = 1201;

COMMIT;
