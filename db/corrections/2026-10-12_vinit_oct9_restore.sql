-- Vinit Solanki (user_id 1194, vinit@cintara.ai, workspace 511)
-- Fri Oct 9 2026. App recorded 7h 05m. Honest DB ~4h 55m. Missing ~2h 10m.
--
-- Creates landed. All 7 Stops failed (ISE / recovery). Recovery closed most
-- short. e05767df never recovery-closed — that is the main hole (~1h 42m).
-- 03852d54 started 13:01 CDT with no Stop — leave it alone (no invented end).
--
-- Laptop Stop clicks only. Never last_proof. Never shortens. Caps at next start.
--
-- Run STEP 1 alone first.


-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 1 — READ ONLY
-- ═══════════════════════════════════════════════════════════════════════════

WITH plan AS (
  SELECT * FROM (VALUES
    -- 01:27–02:15 CDT, 47m 57s, recovery
    ('673c7d47-30b2-47ff-be35-d24693572cd9'::uuid,
     TIMESTAMPTZ '2026-10-09 07:15:19.856+00',
     'stop_click'),
    -- 02:26–03:43 CDT, 1h 17m 18s, ISE + recovery
    ('d190f638-15f8-42f1-90a2-fccfee47574c'::uuid,
     TIMESTAMPTZ '2026-10-09 08:43:49.635+00',
     'stop_click'),
    -- 03:53–04:24 CDT, 30m 27s, ISE + recovery
    ('9753d9d4-ab6c-4401-9b33-7e2f2d7673cd'::uuid,
     TIMESTAMPTZ '2026-10-09 09:24:22.415+00',
     'stop_click'),
    -- 05:36–06:58 CDT, 1h 21m 50s, ISE + recovery
    ('1c9f00cf-8599-4e65-8fd9-549997b88185'::uuid,
     TIMESTAMPTZ '2026-10-09 11:58:26.038+00',
     'stop_click'),
    -- 06:58–08:40 CDT, 1h 41m 36s — ISE, never recovery-closed
    ('e05767df-98b3-421d-879f-b159f00216ce'::uuid,
     TIMESTAMPTZ '2026-10-09 13:40:13.232+00',
     'stop_click_never_closed'),
    -- 08:59–10:19 CDT, 1h 20m 13s, ISE + recovery
    ('f5f6be5f-d620-4548-a90d-1a4c5cbc52df'::uuid,
     TIMESTAMPTZ '2026-10-09 15:19:28.706+00',
     'stop_click'),
    -- 12:28–12:34 CDT, 5m 52s, recovery
    ('d38c21cb-fe09-4f36-96d7-0c029a2ceb65'::uuid,
     TIMESTAMPTZ '2026-10-09 17:34:35.658+00',
     'stop_click')
  ) AS p(id, laptop_end, close_source)
),
next_of AS (
  SELECT
    t.id,
    LEAD(t.start_time) OVER (ORDER BY t.start_time, t.id) AS next_start
  FROM time_doctor.time_logs t
  WHERE t.user_id = 1194
    AND t.workspace_id = 511
)
SELECT
  p.id,
  (t.id IS NULL) AS missing_row,
  p.close_source,
  t.status,
  COALESCE(t.start_time, p.laptop_end) AT TIME ZONE 'America/Chicago' AS start_cdt,
  t.end_time   AT TIME ZONE 'America/Chicago' AS old_end_cdt,
  p.laptop_end AT TIME ZONE 'America/Chicago' AS laptop_stop_cdt,
  n.next_start AT TIME ZONE 'America/Chicago' AS next_start_cdt,
  ROUND(EXTRACT(EPOCH FROM (
    COALESCE(t.end_time, t.last_alive_at, t.start_time) - t.start_time
  )) / 3600.0, 2) AS old_h,
  ROUND(EXTRACT(EPOCH FROM (
    LEAST(
      NOW(),
      COALESCE(n.next_start, 'infinity'::timestamptz),
      GREATEST(
        COALESCE(t.start_time, p.laptop_end),
        COALESCE(t.end_time, t.start_time, p.laptop_end),
        p.laptop_end
      )
    ) - t.start_time
  )) / 3600.0, 2) AS new_h,
  ROUND(EXTRACT(EPOCH FROM (
    LEAST(
      NOW(),
      COALESCE(n.next_start, 'infinity'::timestamptz),
      GREATEST(
        COALESCE(t.start_time, p.laptop_end),
        COALESCE(t.end_time, t.start_time, p.laptop_end),
        p.laptop_end
      )
    ) - COALESCE(t.end_time, t.start_time, p.laptop_end)
  )) / 3600.0, 2) AS hours_to_add,
  (
    t.id IS NULL
    OR LEAST(
         NOW(),
         COALESCE(n.next_start, 'infinity'::timestamptz),
         GREATEST(
           COALESCE(t.start_time, p.laptop_end),
           COALESCE(t.end_time, t.start_time, p.laptop_end),
           p.laptop_end
         )
       ) > COALESCE(t.end_time, t.start_time)
  ) AS need_fix,
  CASE
    WHEN t.end_time IS NOT NULL AND t.end_time > p.laptop_end + INTERVAL '2 seconds'
      THEN 'stretched_past_laptop'
    ELSE NULL
  END AS clip_hint
FROM plan p
LEFT JOIN time_doctor.time_logs t
  ON t.id = p.id AND t.user_id = 1194
LEFT JOIN next_of n ON n.id = p.id
ORDER BY COALESCE(t.start_time, p.laptop_end);


SELECT
  (t.start_time AT TIME ZONE 'America/Chicago')::date AS chicago_day,
  COUNT(*) AS rows,
  ROUND(SUM(EXTRACT(EPOCH FROM (
    COALESCE(t.end_time, t.last_alive_at) - t.start_time
  ))) / 3600.0, 2) AS billed_h
FROM time_doctor.time_logs t
WHERE t.user_id = 1194
  AND t.workspace_id = 511
  AND t.start_time >= TIMESTAMP '2026-10-04 00:00' AT TIME ZONE 'America/Chicago'
  AND t.start_time <  TIMESTAMP '2026-10-12 00:00' AT TIME ZONE 'America/Chicago'
GROUP BY 1
ORDER BY 1;


-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 2 — APPLY. Review need_fix / hours_to_add. Then COMMIT.
-- Never shortens. Caps at next start. Creates already exist — UPDATE only.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

WITH plan AS (
  SELECT * FROM (VALUES
    ('673c7d47-30b2-47ff-be35-d24693572cd9'::uuid, TIMESTAMPTZ '2026-10-09 07:15:19.856+00', 'stop_click'),
    ('d190f638-15f8-42f1-90a2-fccfee47574c'::uuid, TIMESTAMPTZ '2026-10-09 08:43:49.635+00', 'stop_click'),
    ('9753d9d4-ab6c-4401-9b33-7e2f2d7673cd'::uuid, TIMESTAMPTZ '2026-10-09 09:24:22.415+00', 'stop_click'),
    ('1c9f00cf-8599-4e65-8fd9-549997b88185'::uuid, TIMESTAMPTZ '2026-10-09 11:58:26.038+00', 'stop_click'),
    ('e05767df-98b3-421d-879f-b159f00216ce'::uuid, TIMESTAMPTZ '2026-10-09 13:40:13.232+00', 'stop_click_never_closed'),
    ('f5f6be5f-d620-4548-a90d-1a4c5cbc52df'::uuid, TIMESTAMPTZ '2026-10-09 15:19:28.706+00', 'stop_click'),
    ('d38c21cb-fe09-4f36-96d7-0c029a2ceb65'::uuid, TIMESTAMPTZ '2026-10-09 17:34:35.658+00', 'stop_click')
  ) AS p(id, laptop_end, close_source)
),
next_of AS (
  SELECT
    t.id,
    LEAD(t.start_time) OVER (ORDER BY t.start_time, t.id) AS next_start
  FROM time_doctor.time_logs t
  WHERE t.user_id = 1194
    AND t.workspace_id = 511
),
chosen AS (
  SELECT
    t.id,
    t.user_id,
    t.workspace_id,
    t.device_id,
    t.start_time,
    t.end_time,
    t.status,
    t.idle_seconds,
    p.laptop_end,
    p.close_source,
    n.next_start,
    LEAST(
      NOW(),
      COALESCE(n.next_start, 'infinity'::timestamptz),
      GREATEST(
        t.start_time,
        COALESCE(t.end_time, t.start_time),
        p.laptop_end
      )
    ) AS new_end
  FROM time_doctor.time_logs t
  JOIN plan p ON p.id = t.id
  LEFT JOIN next_of n ON n.id = t.id
  WHERE t.user_id = 1194
    AND t.workspace_id = 511
),
updated AS (
  UPDATE time_doctor.time_logs t
  SET
    end_time = c.new_end,
    last_alive_at = GREATEST(COALESCE(t.last_alive_at, t.start_time), c.new_end),
    status = 'completed',
    updated_at = NOW()
  FROM chosen c
  WHERE t.id = c.id
    AND t.user_id = 1194
    AND c.new_end > COALESCE(t.end_time, t.start_time)
    AND c.new_end > t.start_time
    AND c.new_end <= NOW()
  RETURNING
    t.id,
    t.user_id,
    t.workspace_id,
    t.device_id,
    t.start_time,
    t.end_time,
    t.status,
    t.idle_seconds
)
INSERT INTO time_doctor.time_log_events
  (user_id, time_log_id, workspace_id, action, source, device_id, agent_version,
   old_start_time, old_end_time, old_status, old_idle_seconds,
   new_start_time, new_end_time, new_status, new_idle_seconds,
   duration_delta_seconds, shortened, meta)
SELECT
  u.user_id,
  u.id,
  u.workspace_id,
  'admin_corrected_restore_stop_click',
  'manual-correction-2026-10-12-vinit',
  u.device_id,
  '1.0.248',
  c.start_time,
  c.end_time,
  c.status,
  c.idle_seconds,
  u.start_time,
  u.end_time,
  u.status,
  u.idle_seconds,
  EXTRACT(EPOCH FROM (u.end_time - COALESCE(c.end_time, c.start_time)))::int,
  FALSE,
  jsonb_build_object(
    'reason', 'Oct 9: restore laptop Stop after update_time_log ISE',
    'evidence', 'S3 dt=2026-10-09 user_id=1194 pending session close',
    'close_source', c.close_source,
    'laptop_end', c.laptop_end,
    'corrected_by', 'engineering'
  )
FROM updated u
JOIN chosen c ON c.id = u.id;

SELECT
  (t.start_time AT TIME ZONE 'America/Chicago')::date AS chicago_day,
  COUNT(*) AS rows,
  ROUND(SUM(EXTRACT(EPOCH FROM (
    COALESCE(t.end_time, t.last_alive_at) - t.start_time
  ))) / 3600.0, 2) AS billed_h
FROM time_doctor.time_logs t
WHERE t.user_id = 1194
  AND t.workspace_id = 511
  AND t.start_time >= TIMESTAMP '2026-10-04 00:00' AT TIME ZONE 'America/Chicago'
  AND t.start_time <  TIMESTAMP '2026-10-12 00:00' AT TIME ZONE 'America/Chicago'
GROUP BY 1
ORDER BY 1;

-- COMMIT;


-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 3 — VERIFY after COMMIT
-- Pass: check_result=ok (or end_after only if next_start capped), overlaps=0,
-- Oct 9 ~7.05h on the 7 stopped sessions. e05767df should show ~1.69h added.
-- ═══════════════════════════════════════════════════════════════════════════

WITH plan AS (
  SELECT * FROM (VALUES
    ('673c7d47-30b2-47ff-be35-d24693572cd9'::uuid, TIMESTAMPTZ '2026-10-09 07:15:19.856+00'),
    ('d190f638-15f8-42f1-90a2-fccfee47574c'::uuid, TIMESTAMPTZ '2026-10-09 08:43:49.635+00'),
    ('9753d9d4-ab6c-4401-9b33-7e2f2d7673cd'::uuid, TIMESTAMPTZ '2026-10-09 09:24:22.415+00'),
    ('1c9f00cf-8599-4e65-8fd9-549997b88185'::uuid, TIMESTAMPTZ '2026-10-09 11:58:26.038+00'),
    ('e05767df-98b3-421d-879f-b159f00216ce'::uuid, TIMESTAMPTZ '2026-10-09 13:40:13.232+00'),
    ('f5f6be5f-d620-4548-a90d-1a4c5cbc52df'::uuid, TIMESTAMPTZ '2026-10-09 15:19:28.706+00'),
    ('d38c21cb-fe09-4f36-96d7-0c029a2ceb65'::uuid, TIMESTAMPTZ '2026-10-09 17:34:35.658+00')
  ) AS p(id, laptop_end)
),
next_of AS (
  SELECT
    t.id,
    LEAD(t.start_time) OVER (ORDER BY t.start_time, t.id) AS next_start
  FROM time_doctor.time_logs t
  WHERE t.user_id = 1194
    AND t.workspace_id = 511
)
SELECT
  p.id,
  (t.id IS NULL) AS missing_row,
  t.status,
  t.start_time AT TIME ZONE 'America/Chicago' AS start_cdt,
  t.end_time   AT TIME ZONE 'America/Chicago' AS end_cdt,
  p.laptop_end AT TIME ZONE 'America/Chicago' AS laptop_stop_cdt,
  ROUND(EXTRACT(EPOCH FROM (t.end_time - t.start_time)) / 3600.0, 2) AS billed_h,
  CASE
    WHEN t.id IS NULL THEN 'missing'
    WHEN t.end_time IS NULL OR t.status NOT IN ('completed', 'auto_closed') THEN 'still_open'
    WHEN n.next_start IS NOT NULL AND t.end_time > n.next_start THEN 'overlaps_next'
    WHEN t.end_time < p.laptop_end - INTERVAL '2 seconds'
     AND (n.next_start IS NULL OR t.end_time < n.next_start - INTERVAL '2 seconds')
      THEN 'end_before_laptop_stop'
    WHEN t.end_time > p.laptop_end + INTERVAL '2 seconds' THEN 'end_after_laptop_stop'
    ELSE 'ok'
  END AS check_result
FROM plan p
LEFT JOIN time_doctor.time_logs t
  ON t.id = p.id AND t.user_id = 1194
LEFT JOIN next_of n ON n.id = p.id
ORDER BY t.start_time;

SELECT
  e.time_log_id,
  e.old_end_time AT TIME ZONE 'America/Chicago' AS old_end_cdt,
  e.new_end_time AT TIME ZONE 'America/Chicago' AS new_end_cdt,
  ROUND(e.duration_delta_seconds / 3600.0, 2) AS hours_added
FROM time_doctor.time_log_events e
WHERE e.user_id = 1194
  AND e.source = 'manual-correction-2026-10-12-vinit'
ORDER BY e.created_at;

SELECT
  (t.start_time AT TIME ZONE 'America/Chicago')::date AS chicago_day,
  COUNT(*) AS sessions,
  COUNT(*) FILTER (WHERE t.end_time IS NULL) AS still_open,
  ROUND(SUM(EXTRACT(EPOCH FROM (
    COALESCE(t.end_time, t.last_alive_at) - t.start_time
  ))) / 3600.0, 2) AS billed_h
FROM time_doctor.time_logs t
WHERE t.user_id = 1194
  AND t.workspace_id = 511
  AND t.start_time >= TIMESTAMP '2026-10-04 00:00' AT TIME ZONE 'America/Chicago'
  AND t.start_time <  TIMESTAMP '2026-10-12 00:00' AT TIME ZONE 'America/Chicago'
GROUP BY 1
ORDER BY 1;

SELECT COUNT(*) AS remaining_overlaps
FROM (
  SELECT
    t.end_time,
    LEAD(t.start_time) OVER (ORDER BY t.start_time, t.id) AS next_start
  FROM time_doctor.time_logs t
  WHERE t.user_id = 1194
    AND t.workspace_id = 511
    AND t.start_time >= TIMESTAMP '2026-10-04 00:00' AT TIME ZONE 'America/Chicago'
    AND t.start_time <  TIMESTAMP '2026-10-12 00:00' AT TIME ZONE 'America/Chicago'
) s
WHERE s.next_start IS NOT NULL
  AND COALESCE(s.end_time, 'infinity'::timestamptz) > s.next_start;


-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 4 — CLIP any row STEP 1 flagged stretched_past_laptop (optional).
-- Only if recovery closed a session past the laptop Stop into the next one.
-- Review, then COMMIT. Example: e05767df should NOT need clip (never closed).
-- ═══════════════════════════════════════════════════════════════════════════

-- Uncomment and set id/end if STEP 1 clip_hint is set:
--
-- BEGIN;
-- WITH before AS (
--   SELECT t.id, t.user_id, t.workspace_id, t.device_id, t.start_time,
--          t.end_time AS old_end, t.status AS old_status
--   FROM time_doctor.time_logs t
--   WHERE t.id = '<uuid>'::uuid AND t.user_id = 1194
--     AND t.end_time > TIMESTAMPTZ '<laptop_end>'
-- ),
-- updated AS (
--   UPDATE time_doctor.time_logs t
--   SET end_time = TIMESTAMPTZ '<laptop_end>',
--       last_alive_at = LEAST(COALESCE(t.last_alive_at, TIMESTAMPTZ '<laptop_end>'), TIMESTAMPTZ '<laptop_end>'),
--       status = 'completed', updated_at = NOW()
--   FROM before b WHERE t.id = b.id AND t.user_id = 1194
--   RETURNING t.id, t.start_time, t.end_time, t.status
-- )
-- INSERT INTO time_doctor.time_log_events
--   (user_id, time_log_id, workspace_id, action, source, device_id, agent_version,
--    old_start_time, old_end_time, old_status, new_start_time, new_end_time, new_status,
--    duration_delta_seconds, shortened, meta)
-- SELECT b.user_id, b.id, b.workspace_id, 'admin_corrected_clip_overlap',
--   'manual-correction-2026-10-12-vinit-clip', b.device_id, '1.0.248',
--   b.start_time, b.old_end, b.old_status, u.start_time, u.end_time, u.status,
--   EXTRACT(EPOCH FROM (u.end_time - b.old_end))::int, TRUE,
--   jsonb_build_object('reason', 'clip to laptop Stop', 'corrected_by', 'engineering')
-- FROM updated u JOIN before b ON b.id = u.id;
-- -- COMMIT;
