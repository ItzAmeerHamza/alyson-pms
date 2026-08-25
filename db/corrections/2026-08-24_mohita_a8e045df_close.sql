-- Mohita (mohita@cintara.ai, user_id 1196) — close orphan a8e045df.
--
-- Agent started tracking Fri 21 Aug 03:05:21 PKT (Thu 20 17:05 CDT), sent
-- 8 heartbeats + 1 screenshot + 1 app log, then died. end_time stayed NULL.
-- last_alive_at froze 72 seconds later (03:06:33 PKT). No S3 logs after
-- 20:36 UTC, and no objects for Aug 21–23.
--
-- Pulse dailyHoursFromLogs treated NULL end_time as Date.now(), so the
-- Chicago week filled Thu remainder + Fri 24h + Sat 24h + Sun 24h.
-- Friday also has a legitimate +7h annual-leave credit (keep it).
--
-- Close at last proof-of-life (same formula as force-sync kill-all),
-- not NOW. Wall: ~84h sprawl → 1.2 min of real tracked time.
--
-- Run inside the transaction. Review BEFORE/AFTER, then COMMIT.

BEGIN;

-- ── BEFORE ────────────────────────────────────────────────────────────────
SELECT
  'BEFORE' AS phase,
  u.email,
  t.id,
  t.status,
  t.start_time,
  t.end_time,
  t.last_alive_at,
  ROUND(EXTRACT(EPOCH FROM (NOW() - t.start_time)) / 3600.0, 1) AS hours_if_left_open
FROM time_doctor.time_logs t
JOIN tenant."user" u ON u.id = t.user_id
WHERE t.id = 'a8e045df-a19d-444b-a81e-d0fdf785ff8e';

INSERT INTO time_doctor.time_log_events
  (user_id, time_log_id, workspace_id, action, source, device_id, agent_version,
   old_start_time, old_end_time, old_status, old_idle_seconds,
   new_start_time, new_end_time, new_status, new_idle_seconds,
   duration_delta_seconds, shortened, meta)
SELECT
  t.user_id,
  t.id,
  t.workspace_id,
  'admin_closed_orphan_at_last_alive',
  'manual-correction-2026-08-24',
  t.device_id,
  '1.0.233',
  t.start_time,
  t.end_time,
  t.status,
  t.idle_seconds,
  t.start_time,
  t.last_alive_at,
  'completed',
  t.idle_seconds,
  EXTRACT(EPOCH FROM (t.last_alive_at - t.start_time))::int,
  TRUE,
  jsonb_build_object(
    'reason', 'Agent died after start; session never closed',
    'evidence', '8 heartbeats + 1 screenshot + 1 app log in 72s; no S3 logs Aug 21-23',
    'close_at', 'last_proof_of_life',
    'last_alive_at', t.last_alive_at,
    'corrected_by', 'engineering'
  )
FROM time_doctor.time_logs t
WHERE t.id = 'a8e045df-a19d-444b-a81e-d0fdf785ff8e'
  AND t.user_id = 1196
  AND t.end_time IS NULL
  AND t.last_alive_at IS NOT NULL
  AND t.last_alive_at > t.start_time
  AND t.last_alive_at < NOW();

UPDATE time_doctor.time_logs t
SET end_time = LEAST(
      NOW(),
      GREATEST(
        t.start_time,
        COALESCE(t.last_alive_at, t.start_time),
        COALESCE((SELECT MAX(h.seen_at) FROM time_doctor.session_heartbeats h
                   WHERE h.time_log_id = t.id), t.start_time),
        COALESCE((SELECT MAX(s.captured_at) FROM time_doctor.screenshots s
                   WHERE s.time_log_id = t.id), t.start_time),
        COALESCE((SELECT MAX(COALESCE(a.ended_at, a.started_at, a.timestamp))
                   FROM time_doctor.app_logs a WHERE a.time_log_id = t.id), t.start_time),
        COALESCE((SELECT MAX(COALESCE(u.ended_at, u.started_at))
                   FROM time_doctor.url_logs u WHERE u.time_log_id = t.id), t.start_time)
      )
    ),
    status = 'completed',
    updated_at = NOW()
WHERE t.id = 'a8e045df-a19d-444b-a81e-d0fdf785ff8e'
  AND t.user_id = 1196
  AND t.end_time IS NULL
  AND t.last_alive_at IS NOT NULL
  AND t.last_alive_at > t.start_time
  AND t.last_alive_at < NOW();

-- ── AFTER ─────────────────────────────────────────────────────────────────
SELECT
  'AFTER' AS phase,
  u.email,
  t.id,
  t.status,
  t.start_time,
  t.end_time,
  t.last_alive_at,
  ROUND(EXTRACT(EPOCH FROM (t.end_time - t.start_time)), 1) AS wall_secs,
  (SELECT COUNT(*) FROM time_doctor.time_logs x
    WHERE x.user_id = 1196 AND x.end_time IS NULL) AS still_open
FROM time_doctor.time_logs t
JOIN tenant."user" u ON u.id = t.user_id
WHERE t.id = 'a8e045df-a19d-444b-a81e-d0fdf785ff8e';

COMMIT;
