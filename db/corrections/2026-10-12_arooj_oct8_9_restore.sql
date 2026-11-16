-- Arooj Fatima (user_id 1228, workspace 511)
-- Missing time: Thu Oct 8 21m 34s (offline create never landed)
--               Fri Oct 9 3h 29m (four Stops failed ISE / 2s timeout)
-- Do not bill Friday leftover tray (+1h 37m).
--
-- Laptop ends only. Never last_proof (that stretched Aryan 41320f71).
-- Never shortens. Caps at next session start.
--
-- Run STEP 1 alone first.


-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 1 — READ ONLY
-- ═══════════════════════════════════════════════════════════════════════════

WITH plan AS (
  SELECT * FROM (VALUES
    -- Thu 11:23–11:45 CDT, offline, create never landed
    ('545c06a6-e247-43eb-a192-bbebf49b08fb'::uuid,
     TIMESTAMPTZ '2026-10-08 16:23:55.470+00',
     TIMESTAMPTZ '2026-10-08 16:45:29.635+00',
     'baa3d942-1866-47b3-b8e9-94522a63e91e',
     'offline_create'),
    -- Fri 06:44–07:04 CDT, ISE
    ('5f306378-d40b-4e4c-a267-70aaa931c496'::uuid,
     TIMESTAMPTZ '2026-10-09 11:44:19.614+00',
     TIMESTAMPTZ '2026-10-09 12:04:12.367+00',
     'c0e45c4c-31ab-4009-83ab-5092d6295398',
     'stop_click'),
    -- Fri 07:26–08:31 CDT, 2s timeout
    ('46d7c23d-e7b8-4e17-a877-79b4d1c467a4'::uuid,
     TIMESTAMPTZ '2026-10-09 12:26:48.592+00',
     TIMESTAMPTZ '2026-10-09 13:31:07.970+00',
     'c0e45c4c-31ab-4009-83ab-5092d6295398',
     'stop_click'),
    -- Fri 10:10–11:14 CDT, offline start, ISE close
    ('916a2c36-3cdc-4560-b07e-6ff85775dc39'::uuid,
     TIMESTAMPTZ '2026-10-09 15:10:05.290+00',
     TIMESTAMPTZ '2026-10-09 16:14:51.976+00',
     'c0e45c4c-31ab-4009-83ab-5092d6295398',
     'offline_start_stop'),
    -- Fri 11:16–13:39 CDT, ISE
    ('6478ee20-8e26-4ed7-9f18-95f313e71cc9'::uuid,
     TIMESTAMPTZ '2026-10-09 16:15:59.426+00',
     TIMESTAMPTZ '2026-10-09 18:39:45.896+00',
     'c0e45c4c-31ab-4009-83ab-5092d6295398',
     'stop_click')
  ) AS p(id, start_time, laptop_end, device_id, close_source)
),
next_of AS (
  SELECT
    t.id,
    LEAD(t.start_time) OVER (ORDER BY t.start_time, t.id) AS next_start
  FROM time_doctor.time_logs t
  WHERE t.user_id = 1228
    AND t.workspace_id = 511
)
SELECT
  p.id,
  (t.id IS NULL) AS missing_row,
  p.close_source,
  t.status,
  COALESCE(t.start_time, p.start_time) AT TIME ZONE 'America/Chicago' AS start_cdt,
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
        COALESCE(t.start_time, p.start_time),
        COALESCE(t.end_time, t.start_time, p.start_time),
        p.laptop_end
      )
    ) - COALESCE(t.start_time, p.start_time)
  )) / 3600.0, 2) AS new_h,
  ROUND(EXTRACT(EPOCH FROM (
    LEAST(
      NOW(),
      COALESCE(n.next_start, 'infinity'::timestamptz),
      GREATEST(
        COALESCE(t.start_time, p.start_time),
        COALESCE(t.end_time, t.start_time, p.start_time),
        p.laptop_end
      )
    ) - COALESCE(t.end_time, t.start_time, p.start_time)
  )) / 3600.0, 2) AS hours_to_add,
  (
    t.id IS NULL
    OR LEAST(
         NOW(),
         COALESCE(n.next_start, 'infinity'::timestamptz),
         GREATEST(
           COALESCE(t.start_time, p.start_time),
           COALESCE(t.end_time, t.start_time, p.start_time),
           p.laptop_end
         )
       ) > COALESCE(t.end_time, t.start_time)
  ) AS need_fix
FROM plan p
LEFT JOIN time_doctor.time_logs t
  ON t.id = p.id AND t.user_id = 1228
LEFT JOIN next_of n ON n.id = p.id
ORDER BY p.start_time;


SELECT
  (t.start_time AT TIME ZONE 'America/Chicago')::date AS chicago_day,
  COUNT(*) AS rows,
  ROUND(SUM(EXTRACT(EPOCH FROM (
    COALESCE(t.end_time, t.last_alive_at) - t.start_time
  ))) / 3600.0, 2) AS billed_h
FROM time_doctor.time_logs t
WHERE t.user_id = 1228
  AND t.workspace_id = 511
  AND t.start_time >= TIMESTAMP '2026-10-04 00:00' AT TIME ZONE 'America/Chicago'
  AND t.start_time <  TIMESTAMP '2026-10-12 00:00' AT TIME ZONE 'America/Chicago'
GROUP BY 1
ORDER BY 1;


-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 2 — APPLY. Review need_fix / hours_to_add. Then COMMIT.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

WITH plan AS (
  SELECT * FROM (VALUES
    ('545c06a6-e247-43eb-a192-bbebf49b08fb'::uuid,
     TIMESTAMPTZ '2026-10-08 16:23:55.470+00',
     TIMESTAMPTZ '2026-10-08 16:45:29.635+00',
     'baa3d942-1866-47b3-b8e9-94522a63e91e',
     'offline_create'),
    ('5f306378-d40b-4e4c-a267-70aaa931c496'::uuid,
     TIMESTAMPTZ '2026-10-09 11:44:19.614+00',
     TIMESTAMPTZ '2026-10-09 12:04:12.367+00',
     'c0e45c4c-31ab-4009-83ab-5092d6295398',
     'stop_click'),
    ('46d7c23d-e7b8-4e17-a877-79b4d1c467a4'::uuid,
     TIMESTAMPTZ '2026-10-09 12:26:48.592+00',
     TIMESTAMPTZ '2026-10-09 13:31:07.970+00',
     'c0e45c4c-31ab-4009-83ab-5092d6295398',
     'stop_click'),
    ('916a2c36-3cdc-4560-b07e-6ff85775dc39'::uuid,
     TIMESTAMPTZ '2026-10-09 15:10:05.290+00',
     TIMESTAMPTZ '2026-10-09 16:14:51.976+00',
     'c0e45c4c-31ab-4009-83ab-5092d6295398',
     'offline_start_stop'),
    ('6478ee20-8e26-4ed7-9f18-95f313e71cc9'::uuid,
     TIMESTAMPTZ '2026-10-09 16:15:59.426+00',
     TIMESTAMPTZ '2026-10-09 18:39:45.896+00',
     'c0e45c4c-31ab-4009-83ab-5092d6295398',
     'stop_click')
  ) AS p(id, start_time, laptop_end, device_id, close_source)
),
next_of AS (
  SELECT
    t.id,
    LEAD(t.start_time) OVER (ORDER BY t.start_time, t.id) AS next_start
  FROM time_doctor.time_logs t
  WHERE t.user_id = 1228
    AND t.workspace_id = 511
),
chosen AS (
  SELECT
    p.id,
    p.start_time,
    p.laptop_end,
    p.device_id,
    p.close_source,
    t.end_time AS old_end,
    t.status AS old_status,
    t.idle_seconds AS old_idle,
    LEAST(
      NOW(),
      COALESCE(n.next_start, 'infinity'::timestamptz),
      GREATEST(
        COALESCE(t.start_time, p.start_time),
        COALESCE(t.end_time, t.start_time, p.start_time),
        p.laptop_end
      )
    ) AS new_end
  FROM plan p
  LEFT JOIN time_doctor.time_logs t
    ON t.id = p.id AND t.user_id = 1228
  LEFT JOIN next_of n ON n.id = p.id
),
upserted AS (
  INSERT INTO time_doctor.time_logs (
    id, user_id, workspace_id, project_id, device_id,
    start_time, end_time, last_alive_at, status, idle_seconds, updated_at
  )
  SELECT
    c.id,
    1228,
    511,
    '72ad865f-8f7a-48ec-bbac-38e2bcebf2bc'::uuid,
    c.device_id,
    c.start_time,
    c.new_end,
    c.new_end,
    'completed',
    0,
    NOW()
  FROM chosen c
  WHERE c.new_end > c.start_time
    AND c.new_end <= NOW()
    AND (c.old_end IS NULL OR c.new_end > c.old_end)
  ON CONFLICT (id) DO UPDATE
  SET
    end_time = EXCLUDED.end_time,
    last_alive_at = GREATEST(
      COALESCE(time_doctor.time_logs.last_alive_at, time_doctor.time_logs.start_time),
      EXCLUDED.end_time
    ),
    status = 'completed',
    updated_at = NOW()
  WHERE time_doctor.time_logs.user_id = 1228
    AND (
      time_doctor.time_logs.end_time IS NULL
      OR time_doctor.time_logs.end_time < EXCLUDED.end_time
    )
  RETURNING
    id, user_id, workspace_id, device_id,
    start_time, end_time, status, idle_seconds
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
  'manual-correction-2026-10-12-arooj',
  u.device_id,
  '1.0.248',
  c.start_time,
  c.old_end,
  c.old_status,
  c.old_idle,
  u.start_time,
  u.end_time,
  u.status,
  u.idle_seconds,
  EXTRACT(EPOCH FROM (u.end_time - COALESCE(c.old_end, c.start_time)))::int,
  FALSE,
  jsonb_build_object(
    'reason', 'Oct 8-9: restore laptop Stop / offline create after ISE',
    'evidence', 'S3 dt=2026-10-08..09 user_id=1228 pending session close',
    'close_source', c.close_source,
    'laptop_end', c.laptop_end,
    'corrected_by', 'engineering'
  )
FROM upserted u
JOIN chosen c ON c.id = u.id;

SELECT
  (t.start_time AT TIME ZONE 'America/Chicago')::date AS chicago_day,
  COUNT(*) AS rows,
  ROUND(SUM(EXTRACT(EPOCH FROM (
    COALESCE(t.end_time, t.last_alive_at) - t.start_time
  ))) / 3600.0, 2) AS billed_h
FROM time_doctor.time_logs t
WHERE t.user_id = 1228
  AND t.workspace_id = 511
  AND t.start_time >= TIMESTAMP '2026-10-04 00:00' AT TIME ZONE 'America/Chicago'
  AND t.start_time <  TIMESTAMP '2026-10-12 00:00' AT TIME ZONE 'America/Chicago'
GROUP BY 1
ORDER BY 1;

-- COMMIT;


-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 3 — VERIFY after COMMIT
-- Pass: check_result=ok (or inserted), overlaps=0,
-- Oct 8 ~3.35h, Oct 9 ~4.88h, week ~17.45h. Not 6.5h Friday tray.
-- ═══════════════════════════════════════════════════════════════════════════

WITH plan AS (
  SELECT * FROM (VALUES
    ('545c06a6-e247-43eb-a192-bbebf49b08fb'::uuid, TIMESTAMPTZ '2026-10-08 16:45:29.635+00'),
    ('5f306378-d40b-4e4c-a267-70aaa931c496'::uuid, TIMESTAMPTZ '2026-10-09 12:04:12.367+00'),
    ('46d7c23d-e7b8-4e17-a877-79b4d1c467a4'::uuid, TIMESTAMPTZ '2026-10-09 13:31:07.970+00'),
    ('916a2c36-3cdc-4560-b07e-6ff85775dc39'::uuid, TIMESTAMPTZ '2026-10-09 16:14:51.976+00'),
    ('6478ee20-8e26-4ed7-9f18-95f313e71cc9'::uuid, TIMESTAMPTZ '2026-10-09 18:39:45.896+00')
  ) AS p(id, laptop_end)
),
next_of AS (
  SELECT
    t.id,
    LEAD(t.start_time) OVER (ORDER BY t.start_time, t.id) AS next_start
  FROM time_doctor.time_logs t
  WHERE t.user_id = 1228
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
  ON t.id = p.id AND t.user_id = 1228
LEFT JOIN next_of n ON n.id = p.id
ORDER BY t.start_time;

SELECT
  e.time_log_id,
  e.old_end_time AT TIME ZONE 'America/Chicago' AS old_end_cdt,
  e.new_end_time AT TIME ZONE 'America/Chicago' AS new_end_cdt,
  ROUND(e.duration_delta_seconds / 3600.0, 2) AS hours_added
FROM time_doctor.time_log_events e
WHERE e.user_id = 1228
  AND e.source = 'manual-correction-2026-10-12-arooj'
ORDER BY e.created_at;

SELECT
  (t.start_time AT TIME ZONE 'America/Chicago')::date AS chicago_day,
  COUNT(*) AS sessions,
  COUNT(*) FILTER (WHERE t.end_time IS NULL) AS still_open,
  ROUND(SUM(EXTRACT(EPOCH FROM (
    COALESCE(t.end_time, t.last_alive_at) - t.start_time
  ))) / 3600.0, 2) AS billed_h
FROM time_doctor.time_logs t
WHERE t.user_id = 1228
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
  WHERE t.user_id = 1228
    AND t.workspace_id = 511
    AND t.start_time >= TIMESTAMP '2026-10-04 00:00' AT TIME ZONE 'America/Chicago'
    AND t.start_time <  TIMESTAMP '2026-10-12 00:00' AT TIME ZONE 'America/Chicago'
) s
WHERE s.next_start IS NOT NULL
  AND COALESCE(s.end_time, 'infinity'::timestamptz) > s.next_start;


-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 4 — CLIP 46d7c23d to laptop Stop 08:31 CDT.
-- Auto-close rode to 11:14 (into 916a2c36). Do not clip only to next_start
-- (that still bills 08:31–10:10). Review, then COMMIT.
-- ═══════════════════════════════════════════════════════════════════════════

SELECT
  t.id,
  t.status,
  t.start_time AT TIME ZONE 'America/Chicago' AS start_cdt,
  t.end_time   AT TIME ZONE 'America/Chicago' AS current_end_cdt,
  TIMESTAMPTZ '2026-10-09 13:31:07.970+00' AT TIME ZONE 'America/Chicago' AS clip_to_cdt,
  ROUND(EXTRACT(EPOCH FROM (t.end_time - t.start_time)) / 3600.0, 2) AS current_h,
  ROUND(EXTRACT(EPOCH FROM (
    TIMESTAMPTZ '2026-10-09 13:31:07.970+00' - t.start_time
  )) / 3600.0, 2) AS after_h
FROM time_doctor.time_logs t
WHERE t.id = '46d7c23d-e7b8-4e17-a877-79b4d1c467a4'
  AND t.user_id = 1228;

BEGIN;

UPDATE time_doctor.time_logs t
SET
  end_time = TIMESTAMPTZ '2026-10-09 13:31:07.970+00',
  last_alive_at = LEAST(
    COALESCE(t.last_alive_at, TIMESTAMPTZ '2026-10-09 13:31:07.970+00'),
    TIMESTAMPTZ '2026-10-09 13:31:07.970+00'
  ),
  status = 'completed',
  updated_at = NOW()
WHERE t.id = '46d7c23d-e7b8-4e17-a877-79b4d1c467a4'
  AND t.user_id = 1228
  AND t.end_time > TIMESTAMPTZ '2026-10-09 13:31:07.970+00';

INSERT INTO time_doctor.time_log_events
  (user_id, time_log_id, workspace_id, action, source, device_id, agent_version,
   old_start_time, old_end_time, old_status,
   new_start_time, new_end_time, new_status,
   duration_delta_seconds, shortened, meta)
SELECT
  t.user_id,
  t.id,
  t.workspace_id,
  'admin_corrected_clip_overlap',
  'manual-correction-2026-10-12-arooj-clip',
  t.device_id,
  '1.0.248',
  t.start_time,
  TIMESTAMPTZ '2026-10-09 16:14:10.863+00',
  'auto_closed',
  t.start_time,
  t.end_time,
  t.status,
  EXTRACT(EPOCH FROM (t.end_time - TIMESTAMPTZ '2026-10-09 16:14:10.863+00'))::int,
  TRUE,
  jsonb_build_object(
    'reason', 'clip 46d7c23d to laptop Stop 08:31 CDT; auto_close overlapped 916a2c36',
    'corrected_by', 'engineering'
  )
FROM time_doctor.time_logs t
WHERE t.id = '46d7c23d-e7b8-4e17-a877-79b4d1c467a4'
  AND t.user_id = 1228;

-- expect 1.07h, Oct 9 ~4.88h, overlaps 0
SELECT
  id, status,
  start_time AT TIME ZONE 'America/Chicago' AS start_cdt,
  end_time   AT TIME ZONE 'America/Chicago' AS end_cdt,
  ROUND(EXTRACT(EPOCH FROM (end_time - start_time)) / 3600.0, 2) AS billed_h
FROM time_doctor.time_logs
WHERE id = '46d7c23d-e7b8-4e17-a877-79b4d1c467a4';

SELECT
  (t.start_time AT TIME ZONE 'America/Chicago')::date AS chicago_day,
  ROUND(SUM(EXTRACT(EPOCH FROM (
    COALESCE(t.end_time, t.last_alive_at) - t.start_time
  ))) / 3600.0, 2) AS billed_h
FROM time_doctor.time_logs t
WHERE t.user_id = 1228
  AND t.workspace_id = 511
  AND t.start_time >= TIMESTAMP '2026-10-04 00:00' AT TIME ZONE 'America/Chicago'
  AND t.start_time <  TIMESTAMP '2026-10-12 00:00' AT TIME ZONE 'America/Chicago'
GROUP BY 1
ORDER BY 1;

-- COMMIT;
