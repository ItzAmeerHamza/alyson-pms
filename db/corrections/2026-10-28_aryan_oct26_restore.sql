-- Aryan Sawant (user_id 1233, workspace 511) — Mon Oct 26 2026 (Chicago)
--
-- Same bug as Oct 27 (see 2026-10-28_aryan_oct27_restore.sql). From 10:16 CDT
-- every reminder-popup Start sent project_id 'tracking' → create_time_log
-- 500 [22P02]. No row landed for the last 5 sessions.
--
-- Already in DB (created online, project 390ecb47, closes synced):
--   65880bdc, 0b8585bd, 5f3f85ae, 8b953cbe  — laptop tray 14242s (3h 57m)
--
-- Evidence: S3 logs/dt=2026-10-26/.../device_id=11922846.../1.1.3.jsonl
--   (start_time + pending-close endTime) and dt=2026-10-27 file
--   (FROZEN_CLOSE endTime for ca5acbb2). Ends are the laptop's own,
--   already idle-trimmed. Laptop tray bases match each length.
--
-- ca5acbb2: its start falls in an hour the Oct 26 upload missed
--   (22:52–23:52Z). Start = first screenshot of that session, uploaded
--   22:55:46Z (S3 alyson-td-screenshots/2026/10/27/.../9628036d...jpg).
--   Screenshots only run while tracking, so that is the proven minimum.
--
-- Adds 5 rows, 2h 44m 14s. Day total ≈ 6h 41m.
-- Project: 390ecb47 (his own pick on the same day's first 4 sessions).
--
-- Run STEP 1 alone first.


-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 1 — READ ONLY
-- ═══════════════════════════════════════════════════════════════════════════

WITH plan AS (
  SELECT * FROM (VALUES
    -- 10:16–10:37 CDT
    ('3c9089bd-ff28-473a-ba89-157017fa18dc'::uuid,
     TIMESTAMPTZ '2026-10-26 15:16:21.399+00',
     TIMESTAMPTZ '2026-10-26 15:37:36.412+00',
     'laptop_stop'),
    -- 15:16–15:42 CDT
    ('6c5ce5e9-5281-4140-a54a-91663cb2d32d'::uuid,
     TIMESTAMPTZ '2026-10-26 20:16:17.901+00',
     TIMESTAMPTZ '2026-10-26 20:42:21.468+00',
     'laptop_stop'),
    -- 16:02–16:30 CDT
    ('97350fcf-ca45-4707-a296-76397adb3055'::uuid,
     TIMESTAMPTZ '2026-10-26 21:02:23.829+00',
     TIMESTAMPTZ '2026-10-26 21:30:25.415+00',
     'laptop_stop'),
    -- 16:50–17:38 CDT
    ('84373754-09de-4364-8a9c-1ab2cbf75767'::uuid,
     TIMESTAMPTZ '2026-10-26 21:50:26.981+00',
     TIMESTAMPTZ '2026-10-26 22:38:26.324+00',
     'laptop_stop'),
    -- 17:55–18:46 CDT, start = first screenshot
    ('ca5acbb2-814b-407d-b2eb-8b01198a3593'::uuid,
     TIMESTAMPTZ '2026-10-26 22:55:46+00',
     TIMESTAMPTZ '2026-10-26 23:46:40.486+00',
     'laptop_stop_start_from_screenshot')
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

-- Oct 26 Chicago now (expect the 4 synced rows, ~3.96 h)
SELECT id, start_time AT TIME ZONE 'America/Chicago' AS start_cdt,
       end_time AT TIME ZONE 'America/Chicago' AS end_cdt, project_id, status
FROM time_doctor.time_logs
WHERE user_id = 1233
  AND start_time >= TIMESTAMP '2026-10-26 00:00' AT TIME ZONE 'America/Chicago'
  AND start_time <  TIMESTAMP '2026-10-27 00:00' AT TIME ZONE 'America/Chicago'
ORDER BY start_time;


-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 2 — APPLY. Expect missing_row = true and overlapping_rows = 0.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

WITH plan AS (
  SELECT * FROM (VALUES
    ('3c9089bd-ff28-473a-ba89-157017fa18dc'::uuid,
     TIMESTAMPTZ '2026-10-26 15:16:21.399+00',
     TIMESTAMPTZ '2026-10-26 15:37:36.412+00',
     'laptop_stop'),
    ('6c5ce5e9-5281-4140-a54a-91663cb2d32d'::uuid,
     TIMESTAMPTZ '2026-10-26 20:16:17.901+00',
     TIMESTAMPTZ '2026-10-26 20:42:21.468+00',
     'laptop_stop'),
    ('97350fcf-ca45-4707-a296-76397adb3055'::uuid,
     TIMESTAMPTZ '2026-10-26 21:02:23.829+00',
     TIMESTAMPTZ '2026-10-26 21:30:25.415+00',
     'laptop_stop'),
    ('84373754-09de-4364-8a9c-1ab2cbf75767'::uuid,
     TIMESTAMPTZ '2026-10-26 21:50:26.981+00',
     TIMESTAMPTZ '2026-10-26 22:38:26.324+00',
     'laptop_stop'),
    ('ca5acbb2-814b-407d-b2eb-8b01198a3593'::uuid,
     TIMESTAMPTZ '2026-10-26 22:55:46+00',
     TIMESTAMPTZ '2026-10-26 23:46:40.486+00',
     'laptop_stop_start_from_screenshot')
  ) AS p(id, start_time, laptop_end, close_source)
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
    c.id, 1233, 511, '390ecb47-2382-43d5-ad62-11f7d5a1b10e'::uuid,
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
  'manual-correction-2026-10-28-aryan-oct26',
  i.device_id, '1.1.3',
  NULL, NULL, NULL, NULL,
  i.start_time, i.end_time, i.status, i.idle_seconds,
  EXTRACT(EPOCH FROM (i.end_time - i.start_time))::int,
  FALSE,
  jsonb_build_object(
    'reason', 'Oct 26: create_time_log 500 [22P02], project_id ''tracking'' from reminder popup',
    'evidence', CASE WHEN c.close_source = 'laptop_stop_start_from_screenshot'
      THEN 'end: S3 dt=2026-10-27 FROZEN_CLOSE endTime; start: first screenshot 9628036d'
      ELSE 'S3 logs/dt=2026-10-26 user_id=1233 device 11922846 pending session close' END,
    'close_source', c.close_source,
    'laptop_end', c.laptop_end,
    'corrected_by', 'engineering'
  )
FROM inserted i
JOIN chosen c ON c.id = i.id;

-- Expect 9 rows, ~6.69 h for Oct 26 Chicago
SELECT COUNT(*) AS rows,
  ROUND(SUM(EXTRACT(EPOCH FROM (COALESCE(end_time, NOW()) - start_time))) / 3600.0, 2) AS hours
FROM time_doctor.time_logs
WHERE user_id = 1233
  AND start_time >= TIMESTAMP '2026-10-26 00:00' AT TIME ZONE 'America/Chicago'
  AND start_time <  TIMESTAMP '2026-10-27 00:00' AT TIME ZONE 'America/Chicago';

-- COMMIT;   -- or ROLLBACK;
