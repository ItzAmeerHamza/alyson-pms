-- Omer Affan (user_id 1200, omer@cintara.ai, workspace 511)
-- Fri Oct 9 2026. App recorded 5h 18m. DB ~3h 30m. Missing ~1h 48m.
--
-- All 12 Creates landed. All 12 Stops got ISE. Recovery later closed 9
-- of them ~10–55s short. Three never closed (eceb3b29, bebd4409, f60e5449)
-- — those are almost the whole hole.
--
-- Laptop Stop clicks only. Never last_proof (that stretched Aryan 41320f71).
-- Never shortens. Caps at next session start.
--
-- Recovery closed fbf003f6 + 1ece2692 at the same 05:22 CDT checkpoint.
-- If STEP 1 shows fbf003f6 past 05:00:17, run STEP 4 after COMMIT.
--
-- Run STEP 1 alone first.


-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 1 — READ ONLY
-- ═══════════════════════════════════════════════════════════════════════════

WITH plan AS (
  SELECT * FROM (VALUES
    -- 04:43–05:00 CDT, 16m 56s, ISE; recovery may have stretched to 05:22
    ('fbf003f6-8ce7-4a57-9401-741c110b8496'::uuid,
     TIMESTAMPTZ '2026-10-09 10:00:17.506+00',
     'stop_click'),
    -- 05:01–05:22 CDT, 21m 52s
    ('1ece2692-5612-487c-bc1f-ed2f2f9b3bc8'::uuid,
     TIMESTAMPTZ '2026-10-09 10:22:56.657+00',
     'stop_click'),
    -- 05:23–05:46 CDT, 23m 17s
    ('023a5745-8e23-4316-aad3-a6a339844df3'::uuid,
     TIMESTAMPTZ '2026-10-09 10:46:28.869+00',
     'stop_click'),
    -- 06:06–06:50 CDT, 44m 19s — never recovery-closed
    ('eceb3b29-6520-46b7-b80b-ea674ded8493'::uuid,
     TIMESTAMPTZ '2026-10-09 11:50:27.557+00',
     'stop_click_never_closed'),
    -- 06:51–06:54 CDT, 2m 54s
    ('dcb473ef-22e5-4990-99f6-30a3bae3e5a9'::uuid,
     TIMESTAMPTZ '2026-10-09 11:54:23.819+00',
     'stop_click'),
    -- 07:05–07:07 CDT, 2m 07s
    ('d4147609-2914-4bb2-ba5e-290675401873'::uuid,
     TIMESTAMPTZ '2026-10-09 12:07:03.410+00',
     'stop_click'),
    -- 07:17–07:39 CDT, 22m 23s
    ('3f042260-dd5c-4b8c-8787-6d8570335776'::uuid,
     TIMESTAMPTZ '2026-10-09 12:39:28.930+00',
     'stop_click'),
    -- 07:55–08:04 CDT, 8m 58s — never recovery-closed
    ('bebd4409-b225-4a7f-9afa-6e0b165c822a'::uuid,
     TIMESTAMPTZ '2026-10-09 13:04:42.910+00',
     'stop_click_never_closed'),
    -- 09:21–09:26 CDT, 5m 36s
    ('1f8a9cfd-2255-4cf6-be82-691b09d952fa'::uuid,
     TIMESTAMPTZ '2026-10-09 14:26:55.295+00',
     'stop_click'),
    -- 09:33–10:36 CDT, 1h 03m 25s
    ('e2072a49-9499-4a14-a4aa-ca111d575b2b'::uuid,
     TIMESTAMPTZ '2026-10-09 15:36:45.067+00',
     'stop_click'),
    -- 10:48–11:49 CDT, 1h 01m 31s — never recovery-closed
    ('f60e5449-2fdd-40ff-b267-1184ab26a22c'::uuid,
     TIMESTAMPTZ '2026-10-09 16:49:56.998+00',
     'stop_click_never_closed'),
    -- 12:00–12:45 CDT, 45m 01s
    ('48277edf-cfda-4e4d-bca9-901553e26ec9'::uuid,
     TIMESTAMPTZ '2026-10-09 17:45:04.769+00',
     'stop_click')
  ) AS p(id, laptop_end, close_source)
),
next_of AS (
  SELECT
    t.id,
    LEAD(t.start_time) OVER (ORDER BY t.start_time, t.id) AS next_start
  FROM time_doctor.time_logs t
  WHERE t.user_id = 1200
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
  ON t.id = p.id AND t.user_id = 1200
LEFT JOIN next_of n ON n.id = p.id
ORDER BY COALESCE(t.start_time, p.laptop_end);


SELECT
  (t.start_time AT TIME ZONE 'America/Chicago')::date AS chicago_day,
  COUNT(*) AS rows,
  ROUND(SUM(EXTRACT(EPOCH FROM (
    COALESCE(t.end_time, t.last_alive_at) - t.start_time
  ))) / 3600.0, 2) AS billed_h
FROM time_doctor.time_logs t
WHERE t.user_id = 1200
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
    ('fbf003f6-8ce7-4a57-9401-741c110b8496'::uuid, TIMESTAMPTZ '2026-10-09 10:00:17.506+00', 'stop_click'),
    ('1ece2692-5612-487c-bc1f-ed2f2f9b3bc8'::uuid, TIMESTAMPTZ '2026-10-09 10:22:56.657+00', 'stop_click'),
    ('023a5745-8e23-4316-aad3-a6a339844df3'::uuid, TIMESTAMPTZ '2026-10-09 10:46:28.869+00', 'stop_click'),
    ('eceb3b29-6520-46b7-b80b-ea674ded8493'::uuid, TIMESTAMPTZ '2026-10-09 11:50:27.557+00', 'stop_click_never_closed'),
    ('dcb473ef-22e5-4990-99f6-30a3bae3e5a9'::uuid, TIMESTAMPTZ '2026-10-09 11:54:23.819+00', 'stop_click'),
    ('d4147609-2914-4bb2-ba5e-290675401873'::uuid, TIMESTAMPTZ '2026-10-09 12:07:03.410+00', 'stop_click'),
    ('3f042260-dd5c-4b8c-8787-6d8570335776'::uuid, TIMESTAMPTZ '2026-10-09 12:39:28.930+00', 'stop_click'),
    ('bebd4409-b225-4a7f-9afa-6e0b165c822a'::uuid, TIMESTAMPTZ '2026-10-09 13:04:42.910+00', 'stop_click_never_closed'),
    ('1f8a9cfd-2255-4cf6-be82-691b09d952fa'::uuid, TIMESTAMPTZ '2026-10-09 14:26:55.295+00', 'stop_click'),
    ('e2072a49-9499-4a14-a4aa-ca111d575b2b'::uuid, TIMESTAMPTZ '2026-10-09 15:36:45.067+00', 'stop_click'),
    ('f60e5449-2fdd-40ff-b267-1184ab26a22c'::uuid, TIMESTAMPTZ '2026-10-09 16:49:56.998+00', 'stop_click_never_closed'),
    ('48277edf-cfda-4e4d-bca9-901553e26ec9'::uuid, TIMESTAMPTZ '2026-10-09 17:45:04.769+00', 'stop_click')
  ) AS p(id, laptop_end, close_source)
),
next_of AS (
  SELECT
    t.id,
    LEAD(t.start_time) OVER (ORDER BY t.start_time, t.id) AS next_start
  FROM time_doctor.time_logs t
  WHERE t.user_id = 1200
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
  WHERE t.user_id = 1200
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
    AND t.user_id = 1200
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
  'manual-correction-2026-10-12-omer',
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
    'evidence', 'S3 dt=2026-10-09 user_id=1200 pending session close',
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
WHERE t.user_id = 1200
  AND t.workspace_id = 511
  AND t.start_time >= TIMESTAMP '2026-10-04 00:00' AT TIME ZONE 'America/Chicago'
  AND t.start_time <  TIMESTAMP '2026-10-12 00:00' AT TIME ZONE 'America/Chicago'
GROUP BY 1
ORDER BY 1;

-- COMMIT;


-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 3 — VERIFY after COMMIT
-- Pass: check_result=ok (or clip_needed), overlaps=0, Oct 9 ~5.31h.
-- Three never-closed rows should show hours_added ~0.74 + 0.15 + 1.03.
-- ═══════════════════════════════════════════════════════════════════════════

WITH plan AS (
  SELECT * FROM (VALUES
    ('fbf003f6-8ce7-4a57-9401-741c110b8496'::uuid, TIMESTAMPTZ '2026-10-09 10:00:17.506+00'),
    ('1ece2692-5612-487c-bc1f-ed2f2f9b3bc8'::uuid, TIMESTAMPTZ '2026-10-09 10:22:56.657+00'),
    ('023a5745-8e23-4316-aad3-a6a339844df3'::uuid, TIMESTAMPTZ '2026-10-09 10:46:28.869+00'),
    ('eceb3b29-6520-46b7-b80b-ea674ded8493'::uuid, TIMESTAMPTZ '2026-10-09 11:50:27.557+00'),
    ('dcb473ef-22e5-4990-99f6-30a3bae3e5a9'::uuid, TIMESTAMPTZ '2026-10-09 11:54:23.819+00'),
    ('d4147609-2914-4bb2-ba5e-290675401873'::uuid, TIMESTAMPTZ '2026-10-09 12:07:03.410+00'),
    ('3f042260-dd5c-4b8c-8787-6d8570335776'::uuid, TIMESTAMPTZ '2026-10-09 12:39:28.930+00'),
    ('bebd4409-b225-4a7f-9afa-6e0b165c822a'::uuid, TIMESTAMPTZ '2026-10-09 13:04:42.910+00'),
    ('1f8a9cfd-2255-4cf6-be82-691b09d952fa'::uuid, TIMESTAMPTZ '2026-10-09 14:26:55.295+00'),
    ('e2072a49-9499-4a14-a4aa-ca111d575b2b'::uuid, TIMESTAMPTZ '2026-10-09 15:36:45.067+00'),
    ('f60e5449-2fdd-40ff-b267-1184ab26a22c'::uuid, TIMESTAMPTZ '2026-10-09 16:49:56.998+00'),
    ('48277edf-cfda-4e4d-bca9-901553e26ec9'::uuid, TIMESTAMPTZ '2026-10-09 17:45:04.769+00')
  ) AS p(id, laptop_end)
),
next_of AS (
  SELECT
    t.id,
    LEAD(t.start_time) OVER (ORDER BY t.start_time, t.id) AS next_start
  FROM time_doctor.time_logs t
  WHERE t.user_id = 1200
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
  ON t.id = p.id AND t.user_id = 1200
LEFT JOIN next_of n ON n.id = p.id
ORDER BY t.start_time;

SELECT
  e.time_log_id,
  e.old_end_time AT TIME ZONE 'America/Chicago' AS old_end_cdt,
  e.new_end_time AT TIME ZONE 'America/Chicago' AS new_end_cdt,
  ROUND(e.duration_delta_seconds / 3600.0, 2) AS hours_added
FROM time_doctor.time_log_events e
WHERE e.user_id = 1200
  AND e.source = 'manual-correction-2026-10-12-omer'
ORDER BY e.created_at;

SELECT
  (t.start_time AT TIME ZONE 'America/Chicago')::date AS chicago_day,
  COUNT(*) AS sessions,
  COUNT(*) FILTER (WHERE t.end_time IS NULL) AS still_open,
  ROUND(SUM(EXTRACT(EPOCH FROM (
    COALESCE(t.end_time, t.last_alive_at) - t.start_time
  ))) / 3600.0, 2) AS billed_h
FROM time_doctor.time_logs t
WHERE t.user_id = 1200
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
  WHERE t.user_id = 1200
    AND t.workspace_id = 511
    AND t.start_time >= TIMESTAMP '2026-10-04 00:00' AT TIME ZONE 'America/Chicago'
    AND t.start_time <  TIMESTAMP '2026-10-12 00:00' AT TIME ZONE 'America/Chicago'
) s
WHERE s.next_start IS NOT NULL
  AND COALESCE(s.end_time, 'infinity'::timestamptz) > s.next_start;


-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 4 — CLIP fbf003f6 to laptop Stop 05:00:17 CDT if recovery stretched it.
-- Review, then COMMIT.
-- ═══════════════════════════════════════════════════════════════════════════

SELECT
  t.id,
  t.status,
  t.start_time AT TIME ZONE 'America/Chicago' AS start_cdt,
  t.end_time   AT TIME ZONE 'America/Chicago' AS current_end_cdt,
  TIMESTAMPTZ '2026-10-09 10:00:17.506+00' AT TIME ZONE 'America/Chicago' AS clip_to_cdt,
  ROUND(EXTRACT(EPOCH FROM (t.end_time - t.start_time)) / 3600.0, 2) AS current_h,
  ROUND(EXTRACT(EPOCH FROM (
    TIMESTAMPTZ '2026-10-09 10:00:17.506+00' - t.start_time
  )) / 3600.0, 2) AS after_h
FROM time_doctor.time_logs t
WHERE t.id = 'fbf003f6-8ce7-4a57-9401-741c110b8496'
  AND t.user_id = 1200;

BEGIN;

WITH before AS (
  SELECT
    t.id,
    t.user_id,
    t.workspace_id,
    t.device_id,
    t.start_time,
    t.end_time AS old_end,
    t.status AS old_status
  FROM time_doctor.time_logs t
  WHERE t.id = 'fbf003f6-8ce7-4a57-9401-741c110b8496'
    AND t.user_id = 1200
    AND t.end_time > TIMESTAMPTZ '2026-10-09 10:00:17.506+00'
),
updated AS (
  UPDATE time_doctor.time_logs t
  SET
    end_time = TIMESTAMPTZ '2026-10-09 10:00:17.506+00',
    last_alive_at = LEAST(
      COALESCE(t.last_alive_at, TIMESTAMPTZ '2026-10-09 10:00:17.506+00'),
      TIMESTAMPTZ '2026-10-09 10:00:17.506+00'
    ),
    status = 'completed',
    updated_at = NOW()
  FROM before b
  WHERE t.id = b.id
    AND t.user_id = 1200
  RETURNING t.id, t.start_time, t.end_time, t.status
)
INSERT INTO time_doctor.time_log_events
  (user_id, time_log_id, workspace_id, action, source, device_id, agent_version,
   old_start_time, old_end_time, old_status,
   new_start_time, new_end_time, new_status,
   duration_delta_seconds, shortened, meta)
SELECT
  b.user_id,
  b.id,
  b.workspace_id,
  'admin_corrected_clip_overlap',
  'manual-correction-2026-10-12-omer-clip',
  b.device_id,
  '1.0.247',
  b.start_time,
  b.old_end,
  b.old_status,
  u.start_time,
  u.end_time,
  u.status,
  EXTRACT(EPOCH FROM (u.end_time - b.old_end))::int,
  TRUE,
  jsonb_build_object(
    'reason', 'clip fbf003f6 to laptop Stop 05:00 CDT; recovery closed it with 1ece2692 at 05:22',
    'corrected_by', 'engineering'
  )
FROM updated u
JOIN before b ON b.id = u.id;

-- expect 0.28h on fbf003f6, Oct 9 ~5.31h, overlaps 0
SELECT
  id, status,
  start_time AT TIME ZONE 'America/Chicago' AS start_cdt,
  end_time   AT TIME ZONE 'America/Chicago' AS end_cdt,
  ROUND(EXTRACT(EPOCH FROM (end_time - start_time)) / 3600.0, 2) AS billed_h
FROM time_doctor.time_logs
WHERE id = 'fbf003f6-8ce7-4a57-9401-741c110b8496';

SELECT
  (t.start_time AT TIME ZONE 'America/Chicago')::date AS chicago_day,
  ROUND(SUM(EXTRACT(EPOCH FROM (
    COALESCE(t.end_time, t.last_alive_at) - t.start_time
  ))) / 3600.0, 2) AS billed_h
FROM time_doctor.time_logs t
WHERE t.user_id = 1200
  AND t.workspace_id = 511
  AND t.start_time >= TIMESTAMP '2026-10-04 00:00' AT TIME ZONE 'America/Chicago'
  AND t.start_time <  TIMESTAMP '2026-10-12 00:00' AT TIME ZONE 'America/Chicago'
GROUP BY 1
ORDER BY 1;

-- COMMIT;
