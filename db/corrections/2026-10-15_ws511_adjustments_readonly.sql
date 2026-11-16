-- Workspace 511 — follow-up to the week sweep. READ ONLY: two SELECTs.
--
--   Q6  Every time adjustment for Oct 1 → Oct 15 with who entered it, when,
--       and the reason. Explains Mohita −24346 / −68096 / −59400 (Oct 9–11),
--       Fawad +20460 (Oct 9) and Hamza +4500 (Oct 14).
--   Q7  Every recorded change to Mohita's and Fawad's Oct 9–11 sessions —
--       shows whether the rows those adjustments were meant to offset have
--       since been shortened or deleted.
--
-- Run both (DBeaver: Execute script, Alt+X). Export or paste the two tabs.

SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY;
SET TIME ZONE 'UTC';


-- ═══════════════════════════════════════════════════════════════════════════
-- Q6 — Time adjustments with author and reason
-- ═══════════════════════════════════════════════════════════════════════════

SELECT a.work_date,
       trim(both ' ' from coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')) AS employee,
       a.user_id,
       a.delta_seconds,
       ROUND((a.delta_seconds / 3600.0)::numeric, 2) AS delta_hours,
       COALESCE(a.source_type, 'other') AS source_type,
       a.reason,
       trim(both ' ' from coalesce(cb.first_name, '') || ' ' || coalesce(cb.last_name, '')) AS entered_by,
       a.created_at,
       a.id
  FROM time_doctor.time_adjustments a
  JOIN tenant."user" u ON u.id = a.user_id
  LEFT JOIN tenant."user" cb ON cb.id = a.created_by
 WHERE a.workspace_id = 511
   AND a.work_date BETWEEN DATE '2026-10-01' AND DATE '2026-10-15'
 ORDER BY a.work_date, employee, a.created_at;


-- ═══════════════════════════════════════════════════════════════════════════
-- Q7 — Change history of Mohita (1196) and Fawad (1243) sessions, Oct 8–12
-- ═══════════════════════════════════════════════════════════════════════════

SELECT e.created_at,
       e.user_id,
       e.time_log_id,
       e.action,
       e.source,
       e.agent_version,
       e.old_start_time, e.old_end_time, e.old_status,
       e.new_start_time, e.new_end_time, e.new_status,
       e.duration_delta_seconds,
       e.shortened,
       t.id IS NULL AS row_now_missing,
       t.start_time AS current_start,
       t.end_time AS current_end
  FROM time_doctor.time_log_events e
  LEFT JOIN time_doctor.time_logs t ON t.id = e.time_log_id
 WHERE e.user_id IN (1196, 1243)
   AND (
     e.old_start_time >= TIMESTAMPTZ '2026-10-08 05:00:00+00'
     OR e.new_start_time >= TIMESTAMPTZ '2026-10-08 05:00:00+00'
     OR e.created_at >= TIMESTAMPTZ '2026-10-08 05:00:00+00'
   )
   AND COALESCE(e.new_start_time, e.old_start_time) < TIMESTAMPTZ '2026-10-12 05:00:00+00'
 ORDER BY e.user_id, COALESCE(e.new_start_time, e.old_start_time), e.created_at
 LIMIT 500;


RESET TIME ZONE;
SET SESSION CHARACTERISTICS AS TRANSACTION READ WRITE;
