-- Aryan Sawant (user_id 1233, aryan@cintara.ai, workspace 511)
-- Chicago week Sun Oct 4 – Sat Oct 11 2026.
--
-- S3 agent logs (1.0.244 then 1.0.248). Creates landed. Several Stops did
-- not: update_time_log returned ISE / fetch failed / never logged
-- "Database updated successfully". Laptop kept the pending close.
--
-- This restores those laptop Stop clicks. It never shortens. It never
-- bills leftover-queue inflation (Oct 10 tray 11h 11m). It never writes
-- past the next session start. Two Friday afternoon rows have no Stop
-- in the logs — those close at last proof of life only.
--
-- 6117fd6c started offline Thu Oct 8. If STEP 1 shows missing_row=true,
-- do not invent an INSERT here (no project_id in the log).
--
-- Run STEP 1 alone first. It changes nothing.


-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 1 — READ ONLY. Current row vs laptop Stop vs last proof.
-- ═══════════════════════════════════════════════════════════════════════════

WITH plan AS (
  SELECT * FROM (VALUES
    -- Oct 4 12:30–19:31 CDT, 7h 01m, pending close, no Database updated
    ('b9edeacf-f160-4cae-a452-7bd271ef1e39'::uuid,
     TIMESTAMPTZ '2026-10-05 00:31:39.266+00',
     'stop_click'),
    -- Oct 5 01:44–02:20, snap 36m → 24m
    ('4c791b75-f3db-409c-a771-080699bc3069'::uuid,
     TIMESTAMPTZ '2026-10-05 07:20:54.062+00',
     'stop_click'),
    -- Oct 5 02:39–09:58, 7h 19m, snap 7h 43m → 3h 41m
    ('2e70e71a-53de-454b-8150-cfc41025e605'::uuid,
     TIMESTAMPTZ '2026-10-05 14:58:40.935+00',
     'stop_click'),
    -- Oct 5 11:08–11:32, 24m, no Database updated
    ('7f90fa19-14d3-4f71-bf27-4a96b17111af'::uuid,
     TIMESTAMPTZ '2026-10-05 16:32:52.116+00',
     'stop_click'),
    -- Oct 6 00:04–06:01, 5h 57m, snap 6h 01m → 1h 46m
    ('d90cc073-26f0-423c-9fe6-f961e47da9ee'::uuid,
     TIMESTAMPTZ '2026-10-06 11:01:47.711+00',
     'stop_click'),
    -- Oct 6 06:02–09:52, 3h 50m
    ('0cb590e7-76c8-4d73-98ee-28c236ed91d1'::uuid,
     TIMESTAMPTZ '2026-10-06 14:52:41.855+00',
     'stop_click'),
    -- Oct 6 10:28–10:39, 11m
    ('204a9f76-66ab-482b-b775-2a5b9ada5b9e'::uuid,
     TIMESTAMPTZ '2026-10-06 15:39:14.738+00',
     'stop_click'),
    -- Oct 7 04:34–05:36, 1h 02m
    ('8aba3d7e-45cb-4b29-9288-2ea7d329e17b'::uuid,
     TIMESTAMPTZ '2026-10-07 10:36:33.416+00',
     'stop_click'),
    -- Oct 7 07:00–09:34, 2h 34m, fetch failed
    ('6e2f61b2-36e0-4c48-81a9-7ec4ecd11147'::uuid,
     TIMESTAMPTZ '2026-10-07 14:34:37.203+00',
     'stop_click'),
    -- Oct 7 12:53–15:00, 2h 07m
    ('d62b9d02-3257-4631-8eb2-079181d63abe'::uuid,
     TIMESTAMPTZ '2026-10-07 20:00:46.339+00',
     'stop_click'),
    -- Oct 8 00:01–00:31, 29m
    ('9c5f13c6-6b7b-40f4-bfa5-9c4534fa4069'::uuid,
     TIMESTAMPTZ '2026-10-08 05:31:14.438+00',
     'stop_click'),
    -- Oct 8 02:01–02:11 offline — row may not exist
    ('6117fd6c-7565-40c8-90f8-fd5ef35fba5b'::uuid,
     TIMESTAMPTZ '2026-10-08 07:11:17.281+00',
     'stop_click'),
    -- Oct 9 failed closes
    ('f63fe684-b8ed-43f8-94f0-7a5ef7011f4b'::uuid,
     TIMESTAMPTZ '2026-10-09 09:38:48.321+00',
     'stop_click'),
    ('a4a13812-8151-40f1-8a4c-bfe719787110'::uuid,
     TIMESTAMPTZ '2026-10-09 10:30:22.064+00',
     'stop_click'),
    ('0e049bd3-61ce-437e-87cb-a235f73a139b'::uuid,
     TIMESTAMPTZ '2026-10-09 14:03:06.016+00',
     'stop_click'),
    -- Oct 9 afternoon, no Stop in logs
    ('a7ec9c11-4292-4a48-a3f1-baca4808609b'::uuid,
     NULL,
     'last_proof'),
    ('41320f71-b613-4d37-875e-d831d1c72167'::uuid,
     NULL,
     'last_proof'),
    -- Oct 10 failed closes (elapsed 11m and 34m — not the 11h tray)
    ('33408f32-79f7-45c9-8f18-6e23877b3cd6'::uuid,
     TIMESTAMPTZ '2026-10-11 04:11:56.723+00',
     'stop_click'),
    ('4e18e287-8f10-4510-9a0b-8dfb50e49886'::uuid,
     TIMESTAMPTZ '2026-10-11 04:56:28.147+00',
     'stop_click')
  ) AS p(id, laptop_end, close_source)
),
all_logs AS (
  SELECT
    t.id,
    LEAD(t.start_time) OVER (ORDER BY t.start_time, t.id) AS next_start
  FROM time_doctor.time_logs t
  WHERE t.user_id = 1233
    AND t.workspace_id = 511
),
proof AS (
  SELECT
    p.id,
    p.laptop_end,
    p.close_source,
    t.user_id,
    t.start_time,
    t.end_time,
    t.last_alive_at,
    t.status,
    (t.id IS NULL) AS missing_row,
    a.next_start,
    GREATEST(
      COALESCE(t.start_time, p.laptop_end),
      COALESCE(t.last_alive_at, t.start_time),
      COALESCE((SELECT MAX(h.seen_at) FROM time_doctor.session_heartbeats h
                 WHERE h.time_log_id = p.id), t.start_time),
      COALESCE((SELECT MAX(s.captured_at) FROM time_doctor.screenshots s
                 WHERE s.time_log_id = p.id), t.start_time),
      COALESCE((SELECT MAX(COALESCE(a.ended_at, a.started_at, a.timestamp))
                 FROM time_doctor.app_logs a WHERE a.time_log_id = p.id), t.start_time),
      COALESCE((SELECT MAX(COALESCE(ul.ended_at, ul.started_at))
                 FROM time_doctor.url_logs ul WHERE ul.time_log_id = p.id), t.start_time)
    ) AS last_proof
  FROM plan p
  LEFT JOIN time_doctor.time_logs t
    ON t.id = p.id AND t.user_id = 1233
  LEFT JOIN all_logs a ON a.id = p.id
)
SELECT
  p.id,
  p.missing_row,
  p.close_source,
  p.start_time AT TIME ZONE 'America/Chicago' AS start_cdt,
  p.end_time   AT TIME ZONE 'America/Chicago' AS old_end_cdt,
  p.laptop_end AT TIME ZONE 'America/Chicago' AS laptop_stop_cdt,
  p.last_proof AT TIME ZONE 'America/Chicago' AS last_proof_cdt,
  p.next_start AT TIME ZONE 'America/Chicago' AS next_start_cdt,
  LEAST(
    NOW(),
    COALESCE(p.next_start, 'infinity'::timestamptz),
    GREATEST(
      COALESCE(p.start_time, p.laptop_end),
      COALESCE(p.end_time, p.start_time),
      COALESCE(p.laptop_end, p.last_proof)
    )
  ) AT TIME ZONE 'America/Chicago' AS new_end_cdt,
  ROUND(EXTRACT(EPOCH FROM (
    COALESCE(p.end_time, p.last_alive_at, p.start_time) - p.start_time
  )) / 3600.0, 2) AS old_h,
  ROUND(EXTRACT(EPOCH FROM (
    LEAST(
      NOW(),
      COALESCE(p.next_start, 'infinity'::timestamptz),
      GREATEST(
        COALESCE(p.start_time, p.laptop_end),
        COALESCE(p.end_time, p.start_time),
        COALESCE(p.laptop_end, p.last_proof)
      )
    ) - p.start_time
  )) / 3600.0, 2) AS new_h,
  ROUND(EXTRACT(EPOCH FROM (
    LEAST(
      NOW(),
      COALESCE(p.next_start, 'infinity'::timestamptz),
      GREATEST(
        COALESCE(p.start_time, p.laptop_end),
        COALESCE(p.end_time, p.start_time),
        COALESCE(p.laptop_end, p.last_proof)
      )
    ) - COALESCE(p.end_time, p.start_time)
  )) / 3600.0, 2) AS hours_to_add,
  (LEAST(
      NOW(),
      COALESCE(p.next_start, 'infinity'::timestamptz),
      GREATEST(
        COALESCE(p.start_time, p.laptop_end),
        COALESCE(p.end_time, p.start_time),
        COALESCE(p.laptop_end, p.last_proof)
      )
    ) > COALESCE(p.end_time, p.start_time)
  ) AS need_fix
FROM proof p
ORDER BY COALESCE(p.start_time, p.laptop_end);


-- Week card as Pulse would see it today (Chicago, last_alive if still open).
SELECT
  (t.start_time AT TIME ZONE 'America/Chicago')::date AS chicago_day,
  COUNT(*) AS rows,
  ROUND(SUM(EXTRACT(EPOCH FROM (
    LEAST(
      COALESCE(t.end_time, t.last_alive_at, t.start_time),
      COALESCE(t.end_time, t.last_alive_at, NOW())
    ) - t.start_time
  ))) / 3600.0, 2) AS billed_h
FROM time_doctor.time_logs t
WHERE t.user_id = 1233
  AND t.workspace_id = 511
  AND t.start_time >= TIMESTAMP '2026-10-04 00:00' AT TIME ZONE 'America/Chicago'
  AND t.start_time <  TIMESTAMP '2026-10-12 00:00' AT TIME ZONE 'America/Chicago'
GROUP BY 1
ORDER BY 1;


-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 2 — APPLY. Only rows STEP 1 marked need_fix=true should change.
-- Review hours_to_add. Then COMMIT.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

WITH plan AS (
  SELECT * FROM (VALUES
    ('b9edeacf-f160-4cae-a452-7bd271ef1e39'::uuid, TIMESTAMPTZ '2026-10-05 00:31:39.266+00', 'stop_click'),
    ('4c791b75-f3db-409c-a771-080699bc3069'::uuid, TIMESTAMPTZ '2026-10-05 07:20:54.062+00', 'stop_click'),
    ('2e70e71a-53de-454b-8150-cfc41025e605'::uuid, TIMESTAMPTZ '2026-10-05 14:58:40.935+00', 'stop_click'),
    ('7f90fa19-14d3-4f71-bf27-4a96b17111af'::uuid, TIMESTAMPTZ '2026-10-05 16:32:52.116+00', 'stop_click'),
    ('d90cc073-26f0-423c-9fe6-f961e47da9ee'::uuid, TIMESTAMPTZ '2026-10-06 11:01:47.711+00', 'stop_click'),
    ('0cb590e7-76c8-4d73-98ee-28c236ed91d1'::uuid, TIMESTAMPTZ '2026-10-06 14:52:41.855+00', 'stop_click'),
    ('204a9f76-66ab-482b-b775-2a5b9ada5b9e'::uuid, TIMESTAMPTZ '2026-10-06 15:39:14.738+00', 'stop_click'),
    ('8aba3d7e-45cb-4b29-9288-2ea7d329e17b'::uuid, TIMESTAMPTZ '2026-10-07 10:36:33.416+00', 'stop_click'),
    ('6e2f61b2-36e0-4c48-81a9-7ec4ecd11147'::uuid, TIMESTAMPTZ '2026-10-07 14:34:37.203+00', 'stop_click'),
    ('d62b9d02-3257-4631-8eb2-079181d63abe'::uuid, TIMESTAMPTZ '2026-10-07 20:00:46.339+00', 'stop_click'),
    ('9c5f13c6-6b7b-40f4-bfa5-9c4534fa4069'::uuid, TIMESTAMPTZ '2026-10-08 05:31:14.438+00', 'stop_click'),
    ('6117fd6c-7565-40c8-90f8-fd5ef35fba5b'::uuid, TIMESTAMPTZ '2026-10-08 07:11:17.281+00', 'stop_click'),
    ('f63fe684-b8ed-43f8-94f0-7a5ef7011f4b'::uuid, TIMESTAMPTZ '2026-10-09 09:38:48.321+00', 'stop_click'),
    ('a4a13812-8151-40f1-8a4c-bfe719787110'::uuid, TIMESTAMPTZ '2026-10-09 10:30:22.064+00', 'stop_click'),
    ('0e049bd3-61ce-437e-87cb-a235f73a139b'::uuid, TIMESTAMPTZ '2026-10-09 14:03:06.016+00', 'stop_click'),
    ('a7ec9c11-4292-4a48-a3f1-baca4808609b'::uuid, NULL, 'last_proof'),
    ('41320f71-b613-4d37-875e-d831d1c72167'::uuid, NULL, 'last_proof'),
    ('33408f32-79f7-45c9-8f18-6e23877b3cd6'::uuid, TIMESTAMPTZ '2026-10-11 04:11:56.723+00', 'stop_click'),
    ('4e18e287-8f10-4510-9a0b-8dfb50e49886'::uuid, TIMESTAMPTZ '2026-10-11 04:56:28.147+00', 'stop_click')
  ) AS p(id, laptop_end, close_source)
),
next_of AS (
  SELECT
    t.id,
    LEAD(t.start_time) OVER (ORDER BY t.start_time, t.id) AS next_start
  FROM time_doctor.time_logs t
  WHERE t.user_id = 1233
    AND t.workspace_id = 511
),
ordered AS (
  SELECT
    t.id,
    t.user_id,
    t.workspace_id,
    t.device_id,
    t.start_time,
    t.end_time,
    t.last_alive_at,
    t.status,
    t.idle_seconds,
    p.laptop_end,
    p.close_source,
    n.next_start,
    GREATEST(
      t.start_time,
      COALESCE(t.last_alive_at, t.start_time),
      COALESCE((SELECT MAX(h.seen_at) FROM time_doctor.session_heartbeats h
                 WHERE h.time_log_id = t.id), t.start_time),
      COALESCE((SELECT MAX(s.captured_at) FROM time_doctor.screenshots s
                 WHERE s.time_log_id = t.id), t.start_time),
      COALESCE((SELECT MAX(COALESCE(a.ended_at, a.started_at, a.timestamp))
                 FROM time_doctor.app_logs a WHERE a.time_log_id = t.id), t.start_time),
      COALESCE((SELECT MAX(COALESCE(ul.ended_at, ul.started_at))
                 FROM time_doctor.url_logs ul WHERE ul.time_log_id = t.id), t.start_time)
    ) AS last_proof
  FROM time_doctor.time_logs t
  JOIN plan p ON p.id = t.id
  JOIN next_of n ON n.id = t.id
  WHERE t.user_id = 1233
    AND t.workspace_id = 511
),
chosen AS (
  SELECT
    o.*,
    LEAST(
      NOW(),
      COALESCE(o.next_start, 'infinity'::timestamptz),
      GREATEST(
        o.start_time,
        COALESCE(o.end_time, o.start_time),
        COALESCE(o.laptop_end, o.last_proof)
      )
    ) AS new_end
  FROM ordered o
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
    AND t.user_id = 1233
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
  'manual-correction-2026-10-12',
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
    'reason', 'Oct 4-11: restore laptop Stop after update_time_log ISE / failed fetch',
    'evidence', 'S3 dt=2026-10-04..11 user_id=1233 pending session close',
    'close_source', c.close_source,
    'laptop_end', c.laptop_end,
    'corrected_by', 'engineering'
  )
FROM updated u
JOIN chosen c ON c.id = u.id;

-- AFTER week totals
SELECT
  (t.start_time AT TIME ZONE 'America/Chicago')::date AS chicago_day,
  COUNT(*) AS rows,
  ROUND(SUM(EXTRACT(EPOCH FROM (
    COALESCE(t.end_time, t.last_alive_at) - t.start_time
  ))) / 3600.0, 2) AS billed_h
FROM time_doctor.time_logs t
WHERE t.user_id = 1233
  AND t.workspace_id = 511
  AND t.start_time >= TIMESTAMP '2026-10-04 00:00' AT TIME ZONE 'America/Chicago'
  AND t.start_time <  TIMESTAMP '2026-10-12 00:00' AT TIME ZONE 'America/Chicago'
GROUP BY 1
ORDER BY 1;

-- COMMIT;


-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 3 — VERIFY after COMMIT. Read only.
-- Pass: ok=true on every stop_click row that exists, overlaps=0,
-- week ~52.5h, Oct 10/11 extra tray not billed (4e18e287 ~0.57h not 11h).
-- ═══════════════════════════════════════════════════════════════════════════

WITH plan AS (
  SELECT * FROM (VALUES
    ('b9edeacf-f160-4cae-a452-7bd271ef1e39'::uuid, TIMESTAMPTZ '2026-10-05 00:31:39.266+00', 'stop_click'),
    ('4c791b75-f3db-409c-a771-080699bc3069'::uuid, TIMESTAMPTZ '2026-10-05 07:20:54.062+00', 'stop_click'),
    ('2e70e71a-53de-454b-8150-cfc41025e605'::uuid, TIMESTAMPTZ '2026-10-05 14:58:40.935+00', 'stop_click'),
    ('7f90fa19-14d3-4f71-bf27-4a96b17111af'::uuid, TIMESTAMPTZ '2026-10-05 16:32:52.116+00', 'stop_click'),
    ('d90cc073-26f0-423c-9fe6-f961e47da9ee'::uuid, TIMESTAMPTZ '2026-10-06 11:01:47.711+00', 'stop_click'),
    ('0cb590e7-76c8-4d73-98ee-28c236ed91d1'::uuid, TIMESTAMPTZ '2026-10-06 14:52:41.855+00', 'stop_click'),
    ('204a9f76-66ab-482b-b775-2a5b9ada5b9e'::uuid, TIMESTAMPTZ '2026-10-06 15:39:14.738+00', 'stop_click'),
    ('8aba3d7e-45cb-4b29-9288-2ea7d329e17b'::uuid, TIMESTAMPTZ '2026-10-07 10:36:33.416+00', 'stop_click'),
    ('6e2f61b2-36e0-4c48-81a9-7ec4ecd11147'::uuid, TIMESTAMPTZ '2026-10-07 14:34:37.203+00', 'stop_click'),
    ('d62b9d02-3257-4631-8eb2-079181d63abe'::uuid, TIMESTAMPTZ '2026-10-07 20:00:46.339+00', 'stop_click'),
    ('9c5f13c6-6b7b-40f4-bfa5-9c4534fa4069'::uuid, TIMESTAMPTZ '2026-10-08 05:31:14.438+00', 'stop_click'),
    ('6117fd6c-7565-40c8-90f8-fd5ef35fba5b'::uuid, TIMESTAMPTZ '2026-10-08 07:11:17.281+00', 'stop_click'),
    ('f63fe684-b8ed-43f8-94f0-7a5ef7011f4b'::uuid, TIMESTAMPTZ '2026-10-09 09:38:48.321+00', 'stop_click'),
    ('a4a13812-8151-40f1-8a4c-bfe719787110'::uuid, TIMESTAMPTZ '2026-10-09 10:30:22.064+00', 'stop_click'),
    ('0e049bd3-61ce-437e-87cb-a235f73a139b'::uuid, TIMESTAMPTZ '2026-10-09 14:03:06.016+00', 'stop_click'),
    ('a7ec9c11-4292-4a48-a3f1-baca4808609b'::uuid, NULL, 'last_proof'),
    ('41320f71-b613-4d37-875e-d831d1c72167'::uuid, NULL, 'last_proof'),
    ('33408f32-79f7-45c9-8f18-6e23877b3cd6'::uuid, TIMESTAMPTZ '2026-10-11 04:11:56.723+00', 'stop_click'),
    ('4e18e287-8f10-4510-9a0b-8dfb50e49886'::uuid, TIMESTAMPTZ '2026-10-11 04:56:28.147+00', 'stop_click')
  ) AS p(id, laptop_end, close_source)
),
next_of AS (
  SELECT
    t.id,
    LEAD(t.start_time) OVER (ORDER BY t.start_time, t.id) AS next_start
  FROM time_doctor.time_logs t
  WHERE t.user_id = 1233
    AND t.workspace_id = 511
)
SELECT
  p.id,
  (t.id IS NULL) AS missing_row,
  p.close_source,
  t.status,
  t.start_time AT TIME ZONE 'America/Chicago' AS start_cdt,
  t.end_time   AT TIME ZONE 'America/Chicago' AS end_cdt,
  p.laptop_end AT TIME ZONE 'America/Chicago' AS laptop_stop_cdt,
  n.next_start AT TIME ZONE 'America/Chicago' AS next_start_cdt,
  ROUND(EXTRACT(EPOCH FROM (t.end_time - t.start_time)) / 3600.0, 2) AS billed_h,
  CASE
    WHEN t.id IS NULL THEN 'missing'
    WHEN t.end_time IS NULL OR t.status <> 'completed' THEN 'still_open'
    WHEN t.end_time > NOW() THEN 'end_in_future'
    WHEN n.next_start IS NOT NULL AND t.end_time > n.next_start THEN 'overlaps_next'
    WHEN p.close_source = 'stop_click'
     AND t.end_time < p.laptop_end - INTERVAL '2 seconds'
     AND (n.next_start IS NULL OR t.end_time < n.next_start - INTERVAL '2 seconds')
      THEN 'end_before_laptop_stop'
    WHEN p.close_source = 'stop_click'
     AND t.end_time > p.laptop_end + INTERVAL '2 seconds'
      THEN 'end_after_laptop_stop'
    ELSE 'ok'
  END AS check_result
FROM plan p
LEFT JOIN time_doctor.time_logs t
  ON t.id = p.id AND t.user_id = 1233
LEFT JOIN next_of n ON n.id = p.id
ORDER BY COALESCE(t.start_time, p.laptop_end);


-- Audit rows from this correction (expect one per updated session).
SELECT
  e.time_log_id,
  e.action,
  e.source,
  e.old_end_time AT TIME ZONE 'America/Chicago' AS old_end_cdt,
  e.new_end_time AT TIME ZONE 'America/Chicago' AS new_end_cdt,
  ROUND(e.duration_delta_seconds / 3600.0, 2) AS hours_added,
  e.shortened,
  e.created_at AT TIME ZONE 'America/Chicago' AS written_cdt
FROM time_doctor.time_log_events e
WHERE e.user_id = 1233
  AND e.source = 'manual-correction-2026-10-12'
ORDER BY e.created_at;


-- Week totals. Expect ~52.5h, not 44.4h and not 63h+ (tray leak).
SELECT
  (t.start_time AT TIME ZONE 'America/Chicago')::date AS chicago_day,
  COUNT(*) AS rows,
  COUNT(*) FILTER (WHERE t.end_time IS NULL) AS still_open,
  ROUND(SUM(EXTRACT(EPOCH FROM (
    COALESCE(t.end_time, t.last_alive_at) - t.start_time
  ))) / 3600.0, 2) AS billed_h
FROM time_doctor.time_logs t
WHERE t.user_id = 1233
  AND t.workspace_id = 511
  AND t.start_time >= TIMESTAMP '2026-10-04 00:00' AT TIME ZONE 'America/Chicago'
  AND t.start_time <  TIMESTAMP '2026-10-12 00:00' AT TIME ZONE 'America/Chicago'
GROUP BY 1
ORDER BY 1;


-- Must be 0: no restored end past the next start.
SELECT COUNT(*) AS remaining_overlaps
FROM (
  SELECT
    t.end_time,
    LEAD(t.start_time) OVER (ORDER BY t.start_time, t.id) AS next_start
  FROM time_doctor.time_logs t
  WHERE t.user_id = 1233
    AND t.workspace_id = 511
    AND t.start_time >= TIMESTAMP '2026-10-04 00:00' AT TIME ZONE 'America/Chicago'
    AND t.start_time <  TIMESTAMP '2026-10-12 00:00' AT TIME ZONE 'America/Chicago'
) s
WHERE s.next_start IS NOT NULL
  AND COALESCE(s.end_time, 'infinity'::timestamptz) > s.next_start;


-- Must be ~0.57h, never ~11h.
SELECT
  id,
  status,
  ROUND(EXTRACT(EPOCH FROM (end_time - start_time)) / 3600.0, 2) AS billed_h
FROM time_doctor.time_logs
WHERE id = '4e18e287-8f10-4510-9a0b-8dfb50e49886';


-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 4 — CLIP 41320f71. last_proof rode the leftover queue to the next
-- Saturday session (33.07h). Roll end back to the audit old_end (Fri 15:05 CDT).
-- Review, then COMMIT.
-- ═══════════════════════════════════════════════════════════════════════════

-- Preview
SELECT
  t.id,
  t.status,
  t.start_time AT TIME ZONE 'America/Chicago' AS start_cdt,
  t.end_time   AT TIME ZONE 'America/Chicago' AS current_end_cdt,
  e.old_end_time AT TIME ZONE 'America/Chicago' AS clip_to_cdt,
  ROUND(EXTRACT(EPOCH FROM (t.end_time - t.start_time)) / 3600.0, 2) AS current_h,
  ROUND(EXTRACT(EPOCH FROM (e.old_end_time - t.start_time)) / 3600.0, 2) AS after_h
FROM time_doctor.time_logs t
JOIN time_doctor.time_log_events e
  ON e.time_log_id = t.id
 AND e.user_id = 1233
 AND e.source = 'manual-correction-2026-10-12'
 AND e.duration_delta_seconds > 3600
WHERE t.id = '41320f71-b613-4d37-875e-d831d1c72167'
  AND t.user_id = 1233;

BEGIN;

WITH ev AS (
  SELECT e.old_end_time, e.old_status, e.old_idle_seconds
  FROM time_doctor.time_log_events e
  WHERE e.time_log_id = '41320f71-b613-4d37-875e-d831d1c72167'
    AND e.user_id = 1233
    AND e.source = 'manual-correction-2026-10-12'
    AND e.duration_delta_seconds > 3600
  ORDER BY e.created_at DESC
  LIMIT 1
),
updated AS (
  UPDATE time_doctor.time_logs t
  SET
    end_time = ev.old_end_time,
    last_alive_at = ev.old_end_time,
    status = COALESCE(ev.old_status, 'completed'),
    updated_at = NOW()
  FROM ev
  WHERE t.id = '41320f71-b613-4d37-875e-d831d1c72167'
    AND t.user_id = 1233
    AND t.end_time > ev.old_end_time
  RETURNING
    t.id, t.user_id, t.workspace_id, t.device_id,
    t.start_time, t.end_time, t.status, t.idle_seconds
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
  'admin_corrected_clip_last_proof',
  'manual-correction-2026-10-12-clip',
  u.device_id,
  '1.0.248',
  u.start_time,
  TIMESTAMPTZ '2026-10-11 04:00:41.750+00',
  'completed',
  u.idle_seconds,
  u.start_time,
  u.end_time,
  u.status,
  u.idle_seconds,
  EXTRACT(EPOCH FROM (u.end_time - TIMESTAMPTZ '2026-10-11 04:00:41.750+00'))::int,
  TRUE,
  jsonb_build_object(
    'reason', 'clip 41320f71: last_proof followed leftover queue to next Saturday start',
    'clip_to', 'audit old_end Fri 2026-10-09 15:05:51 CDT',
    'corrected_by', 'engineering'
  )
FROM updated u;

-- After: 41320f71 ~1.15h, Oct 9 ~7h, week ~57h, overlaps still 0
SELECT
  id,
  status,
  start_time AT TIME ZONE 'America/Chicago' AS start_cdt,
  end_time   AT TIME ZONE 'America/Chicago' AS end_cdt,
  ROUND(EXTRACT(EPOCH FROM (end_time - start_time)) / 3600.0, 2) AS billed_h
FROM time_doctor.time_logs
WHERE id = '41320f71-b613-4d37-875e-d831d1c72167';

SELECT
  (t.start_time AT TIME ZONE 'America/Chicago')::date AS chicago_day,
  ROUND(SUM(EXTRACT(EPOCH FROM (
    COALESCE(t.end_time, t.last_alive_at) - t.start_time
  ))) / 3600.0, 2) AS billed_h
FROM time_doctor.time_logs t
WHERE t.user_id = 1233
  AND t.workspace_id = 511
  AND t.start_time >= TIMESTAMP '2026-10-04 00:00' AT TIME ZONE 'America/Chicago'
  AND t.start_time <  TIMESTAMP '2026-10-12 00:00' AT TIME ZONE 'America/Chicago'
GROUP BY 1
ORDER BY 1;

-- COMMIT;
