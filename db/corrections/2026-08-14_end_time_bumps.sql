-- One-off correction: 17 sessions extended past their real end, Aug 10–14 2026.
--
-- Each of these was cleanly closed, then re-opened hours later by an
-- update_time_log carrying the writer's own wall clock. update_time_log capped
-- a forward bump at NOW() only, never at the session's proven liveness, so the
-- write was accepted. 33de1c77 ran for 91 seconds and was later extended by
-- 4.69 hours.
--
-- Identified from time_log_events: the restored value is the row's own
-- old_end_time from the bump event, and every row below had its new end_time
-- land within 90s of the UPDATE that wrote it — i.e. the writer stamped its own
-- clock rather than a recorded stop time.
--
-- Deliberately NOT included: 11 further bumps whose new end_time sits hours away
-- from the write. Those carry historical timestamps and are genuine offline
-- recovery extending a premature close.
--
-- Total removed: 14.21 hours across 12 employees.
--
-- Fixed at source in force-sync.controller.ts: a retroactive extension is now
-- capped at the session's last proof-of-life, and last_alive_at no longer
-- advances on a completed row.
--
-- Run inside the transaction. Review the BEFORE/AFTER output, then COMMIT.

BEGIN;

CREATE TEMP TABLE _bump_fix (id UUID PRIMARY KEY, true_end TIMESTAMPTZ) ON COMMIT DROP;

INSERT INTO _bump_fix (id, true_end) VALUES
    ('33de1c77-b05c-4639-b653-38a7f5d17c75'::uuid, TIMESTAMPTZ '2026-08-10 08:58:51+00'),  -- ahsanjaved -4.69h
    ('76d36a62-4278-44ab-8d08-c8a3fda1c281'::uuid, TIMESTAMPTZ '2026-08-13 11:41:04+00'),  -- ahsanjaved -2.23h
    ('31ad1969-2916-492b-bfae-ac0b2c206603'::uuid, TIMESTAMPTZ '2026-08-13 23:07:36+00'),  -- aryaman    -1.96h
    ('23f9731d-33bf-4388-8e9a-5415aedb5a8d'::uuid, TIMESTAMPTZ '2026-08-12 08:16:40+00'),  -- fawad      -0.91h
    ('84d7a358-ac7a-4859-ace2-c98682762808'::uuid, TIMESTAMPTZ '2026-08-12 18:43:10+00'),  -- om.podey   -0.73h
    ('d24beae1-1d9e-4bda-9453-b788b251a7f6'::uuid, TIMESTAMPTZ '2026-08-10 07:54:23+00'),  -- anila      -0.72h
    ('80b78d6c-21de-4d6c-b3b4-1905c03fdede'::uuid, TIMESTAMPTZ '2026-08-12 13:13:11+00'),  -- ameer      -0.61h
    ('5befa3c4-b6ec-4b59-b2b9-b48176f804e8'::uuid, TIMESTAMPTZ '2026-08-11 12:14:00+00'),  -- ahsanjaved -0.48h
    ('42592279-74ea-405f-b652-2834e149793e'::uuid, TIMESTAMPTZ '2026-08-13 18:28:51+00'),  -- awais      -0.41h
    ('db31143f-3540-4504-acb9-abec9b06ed25'::uuid, TIMESTAMPTZ '2026-08-11 13:43:41+00'),  -- om.podey   -0.39h
    ('b6e2d4ee-50e6-4358-ad78-eb99e3fbf5de'::uuid, TIMESTAMPTZ '2026-08-12 10:31:27+00'),  -- sameer     -0.28h
    ('787c3fc5-e682-489e-9075-d7a1227f311b'::uuid, TIMESTAMPTZ '2026-08-10 11:01:13+00'),  -- garima     -0.21h
    ('5cf77522-327d-4a22-a42f-ff1512fc5535'::uuid, TIMESTAMPTZ '2026-08-10 08:44:21+00'),  -- ahsanjaved -0.20h
    ('db6a2ca1-3b64-49de-9760-0bb531fc27ca'::uuid, TIMESTAMPTZ '2026-08-11 17:44:13+00'),  -- arooj      -0.12h
    ('f91b4254-9760-4f57-83a6-8281dba81418'::uuid, TIMESTAMPTZ '2026-08-10 13:57:18+00'),  -- omer       -0.12h
    ('2bc0e1a8-b084-4904-9bdc-fea2494841cb'::uuid, TIMESTAMPTZ '2026-08-11 08:57:55+00'),  -- anila      -0.08h
    ('2aff3583-8802-43b1-ae7f-400fbf1ad7c9'::uuid, TIMESTAMPTZ '2026-08-12 08:26:19+00');  -- omer       -0.07h

-- ── BEFORE ────────────────────────────────────────────────────────────────
SELECT 'BEFORE' AS phase, u.email, t.id, t.start_time, t.end_time,
       round(EXTRACT(EPOCH FROM (t.end_time - t.start_time))/60, 1) AS minutes,
       round(EXTRACT(EPOCH FROM (t.end_time - f.true_end))/60, 1)   AS minutes_to_remove
FROM time_doctor.time_logs t
JOIN _bump_fix f ON f.id = t.id
LEFT JOIN tenant."user" u ON u.id = t.user_id
ORDER BY minutes_to_remove DESC;

-- ── Audit trail (captures old values before we change them) ────────────────
INSERT INTO time_doctor.time_log_events
  (user_id, time_log_id, workspace_id, action, source, device_id, meta,
   old_start_time, old_end_time, old_status,
   new_start_time, new_end_time, new_status, shortened)
SELECT t.user_id, t.id, t.workspace_id,
       'admin_reverted_end_time_bump', 'manual-correction-2026-08-14', t.device_id,
       jsonb_build_object(
         'reason', 'Closed session re-opened by an update carrying the writer''s wall clock',
         'evidence', 'time_log_events: new_end_time landed within 90s of the UPDATE itself',
         'restored_to', 'old_end_time recorded on that bump event',
         'corrected_by', 'engineering'
       ),
       t.start_time, t.end_time, t.status,
       t.start_time, f.true_end, t.status, TRUE
FROM time_doctor.time_logs t
JOIN _bump_fix f ON f.id = t.id
WHERE t.end_time > f.true_end;

-- ── Correction ────────────────────────────────────────────────────────────
UPDATE time_doctor.time_logs t
SET end_time   = f.true_end,
    -- The switch was left standing past the real end by the same writes.
    last_alive_at = LEAST(COALESCE(t.last_alive_at, f.true_end), f.true_end),
    updated_at = NOW()
FROM _bump_fix f
WHERE f.id = t.id
  AND t.end_time > f.true_end;

-- ── AFTER ─────────────────────────────────────────────────────────────────
SELECT 'AFTER' AS phase, u.email, t.id, t.start_time, t.end_time,
       round(EXTRACT(EPOCH FROM (t.end_time - t.start_time))/60, 1) AS minutes
FROM time_doctor.time_logs t
JOIN _bump_fix f ON f.id = t.id
LEFT JOIN tenant."user" u ON u.id = t.user_id
ORDER BY t.start_time;

-- Expect: 14.21 fewer hours in total.
SELECT round(SUM(EXTRACT(EPOCH FROM (t.end_time - t.start_time)))/3600, 2) AS hours_after
FROM time_doctor.time_logs t JOIN _bump_fix f ON f.id = t.id;

-- COMMIT;
ROLLBACK;
