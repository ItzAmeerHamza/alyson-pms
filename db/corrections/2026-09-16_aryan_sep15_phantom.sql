-- Aryan Sawant (user_id 1233, aryan@cintara.ai, workspace 511) — 15 Sep 2026.
--
-- Pulse Chicago card today:
--   Tracked / recorded  11h 48m
--   Effective            7h 06m  (60%)
--   Non-effective        4h 42m  (40%)
--
-- S3 agent log (1.0.243) + the six time_logs / idle_logs / screenshots you
-- pasted. No overlapping sessions. Session 2's 12:04–14:10 sleep was already
-- closed at last proof — Pulse did NOT bill that gap.
--
-- Confirmed phantom:
--
--   A. 2246abbf  billed 21:23–22:38 PK (1.26h).
--      Sleep arm at lid-close: "last awake proof, not wake NOW"
--      = 2026-09-15 16:43:09.465Z (21:43:09 PK).
--      Last screenshot 21:38, last health-check 21:41.
--      RDS end_time / last_alive_at = 22:38:46 (wake NOW).
--      Clip to 21:43:09.  −56m tracked.
--
--   B. 24c47dce  still status=active, end_time NULL, last_alive 02:59 PK Sep 16.
--      Screenshots / Meet through 02:55. He is not working Sep 16.
--      Close at last_alive. Pulse already bills only to last_alive, so the
--      Chicago Sep 15 card does not change.
--
--   C. Three idle_logs with no time_log_id. Pulse counts idle ≥5m even when
--      it sits after the session (non_effective = min(tracked, idle+low)).
--        253029db  19:32–21:21  108.5m  last 99m is sleep after c4abfaa3
--        fce2b3f2  21:33–22:38   65.1m  last 56m is the same wake-NOW tail
--        b3bbc796  23:24–23:46   21.4m  inside 064ef35d — attach, do not cut
--      Clip A/B to the session that actually contains them.
--
-- Not touched:
--   ac87349c  midnight rollover, 3m on Chicago Sep 15 — real
--   2b1b4ffc  10:04–12:04 — sleep-safe close already correct
--   c4abfaa3  15:31–19:42 — health-checks + screenshots to end
--   064ef35d  22:41–23:46 — 11m past last awake proof (23:35), under the
--             30-minute no-proof rule used on his Aug 18 correction
--
-- Expected Chicago Sep 15 after COMMIT (refresh Pulse):
--   Tracked        10h 52m   (−56m)
--   Effective     ~8h 45m    (the 1h 39m post-session sleep idle stops stealing)
--   Non-effective ~2h 07m
--
-- Run STEP 1 alone first. It changes nothing.


-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 1 — READ ONLY
-- ═══════════════════════════════════════════════════════════════════════════

-- 1A. The six sessions Pulse merged into 11h 48m.
SELECT
  t.id,
  t.status,
  t.start_time AT TIME ZONE 'Asia/Karachi' AS start_pk,
  t.end_time   AT TIME ZONE 'Asia/Karachi' AS end_pk,
  t.last_alive_at AT TIME ZONE 'Asia/Karachi' AS last_alive_pk,
  ROUND(EXTRACT(EPOCH FROM (
    COALESCE(t.end_time, t.last_alive_at) - t.start_time
  )) / 3600.0, 2) AS wall_h,
  t.idle_seconds
FROM time_doctor.time_logs t
WHERE t.user_id = 1233
  AND t.workspace_id = 511
  AND t.id IN (
    'ac87349c-e2df-4ee3-9b54-c999351cbd27',
    '2b1b4ffc-0cbc-418d-99b6-6982de929806',
    'c4abfaa3-94bc-4ee9-856c-ed238c760639',
    '2246abbf-ba2d-434b-bb81-bee8c1b99612',
    '064ef35d-6ea9-4dd2-a97b-7aee2864caa9',
    '24c47dce-8416-4048-ba09-3c9ca2cbd7e5'
  )
ORDER BY t.start_time;

-- 1B. Plan. Expect 0.93h off 2246abbf, and 24c47dce closed at last_alive.
WITH plan AS (
  SELECT * FROM (VALUES
    ('2246abbf-ba2d-434b-bb81-bee8c1b99612'::uuid,
     TIMESTAMPTZ '2026-09-15 16:43:09.465+00',
     'completed',
     'sleep_wake_now_not_last_awake'),
    ('24c47dce-8416-4048-ba09-3c9ca2cbd7e5'::uuid,
     NULL,
     'auto_closed',
     'close_stale_active_at_last_alive')
  ) AS p(id, clip_end, new_status, reason)
)
SELECT
  t.id,
  t.status AS old_status,
  p.new_status,
  t.end_time AT TIME ZONE 'Asia/Karachi' AS old_end_pk,
  COALESCE(p.clip_end, t.last_alive_at) AT TIME ZONE 'Asia/Karachi' AS new_end_pk,
  ROUND(EXTRACT(EPOCH FROM (
    COALESCE(t.end_time, t.last_alive_at, NOW())
    - COALESCE(p.clip_end, t.last_alive_at)
  )) / 60.0, 1) AS minutes_removed,
  p.reason
FROM time_doctor.time_logs t
JOIN plan p ON p.id = t.id
WHERE t.user_id = 1233
ORDER BY t.start_time;

-- 1C. Orphan / overlong idle. Expect ~2.58h removed (99m + 56m).
WITH idle AS (
  SELECT * FROM (VALUES
    ('253029db-e851-5d56-9012-8b4d47b87528'::uuid,
     'c4abfaa3-94bc-4ee9-856c-ed238c760639'::uuid,
     TIMESTAMPTZ '2026-09-15 19:42:47.440+05',
     'clip_sleep_after_session'),
    ('fce2b3f2-9b8d-55a9-b701-0810fd159b79'::uuid,
     '2246abbf-ba2d-434b-bb81-bee8c1b99612'::uuid,
     TIMESTAMPTZ '2026-09-15 16:43:09.465+00',
     'clip_to_last_awake'),
    ('b3bbc796-18e0-5dc3-944f-3013af206198'::uuid,
     '064ef35d-6ea9-4dd2-a97b-7aee2864caa9'::uuid,
     TIMESTAMPTZ '2026-09-15 23:46:17.989+05',
     'attach_in_session')
  ) AS p(id, time_log_id, new_end, reason)
)
SELECT
  i.id,
  i.time_log_id AS old_time_log_id,
  p.time_log_id AS new_time_log_id,
  i.idle_start AT TIME ZONE 'Asia/Karachi' AS start_pk,
  i.idle_end   AT TIME ZONE 'Asia/Karachi' AS old_end_pk,
  LEAST(i.idle_end, p.new_end) AT TIME ZONE 'Asia/Karachi' AS new_end_pk,
  i.duration_seconds AS old_sec,
  GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (
    LEAST(i.idle_end, p.new_end) - i.idle_start
  ))))::int AS new_sec,
  p.reason
FROM time_doctor.idle_logs i
JOIN idle p ON p.id = i.id
WHERE i.user_id = 1233
ORDER BY i.idle_start;


-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 2 — APPLY. Review STEP 1, then run this block and COMMIT.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DROP TABLE IF EXISTS time_doctor.aryan_sep15_phantom_fix_2026_09_16;

CREATE TABLE time_doctor.aryan_sep15_phantom_fix_2026_09_16 AS
WITH plan AS (
  SELECT * FROM (VALUES
    ('2246abbf-ba2d-434b-bb81-bee8c1b99612'::uuid,
     TIMESTAMPTZ '2026-09-15 16:43:09.465+00',
     'completed',
     'sleep_wake_now_not_last_awake'),
    ('24c47dce-8416-4048-ba09-3c9ca2cbd7e5'::uuid,
     NULL,
     'auto_closed',
     'close_stale_active_at_last_alive')
  ) AS p(id, clip_end, new_status, reason)
)
SELECT
  t.id, t.user_id, t.workspace_id, t.device_id,
  t.start_time,
  t.end_time      AS old_end_time,
  t.status        AS old_status,
  t.last_alive_at AS old_last_alive_at,
  t.idle_seconds  AS old_idle_seconds,
  GREATEST(t.start_time, COALESCE(p.clip_end, t.last_alive_at)) AS new_end_time,
  p.new_status,
  p.reason
FROM time_doctor.time_logs t
JOIN plan p ON p.id = t.id
WHERE t.user_id = 1233
  AND t.workspace_id = 511
  AND GREATEST(t.start_time, COALESCE(p.clip_end, t.last_alive_at))
        < COALESCE(t.end_time, 'infinity'::timestamptz);

SELECT id, reason, old_status, new_status,
       old_end_time, new_end_time,
       ROUND(EXTRACT(EPOCH FROM (
         COALESCE(old_end_time, new_end_time) - new_end_time
       )) / 60.0, 1) AS minutes_removed
FROM time_doctor.aryan_sep15_phantom_fix_2026_09_16;

INSERT INTO time_doctor.time_log_events
  (user_id, time_log_id, workspace_id, action, source, device_id, meta,
   old_start_time, old_end_time, old_status,
   new_start_time, new_end_time, new_status, shortened)
SELECT f.user_id, f.id, f.workspace_id,
       'admin_aryan_sep15_phantom',
       'manual-correction-2026-09-16',
       f.device_id,
       jsonb_build_object(
         'reason', f.reason,
         'user', 'aryan@cintara.ai user_id=1233',
         'window', '2026-09-15 America/Chicago',
         'corrected_by', 'engineering'
       ),
       f.start_time, f.old_end_time, f.old_status,
       f.start_time, f.new_end_time, f.new_status,
       f.old_end_time IS NOT NULL
FROM time_doctor.aryan_sep15_phantom_fix_2026_09_16 f;

UPDATE time_doctor.time_logs t
SET end_time      = f.new_end_time,
    status        = f.new_status,
    last_alive_at = CASE
                      WHEN t.last_alive_at IS NULL THEN t.last_alive_at
                      ELSE LEAST(t.last_alive_at, f.new_end_time)
                    END,
    updated_at    = NOW()
FROM time_doctor.aryan_sep15_phantom_fix_2026_09_16 f
WHERE f.id = t.id
  AND t.user_id = 1233
  AND COALESCE(t.end_time, 'infinity'::timestamptz) > f.new_end_time;

-- Idle: attach + clip to the (new) session end.
DROP TABLE IF EXISTS time_doctor.aryan_sep15_idle_fix_2026_09_16;

CREATE TABLE time_doctor.aryan_sep15_idle_fix_2026_09_16 AS
WITH plan AS (
  SELECT * FROM (VALUES
    ('253029db-e851-5d56-9012-8b4d47b87528'::uuid,
     'c4abfaa3-94bc-4ee9-856c-ed238c760639'::uuid,
     TIMESTAMPTZ '2026-09-15 19:42:47.440+05',
     'clip_sleep_after_session'),
    ('fce2b3f2-9b8d-55a9-b701-0810fd159b79'::uuid,
     '2246abbf-ba2d-434b-bb81-bee8c1b99612'::uuid,
     TIMESTAMPTZ '2026-09-15 16:43:09.465+00',
     'clip_to_last_awake'),
    ('b3bbc796-18e0-5dc3-944f-3013af206198'::uuid,
     '064ef35d-6ea9-4dd2-a97b-7aee2864caa9'::uuid,
     TIMESTAMPTZ '2026-09-15 23:46:17.989+05',
     'attach_in_session')
  ) AS p(id, time_log_id, new_end, reason)
)
SELECT
  i.id, i.user_id, i.time_log_id AS old_time_log_id, i.workspace_id,
  i.idle_start, i.idle_end AS old_idle_end, i.duration_seconds AS old_duration,
  p.time_log_id AS new_time_log_id,
  LEAST(
    GREATEST(COALESCE(i.idle_end, i.idle_start),
             i.idle_start + make_interval(secs => COALESCE(i.duration_seconds, 0))),
    p.new_end
  ) AS new_idle_end,
  p.reason
FROM time_doctor.idle_logs i
JOIN plan p ON p.id = i.id
WHERE i.user_id = 1233;

SELECT id, reason, old_time_log_id, new_time_log_id,
       old_duration,
       GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (new_idle_end - idle_start))))::int AS new_sec
FROM time_doctor.aryan_sep15_idle_fix_2026_09_16;

UPDATE time_doctor.idle_logs i
SET time_log_id      = f.new_time_log_id,
    idle_end         = f.new_idle_end,
    duration_seconds = GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (
                         f.new_idle_end - i.idle_start
                       ))))::int
FROM time_doctor.aryan_sep15_idle_fix_2026_09_16 f
WHERE f.id = i.id
  AND i.user_id = 1233;

-- Drop idle that now starts at or after the new session end.
DELETE FROM time_doctor.idle_logs i
USING time_doctor.aryan_sep15_idle_fix_2026_09_16 f
WHERE f.id = i.id
  AND i.user_id = 1233
  AND i.idle_start >= f.new_idle_end;

-- Also clip any other idle on 2246abbf that still runs past the new end.
UPDATE time_doctor.idle_logs i
SET idle_end         = LEAST(
                         GREATEST(
                           COALESCE(i.idle_end, i.idle_start),
                           i.idle_start + make_interval(secs => COALESCE(i.duration_seconds, 0))
                         ),
                         f.new_end_time
                       ),
    duration_seconds = GREATEST(
                         0,
                         FLOOR(EXTRACT(EPOCH FROM (
                           LEAST(
                             GREATEST(
                               COALESCE(i.idle_end, i.idle_start),
                               i.idle_start + make_interval(secs => COALESCE(i.duration_seconds, 0))
                             ),
                             f.new_end_time
                           ) - GREATEST(i.idle_start, t.start_time)
                         )))
                       )::int
FROM time_doctor.aryan_sep15_phantom_fix_2026_09_16 f
JOIN time_doctor.time_logs t ON t.id = f.id
WHERE i.time_log_id = f.id
  AND i.idle_start < f.new_end_time
  AND GREATEST(
        COALESCE(i.idle_end, i.idle_start),
        i.idle_start + make_interval(secs => COALESCE(i.duration_seconds, 0))
      ) > f.new_end_time;

DELETE FROM time_doctor.idle_logs i
USING time_doctor.aryan_sep15_phantom_fix_2026_09_16 f
WHERE i.time_log_id = f.id
  AND i.idle_start >= f.new_end_time;

UPDATE time_doctor.time_logs t
SET idle_seconds = COALESCE(c.total, 0),
    updated_at   = NOW()
FROM (
  SELECT id FROM time_doctor.aryan_sep15_phantom_fix_2026_09_16
  UNION
  SELECT new_time_log_id FROM time_doctor.aryan_sep15_idle_fix_2026_09_16
) affected
LEFT JOIN LATERAL (
  SELECT SUM(GREATEST(0, COALESCE(i2.duration_seconds, 0)))::int AS total
  FROM time_doctor.idle_logs i2
  WHERE i2.time_log_id = affected.id
) c ON TRUE
WHERE t.id = affected.id
  AND t.idle_seconds IS DISTINCT FROM COALESCE(c.total, 0);

-- App leftovers confirmed from prod dump:
--   Time Doctor 11:54–15:31 on 2b1b4ffc  (+206.7m after 12:04 close)
--   Cursor      09:58–10:08 on ac87349c  (+4.5m past midnight close)
--   Time Doctor 02:54–OPEN  on 24c47dce  (grows with NOW(); ~11h this afternoon)
-- After the session clips above, also pull 2246abbf's TD row back to 21:43.
UPDATE time_doctor.app_logs a
SET ended_at = s.sess_end
FROM (
  SELECT t.id, COALESCE(t.end_time, t.last_alive_at) AS sess_end
  FROM time_doctor.time_logs t
  WHERE t.user_id = 1233
    AND t.workspace_id = 511
    AND t.id IN (
      'ac87349c-e2df-4ee3-9b54-c999351cbd27',
      '2b1b4ffc-0cbc-418d-99b6-6982de929806',
      'c4abfaa3-94bc-4ee9-856c-ed238c760639',
      '2246abbf-ba2d-434b-bb81-bee8c1b99612',
      '064ef35d-6ea9-4dd2-a97b-7aee2864caa9',
      '24c47dce-8416-4048-ba09-3c9ca2cbd7e5'
    )
) s
WHERE a.user_id = 1233
  AND a.time_log_id = s.id
  AND s.sess_end IS NOT NULL
  AND COALESCE(a.ended_at, 'infinity'::timestamptz) > s.sess_end;

-- Chicago-day wall after the edit. Expect ~10.86h.
WITH bounds AS (
  SELECT
    TIMESTAMP '2026-09-15 00:00' AT TIME ZONE 'America/Chicago' AS day_start,
    TIMESTAMP '2026-09-16 00:00' AT TIME ZONE 'America/Chicago' AS day_end
),
clipped AS (
  SELECT
    GREATEST(t.start_time, b.day_start) AS clip_start,
    LEAST(COALESCE(t.end_time, t.last_alive_at), b.day_end) AS clip_end
  FROM time_doctor.time_logs t
  CROSS JOIN bounds b
  WHERE t.user_id = 1233
    AND t.workspace_id = 511
    AND t.start_time < b.day_end
    AND COALESCE(t.end_time, t.last_alive_at) > b.day_start
)
SELECT
  ROUND(SUM(EXTRACT(EPOCH FROM (clip_end - clip_start))) / 3600.0, 2) AS tracked_h,
  ROUND(SUM(EXTRACT(EPOCH FROM (clip_end - clip_start))) / 60.0, 0) AS tracked_min
FROM clipped
WHERE clip_end > clip_start;

-- Must be 0 open rows.
SELECT id, status, end_time, last_alive_at
FROM time_doctor.time_logs
WHERE user_id = 1233
  AND end_time IS NULL;

COMMIT;


-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 3 — ROLLBACK
--   DROP TABLE time_doctor.aryan_sep15_phantom_fix_2026_09_16;
--   DROP TABLE time_doctor.aryan_sep15_idle_fix_2026_09_16;
-- ═══════════════════════════════════════════════════════════════════════════
UPDATE time_doctor.time_logs t
SET end_time      = f.old_end_time,
    status        = f.old_status,
    last_alive_at = f.old_last_alive_at,
    idle_seconds  = f.old_idle_seconds,
    updated_at    = NOW()
FROM time_doctor.aryan_sep15_phantom_fix_2026_09_16 f
WHERE f.id = t.id;

UPDATE time_doctor.idle_logs i
SET time_log_id      = f.old_time_log_id,
    idle_end         = f.old_idle_end,
    duration_seconds = f.old_duration
FROM time_doctor.aryan_sep15_idle_fix_2026_09_16 f
WHERE f.id = i.id;
