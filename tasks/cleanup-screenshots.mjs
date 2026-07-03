#!/usr/bin/env node
/**
 * Delete screenshot metadata older than RETENTION_DAYS and remove S3 objects.
 * Schedule: EventBridge cron "0 3 * * *" (daily 3am UTC)
 *
 * Env: DATABASE_URL, AWS_S3_SCREENSHOTS_BUCKET, RETENTION_DAYS (default 90)
 */
import pg from 'pg';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';

const { Pool } = pg;
const retentionDays = parseInt(process.env.RETENTION_DAYS || '90', 10);
const bucket = process.env.AWS_S3_SCREENSHOTS_BUCKET || process.env.AWS_S3_BUCKET;

function poolFromEnv() {
  if (process.env.DATABASE_URL) {
    return new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL !== 'false' ? { rejectUnauthorized: false } : false });
  }
  throw new Error('DATABASE_URL required');
}

if (!bucket) {
  console.error('AWS_S3_SCREENSHOTS_BUCKET not set');
  process.exit(1);
}

const pool = poolFromEnv();
const s3 = new S3Client({});

const { rows } = await pool.query(
  `SELECT id, s3_key, file_path
   FROM public.screenshots
   WHERE captured_at < NOW() - ($1 || ' days')::interval
   LIMIT 500`,
  [retentionDays],
);

let deleted = 0;
let s3Errors = 0;

for (const row of rows) {
  const key = row.s3_key || row.file_path;
  if (key && !key.startsWith('http')) {
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    } catch {
      s3Errors++;
    }
  }
  await pool.query('DELETE FROM public.screenshots WHERE id = $1', [row.id]);
  deleted++;
}

console.log(JSON.stringify({ deleted, s3_errors: s3Errors, retention_days: retentionDays }));
await pool.end();
