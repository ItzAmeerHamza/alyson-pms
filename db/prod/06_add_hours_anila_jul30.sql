-- Add 8h tracked time for anila@cintara.ai on:
--   Thu 2026-07-30, Fri 2026-07-31, Mon 2026-08-03 (Pacific)
-- Each day: 09:00–17:00 America/Los_Angeles → 8 hours, status completed.
-- Safe to re-run: skips rows already inserted with this device_id.

WITH emp AS (
  SELECT
    u.id AS user_id,
    ext.workspace_id
  FROM tenant."user" u
  LEFT JOIN time_doctor.user_extensions ext ON ext.user_id = u.id
  WHERE lower(u.email) = lower('anila@cintara.ai')
  LIMIT 1
),
days AS (
  SELECT d::date AS work_date
  FROM (VALUES
    ('2026-07-30'::date),
    ('2026-07-31'::date),
    ('2026-08-03'::date)
  ) AS v(d)
),
slots AS (
  SELECT
    e.user_id,
    e.workspace_id,
    d.work_date,
    (d.work_date + TIME '09:00') AT TIME ZONE 'America/Los_Angeles' AS start_time,
    (d.work_date + TIME '17:00') AT TIME ZONE 'America/Los_Angeles' AS end_time
  FROM emp e
  CROSS JOIN days d
  WHERE e.user_id IS NOT NULL
)
INSERT INTO time_doctor.time_logs (
  user_id,
  workspace_id,
  project_id,
  start_time,
  end_time,
  status,
  idle_seconds,
  deducted_seconds,
  device_id
)
SELECT
  s.user_id,
  s.workspace_id,
  NULL,
  s.start_time,
  s.end_time,
  'completed',
  0,
  0,
  'manual-credit-anila-2026-07-30'
FROM slots s
WHERE NOT EXISTS (
  SELECT 1
  FROM time_doctor.time_logs t
  WHERE t.user_id = s.user_id
    AND COALESCE(t.device_id, '') = 'manual-credit-anila-2026-07-30'
    AND t.start_time = s.start_time
)
RETURNING
  id,
  user_id,
  start_time AT TIME ZONE 'America/Los_Angeles' AS start_pacific,
  end_time AT TIME ZONE 'America/Los_Angeles' AS end_pacific,
  EXTRACT(EPOCH FROM (end_time - start_time)) / 3600.0 AS hours;

-- Verify totals
SELECT
  (t.start_time AT TIME ZONE 'America/Los_Angeles')::date AS work_date,
  ROUND(SUM(EXTRACT(EPOCH FROM (t.end_time - t.start_time)) / 3600.0)::numeric, 1) AS hours
FROM time_doctor.time_logs t
JOIN tenant."user" u ON u.id = t.user_id
WHERE lower(u.email) = lower('anila@cintara.ai')
  AND (t.start_time AT TIME ZONE 'America/Los_Angeles')::date IN (
    '2026-07-30', '2026-07-31', '2026-08-03'
  )
GROUP BY 1
ORDER BY 1;
