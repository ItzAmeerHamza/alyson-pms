#!/usr/bin/env node
/**
 * CLOSE stale open time_logs at their last proof of life.
 *
 * This is the only actor that does not depend on the employee's machine being
 * healthy. A slept / crashed / offline agent cannot report itself broken, so
 * flag-only detection left sessions open and they were later closed at NOW —
 * billing the whole gap. Here we close at last heartbeat/evidence instead.
 *
 * Never extends a session. The chosen end is always <= last liveness + grace,
 * so the worst case is losing the grace window, never gaining sleep hours.
 *
 * DEFAULTS TO DRY RUN. Set DRY_RUN=false to actually close.
 *
 * Env: DATABASE_URL or DATABASE_HOST + DATABASE_PASSWORD + DATABASE_NAME + DATABASE_USER
 * Optional:
 *   STALE_AFTER_MINUTES     (default 20)  age before a session is considered dead
 *   LIVENESS_GRACE_SECONDS  (default 120) slack added to last liveness
 *   DRY_RUN=false                         actually mutate (default: report only)
 */
import pg from 'pg';

const { Pool } = pg;

function poolFromEnv() {
  if (process.env.DATABASE_URL) {
    return new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL !== 'false' ? { rejectUnauthorized: false } : false,
    });
  }
  const host = process.env.DATABASE_HOST;
  const password = process.env.DATABASE_PASSWORD;
  if (!host || !password) throw new Error('Set DATABASE_URL or DATABASE_HOST + DATABASE_PASSWORD');
  return new Pool({
    host,
    port: parseInt(process.env.DATABASE_PORT || '5432', 10),
    database: process.env.DATABASE_NAME || 'revclouddb',
    user: process.env.DATABASE_USER || 'alyson_time_doctor_api',
    password,
    ssl: process.env.DATABASE_SSL !== 'false' ? { rejectUnauthorized: false } : false,
  });
}

export async function closeStaleSessions({ pool, staleMinutes, graceSeconds, dryRun }) {
  const open = await pool.query(
    `SELECT t.id, t.user_id, t.start_time, t.device_id, t.workspace_id,
            COALESCE(t.last_alive_at, t.start_time) AS last_liveness
     FROM time_doctor.time_logs t
     WHERE t.end_time IS NULL
     ORDER BY t.start_time ASC
     LIMIT 500`,
  );

  const closed = [];
  for (const row of open.rows) {
    const liveMs = new Date(row.last_liveness).getTime();
    const ageMin = (Date.now() - liveMs) / 60000;
    if (!Number.isFinite(ageMin) || ageMin < staleMinutes) continue;

    const startMs = new Date(row.start_time).getTime();
    const billedIfClosedNow = (Date.now() - startMs) / 60000;
    const record = {
      id: row.id,
      user_id: row.user_id,
      start_time: new Date(startMs).toISOString(),
      last_liveness: new Date(liveMs).toISOString(),
      dead_for_minutes: Math.round(ageMin),
      // What the old close-at-NOW behaviour would have billed for this row.
      minutes_prevented: Math.round(billedIfClosedNow - (liveMs - startMs) / 60000),
    };

    if (dryRun) {
      closed.push({ ...record, applied: false });
      continue;
    }

    const upd = await pool.query(
      `UPDATE time_doctor.time_logs t
       SET end_time = GREATEST(
             t.start_time + interval '30 seconds',
             COALESCE(t.last_alive_at, t.start_time)
           ),
           status = 'auto_closed',
           updated_at = NOW()
       WHERE t.id = $1 AND t.end_time IS NULL
       RETURNING t.end_time`,
      [row.id],
    );
    if (!upd.rows[0]) continue;

    try {
      await pool.query(
        `INSERT INTO time_doctor.time_log_events
           (user_id, time_log_id, workspace_id, action, source, device_id, meta,
            new_end_time, new_status, shortened)
         VALUES ($1, $2, $3, 'stale_session_auto_closed', 'close-stale-sessions-task', $4, $5::jsonb,
                 $6, 'auto_closed', TRUE)`,
        [
          row.user_id,
          row.id,
          row.workspace_id,
          row.device_id,
          JSON.stringify({
            reason: 'closed_at_last_liveness',
            last_liveness: record.last_liveness,
            dead_for_minutes: record.dead_for_minutes,
            grace_seconds: graceSeconds,
          }),
          upd.rows[0].end_time,
        ],
      );
    } catch (_) {
      /* events table may not exist on older envs */
    }

    closed.push({ ...record, end_time: upd.rows[0].end_time, applied: true });
  }

  return {
    mode: dryRun ? 'dry_run' : 'close_at_last_liveness',
    stale_after_minutes: staleMinutes,
    grace_seconds: graceSeconds,
    scanned: open.rowCount,
    closed: closed.length,
    minutes_prevented: closed.reduce((s, c) => s + (c.minutes_prevented || 0), 0),
    sessions: closed,
  };
}

// Direct CLI run (the Lambda handler imports closeStaleSessions instead).
if (import.meta.url === `file://${process.argv[1]}`) {
  const pool = poolFromEnv();
  try {
    const result = await closeStaleSessions({
      pool,
      staleMinutes: Math.max(15, parseInt(process.env.STALE_AFTER_MINUTES || '20', 10)),
      graceSeconds: Math.max(30, parseInt(process.env.LIVENESS_GRACE_SECONDS || '120', 10)),
      dryRun: process.env.DRY_RUN !== 'false',
    });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await pool.end();
  }
}

export { poolFromEnv };
