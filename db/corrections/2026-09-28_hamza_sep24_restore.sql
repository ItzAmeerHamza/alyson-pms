-- Hamza (hamza@cintara.ai, user_id 1195, workspace 511) — 24 Sep 2026.
--
-- WHY THE CLOCK WENT TO 0 (not a payroll delete):
--   After 18:21 Stop + ~1h break, Start at 19:23 painted last-session-only
--   (and sometimes 00:00:00) because 1.0.244 threw away the Stop floor and
--   the first tray tick seeded closed-today at 0. The morning 5h 16m stayed
--   in time_logs. Agent fix is in source; this SQL only repairs rows.
--
-- Agent ledger + 2026-09-24.jsonl (device e08b00ec, 1.0.244).
-- Chicago day 24 Sep = 05:00 UTC 24 Sep → 05:00 UTC 25 Sep.
-- Expected merged wall if all 8 rows match the ledger: 23938s = 6h 38m 58s.
--
-- Real DB defects this can fix:
--   773566bb  overlap flush set end_time = start_time (0s). Honest idle-cut
--             end is 20:23:34 PKT (665s). Synced_update later may already
--             have restored it — STEP 1 will show.
--   Evening rows created offline may be missing or still open.
--
-- NOT touched (product / already billed):
--   Idle-prompt 10m cuts on d45aa082 (19:59→19:49) and 773566bb (20:33→20:23).
--   Morning sessions 537a4a5d / d0ae2f89 / 7405b94d / 29c1df00 (synced same day).
--
-- Run STEP 1 alone first. It changes nothing.


-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 1 — READ ONLY
-- ═══════════════════════════════════════════════════════════════════════════

-- 1A. What Pulse will merge for Chicago 24 Sep.
SELECT
  t.id,
  t.status,
  t.start_time AT TIME ZONE 'Asia/Karachi' AS start_pk,
  t.end_time   AT TIME ZONE 'Asia/Karachi' AS end_pk,
  t.last_alive_at AT TIME ZONE 'Asia/Karachi' AS last_alive_pk,
  ROUND(EXTRACT(EPOCH FROM (
    COALESCE(t.end_time, t.last_alive_at) - t.start_time
  )))::int AS wall_s,
  t.idle_seconds
FROM time_doctor.time_logs t
WHERE t.user_id = 1195
  AND t.workspace_id = 511
  AND t.start_time >= TIMESTAMPTZ '2026-09-24 05:00:00+00'
  AND t.start_time <  TIMESTAMPTZ '2026-09-25 05:00:00+00'
ORDER BY t.start_time;

-- 1B. Ledger vs RDS. need_fix = missing, open, or shorter than the agent close.
WITH plan AS (
  SELECT * FROM (VALUES
    ('537a4a5d-66d8-43f9-9ff3-56dd06683d9a'::uuid,
     TIMESTAMPTZ '2026-09-24 06:12:51.677+00',
     TIMESTAMPTZ '2026-09-24 08:17:30.053+00',
     0, 'manual_stop'),
    ('d0ae2f89-721c-472c-b4af-5c63e0043906'::uuid,
     TIMESTAMPTZ '2026-09-24 09:19:54.212+00',
     TIMESTAMPTZ '2026-09-24 10:13:48.731+00',
     0, 'manual_stop'),
    ('7405b94d-4b0b-4cb0-9391-926c05fd6ca0'::uuid,
     TIMESTAMPTZ '2026-09-24 10:59:40.409+00',
     TIMESTAMPTZ '2026-09-24 12:33:17.661+00',
     0, 'manual_stop'),
    ('29c1df00-0d8e-4a4b-a1a3-4b88ac94dba4'::uuid,
     TIMESTAMPTZ '2026-09-24 12:37:35.808+00',
     TIMESTAMPTZ '2026-09-24 13:21:26.267+00',
     0, 'manual_stop'),
    ('d45aa082-c255-48f8-aa8b-11db70d70e18'::uuid,
     TIMESTAMPTZ '2026-09-24 14:23:41.303+00',
     TIMESTAMPTZ '2026-09-24 14:49:44.236+00',
     153, 'idle_timeout_10m'),
    ('7b9178df-3245-44c1-87d7-3a2f2bb57eac'::uuid,
     TIMESTAMPTZ '2026-09-24 15:11:02.266+00',
     TIMESTAMPTZ '2026-09-24 15:12:23.426+00',
     0, 'manual_stop'),
    ('773566bb-a82e-403e-9a09-8c104f05464e'::uuid,
     TIMESTAMPTZ '2026-09-24 15:12:29.420+00',
     TIMESTAMPTZ '2026-09-24 15:23:34.600+00',
     0, 'idle_timeout_then_overlap_zero'),
    ('f9e0c5b9-b187-4e27-aea0-8c96e4cbad50'::uuid,
     TIMESTAMPTZ '2026-09-24 15:42:32.640+00',
     TIMESTAMPTZ '2026-09-24 16:27:03.724+00',
     0, 'manual_stop')
  ) AS p(id, start_time, end_time, idle_seconds, reason)
)
SELECT
  p.id,
  p.reason,
  t.id IS NULL AS missing,
  t.end_time IS NULL AS still_open,
  COALESCE(t.end_time, t.start_time) <= t.start_time AS zeroed,
  t.end_time AT TIME ZONE 'Asia/Karachi' AS rds_end_pk,
  p.end_time AT TIME ZONE 'Asia/Karachi' AS ledger_end_pk,
  CASE
    WHEN t.id IS NULL THEN EXTRACT(EPOCH FROM (p.end_time - p.start_time))::int
    WHEN t.end_time IS NULL OR t.end_time < p.end_time
      THEN EXTRACT(EPOCH FROM (p.end_time - COALESCE(t.end_time, t.start_time)))::int
    ELSE 0
  END AS seconds_to_add,
  (t.id IS NULL OR t.end_time IS NULL OR t.end_time < p.end_time) AS need_fix
FROM plan p
LEFT JOIN time_doctor.time_logs t
  ON t.id = p.id AND t.user_id = 1195
ORDER BY p.start_time;


-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 2 — APPLY. Review STEP 1. Only rows with need_fix=true should change.
-- Then COMMIT.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

WITH plan AS (
  SELECT * FROM (VALUES
    ('d45aa082-c255-48f8-aa8b-11db70d70e18'::uuid,
     TIMESTAMPTZ '2026-09-24 14:23:41.303+00',
     TIMESTAMPTZ '2026-09-24 14:49:44.236+00',
     153, 'idle_timeout_10m'),
    ('7b9178df-3245-44c1-87d7-3a2f2bb57eac'::uuid,
     TIMESTAMPTZ '2026-09-24 15:11:02.266+00',
     TIMESTAMPTZ '2026-09-24 15:12:23.426+00',
     0, 'manual_stop'),
    ('773566bb-a82e-403e-9a09-8c104f05464e'::uuid,
     TIMESTAMPTZ '2026-09-24 15:12:29.420+00',
     TIMESTAMPTZ '2026-09-24 15:23:34.600+00',
     0, 'idle_timeout_then_overlap_zero'),
    ('f9e0c5b9-b187-4e27-aea0-8c96e4cbad50'::uuid,
     TIMESTAMPTZ '2026-09-24 15:42:32.640+00',
     TIMESTAMPTZ '2026-09-24 16:27:03.724+00',
     0, 'manual_stop')
  ) AS p(id, start_time, end_time, idle_seconds, reason)
),
upserted AS (
  INSERT INTO time_doctor.time_logs (
    id, user_id, workspace_id, project_id, device_id,
    start_time, end_time, last_alive_at, status, idle_seconds, updated_at
  )
  SELECT
    p.id,
    1195,
    511,
    '390ecb47-2382-43d5-ad62-11f7d5a1b10e'::uuid,
    'e08b00ec-877c-4d47-94ff-3df23bbfd377',
    p.start_time,
    p.end_time,
    p.end_time,
    'completed',
    p.idle_seconds,
    NOW()
  FROM plan p
  ON CONFLICT (id) DO UPDATE
  SET
    end_time = EXCLUDED.end_time,
    last_alive_at = EXCLUDED.end_time,
    status = 'completed',
    idle_seconds = GREATEST(time_doctor.time_logs.idle_seconds, EXCLUDED.idle_seconds),
    updated_at = NOW()
  WHERE time_doctor.time_logs.user_id = 1195
    AND (
      time_doctor.time_logs.end_time IS NULL
      OR time_doctor.time_logs.end_time < EXCLUDED.end_time
    )
  RETURNING id, start_time, end_time, idle_seconds
)
INSERT INTO time_doctor.time_log_events
  (user_id, time_log_id, workspace_id, action, source, device_id, agent_version,
   old_start_time, old_end_time, old_status, old_idle_seconds,
   new_start_time, new_end_time, new_status, new_idle_seconds,
   duration_delta_seconds, shortened, meta)
SELECT
  1195,
  u.id,
  511,
  'admin_corrected_restore_overlap_or_missing',
  'manual-correction-2026-09-28',
  'e08b00ec-877c-4d47-94ff-3df23bbfd377',
  '1.0.244',
  u.start_time,
  NULL,
  NULL,
  NULL,
  u.start_time,
  u.end_time,
  'completed',
  u.idle_seconds,
  EXTRACT(EPOCH FROM (u.end_time - u.start_time))::int,
  FALSE,
  jsonb_build_object(
    'reason', 'Sep 24 evening: restore overlap-zero / missing offline close',
    'evidence', 'local time-ledger + 2026-09-24.jsonl pending close',
    'corrected_by', 'engineering'
  )
FROM upserted u;

-- AFTER
SELECT
  'AFTER' AS phase,
  t.id,
  t.start_time AT TIME ZONE 'Asia/Karachi' AS start_pk,
  t.end_time   AT TIME ZONE 'Asia/Karachi' AS end_pk,
  ROUND(EXTRACT(EPOCH FROM (t.end_time - t.start_time)))::int AS wall_s
FROM time_doctor.time_logs t
WHERE t.user_id = 1195
  AND t.id IN (
    'd45aa082-c255-48f8-aa8b-11db70d70e18',
    '7b9178df-3245-44c1-87d7-3a2f2bb57eac',
    '773566bb-a82e-403e-9a09-8c104f05464e',
    'f9e0c5b9-b187-4e27-aea0-8c96e4cbad50'
  )
ORDER BY t.start_time;

COMMIT;
