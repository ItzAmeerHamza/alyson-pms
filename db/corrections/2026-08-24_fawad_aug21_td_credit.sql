-- Fawad (fawad@cintara.ai, user_id 1243) — Friday 21 Aug 2026 Chicago.
--
-- Alyson tracked 4.81h (three completed sessions). Last session bd451fa6
-- closed on a Stop click at 09:06:50 CDT. Agent stayed running with
-- isTracking=false. Time Doctor kept Lahore Team Time Tracking through
-- 11:00:07 CDT (2.52h span 08:28–11:00 vs Alyson 0.62h).
--
-- Credit the evidenced TD-only tail after the Alyson Stop:
--   2026-08-21 09:06:50 → 11:00:07 America/Chicago = 6797s (1h 53m).
-- Pulse day total becomes ~6.7h (TD Friday = 6.75h).
--
-- Append-only time_adjustments row. Idempotent on source_id.
-- Review BEFORE/AFTER, then COMMIT.

BEGIN;

-- ── BEFORE ────────────────────────────────────────────────────────────────
SELECT
  'BEFORE' AS phase,
  u.email,
  a.work_date,
  a.delta_seconds,
  ROUND(a.delta_seconds / 3600.0, 2) AS delta_hours,
  a.reason,
  a.source_type,
  a.source_id
FROM time_doctor.time_adjustments a
JOIN tenant."user" u ON u.id = a.user_id
WHERE a.user_id = 1243
  AND a.work_date = DATE '2026-08-21';

WITH tracked AS (
  SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (
           COALESCE(end_time, last_alive_at) - start_time
         ))), 0) AS tracked_seconds
    FROM time_doctor.time_logs
   WHERE user_id = 1243
     AND start_time >= TIMESTAMPTZ '2026-08-21 00:00:00 America/Chicago'
     AND start_time <  TIMESTAMPTZ '2026-08-22 00:00:00 America/Chicago'
),
adj AS (
  SELECT COALESCE(SUM(delta_seconds), 0) AS adj_seconds
    FROM time_doctor.time_adjustments
   WHERE user_id = 1243
     AND work_date = DATE '2026-08-21'
)
SELECT
  'BEFORE totals' AS phase,
  ROUND((tracked.tracked_seconds / 3600.0)::numeric, 2) AS tracked_h,
  ROUND((adj.adj_seconds / 3600.0)::numeric, 2) AS adj_h,
  ROUND(((tracked.tracked_seconds + adj.adj_seconds) / 3600.0)::numeric, 2) AS day_h
FROM tracked, adj;

-- ── INSERT (skip if this correction already landed) ───────────────────────
INSERT INTO time_doctor.time_adjustments
  (id, workspace_id, user_id, work_date, delta_seconds, reason,
   created_by, source_type, source_id)
SELECT
  '20260821-1243-4c21-a821-bd451fa60021'::uuid,
  511,
  1243,
  DATE '2026-08-21',
  6797,
  'Credit Time Doctor 09:06–11:00 CDT after Alyson Stop on 2026-08-21 (bd451fa6). S3: Stop click 09:06:50, isTracking=false until 10:26; TD ran to 11:00:07.',
  COALESCE(
    (SELECT created_by
       FROM time_doctor.time_adjustments
      WHERE workspace_id = 511
      ORDER BY created_at DESC
      LIMIT 1),
    (SELECT u.id
       FROM tenant."user" u
       JOIN time_doctor.user_extensions ext ON ext.user_id = u.id
      WHERE ext.workspace_id = 511
        AND ext.pulse_role = 'admin'
      ORDER BY u.id
      LIMIT 1)
  ),
  'manual-correction',
  '20260821-1243-4c21-a821-bd451fa60021'::uuid
WHERE NOT EXISTS (
  SELECT 1
    FROM time_doctor.time_adjustments
   WHERE id = '20260821-1243-4c21-a821-bd451fa60021'::uuid
      OR source_id = '20260821-1243-4c21-a821-bd451fa60021'::uuid
);

INSERT INTO time_doctor.time_log_events
  (user_id, workspace_id, action, source, duration_delta_seconds, meta)
SELECT
  1243,
  511,
  'admin_time_adjustment',
  'manual-correction-2026-08-24',
  6797,
  jsonb_build_object(
    'work_date', '2026-08-21',
    'reason', 'TD 09:06–11:00 CDT after Alyson Stop bd451fa6',
    'adjustment_id', '20260821-1243-4c21-a821-bd451fa60021'
  )
WHERE EXISTS (
  SELECT 1 FROM time_doctor.time_adjustments
   WHERE id = '20260821-1243-4c21-a821-bd451fa60021'::uuid
)
AND NOT EXISTS (
  SELECT 1 FROM time_doctor.time_log_events
   WHERE action = 'admin_time_adjustment'
     AND source = 'manual-correction-2026-08-24'
     AND user_id = 1243
     AND meta ->> 'adjustment_id' = '20260821-1243-4c21-a821-bd451fa60021'
);

-- ── AFTER ─────────────────────────────────────────────────────────────────
SELECT
  'AFTER' AS phase,
  u.email,
  a.id,
  a.work_date,
  a.delta_seconds,
  ROUND(a.delta_seconds / 3600.0, 2) AS delta_hours,
  a.reason
FROM time_doctor.time_adjustments a
JOIN tenant."user" u ON u.id = a.user_id
WHERE a.user_id = 1243
  AND a.work_date = DATE '2026-08-21';

WITH tracked AS (
  SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (
           COALESCE(end_time, last_alive_at) - start_time
         ))), 0) AS tracked_seconds
    FROM time_doctor.time_logs
   WHERE user_id = 1243
     AND start_time >= TIMESTAMPTZ '2026-08-21 00:00:00 America/Chicago'
     AND start_time <  TIMESTAMPTZ '2026-08-22 00:00:00 America/Chicago'
),
adj AS (
  SELECT COALESCE(SUM(delta_seconds), 0) AS adj_seconds
    FROM time_doctor.time_adjustments
   WHERE user_id = 1243
     AND work_date = DATE '2026-08-21'
)
SELECT
  'AFTER totals' AS phase,
  ROUND((tracked.tracked_seconds / 3600.0)::numeric, 2) AS tracked_h,
  ROUND((adj.adj_seconds / 3600.0)::numeric, 2) AS adj_h,
  ROUND(((tracked.tracked_seconds + adj.adj_seconds) / 3600.0)::numeric, 2) AS day_h
FROM tracked, adj;

COMMIT;
