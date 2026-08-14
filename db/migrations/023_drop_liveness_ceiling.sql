-- Drop the liveness-ceiling layer added in 021.
--
-- 021 was the wrong shape: it did not stop a wrong end_time being produced, it
-- clamped one after the fact. It then needed its own corrections — a client
-- checkpoint override so it stopped deleting genuine offline work, and a second
-- migration because retroactive app_log.ended_at values defeated it. A fix that
-- needs its own fixes is a symptom, not a solution.
--
-- The real cause was that the agent could not write an end time at stop, because
-- the OS freezes the process on lid-close. 022 fixes that at source: the agent
-- stamps last_alive_at every 10s while alive, so the session always already
-- knows where it ends and nothing has to be inferred or corrected afterwards.
--
-- The rule is now one line:  a session ends at last_alive_at.
--
-- Safe to run before or after 022. Keeps 022's column, index and backfill.

DROP FUNCTION IF EXISTS time_doctor.clamp_end_to_liveness(UUID, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER);
DROP FUNCTION IF EXISTS time_doctor.session_last_liveness(UUID);

-- Superseded by idx_td_time_logs_open_last_alive from 022, which supports the
-- same "find open rows" scan and orders by the column the sweep actually reads.
DROP INDEX IF EXISTS time_doctor.idx_td_time_logs_open;
