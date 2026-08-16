-- Correction: sessions that overlap the next session on the same device.
--
-- A person cannot be in two sessions at once. The agent could open one while a
-- previous Stop was still in flight, because `isTracking` is set false the
-- instant Stop is pressed while the database close runs for up to 12s
-- afterwards. Every "is it safe to start?" check read that flag, so on a slow
-- link a new session was created while the old one was still open.
--
-- Reports sum session durations rather than merging intervals, so every
-- overlapping second is billed twice.
--
-- Rule: a session's end may not exceed the start of the next session on the same
-- device. The next session starting IS proof the previous one had ended.
--
-- Prevention is in the agent (startTracking now waits for the prior stop to
-- actually close) and in force-sync.controller.ts create_time_log (closes any
-- still-open session for that user+device on insert). This file only cleans up
-- rows that were already written wrong.
--
-- Run STEP 1 alone first. It changes nothing.

-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 1 — READ ONLY. How much time is affected, and for whom?
-- ═══════════════════════════════════════════════════════════════════════════
WITH ordered AS (
  SELECT t.id, t.user_id, t.start_time, t.end_time,
         LEAD(t.start_time) OVER (
           PARTITION BY t.user_id, t.device_id ORDER BY t.start_time
         ) AS next_start
  FROM time_doctor.time_logs t
  WHERE t.end_time IS NOT NULL
    AND t.device_id IS NOT NULL
)
SELECT u.email,
       COUNT(*) AS sessions_affected,
       ROUND(SUM(
         EXTRACT(EPOCH FROM (o.end_time - GREATEST(o.start_time, o.next_start)))
       ) / 3600.0, 2) AS phantom_hours,
       MIN(o.start_time) AS earliest,
       MAX(o.start_time) AS latest
FROM ordered o
JOIN tenant."user" u ON u.id = o.user_id
WHERE o.next_start IS NOT NULL
  AND o.end_time > o.next_start
GROUP BY u.email
ORDER BY phantom_hours DESC;


-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 2 — THE CORRECTION. Run only after reviewing STEP 1.
--
-- Optional: restrict to a recent window by uncommenting the start_time bound in
-- BOTH statements below, so older closed payroll periods stay untouched.
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;

-- Audit trail first, so it records the pre-change values.
INSERT INTO time_doctor.time_log_events
  (user_id, time_log_id, workspace_id, action, source, device_id, meta,
   old_start_time, old_end_time, old_status,
   new_start_time, new_end_time, new_status, shortened)
SELECT t.user_id, t.id, t.workspace_id,
       'admin_clamped_overlap', 'manual-correction-2026-08-17', t.device_id,
       jsonb_build_object(
         'reason', 'Session overlapped the next session on the same device',
         'rule', 'end_time clamped to next session start_time',
         'corrected_by', 'engineering'
       ),
       t.start_time, t.end_time, t.status,
       t.start_time, GREATEST(t.start_time, o.next_start), t.status, TRUE
FROM time_doctor.time_logs t
JOIN (
  SELECT id,
         LEAD(start_time) OVER (
           PARTITION BY user_id, device_id ORDER BY start_time
         ) AS next_start
  FROM time_doctor.time_logs
  WHERE end_time IS NOT NULL
    AND device_id IS NOT NULL
    -- AND start_time >= TIMESTAMP '2026-08-01 00:00' AT TIME ZONE 'America/Chicago'
) o ON o.id = t.id
WHERE o.next_start IS NOT NULL
  AND t.end_time > o.next_start;

-- Clamp each session's end to the next session's start.
UPDATE time_doctor.time_logs t
SET end_time      = GREATEST(t.start_time, o.next_start),
    last_alive_at = LEAST(
                      COALESCE(t.last_alive_at, GREATEST(t.start_time, o.next_start)),
                      GREATEST(t.start_time, o.next_start)
                    ),
    updated_at    = NOW()
FROM (
  SELECT id,
         LEAD(start_time) OVER (
           PARTITION BY user_id, device_id ORDER BY start_time
         ) AS next_start
  FROM time_doctor.time_logs
  WHERE end_time IS NOT NULL
    AND device_id IS NOT NULL
    -- AND start_time >= TIMESTAMP '2026-08-01 00:00' AT TIME ZONE 'America/Chicago'
) o
WHERE o.id = t.id
  AND o.next_start IS NOT NULL
  AND t.end_time > o.next_start;

-- Verify: this must return 0 before you commit.
WITH ordered AS (
  SELECT t.start_time, t.end_time,
         LEAD(t.start_time) OVER (
           PARTITION BY t.user_id, t.device_id ORDER BY t.start_time
         ) AS next_start
  FROM time_doctor.time_logs t
  WHERE t.end_time IS NOT NULL AND t.device_id IS NOT NULL
)
SELECT COUNT(*) AS remaining_overlaps
FROM ordered
WHERE next_start IS NOT NULL AND end_time > next_start;

-- If remaining_overlaps = 0 and STEP 1 looked right:
--   COMMIT;
-- Otherwise:
--   ROLLBACK;
