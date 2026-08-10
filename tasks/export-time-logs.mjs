#!/usr/bin/env node
/**
 * Incrementally export time_doctor.time_logs to S3 as NDJSON, Hive-partitioned
 * by updated_at date, for Athena / Iceberg.
 *
 * Rows are mutable (sessions open then close / get extended), so the watermark is
 * (updated_at, id). Re-exported rows with the same id may appear in multiple
 * partitions — Athena queries should pick the latest updated_at per id
 * (see tasks/athena/README.md).
 *
 * Schedule: EventBridge rate(15 minutes) or cron "*\/15 * * * *"
 * Env: DATABASE_URL (or DATABASE_HOST + DATABASE_PASSWORD + DATABASE_NAME + DATABASE_USER),
 *      AWS_S3_SCREENSHOTS_BUCKET (or AWS_S3_BUCKET),
 *      TRACKED_TIME_LOGS_S3_PREFIX (default "tracked-time/time_logs")
 */
import pg from 'pg';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

const { Pool } = pg;

const bucket = process.env.AWS_S3_SCREENSHOTS_BUCKET || process.env.AWS_S3_BUCKET;
const prefix = (process.env.TRACKED_TIME_LOGS_S3_PREFIX || 'tracked-time/time_logs').replace(
  /^\/+|\/+$/g,
  '',
);
const watermarkKey = `${prefix}/_state/watermark.json`;
const BATCH_SIZE = 5000;

if (!bucket) {
  console.error('AWS_S3_SCREENSHOTS_BUCKET (or AWS_S3_BUCKET) not set');
  process.exit(1);
}

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

const pool = poolFromEnv();
const s3 = new S3Client({});

async function readWatermark() {
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: watermarkKey }));
    const body = await res.Body.transformToString();
    const parsed = JSON.parse(body);
    return {
      last_updated_at: parsed.last_updated_at || '1970-01-01T00:00:00.000Z',
      last_id: parsed.last_id || '00000000-0000-0000-0000-000000000000',
    };
  } catch (err) {
    if (err?.name === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404) {
      return {
        last_updated_at: '1970-01-01T00:00:00.000Z',
        last_id: '00000000-0000-0000-0000-000000000000',
      };
    }
    throw err;
  }
}

async function writeWatermark(lastUpdatedAt, lastId) {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: watermarkKey,
      Body: JSON.stringify({
        last_updated_at: lastUpdatedAt,
        last_id: lastId,
        updated_at: new Date().toISOString(),
      }),
      ContentType: 'application/json',
    }),
  );
}

function toIso(v) {
  return v instanceof Date ? v.toISOString() : v ?? null;
}

/**
 * One Athena-ready JSON object per line (JsonSerDe).
 * Types are coerced so Hive columns match tasks/athena/README.md.
 */
function rowToNdjsonLine(row) {
  const startIso = toIso(row.start_time);
  const endIso = toIso(row.end_time);
  const startMs = startIso ? Date.parse(startIso) : NaN;
  const endMs = endIso ? Date.parse(endIso) : NaN;
  const durationSeconds =
    Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs
      ? Math.floor((endMs - startMs) / 1000)
      : null;

  return JSON.stringify({
    id: String(row.id),
    user_id: Number(row.user_id),
    workspace_id: row.workspace_id == null ? null : Number(row.workspace_id),
    project_id: row.project_id == null ? null : String(row.project_id),
    device_id: row.device_id == null ? null : String(row.device_id),
    start_time: startIso,
    end_time: endIso,
    status: String(row.status),
    idle_seconds: Number(row.idle_seconds) || 0,
    deducted_seconds: Number(row.deducted_seconds) || 0,
    duration_seconds: durationSeconds,
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
  });
}

/** Group by updated_at UTC date so each object stays in one Hive partition. */
function groupByUpdatedDate(rows) {
  const groups = new Map();
  for (const row of rows) {
    const dt = toIso(row.updated_at).slice(0, 10);
    if (!groups.has(dt)) groups.set(dt, []);
    groups.get(dt).push(row);
  }
  return groups;
}

let watermark = await readWatermark();
let totalExported = 0;
let filesWritten = 0;

for (;;) {
  const { rows } = await pool.query(
    `SELECT id, user_id, workspace_id, project_id, device_id,
            start_time, end_time, status, idle_seconds, deducted_seconds,
            created_at, updated_at
       FROM time_doctor.time_logs
      WHERE updated_at > $1::timestamptz
         OR (updated_at = $1::timestamptz AND id::text > $2)
      ORDER BY updated_at ASC, id ASC
      LIMIT $3`,
    [watermark.last_updated_at, watermark.last_id, BATCH_SIZE],
  );
  if (rows.length === 0) break;

  const runTs = Date.now();
  const groups = groupByUpdatedDate(rows);
  for (const [dt, groupRows] of groups) {
    const fromId = groupRows[0].id;
    const toId = groupRows[groupRows.length - 1].id;
    const key = `${prefix}/dt=${dt}/part-${runTs}-${fromId}-${toId}.ndjson`;
    const body = groupRows.map(rowToNdjsonLine).join('\n') + '\n';
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: 'application/x-ndjson',
      }),
    );
    filesWritten++;
  }

  totalExported += rows.length;
  const last = rows[rows.length - 1];
  watermark = {
    last_updated_at: toIso(last.updated_at),
    last_id: String(last.id),
  };
  await writeWatermark(watermark.last_updated_at, watermark.last_id);

  if (rows.length < BATCH_SIZE) break;
}

console.log(
  JSON.stringify({
    exported: totalExported,
    files_written: filesWritten,
    watermark,
  }),
);

await pool.end();
