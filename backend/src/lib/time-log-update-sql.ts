/**
 * Payroll-critical UPDATE/UPSERT fragments for time_logs.
 *
 * authorized_idle_cut bills the client's now−10m. The laptop is still awake, so
 * last_alive_at / heartbeats at "now" must not raise that end — doing so put
 * the 10m back on every unanswered idle prompt (Garima 31 Aug and others).
 */

export const LAST_PROOF_OF_LIFE_SQL = `LEAST(
    NOW(),
    GREATEST(
      t.start_time,
      COALESCE(t.last_alive_at, t.start_time),
      COALESCE((SELECT MAX(h.seen_at) FROM time_doctor.session_heartbeats h
                 WHERE h.time_log_id = t.id), t.start_time),
      COALESCE((SELECT MAX(s.captured_at) FROM time_doctor.screenshots s
                 WHERE s.time_log_id = t.id), t.start_time),
      COALESCE((SELECT MAX(COALESCE(a.ended_at, a.started_at, a.timestamp))
                 FROM time_doctor.app_logs a WHERE a.time_log_id = t.id), t.start_time),
      COALESCE((SELECT MAX(COALESCE(u.ended_at, u.started_at))
                 FROM time_doctor.url_logs u WHERE u.time_log_id = t.id), t.start_time)
    )
  )`;

/** Client now−10m, never last_alive_at. $2 is client end_time. */
export const AUTHORIZED_CUT_END_SQL =
  `GREATEST(t.start_time, LEAST($2::timestamptz, NOW()))`;

/** Live stop: start, last_alive, or client end — whichever is latest, never future. */
export const PROPOSED_END_SQL =
  `GREATEST(t.start_time, COALESCE(t.last_alive_at, t.start_time), LEAST($2::timestamptz, NOW()))`;

/**
 * Extend a completed row only as far as last_alive_at (or other proof if the
 * agent never stamped last_alive). Heartbeats after an unanswered idle prompt
 * are the laptop sitting on the dialog, not work — they must not restore the
 * 10m once last_alive is frozen to the cut.
 */
export function provenExtensionSql(): string {
  return `GREATEST(t.end_time, LEAST(${PROPOSED_END_SQL}, COALESCE(t.last_alive_at, ${LAST_PROOF_OF_LIFE_SQL}), ${LAST_PROOF_OF_LIFE_SQL}))`;
}

export function updateTimeLogEndSql(authorizedIdleCut: boolean): string {
  if (authorizedIdleCut) {
    return `CASE
                 WHEN $2::timestamptz IS NULL THEN t.end_time
                 ELSE ${AUTHORIZED_CUT_END_SQL}
               END`;
  }
  return `CASE
                 WHEN $2::timestamptz IS NULL THEN t.end_time
                 WHEN t.end_time IS NULL THEN ${PROPOSED_END_SQL}
                 ELSE ${provenExtensionSql()}
               END`;
}

/** On an authorized cut, pull last_alive back to the billed end so later writes cannot raise it. */
export function updateTimeLogLastAliveSql(authorizedIdleCut: boolean): string {
  if (authorizedIdleCut) {
    return AUTHORIZED_CUT_END_SQL;
  }
  return `CASE
                 WHEN t.end_time IS NOT NULL THEN t.last_alive_at
                 ELSE GREATEST(
                   COALESCE(t.last_alive_at, t.start_time),
                   LEAST(COALESCE($6::timestamptz, t.last_alive_at, t.start_time), NOW())
                 )
               END`;
}

/**
 * create/upsert ON CONFLICT: a completed billed end (including idle cuts)
 * must not be raised by a later insert retry carrying wall-clock now.
 */
export const COMPLETED_ROW_KEEPS_END_SQL = `CASE
               WHEN EXCLUDED.end_time IS NULL THEN time_doctor.time_logs.end_time
               WHEN time_doctor.time_logs.end_time IS NULL THEN EXCLUDED.end_time
               WHEN time_doctor.time_logs.status = 'completed' THEN time_doctor.time_logs.end_time
               ELSE GREATEST(time_doctor.time_logs.end_time, EXCLUDED.end_time)
             END`;
