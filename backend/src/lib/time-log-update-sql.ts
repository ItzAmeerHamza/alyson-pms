/**
 * Payroll-critical UPDATE/UPSERT fragments for time_logs.
 *
 * authorized_idle_cut bills the client's now−10m. The laptop is still awake, so
 * last_alive_at / heartbeats at "now" must not raise that end — doing so put
 * the 10m back on every unanswered idle prompt (Garima 31 Aug and others).
 */

/** `row` is the alias (or table name) the surrounding statement uses for time_logs. */
export function lastProofOfLifeSql(row = 't'): string {
  return `LEAST(
    NOW(),
    GREATEST(
      ${row}.start_time,
      COALESCE(${row}.last_alive_at, ${row}.start_time),
      COALESCE((SELECT MAX(h.seen_at) FROM time_doctor.session_heartbeats h
                 WHERE h.time_log_id = ${row}.id), ${row}.start_time),
      COALESCE((SELECT MAX(s.captured_at) FROM time_doctor.screenshots s
                 WHERE s.time_log_id = ${row}.id), ${row}.start_time),
      COALESCE((SELECT MAX(COALESCE(a.ended_at, a.started_at, a.timestamp))
                 FROM time_doctor.app_logs a WHERE a.time_log_id = ${row}.id), ${row}.start_time),
      COALESCE((SELECT MAX(COALESCE(u.ended_at, u.started_at))
                 FROM time_doctor.url_logs u WHERE u.time_log_id = ${row}.id), ${row}.start_time)
    )
  )`;
}

export const LAST_PROOF_OF_LIFE_SQL = lastProofOfLifeSql('t');

/**
 * Events written when an automated close picked this row's end: kill-all at own
 * liveness, device-wide or checkpoint-confirmed close, the stale-session lambda,
 * and inspect's close at last_alive (action varies, source does not). Admin
 * closes are excluded.
 */
export const SWEEP_CLOSE_ACTIONS = [
  'closed_at_own_liveness',
  'confirmed_close',
  'local_checkpoint_confirmed_close',
  'stale_session_auto_closed',
] as const;
export const SWEEP_CLOSE_SOURCES = ['closed_at_last_alive'] as const;

export function closedBySweepSql(row = 't'): string {
  const list = (values: readonly string[]) => values.map((v) => `'${v}'`).join(', ');
  return `EXISTS (SELECT 1 FROM time_doctor.time_log_events e
                  WHERE e.time_log_id = ${row}.id
                    AND (e.action IN (${list(SWEEP_CLOSE_ACTIONS)})
                         OR e.source IN (${list(SWEEP_CLOSE_SOURCES)})))`;
}

/**
 * A sweep guessed this row's end; the laptop's Stop knows it. Moving the end
 * later is capped by the row's own proof of life (+2m, checkpoints are 30s),
 * the next session on that device, and now — so a Stop stamped at wake cannot
 * bill the sleep in between. Ahsan Zafar 12 Oct d63a2160 (killed at its start).
 */
export function sweptRowStopExtensionSql(row: string, stopEnd: string): string {
  return `GREATEST(${row}.end_time, LEAST(
                 ${stopEnd},
                 NOW(),
                 ${lastProofOfLifeSql(row)} + interval '2 minutes',
                 (SELECT MIN(n.start_time) FROM time_doctor.time_logs n
                   WHERE n.user_id = ${row}.user_id
                     AND n.device_id IS NOT DISTINCT FROM ${row}.device_id
                     AND n.id <> ${row}.id
                     AND n.start_time > ${row}.start_time)
               ))`;
}

/** Earlier Stop shortens a swept row outright (Garima 9 Oct 81162434, stretched 2h44m). */
export function sweptRowStopEndSql(row: string, stopEnd: string): string {
  return `CASE
                 WHEN ${stopEnd} <= ${row}.end_time THEN GREATEST(${row}.start_time, ${stopEnd})
                 ELSE ${sweptRowStopExtensionSql(row, stopEnd)}
               END`;
}

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
  // last_alive_at is the cheap cap. LAST_PROOF scans screenshots / app / URL
  // rows and must not run on every already-closed retry (Mohita / Hamza queues).
  return `GREATEST(t.end_time, LEAST(${PROPOSED_END_SQL}, COALESCE(t.last_alive_at, ${LAST_PROOF_OF_LIFE_SQL})))`;
}

/** A Stop later than the end a sweep already wrote — the only frozen write that is capped. */
const STOP_EXTENDS_SWEPT_ROW_SQL = `$2::timestamptz IS NOT NULL
                   AND t.end_time IS NOT NULL
                   AND $2::timestamptz > t.end_time
                   AND ${closedBySweepSql('t')}`;

/** authorized_idle_cut or frozen_end: bill the client's end, never raise to last_alive. */
export function updateTimeLogEndSql(authorizedIdleCut: boolean): string {
  if (authorizedIdleCut) {
    return `CASE
                 WHEN $2::timestamptz IS NULL THEN t.end_time
                 WHEN ${STOP_EXTENDS_SWEPT_ROW_SQL}
                   THEN ${sweptRowStopExtensionSql('t', '$2::timestamptz')}
                 ELSE ${AUTHORIZED_CUT_END_SQL}
               END`;
  }
  return `CASE
                 WHEN $2::timestamptz IS NULL THEN t.end_time
                 WHEN t.end_time IS NULL THEN ${PROPOSED_END_SQL}
                 ELSE ${provenExtensionSql()}
               END`;
}

/**
 * On an authorized cut, pull last_alive back to the billed end so later writes cannot raise it.
 * A capped extension of a swept row keeps last_alive: it feeds the cap, so raising it would let
 * each retry of the same Stop push the end another 2m.
 */
export function updateTimeLogLastAliveSql(authorizedIdleCut: boolean): string {
  if (authorizedIdleCut) {
    return `CASE
                 WHEN ${STOP_EXTENDS_SWEPT_ROW_SQL} THEN t.last_alive_at
                 ELSE ${AUTHORIZED_CUT_END_SQL}
               END`;
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

/**
 * Same-id retry of a laptop Stop (update_time_log kept failing). A row a sweep
 * closed takes the Stop instead of keeping the sweep's guess; every other row
 * keeps COMPLETED_ROW_KEEPS_END_SQL. `frozenParam` is the bind placeholder for
 * the frozen_end / authorized_idle_cut flag.
 */
export function stopRetryKeepsEndSql(frozenParam: string): string {
  return `CASE
               WHEN ${frozenParam}::boolean IS TRUE
                AND EXCLUDED.end_time IS NOT NULL
                AND time_doctor.time_logs.end_time IS NOT NULL
                AND ${closedBySweepSql('time_doctor.time_logs')}
                 THEN ${sweptRowStopEndSql('time_doctor.time_logs', 'EXCLUDED.end_time')}
               ELSE ${COMPLETED_ROW_KEEPS_END_SQL}
             END`;
}
