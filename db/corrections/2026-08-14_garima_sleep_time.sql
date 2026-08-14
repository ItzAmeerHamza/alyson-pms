-- One-off correction: Garima Singh (user_id 1224), Aug 12–13 2026.
--
-- Three sessions billed laptop-sleep as work. Sleep boundaries are taken from
-- the agent's own S3 diagnostic logs, where the process writes thousands of
-- lines per hour while awake and nothing at all while suspended:
--   s3://alyson-pm/logs/dt=2026-08-12/.../user_id=1224/...jsonl
--   s3://alyson-pm/logs/dt=2026-08-13/.../user_id=1224/...jsonl
--
-- Effect (Central work days):
--   Aug 12   14h37m -> 8h33m   (-6h04m)
--   Aug 13   10h19m -> 8h15m   (-2h04m)
--
-- Run inside the transaction. Review the BEFORE/AFTER output, then COMMIT.

BEGIN;

-- ── BEFORE ────────────────────────────────────────────────────────────────
SELECT 'BEFORE' AS phase, id, start_time, end_time,
       round(EXTRACT(EPOCH FROM (end_time - start_time))/60, 1) AS minutes
FROM time_doctor.time_logs
WHERE id IN ('ef8f6f84-8a30-4e04-a192-14546ea83026',
             '16a362c5-de0c-45bb-9cf6-851d94f1a52c',
             'f21f098a-6d54-4538-8a58-fc3e22156639')
ORDER BY start_time;

-- ── Audit trail (captures old values before we change them) ────────────────
INSERT INTO time_doctor.time_log_events
  (user_id, time_log_id, workspace_id, action, source, device_id, meta,
   old_start_time, old_end_time, old_status,
   new_start_time, new_end_time, new_status, shortened)
SELECT t.user_id, t.id, t.workspace_id,
       'admin_corrected_sleep_time', 'manual-correction-2026-08-14', t.device_id,
       jsonb_build_object(
         'reason', 'Laptop asleep — billed as work',
         'evidence', 'agent S3 diagnostic logs: no log lines emitted while suspended',
         'corrected_by', 'engineering'
       ),
       t.start_time, t.end_time, t.status,
       CASE t.id
         WHEN '16a362c5-de0c-45bb-9cf6-851d94f1a52c'::uuid
           THEN TIMESTAMPTZ '2026-08-12 18:12:28+00'
         ELSE t.start_time
       END,
       CASE t.id
         WHEN 'ef8f6f84-8a30-4e04-a192-14546ea83026'::uuid
           THEN TIMESTAMPTZ '2026-08-12 12:07:48+00'
         WHEN 'f21f098a-6d54-4538-8a58-fc3e22156639'::uuid
           THEN TIMESTAMPTZ '2026-08-13 14:34:16+00'
         ELSE t.end_time
       END,
       t.status, TRUE
FROM time_doctor.time_logs t
WHERE t.id IN ('ef8f6f84-8a30-4e04-a192-14546ea83026',
               '16a362c5-de0c-45bb-9cf6-851d94f1a52c',
               'f21f098a-6d54-4538-8a58-fc3e22156639');

-- ── 1. ef8f6f84 — created by auto-resume, laptop slept 1 second later ──────
-- Awake for 1s at 12:07:18, then suspended 12:07:19–16:41:32 and 16:41:37–18:12:28.
-- The 18:12–18:58 work belongs to 16a362c5, which was the active session by then.
-- Collapses to the 30s minimum: this session contains no work.
UPDATE time_doctor.time_logs
SET end_time = TIMESTAMPTZ '2026-08-12 12:07:48+00',
    last_alive_at = TIMESTAMPTZ '2026-08-12 12:07:19+00',
    updated_at = NOW()
WHERE id = 'ef8f6f84-8a30-4e04-a192-14546ea83026';

-- ── 2. 16a362c5 — duplicate session opened on a wake, then slept again ─────
-- Suspended 16:41:37–18:12:28 (1h30m). Real work is 18:12:28–18:58:30 (46m).
-- Sleep is at the START here, so start_time moves rather than end_time.
UPDATE time_doctor.time_logs
SET start_time = TIMESTAMPTZ '2026-08-12 18:12:28+00',
    last_alive_at = TIMESTAMPTZ '2026-08-12 18:58:30+00',
    updated_at = NOW()
WHERE id = '16a362c5-de0c-45bb-9cf6-851d94f1a52c';

-- ── 3. f21f098a — suspended mid-session, closed at wake time ───────────────
-- Awake 13:13:40–14:34:16 (1h20m), then suspended until 16:39:01 when the
-- deferred sleep-stop finally ran and stamped the wake moment as the end.
UPDATE time_doctor.time_logs
SET end_time = TIMESTAMPTZ '2026-08-13 14:34:16+00',
    last_alive_at = TIMESTAMPTZ '2026-08-13 14:34:16+00',
    updated_at = NOW()
WHERE id = 'f21f098a-6d54-4538-8a58-fc3e22156639';

-- ── AFTER ─────────────────────────────────────────────────────────────────
SELECT 'AFTER' AS phase, id, start_time, end_time,
       round(EXTRACT(EPOCH FROM (end_time - start_time))/60, 1) AS minutes
FROM time_doctor.time_logs
WHERE id IN ('ef8f6f84-8a30-4e04-a192-14546ea83026',
             '16a362c5-de0c-45bb-9cf6-851d94f1a52c',
             'f21f098a-6d54-4538-8a58-fc3e22156639')
ORDER BY start_time;

-- ── Sessions per Central work day, after correction ───────────────────────
-- Sum these per day to sanity-check. The three corrected rows no longer
-- overlap each other, so a plain sum equals the merged total Pulse shows.
SELECT (t.start_time AT TIME ZONE 'America/Chicago')::date          AS central_day,
       t.id,
       (t.start_time AT TIME ZONE 'America/Chicago')::time(0)       AS starts,
       (t.end_time   AT TIME ZONE 'America/Chicago')::time(0)       AS ends,
       round(EXTRACT(EPOCH FROM (t.end_time - t.start_time))/60, 1) AS minutes
FROM time_doctor.time_logs t
WHERE t.user_id = 1224
  AND t.end_time IS NOT NULL
  AND t.start_time >= TIMESTAMPTZ '2026-08-10 05:00+00'
  AND t.start_time <  TIMESTAMPTZ '2026-08-14 05:00+00'
ORDER BY t.start_time;

-- Expected daily totals after commit (Central, overlaps merged):
--   Aug 10  7h32m   (unchanged)
--   Aug 11  7h57m   (unchanged)
--   Aug 12  8h33m   (was 14h37m)
--   Aug 13  8h15m   (was 10h19m)

-- ROLLBACK;   -- <- run this if the numbers look wrong
-- COMMIT;     -- <- run this to apply
