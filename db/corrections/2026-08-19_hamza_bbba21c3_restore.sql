-- Hamza (hamza@cintara.ai, user_id 1195) — restore session bbba21c3.
--
-- The agent tracked locally 22:35:48 → 23:46:44 PKT (stop_click).
-- DNS to the Pulse API died at 22:50, so last_alive froze and recovery
-- later closed the row at last_alive (22:50:11) instead of the stop click.
-- Evidence (S3 dt=2026-08-18 user_id=1195 device e08b00ec, agent 1.0.233):
--   * currentTimeLogId stayed bbba21c3 through 23:45:42
--   * 47 screenshots captured after 22:50
--   * 23:46:44  "Stop tracking requested"
--   * 23:46:44  "Stored pending session close: bbba21c3-..."
--   * 23:46:46  "Stop tracking completed" synced=false
-- Next session 5508d4c7 starts 23:52:20 PKT — no overlap after this restore.
--
-- Wall: 14.4 min → 70.9 min  (+56.5 min)
-- Idle: add the two idle slices logged in the missing tail (23:18–19, 23:42–44).
--
-- Run inside the transaction. Review BEFORE/AFTER, then COMMIT.

BEGIN;

-- ── BEFORE ────────────────────────────────────────────────────────────────
SELECT
  'BEFORE' AS phase,
  id,
  start_time,
  end_time,
  last_alive_at,
  idle_seconds,
  ROUND(EXTRACT(EPOCH FROM (end_time - start_time)) / 60.0, 1) AS wall_min
FROM time_doctor.time_logs
WHERE id = 'bbba21c3-da64-4877-83a0-c7d419c91a5c';

INSERT INTO time_doctor.time_log_events
  (user_id, time_log_id, workspace_id, action, source, device_id, agent_version,
   old_start_time, old_end_time, old_status, old_idle_seconds,
   new_start_time, new_end_time, new_status, new_idle_seconds,
   duration_delta_seconds, shortened, meta)
SELECT
  t.user_id,
  t.id,
  t.workspace_id,
  'admin_corrected_restore_stop_click',
  'manual-correction-2026-08-19',
  t.device_id,
  '1.0.233',
  t.start_time,
  t.end_time,
  t.status,
  t.idle_seconds,
  t.start_time,
  TIMESTAMPTZ '2026-08-18 23:46:44.701+05',
  t.status,
  COALESCE(t.idle_seconds, 0) + 180,
  EXTRACT(EPOCH FROM (
    TIMESTAMPTZ '2026-08-18 23:46:44.701+05' - t.end_time
  ))::int,
  FALSE,
  jsonb_build_object(
    'reason', 'Offline stop: recovery closed at last_alive, not stop_click',
    'evidence', 'S3 agent logs: pending session close + 47 screenshots after 22:50 PKT',
    'local_stop_click', '2026-08-18T23:46:44.701+05',
    'old_end_was_last_alive', TRUE,
    'corrected_by', 'engineering'
  )
FROM time_doctor.time_logs t
WHERE t.id = 'bbba21c3-da64-4877-83a0-c7d419c91a5c'
  AND t.end_time < TIMESTAMPTZ '2026-08-18 23:46:44.701+05'
  AND t.end_time < TIMESTAMPTZ '2026-08-18 23:52:20+05';

UPDATE time_doctor.time_logs
SET end_time = TIMESTAMPTZ '2026-08-18 23:46:44.701+05',
    last_alive_at = TIMESTAMPTZ '2026-08-18 23:46:44.701+05',
    idle_seconds = COALESCE(idle_seconds, 0) + 180,
    updated_at = NOW()
WHERE id = 'bbba21c3-da64-4877-83a0-c7d419c91a5c'
  AND end_time < TIMESTAMPTZ '2026-08-18 23:46:44.701+05'
  AND end_time < TIMESTAMPTZ '2026-08-18 23:52:20+05';

-- ── AFTER ─────────────────────────────────────────────────────────────────
SELECT
  'AFTER' AS phase,
  id,
  start_time,
  end_time,
  last_alive_at,
  idle_seconds,
  ROUND(EXTRACT(EPOCH FROM (end_time - start_time)) / 60.0, 1) AS wall_min
FROM time_doctor.time_logs
WHERE id = 'bbba21c3-da64-4877-83a0-c7d419c91a5c';

COMMIT;
