-- Aryan Sawant (user_id 1233, workspace 511) — Tue Oct 27 2026 (Chicago)
--
-- Every create_time_log on Oct 27 failed with 500 [22P02]. The reminder
-- popup sent project_id 'tracking' (from the Report-issue dropdown) and
-- resolveProjectId cast it to uuid. No row ever landed, so Pulse shows 0.
--
-- Evidence: S3 logs/dt=2026-10-27/workspace_id=511/user_id=1233/
--   device_id=11922846-5af2-479b-b1b6-bfcd86e0d8d8/1.1.3.jsonl
-- Times are the laptop's own start_time and pending-close endTime.
-- Sum = 16049s (4h 27m 29s) = laptop tray base at 16:19Z. 99 screenshots in S3.
--
-- Laptop ends only. Never shortens. Caps at next session.
-- Exception: 6e3a974d (11:19 CDT) has no laptop Stop yet (log upload stops
-- at 19:39Z). It ends at his last keyboard/mouse input, 19:29:32.704Z
-- (INPUT SUMMARY last_activity_iso). That is the proven minimum. If a later
-- log upload shows a later Stop, extend it with an UPDATE. Never shorten.
--
-- Project: he never picked one. Uses his most recent real project_id
-- (390ecb47-2382-43d5-ad62-11f7d5a1b10e on Oct 28).
--
-- Applied Oct 28: first 3 rows. Rerun is safe: existing ids are skipped.
-- Full day = 4 rows, 7h 37m 10s.
--
-- Run STEP 1 alone first.


-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 1 — READ ONLY
-- ═══════════════════════════════════════════════════════════════════════════

WITH plan AS (
  SELECT * FROM (VALUES
    -- 01:45–02:27 CDT, closed at lid sleep
    ('48570710-dc1e-438b-bdfd-405b66ce9d46'::uuid,
     TIMESTAMPTZ '2026-10-27 06:45:48.471+00',
     TIMESTAMPTZ '2026-10-27 07:27:27.467+00',
     'lid_close'),
    -- 04:03–04:10 CDT, laptop trimmed trailing idle
    ('d7a7e512-471f-43fe-a5b2-9b766d50717d'::uuid,
     TIMESTAMPTZ '2026-10-27 09:03:43.978+00',
     TIMESTAMPTZ '2026-10-27 09:10:46.040+00',
     'stop_idle_trim'),
    -- 04:58–08:37 CDT
    ('633c0403-f70a-4331-8c43-abca42788bb9'::uuid,
     TIMESTAMPTZ '2026-10-27 09:58:34.952+00',
     TIMESTAMPTZ '2026-10-27 13:37:24.355+00',
     'laptop_stop'),
    -- 11:19–14:29 CDT, no Stop uploaded; ends at last input
    ('6e3a974d-fe60-42ae-b993-ac7d675c6197'::uuid,
     TIMESTAMPTZ '2026-10-27 16:19:52.665+00',
     TIMESTAMPTZ '2026-10-27 19:29:32.704+00',
     'last_input_activity')
  ) AS p(id, start_time, laptop_end, close_source)
)
SELECT
  p.id,
  (t.id IS NULL) AS missing_row,
  p.close_source,
  p.start_time AT TIME ZONE 'America/Chicago' AS start_cdt,
  p.laptop_end AT TIME ZONE 'America/Chicago' AS end_cdt,
  ROUND(EXTRACT(EPOCH FROM (p.laptop_end - p.start_time)) / 3600.0, 2) AS h,
  (SELECT COUNT(*) FROM time_doctor.time_logs o
    WHERE o.user_id = 1233 AND o.id <> p.id
      AND o.start_time < p.laptop_end
      AND COALESCE(o.end_time, NOW()) > p.start_time
  ) AS overlapping_rows
FROM plan p
LEFT JOIN time_doctor.time_logs t ON t.id = p.id
ORDER BY p.start_time;

-- Project that STEP 2 will use
SELECT t.project_id, p.name, t.start_time
FROM time_doctor.time_logs t
LEFT JOIN time_doctor.projects p ON p.id = t.project_id
WHERE t.user_id = 1233 AND t.project_id IS NOT NULL
ORDER BY t.start_time DESC
LIMIT 1;

-- Oct 27 Chicago total now
SELECT COUNT(*) AS rows,
  ROUND(SUM(EXTRACT(EPOCH FROM (
    COALESCE(t.end_time, NOW()) - t.start_time
  ))) / 3600.0, 2) AS billed_h
FROM time_doctor.time_logs t
WHERE t.user_id = 1233
  AND t.start_time >= TIMESTAMP '2026-10-27 00:00' AT TIME ZONE 'America/Chicago'
  AND t.start_time <  TIMESTAMP '2026-10-28 00:00' AT TIME ZONE 'America/Chicago';


-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 2 — APPLY. Expect 6e3a974d: missing_row = true, overlapping_rows = 0.
-- (The first 3 show missing_row = false — already applied, skipped.)
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

WITH plan AS (
  SELECT * FROM (VALUES
    ('48570710-dc1e-438b-bdfd-405b66ce9d46'::uuid,
     TIMESTAMPTZ '2026-10-27 06:45:48.471+00',
     TIMESTAMPTZ '2026-10-27 07:27:27.467+00',
     'lid_close'),
    ('d7a7e512-471f-43fe-a5b2-9b766d50717d'::uuid,
     TIMESTAMPTZ '2026-10-27 09:03:43.978+00',
     TIMESTAMPTZ '2026-10-27 09:10:46.040+00',
     'stop_idle_trim'),
    ('633c0403-f70a-4331-8c43-abca42788bb9'::uuid,
     TIMESTAMPTZ '2026-10-27 09:58:34.952+00',
     TIMESTAMPTZ '2026-10-27 13:37:24.355+00',
     'laptop_stop'),
    ('6e3a974d-fe60-42ae-b993-ac7d675c6197'::uuid,
     TIMESTAMPTZ '2026-10-27 16:19:52.665+00',
     TIMESTAMPTZ '2026-10-27 19:29:32.704+00',
     'last_input_activity')
  ) AS p(id, start_time, laptop_end, close_source)
),
proj AS (
  SELECT (
    SELECT t.project_id FROM time_doctor.time_logs t
    WHERE t.user_id = 1233 AND t.project_id IS NOT NULL
    ORDER BY t.start_time DESC LIMIT 1
  ) AS project_id
),
chosen AS (
  SELECT p.*
  FROM plan p
  WHERE NOT EXISTS (SELECT 1 FROM time_doctor.time_logs t WHERE t.id = p.id)
    AND NOT EXISTS (
      SELECT 1 FROM time_doctor.time_logs o
      WHERE o.user_id = 1233
        AND o.start_time < p.laptop_end
        AND COALESCE(o.end_time, NOW()) > p.start_time
    )
),
inserted AS (
  INSERT INTO time_doctor.time_logs (
    id, user_id, workspace_id, project_id, device_id,
    start_time, end_time, last_alive_at, status, idle_seconds, updated_at
  )
  SELECT
    c.id, 1233, 511, (SELECT project_id FROM proj),
    '11922846-5af2-479b-b1b6-bfcd86e0d8d8',
    c.start_time, c.laptop_end, c.laptop_end, 'completed', 0, NOW()
  FROM chosen c
  ON CONFLICT (id) DO NOTHING
  RETURNING id, user_id, workspace_id, device_id, start_time, end_time, status, idle_seconds
)
INSERT INTO time_doctor.time_log_events
  (user_id, time_log_id, workspace_id, action, source, device_id, agent_version,
   old_start_time, old_end_time, old_status, old_idle_seconds,
   new_start_time, new_end_time, new_status, new_idle_seconds,
   duration_delta_seconds, shortened, meta)
SELECT
  i.user_id, i.id, i.workspace_id,
  'admin_corrected_restore_stop_click',
  'manual-correction-2026-10-28-aryan',
  i.device_id, '1.1.3',
  NULL, NULL, NULL, NULL,
  i.start_time, i.end_time, i.status, i.idle_seconds,
  EXTRACT(EPOCH FROM (i.end_time - i.start_time))::int,
  FALSE,
  jsonb_build_object(
    'reason', 'Oct 27: create_time_log 500 [22P02], project_id ''tracking'' from reminder popup',
    'evidence', CASE WHEN c.close_source = 'last_input_activity'
      THEN 'S3 logs/dt=2026-10-27 user_id=1233 last INPUT last_activity_iso; no Stop uploaded'
      ELSE 'S3 logs/dt=2026-10-27 user_id=1233 device 11922846 pending session close' END,
    'close_source', c.close_source,
    'laptop_end', c.laptop_end,
    'corrected_by', 'engineering'
  )
FROM inserted i
JOIN chosen c ON c.id = i.id;

-- Expect 4 rows
SELECT id, start_time AT TIME ZONE 'America/Chicago' AS start_cdt,
       end_time AT TIME ZONE 'America/Chicago' AS end_cdt, project_id
FROM time_doctor.time_logs
WHERE id IN ('48570710-dc1e-438b-bdfd-405b66ce9d46',
             'd7a7e512-471f-43fe-a5b2-9b766d50717d',
             '633c0403-f70a-4331-8c43-abca42788bb9',
             '6e3a974d-fe60-42ae-b993-ac7d675c6197')
ORDER BY start_time;

-- Expect 4 rows, ~7.62 h for Oct 27 Chicago
SELECT COUNT(*) AS rows,
  ROUND(SUM(EXTRACT(EPOCH FROM (end_time - start_time))) / 3600.0, 2) AS hours
FROM time_doctor.time_logs
WHERE user_id = 1233
  AND start_time >= TIMESTAMP '2026-10-27 00:00' AT TIME ZONE 'America/Chicago'
  AND start_time <  TIMESTAMP '2026-10-28 00:00' AT TIME ZONE 'America/Chicago';

-- COMMIT;   -- or ROLLBACK;
