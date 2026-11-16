-- Workspace 511 — 7-day sweep, Fri Oct 9 → Thu Oct 15 2026 (work days in the
-- workspace timezone). READ ONLY: four SELECTs, nothing is written.
--
-- Cross-checked against the desktop S3 logs for the same week:
--   Q1  Pulse's daily total per employee (same rules as pulse.service
--       dailyHoursFromLogs) — compare with what each tray showed.
--   Q2  Gaps inside a session with no proof of life at all (no heartbeat,
--       screenshot, app or URL event) — billed sleep candidates.
--   Q3  Proof of life outside every session — real work that was not billed.
--   Q4  Sessions still open right now (orphans).
--   Q5  Rows the tray counts but Pulse cannot see (time_logs / adjustments
--       whose workspace_id is not 511). Empty = no tray/Pulse split.
--
-- Run all five (DBeaver: Execute script, Alt+X). Export each result tab as
-- CSV to /tmp/sweep-511/db/q1.csv … q5.csv, or paste them back.
-- Timestamps are printed in UTC to line up with the desktop S3 logs.

SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY;
SET TIME ZONE 'UTC';


-- ═══════════════════════════════════════════════════════════════════════════
-- Q1 — Pulse daily total per employee
-- ═══════════════════════════════════════════════════════════════════════════

WITH params AS (
  SELECT 511 AS ws,
         DATE '2026-10-09' AS d0,
         DATE '2026-10-15' AS d1,
         COALESCE(
           (SELECT NULLIF(settings->>'timezone', '')
              FROM time_doctor.workspace_settings WHERE workspace_id = 511),
           'America/Los_Angeles'
         ) AS tz
),
people AS (
  SELECT u.id AS user_id,
         u.email,
         trim(both ' ' from coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')) AS name
    FROM time_doctor.user_extensions ue
    JOIN tenant."user" u ON u.id = ue.user_id
    CROSS JOIN params p
   WHERE ue.workspace_id = p.ws
     AND COALESCE(u.email, '') NOT ILIKE '%@example.com%'
),
days AS (
  SELECT gs::date AS work_date,
         (gs::date::timestamp AT TIME ZONE p.tz) AS day_start,
         ((gs::date + 1)::timestamp AT TIME ZONE p.tz) AS day_end
    FROM params p, generate_series(p.d0, p.d1, INTERVAL '1 day') gs
),
logs AS (
  SELECT t.id, t.user_id, t.start_time, t.end_time, t.deducted_seconds,
         COALESCE(t.end_time, t.last_alive_at, NOW()) AS end_eff
    FROM time_doctor.time_logs t
    JOIN people pe ON pe.user_id = t.user_id
    CROSS JOIN params p
   WHERE t.workspace_id = p.ws
     AND t.start_time < ((p.d1 + 1)::timestamp AT TIME ZONE p.tz)
     AND t.start_time >= ((p.d0 - 3)::timestamp AT TIME ZONE p.tz)
     AND COALESCE(t.end_time, t.last_alive_at, NOW()) > (p.d0::timestamp AT TIME ZONE p.tz)
),
clipped AS (
  SELECT l.user_id, d.work_date,
         GREATEST(l.start_time, d.day_start) AS s,
         LEAST(l.end_eff, d.day_end) AS e,
         (l.end_time IS NULL) AS is_open
    FROM logs l
    JOIN days d ON l.start_time < d.day_end AND l.end_eff > d.day_start
),
ordered AS (
  SELECT c.*,
         MAX(e) OVER (PARTITION BY user_id, work_date ORDER BY s, e
                      ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS prev_e
    FROM clipped c
   WHERE e > s
),
islands AS (
  SELECT o.*,
         SUM(CASE WHEN prev_e IS NULL OR s > prev_e THEN 1 ELSE 0 END)
           OVER (PARTITION BY user_id, work_date ORDER BY s, e ROWS UNBOUNDED PRECEDING) AS grp
    FROM ordered o
),
merged AS (
  SELECT user_id, work_date, SUM(EXTRACT(EPOCH FROM (e - s))) AS union_s
    FROM (SELECT user_id, work_date, grp, MIN(s) AS s, MAX(e) AS e
            FROM islands GROUP BY user_id, work_date, grp) x
   GROUP BY user_id, work_date
),
pieces AS (
  SELECT user_id, work_date,
         SUM(EXTRACT(EPOCH FROM (e - s))) AS sum_s,
         COUNT(*) AS sessions,
         COUNT(*) FILTER (WHERE is_open) AS open_sessions
    FROM clipped WHERE e > s
   GROUP BY user_id, work_date
),
deducted AS (
  SELECT l.user_id, (l.start_time AT TIME ZONE p.tz)::date AS work_date,
         SUM(l.deducted_seconds) AS deducted_s
    FROM logs l CROSS JOIN params p
   WHERE l.deducted_seconds > 0
   GROUP BY 1, 2
),
adj AS (
  SELECT a.user_id, a.work_date,
         COALESCE(SUM(a.delta_seconds) FILTER (WHERE a.source_type IN ('leave', 'leave_void')), 0) AS leave_s,
         COALESCE(SUM(a.delta_seconds) FILTER (WHERE a.source_type IS NULL
                                                  OR a.source_type NOT IN ('leave', 'leave_void')), 0) AS other_s
    FROM time_doctor.time_adjustments a
    JOIN people pe ON pe.user_id = a.user_id
    CROSS JOIN params p
   WHERE a.workspace_id = p.ws
     AND a.work_date BETWEEN p.d0 AND p.d1
   GROUP BY 1, 2
),
totals AS (
  SELECT pe.user_id, pe.name, pe.email, d.work_date,
         ROUND(COALESCE(m.union_s, 0))::bigint AS union_seconds,
         COALESCE(dd.deducted_s, 0)::bigint AS deducted_seconds,
         GREATEST(0, ROUND(COALESCE(m.union_s, 0)) - COALESCE(dd.deducted_s, 0))::bigint AS tracked_seconds,
         COALESCE(a.leave_s, 0)::bigint AS leave_seconds,
         COALESCE(a.other_s, 0)::bigint AS other_seconds,
         ROUND(COALESCE(pc.sum_s, 0) - COALESCE(m.union_s, 0))::bigint AS overlap_seconds,
         COALESCE(pc.sessions, 0) AS sessions,
         COALESCE(pc.open_sessions, 0) AS open_sessions
    FROM people pe
    CROSS JOIN days d
    LEFT JOIN merged m ON m.user_id = pe.user_id AND m.work_date = d.work_date
    LEFT JOIN pieces pc ON pc.user_id = pe.user_id AND pc.work_date = d.work_date
    LEFT JOIN deducted dd ON dd.user_id = pe.user_id AND dd.work_date = d.work_date
    LEFT JOIN adj a ON a.user_id = pe.user_id AND a.work_date = d.work_date
)
SELECT user_id, name, email, work_date,
       tracked_seconds,
       GREATEST(0, tracked_seconds + other_seconds + GREATEST(0, leave_seconds - tracked_seconds)) AS total_seconds,
       ROUND((GREATEST(0, tracked_seconds + other_seconds
              + GREATEST(0, leave_seconds - tracked_seconds)) / 3600.0)::numeric, 1) AS pulse_hours_shown,
       union_seconds, deducted_seconds, leave_seconds, other_seconds,
       overlap_seconds, sessions, open_sessions
  FROM totals
 WHERE sessions > 0 OR deducted_seconds > 0 OR leave_seconds <> 0 OR other_seconds <> 0
 ORDER BY name, work_date;


-- ═══════════════════════════════════════════════════════════════════════════
-- Q2 — Gaps inside a session with no proof of life (billed sleep candidates)
--   tail = end_time was written long after the last sign of life (Stop at wake)
--   mid  = the session ran straight through the gap
--   whole = not a single sign of life anywhere in the session
--   Heartbeats come every ~60s while online; screenshots every ≤10 min even
--   offline. Offline stretches are told apart using the S3 logs.
-- ═══════════════════════════════════════════════════════════════════════════

WITH params AS (
  SELECT 511 AS ws,
         DATE '2026-10-09' AS d0,
         DATE '2026-10-15' AS d1,
         COALESCE(
           (SELECT NULLIF(settings->>'timezone', '')
              FROM time_doctor.workspace_settings WHERE workspace_id = 511),
           'America/Los_Angeles'
         ) AS tz
),
people AS (
  SELECT u.id AS user_id,
         trim(both ' ' from coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')) AS name
    FROM time_doctor.user_extensions ue
    JOIN tenant."user" u ON u.id = ue.user_id
    CROSS JOIN params p
   WHERE ue.workspace_id = p.ws
     AND COALESCE(u.email, '') NOT ILIKE '%@example.com%'
),
sessions AS (
  SELECT t.id, t.user_id, t.device_id, t.agent_version, t.status, t.start_time, t.end_time
    FROM time_doctor.time_logs t
    JOIN people pe ON pe.user_id = t.user_id
    CROSS JOIN params p
   WHERE t.end_time IS NOT NULL
     AND t.start_time >= (p.d0::timestamp AT TIME ZONE p.tz)
     AND t.start_time < ((p.d1 + 1)::timestamp AT TIME ZONE p.tz)
     AND t.end_time - t.start_time > INTERVAL '12 minutes'
),
proofs AS (
  SELECT s.id, s.start_time AS at, 'start' AS kind FROM sessions s
  UNION ALL
  SELECT s.id, s.end_time, 'end' FROM sessions s
  UNION ALL
  SELECT h.time_log_id, h.seen_at, 'hb'
    FROM time_doctor.session_heartbeats h JOIN sessions s ON s.id = h.time_log_id
  UNION ALL
  SELECT sc.time_log_id, sc.captured_at, 'shot'
    FROM time_doctor.screenshots sc JOIN sessions s ON s.id = sc.time_log_id
  UNION ALL
  SELECT a.time_log_id, COALESCE(a.started_at, a.timestamp), 'app'
    FROM time_doctor.app_logs a JOIN sessions s ON s.id = a.time_log_id
  UNION ALL
  SELECT ul.time_log_id, ul.started_at, 'url'
    FROM time_doctor.url_logs ul JOIN sessions s ON s.id = ul.time_log_id
),
inside AS (
  SELECT pr.id, pr.at, pr.kind
    FROM proofs pr JOIN sessions s ON s.id = pr.id
   WHERE pr.at BETWEEN s.start_time AND s.end_time
),
seq AS (
  SELECT id, at, kind,
         LAG(at) OVER (PARTITION BY id ORDER BY at, kind) AS prev_at,
         LAG(kind) OVER (PARTITION BY id ORDER BY at, kind) AS prev_kind
    FROM inside
),
counts AS (
  SELECT id,
         COUNT(*) FILTER (WHERE kind = 'hb') AS heartbeats,
         COUNT(*) FILTER (WHERE kind = 'shot') AS screenshots
    FROM inside GROUP BY id
)
SELECT pe.name, s.user_id, s.id AS time_log_id, s.device_id, s.agent_version, s.status,
       s.start_time, s.end_time,
       q.prev_at AS gap_from, q.at AS gap_to,
       ROUND((EXTRACT(EPOCH FROM (q.at - q.prev_at)) / 60.0)::numeric, 1) AS gap_minutes,
       CASE WHEN q.kind = 'end' AND q.prev_kind = 'start' THEN 'whole'
            WHEN q.kind = 'end' THEN 'tail'
            WHEN q.prev_kind = 'start' THEN 'head'
            ELSE 'mid' END AS where_in_session,
       c.heartbeats, c.screenshots
  FROM seq q
  JOIN sessions s ON s.id = q.id
  JOIN people pe ON pe.user_id = s.user_id
  JOIN counts c ON c.id = q.id
 WHERE q.prev_at IS NOT NULL
   AND q.at - q.prev_at > INTERVAL '12 minutes'
 ORDER BY gap_minutes DESC
 LIMIT 1000;


-- ═══════════════════════════════════════════════════════════════════════════
-- Q3 — Proof of life outside every session (work that was not billed)
--   minutes_after_end ≤ ~11 right after a session is usually the authorized
--   10-minute idle cut (by design). Anything else is missed time.
-- ═══════════════════════════════════════════════════════════════════════════

WITH params AS (
  SELECT 511 AS ws,
         DATE '2026-10-09' AS d0,
         DATE '2026-10-15' AS d1,
         COALESCE(
           (SELECT NULLIF(settings->>'timezone', '')
              FROM time_doctor.workspace_settings WHERE workspace_id = 511),
           'America/Los_Angeles'
         ) AS tz
),
people AS (
  SELECT u.id AS user_id,
         trim(both ' ' from coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')) AS name
    FROM time_doctor.user_extensions ue
    JOIN tenant."user" u ON u.id = ue.user_id
    CROSS JOIN params p
   WHERE ue.workspace_id = p.ws
     AND COALESCE(u.email, '') NOT ILIKE '%@example.com%'
),
win AS (
  SELECT (p.d0::timestamp AT TIME ZONE p.tz) AS w0,
         ((p.d1 + 1)::timestamp AT TIME ZONE p.tz) AS w1
    FROM params p
),
proof AS (
  SELECT h.user_id, h.time_log_id, h.seen_at AS at, 'hb' AS kind
    FROM time_doctor.session_heartbeats h
    JOIN people pe ON pe.user_id = h.user_id
    CROSS JOIN win w
   WHERE h.seen_at >= w.w0 AND h.seen_at < w.w1
  UNION ALL
  SELECT sc.user_id, sc.time_log_id, sc.captured_at, 'shot'
    FROM time_doctor.screenshots sc
    JOIN people pe ON pe.user_id = sc.user_id
    CROSS JOIN win w
   WHERE sc.captured_at >= w.w0 AND sc.captured_at < w.w1
),
uncovered AS (
  SELECT pr.*
    FROM proof pr
   WHERE NOT EXISTS (
     SELECT 1 FROM time_doctor.time_logs t
      WHERE t.user_id = pr.user_id
        AND t.start_time - INTERVAL '2 minutes' <= pr.at
        AND COALESCE(t.end_time, t.last_alive_at, NOW()) + INTERVAL '2 minutes' >= pr.at
   )
)
SELECT pe.name, u.user_id, u.time_log_id,
       t.start_time, t.end_time, t.status, t.device_id, t.agent_version,
       MIN(u.at) AS first_unbilled, MAX(u.at) AS last_unbilled,
       ROUND((EXTRACT(EPOCH FROM (MAX(u.at) - MIN(u.at))) / 60.0)::numeric, 1) AS span_minutes,
       ROUND((EXTRACT(EPOCH FROM (MAX(u.at) - t.end_time)) / 60.0)::numeric, 1) AS minutes_after_end,
       COUNT(*) FILTER (WHERE u.kind = 'hb') AS heartbeats,
       COUNT(*) FILTER (WHERE u.kind = 'shot') AS screenshots
  FROM uncovered u
  JOIN people pe ON pe.user_id = u.user_id
  LEFT JOIN time_doctor.time_logs t ON t.id = u.time_log_id
 GROUP BY pe.name, u.user_id, u.time_log_id, t.start_time, t.end_time, t.status, t.device_id, t.agent_version
 ORDER BY span_minutes DESC NULLS LAST
 LIMIT 1000;


-- ═══════════════════════════════════════════════════════════════════════════
-- Q4 — Sessions open right now (orphans count to last_alive_at in Pulse)
-- ═══════════════════════════════════════════════════════════════════════════

WITH people AS (
  SELECT u.id AS user_id,
         trim(both ' ' from coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')) AS name
    FROM time_doctor.user_extensions ue
    JOIN tenant."user" u ON u.id = ue.user_id
   WHERE ue.workspace_id = 511
     AND COALESCE(u.email, '') NOT ILIKE '%@example.com%'
)
SELECT pe.name, t.user_id, t.id AS time_log_id, t.device_id, t.agent_version, t.status,
       t.start_time, t.last_alive_at,
       ROUND((EXTRACT(EPOCH FROM (NOW() - COALESCE(t.last_alive_at, t.start_time))) / 60.0)::numeric, 1)
         AS minutes_since_alive,
       (SELECT MAX(h.seen_at) FROM time_doctor.session_heartbeats h WHERE h.time_log_id = t.id) AS last_heartbeat
  FROM time_doctor.time_logs t
  JOIN people pe ON pe.user_id = t.user_id
 WHERE t.end_time IS NULL
 ORDER BY minutes_since_alive DESC;


-- ═══════════════════════════════════════════════════════════════════════════
-- Q5 — Counted by the tray, invisible to Pulse
--   The tray reads every time_logs / time_adjustments row for the user;
--   Pulse only reads rows with workspace_id = 511.
-- ═══════════════════════════════════════════════════════════════════════════

WITH params AS (
  SELECT 511 AS ws,
         DATE '2026-10-09' AS d0,
         DATE '2026-10-15' AS d1,
         COALESCE(
           (SELECT NULLIF(settings->>'timezone', '')
              FROM time_doctor.workspace_settings WHERE workspace_id = 511),
           'America/Los_Angeles'
         ) AS tz
),
people AS (
  SELECT u.id AS user_id,
         trim(both ' ' from coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')) AS name
    FROM time_doctor.user_extensions ue
    JOIN tenant."user" u ON u.id = ue.user_id
    CROSS JOIN params p
   WHERE ue.workspace_id = p.ws
     AND COALESCE(u.email, '') NOT ILIKE '%@example.com%'
)
SELECT pe.name, t.user_id, 'time_log' AS kind, t.id::text AS row_id,
       t.workspace_id, t.device_id, t.agent_version, t.status,
       (t.start_time AT TIME ZONE p.tz)::date AS work_date,
       t.start_time, t.end_time,
       ROUND(EXTRACT(EPOCH FROM (COALESCE(t.end_time, t.last_alive_at, NOW()) - t.start_time)))::bigint AS seconds
  FROM time_doctor.time_logs t
  JOIN people pe ON pe.user_id = t.user_id
  CROSS JOIN params p
 WHERE t.workspace_id IS DISTINCT FROM p.ws
   AND t.start_time >= (p.d0::timestamp AT TIME ZONE p.tz)
   AND t.start_time < ((p.d1 + 1)::timestamp AT TIME ZONE p.tz)
UNION ALL
SELECT pe.name, a.user_id, 'adjustment:' || COALESCE(a.source_type, 'other'), a.id::text,
       a.workspace_id, NULL, NULL, NULL,
       a.work_date, NULL, NULL,
       a.delta_seconds::bigint
  FROM time_doctor.time_adjustments a
  JOIN people pe ON pe.user_id = a.user_id
  CROSS JOIN params p
 WHERE a.workspace_id IS DISTINCT FROM p.ws
   AND a.work_date BETWEEN p.d0 AND p.d1
 ORDER BY name, work_date, start_time NULLS LAST;


RESET TIME ZONE;
SET SESSION CHARACTERISTICS AS TRANSACTION READ WRITE;
