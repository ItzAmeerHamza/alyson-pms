#!/usr/bin/env node
/**
 * Close time_logs that have been open > 12 hours (stale desktop sessions).
 * Schedule: EventBridge rate(1 hour) or cron "0 * * * *"
 *
 * Env: DATABASE_URL or DATABASE_HOST + DATABASE_PASSWORD + DATABASE_NAME + DATABASE_USER
 */
import pg from 'pg';

const { Pool } = pg;

function poolFromEnv() {
  if (process.env.DATABASE_URL) {
    return new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL !== 'false' ? { rejectUnauthorized: false } : false });
  }
  const host = process.env.DATABASE_HOST;
  const password = process.env.DATABASE_PASSWORD;
  if (!host || !password) throw new Error('Set DATABASE_URL or DATABASE_HOST + DATABASE_PASSWORD');
  return new Pool({
    host,
    port: parseInt(process.env.DATABASE_PORT || '5432', 10),
    database: process.env.DATABASE_NAME || 'timeflow',
    user: process.env.DATABASE_USER || 'timeflow_admin',
    password,
    ssl: process.env.DATABASE_SSL !== 'false' ? { rejectUnauthorized: false } : false,
  });
}

const pool = poolFromEnv();

const result = await pool.query(
  `UPDATE public.time_logs
   SET end_time = NOW(), status = 'auto_closed', updated_at = NOW()
   WHERE end_time IS NULL
     AND start_time < NOW() - INTERVAL '12 hours'
   RETURNING id, user_id`,
);

console.log(JSON.stringify({ closed: result.rowCount, sessions: result.rows }));
await pool.end();
