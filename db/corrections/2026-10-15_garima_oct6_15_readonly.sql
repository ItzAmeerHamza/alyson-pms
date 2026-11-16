-- Garima Singh (user 1224) — read-only check of Oct 6–15 rows against her S3 logs.
-- Times are UTC so they line up with the desktop logs.
--   G1  every row for Chicago work days Oct 6–15, with how it was last closed
--   G2  full event trail for the rows the logs flagged

SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY;
SET TIME ZONE 'UTC';

-- ═══════════════════════════════════════════════════════════════════════════
-- G1 — rows, billed minutes, and the last event that moved end_time
-- ═══════════════════════════════════════════════════════════════════════════
SELECT (t.start_time AT TIME ZONE 'America/Chicago')::date AS work_date,
       left(t.id::text, 8) AS id8,
       t.id,
       t.start_time,
       t.end_time,
       t.status,
       left(t.device_id, 8) AS device8,
       t.agent_version,
       t.last_alive_at,
       t.deducted_seconds,
       ROUND((EXTRACT(EPOCH FROM (COALESCE(t.end_time, t.last_alive_at) - t.start_time)) / 60.0)::numeric, 1)
         AS billed_min,
       ev.action AS last_end_action,
       ev.source AS last_end_source,
       ev.created_at AS last_end_at,
       ev.old_end_time AS last_end_from,
       ev.new_end_time AS last_end_to
  FROM time_doctor.time_logs t
  LEFT JOIN LATERAL (
        SELECT e.action, e.source, e.created_at, e.old_end_time, e.new_end_time
          FROM time_doctor.time_log_events e
         WHERE e.time_log_id = t.id
           AND e.new_end_time IS DISTINCT FROM e.old_end_time
         ORDER BY e.created_at DESC
         LIMIT 1
       ) ev ON TRUE
 WHERE t.user_id = 1224
   AND t.start_time >= TIMESTAMPTZ '2026-10-06 05:00:00+00'
   AND t.start_time <  TIMESTAMPTZ '2026-10-16 05:00:00+00'
 ORDER BY t.start_time;

-- ═══════════════════════════════════════════════════════════════════════════
-- G2 — event trail for the flagged rows
--   235b304a, af0d3945  resumed after a failed Stop (v1.0.244)
--   61fdf0ab, c6e4cfe3, 798fdb18  idle cut possibly lost (v1.0.244)
--   3a416f43, 9b11ce4a, 3a528b00, 94fede26  idle cut lost (Oct 13)
--   2e8559a4, c5a558b1, 036ac783  idle cut kept (Oct 13, for comparison)
--   4aef72c1, 65e6fc8e, 5b229762  server below the logs / closed by update restart
--   7c837244, 106c094b  sessions whose last log lines never reached S3
-- ═══════════════════════════════════════════════════════════════════════════
SELECT left(e.time_log_id::text, 8) AS id8,
       e.created_at,
       e.action,
       e.source,
       e.agent_version,
       e.old_status,
       e.new_status,
       e.old_end_time,
       e.new_end_time,
       e.duration_delta_seconds,
       e.shortened
  FROM time_doctor.time_log_events e
 WHERE e.user_id = 1224
   AND e.created_at >= TIMESTAMPTZ '2026-10-06 00:00:00+00'
   AND left(e.time_log_id::text, 8) IN (
         '235b304a', 'af0d3945',
         '61fdf0ab', 'c6e4cfe3', '798fdb18',
         '3a416f43', '9b11ce4a', '3a528b00', '94fede26',
         '2e8559a4', 'c5a558b1', '036ac783',
         '4aef72c1', '65e6fc8e', '5b229762',
         '7c837244', '106c094b')
 ORDER BY e.time_log_id, e.created_at
 LIMIT 500;

RESET TIME ZONE;
SET SESSION CHARACTERISTICS AS TRANSACTION READ WRITE;
