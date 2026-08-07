#!/usr/bin/env node
/**
 * FLAG stale open time_logs — does NOT mutate end_time.
 *
 * Heartbeat / evidence age is used for detection only. Closing requires
 * employee/admin confirmation (confirm_stale_session_close) or a local
 * durable checkpoint confirmation from the desktop agent.
 *
 * Schedule: EventBridge rate(1 hour) or cron "0 * * * *"
 * Env: DATABASE_URL or DATABASE_HOST + DATABASE_PASSWORD + DATABASE_NAME + DATABASE_USER
 * Optional: STALE_AFTER_MINUTES (default 30)
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

const staleMinutes = Math.max(15, parseInt(process.env.STALE_AFTER_MINUTES || '30', 10));
const pool = poolFromEnv();

const open = await pool.query(
  `SELECT id, user_id, start_time, device_id, workspace_id
   FROM time_doctor.time_logs
   WHERE end_time IS NULL
   ORDER BY start_time ASC
   LIMIT 500`,
);

const flagged = [];
for (const row of open.rows) {
  const live = await pool.query(
    `SELECT
       (SELECT MAX(h.seen_at) FROM time_doctor.session_heartbeats h WHERE h.time_log_id = $1) AS heartbeat_at,
       (SELECT MAX(s.captured_at) FROM time_doctor.screenshots s WHERE s.time_log_id = $1) AS shot_at,
       (SELECT MAX(COALESCE(a.ended_at, a.started_at, a.timestamp)) FROM time_doctor.app_logs a WHERE a.time_log_id = $1) AS app_at,
       (SELECT MAX(COALESCE(u.ended_at, u.started_at)) FROM time_doctor.url_logs u WHERE u.time_log_id = $1) AS url_at,
       (SELECT MAX(COALESCE(i.idle_end, i.idle_start)) FROM time_doctor.idle_logs i WHERE i.time_log_id = $1) AS idle_at`,
    [row.id],
  );
  const r = live.rows[0] || {};
  const times = [r.heartbeat_at, r.shot_at, r.app_at, r.url_at, r.idle_at, row.start_time]
    .filter(Boolean)
    .map((t) => new Date(t).getTime())
    .filter((n) => Number.isFinite(n));
  const lastMs = Math.max(...times);
  const ageMin = (Date.now() - lastMs) / 60000;
  if (ageMin < staleMinutes) continue;

  try {
    await pool.query(
      `INSERT INTO time_doctor.time_log_events
         (user_id, time_log_id, workspace_id, action, source, device_id, meta, shortened)
       VALUES ($1, $2, $3, 'stale_session_flagged', 'close-stale-sessions-task', $4, $5::jsonb, FALSE)`,
      [
        row.user_id,
        row.id,
        row.workspace_id,
        row.device_id,
        JSON.stringify({
          reason: 'stale_session_flagged',
          age_minutes: Math.round(ageMin),
          last_signal_at: new Date(lastMs).toISOString(),
          note: 'Flag only — time_logs.end_time not modified. Requires confirmation to close.',
        }),
      ],
    );
  } catch (_) {
    /* events table may not exist on older envs */
  }

  flagged.push({
    id: row.id,
    user_id: row.user_id,
    age_minutes: Math.round(ageMin),
    last_signal_at: new Date(lastMs).toISOString(),
  });
}

console.log(
  JSON.stringify({
    mode: 'flag_only',
    stale_after_minutes: staleMinutes,
    scanned: open.rowCount,
    flagged: flagged.length,
    sessions: flagged,
  }),
);
await pool.end();
