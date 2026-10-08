-- One idle stretch is one row. The agent used to INSERT again after a timeout
-- (Lambda had already written). This unique key refuses a second copy of the
-- same (user, idle_start). insert_idle_log stays an insert — a retry is a no-op.

DELETE FROM time_doctor.idle_logs il
USING (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY user_id, idle_start
           ORDER BY
             COALESCE(duration_seconds, 0) DESC,
             (time_log_id IS NOT NULL) DESC,
             created_at ASC NULLS LAST,
             id ASC
         ) AS rn
  FROM time_doctor.idle_logs
) dups
WHERE il.id = dups.id
  AND dups.rn > 1;

ALTER TABLE time_doctor.idle_logs
  DROP CONSTRAINT IF EXISTS idle_logs_user_idle_start_key;

ALTER TABLE time_doctor.idle_logs
  ADD CONSTRAINT idle_logs_user_idle_start_key UNIQUE (user_id, idle_start);

COMMENT ON CONSTRAINT idle_logs_user_idle_start_key ON time_doctor.idle_logs IS
  'The agent records one idle stretch once. A retry of the same start must not add another row.';
