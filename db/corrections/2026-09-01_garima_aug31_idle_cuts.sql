-- Garima Singh (user_id 1224, workspace 511) — 31 Aug 2026 Pulse overcount.
--
-- Agent S3 logs + tracked-time time_logs. Overnight lid-close 00:39–10:28 PKT
-- was already unpaid. These clips are the unanswered idle-prompt 10m cuts the
-- agent logged but the API raised back to last_alive_at, plus a 35m silent
-- tail after the last diagnostic line.
--
-- Screenshot deducted_seconds=6156 on 4b2ebd54 is already stored. Pulse now
-- subtracts that from hours_worked after deploy — do not clip it here.
--
-- Idle / meetings are NOT removed. Walk-away idle stays on the tracked card
-- and in effective/non-effective; video meetings and "I'm working" stay billed.
--
-- Expected Pulse Chicago 31 Aug after COMMIT + Pulse deploy:
--   wall 10.84h
--   − 1.71h screenshot deletes (deducted_seconds, Pulse-side)
--   − 0.67h four idle-prompt cuts
--   − 0.57h silent tail 23:40–00:14 PKT
--   ≈ 7.9h tracked
--
-- Run STEP 1 alone first. Review, then STEP 2 through COMMIT.


-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 1 — READ ONLY
-- ═══════════════════════════════════════════════════════════════════════════

SELECT
  t.id,
  t.status,
  t.start_time AT TIME ZONE 'Asia/Karachi' AS start_pkt,
  t.end_time   AT TIME ZONE 'Asia/Karachi' AS end_pkt,
  ROUND(EXTRACT(EPOCH FROM (t.end_time - t.start_time)) / 3600.0, 2) AS wall_h,
  t.idle_seconds,
  t.deducted_seconds
FROM time_doctor.time_logs t
WHERE t.user_id = 1224
  AND t.workspace_id = 511
  AND t.id IN (
    '4b2ebd54-8019-44b8-87e4-c93c82e14d0d',
    'bc068c19-ade9-4f24-a024-6df99f47a310',
    '24bb8016-1120-4dc6-9b1d-88f9254baea1',
    'c1f04a2d-3c57-4e30-a9a0-cf54eb7b2b20',
    '4b47db3b-868f-434f-93d7-efd39195dc64',
    '49d532c7-3ac6-41d1-82e4-48e70f705602',
    'b90e6518-74ff-4dfe-86e3-4d93558bc2c3'
  )
ORDER BY t.start_time;

WITH plan AS (
  SELECT * FROM (VALUES
    ('4b2ebd54-8019-44b8-87e4-c93c82e14d0d'::uuid,
     TIMESTAMPTZ '2026-08-31 10:17:17.731+00', 'idle_prompt_10m'),
    ('bc068c19-ade9-4f24-a024-6df99f47a310'::uuid,
     TIMESTAMPTZ '2026-08-31 13:09:25.818+00', 'idle_prompt_10m'),
    ('c1f04a2d-3c57-4e30-a9a0-cf54eb7b2b20'::uuid,
     TIMESTAMPTZ '2026-08-31 17:32:31.749+00', 'idle_prompt_10m'),
    ('4b47db3b-868f-434f-93d7-efd39195dc64'::uuid,
     TIMESTAMPTZ '2026-08-31 18:05:04.901+00', 'idle_prompt_10m'),
    ('49d532c7-3ac6-41d1-82e4-48e70f705602'::uuid,
     TIMESTAMPTZ '2026-08-31 18:39:51.586+00', 'silent_tail_after_last_s3_line')
  ) AS p(id, clip_end, reason)
)
SELECT
  t.id,
  t.end_time AT TIME ZONE 'Asia/Karachi' AS old_end_pkt,
  p.clip_end AT TIME ZONE 'Asia/Karachi' AS new_end_pkt,
  ROUND(EXTRACT(EPOCH FROM (t.end_time - p.clip_end)) / 60.0, 1) AS minutes_removed,
  p.reason
FROM time_doctor.time_logs t
JOIN plan p ON p.id = t.id
WHERE t.user_id = 1224
  AND t.end_time > p.clip_end
ORDER BY t.start_time;


-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 2 — APPLY. Review STEP 1, then run this block and COMMIT.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DROP TABLE IF EXISTS time_doctor.garima_1224_aug31_idle_cut_2026_09_01;

CREATE TABLE time_doctor.garima_1224_aug31_idle_cut_2026_09_01 AS
WITH plan AS (
  SELECT * FROM (VALUES
    ('4b2ebd54-8019-44b8-87e4-c93c82e14d0d'::uuid,
     TIMESTAMPTZ '2026-08-31 10:17:17.731+00', 'idle_prompt_10m'),
    ('bc068c19-ade9-4f24-a024-6df99f47a310'::uuid,
     TIMESTAMPTZ '2026-08-31 13:09:25.818+00', 'idle_prompt_10m'),
    ('c1f04a2d-3c57-4e30-a9a0-cf54eb7b2b20'::uuid,
     TIMESTAMPTZ '2026-08-31 17:32:31.749+00', 'idle_prompt_10m'),
    ('4b47db3b-868f-434f-93d7-efd39195dc64'::uuid,
     TIMESTAMPTZ '2026-08-31 18:05:04.901+00', 'idle_prompt_10m'),
    ('49d532c7-3ac6-41d1-82e4-48e70f705602'::uuid,
     TIMESTAMPTZ '2026-08-31 18:39:51.586+00', 'silent_tail_after_last_s3_line')
  ) AS p(id, clip_end, reason)
)
SELECT
  t.id, t.user_id, t.workspace_id, t.device_id,
  t.start_time,
  t.end_time AS old_end_time,
  t.status   AS old_status,
  p.clip_end AS new_end_time,
  p.reason
FROM time_doctor.time_logs t
JOIN plan p ON p.id = t.id
WHERE t.user_id = 1224
  AND t.workspace_id = 511
  AND t.end_time IS NOT NULL
  AND t.end_time > p.clip_end;

SELECT id, reason, old_end_time, new_end_time,
       ROUND(EXTRACT(EPOCH FROM (old_end_time - new_end_time)) / 60.0, 1) AS minutes_removed
FROM time_doctor.garima_1224_aug31_idle_cut_2026_09_01
ORDER BY start_time;

INSERT INTO time_doctor.time_log_events
  (user_id, time_log_id, workspace_id, action, source, device_id, meta,
   old_start_time, old_end_time, old_status,
   new_start_time, new_end_time, new_status, shortened)
SELECT f.user_id, f.id, f.workspace_id,
       'admin_garima_aug31_idle_cut',
       'manual-correction-2026-09-01',
       f.device_id,
       jsonb_build_object(
         'reason', f.reason,
         'user', 'garima user_id=1224',
         'evidence', 'agent S3 logs dt=2026-08-31 user_id=1224',
         'corrected_by', 'engineering'
       ),
       f.start_time, f.old_end_time, f.old_status,
       f.start_time, f.new_end_time, f.old_status, TRUE
FROM time_doctor.garima_1224_aug31_idle_cut_2026_09_01 f;

UPDATE time_doctor.time_logs t
SET end_time      = f.new_end_time,
    last_alive_at = CASE
                      WHEN t.last_alive_at IS NULL THEN t.last_alive_at
                      ELSE LEAST(t.last_alive_at, f.new_end_time)
                    END,
    updated_at    = NOW()
FROM time_doctor.garima_1224_aug31_idle_cut_2026_09_01 f
WHERE f.id = t.id
  AND t.user_id = 1224
  AND COALESCE(t.end_time, 'infinity'::timestamptz) > f.new_end_time;

SELECT
  t.id,
  t.end_time AT TIME ZONE 'Asia/Karachi' AS end_pkt,
  ROUND(EXTRACT(EPOCH FROM (t.end_time - t.start_time)) / 3600.0, 2) AS wall_h,
  t.deducted_seconds
FROM time_doctor.time_logs t
WHERE t.user_id = 1224
  AND t.id IN (
    '4b2ebd54-8019-44b8-87e4-c93c82e14d0d',
    'bc068c19-ade9-4f24-a024-6df99f47a310',
    'c1f04a2d-3c57-4e30-a9a0-cf54eb7b2b20',
    '4b47db3b-868f-434f-93d7-efd39195dc64',
    '49d532c7-3ac6-41d1-82e4-48e70f705602'
  )
ORDER BY t.start_time;

COMMIT;
