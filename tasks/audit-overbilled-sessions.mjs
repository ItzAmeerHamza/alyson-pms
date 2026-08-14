#!/usr/bin/env node
/**
 * READ-ONLY: report sessions billed past their last proof of life.
 *
 * Mutates nothing. Answers "how many hours have we already paid for time
 * nobody worked", and which employees/days are affected.
 *
 * A row is over-billed when end_time exceeds last heartbeat/evidence by more
 * than the grace window — the signature of a session closed at wake/restart
 * time rather than when the agent actually died.
 *
 * Env: DATABASE_URL or DATABASE_HOST + DATABASE_PASSWORD + DATABASE_NAME + DATABASE_USER
 * Optional: SINCE_DAYS (default 30), LIVENESS_GRACE_SECONDS (default 120),
 *           MIN_MINUTES (default 5) ignore noise below this
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

const sinceDays = Math.max(1, parseInt(process.env.SINCE_DAYS || '30', 10));
const graceSeconds = Math.max(30, parseInt(process.env.LIVENESS_GRACE_SECONDS || '120', 10));
const minMinutes = Math.max(1, parseInt(process.env.MIN_MINUTES || '5', 10));

const pool = poolFromEnv();

const rows = await pool.query(
  `WITH scored AS (
     SELECT t.id, t.user_id, t.start_time, t.end_time, t.device_id,
            COALESCE(t.last_alive_at, t.start_time) AS last_liveness,
            EXTRACT(EPOCH FROM (
              t.end_time - (COALESCE(t.last_alive_at, t.start_time) + make_interval(secs => $2::int))
            )) AS over_seconds
     FROM time_doctor.time_logs t
     WHERE t.end_time IS NOT NULL
       AND t.start_time >= NOW() - make_interval(days => $1::int)
   )
   SELECT s.*, u.first_name, u.last_name, u.email
   FROM scored s
   LEFT JOIN tenant."user" u ON u.id = s.user_id
   WHERE s.over_seconds > $3::int
   ORDER BY s.over_seconds DESC
   LIMIT 500`,
  [sinceDays, graceSeconds, minMinutes * 60],
);

const byUser = new Map();
let totalOver = 0;
for (const r of rows.rows) {
  const over = Number(r.over_seconds) || 0;
  totalOver += over;
  const key = r.email || `user_${r.user_id}`;
  const cur = byUser.get(key) || { name: `${r.first_name || ''} ${r.last_name || ''}`.trim(), sessions: 0, over_seconds: 0 };
  cur.sessions += 1;
  cur.over_seconds += over;
  byUser.set(key, cur);
}

const hm = (s) => `${Math.floor(s / 3600)}h${String(Math.round((s % 3600) / 60)).padStart(2, '0')}m`;

console.log(`Over-billed sessions (last ${sinceDays}d, grace ${graceSeconds}s, min ${minMinutes}m)`);
console.log(`  sessions affected : ${rows.rowCount}`);
console.log(`  total over-billed : ${hm(totalOver)}`);
console.log('');
console.log('By employee:');
for (const [email, v] of [...byUser.entries()].sort((a, b) => b[1].over_seconds - a[1].over_seconds)) {
  console.log(`  ${hm(v.over_seconds).padStart(9)}  ${String(v.sessions).padStart(3)} sessions  ${v.name} <${email}>`);
}
console.log('');
console.log('Worst 15 sessions:');
for (const r of rows.rows.slice(0, 15)) {
  console.log(
    `  ${hm(Number(r.over_seconds))}  ${r.id}  ${r.email || r.user_id}  ` +
      `start=${new Date(r.start_time).toISOString()} end=${new Date(r.end_time).toISOString()} ` +
      `last_alive=${new Date(r.last_liveness).toISOString()}`,
  );
}

await pool.end();
