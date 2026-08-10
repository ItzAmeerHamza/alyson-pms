#!/usr/bin/env node
/**
 * Incrementally export time_doctor.time_log_events to S3 as NDJSON, Hive-partitioned
 * by event date, so an Iceberg table can be built on top and queried from Athena.
 *
 * Append-only source table (id is monotonic, rows are never updated) — the watermark
 * is just "highest id exported so far", stored as a small JSON object in S3 itself so
 * this script needs no new DB table or migration.
 *
 * Schedule: EventBridge rate(15 minutes) or cron "*\/15 * * * *"
 * Env: DATABASE_URL (or DATABASE_HOST + DATABASE_PASSWORD + DATABASE_NAME + DATABASE_USER),
 *      AWS_S3_SCREENSHOTS_BUCKET (or AWS_S3_BUCKET) — same bucket the app already uses,
 *      TRACKED_TIME_S3_PREFIX (default "tracked-time/time_log_events")
 */
import pg from 'pg';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

const { Pool } = pg;

const bucket = process.env.AWS_S3_SCREENSHOTS_BUCKET || process.env.AWS_S3_BUCKET;
const prefix = (process.env.TRACKED_TIME_S3_PREFIX || 'tracked-time/time_log_events').replace(/^\/+|\/+$/g, '');
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
    return Number.isFinite(parsed.last_id) ? parsed.last_id : 0;
  } catch (err) {
    if (err?.name === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404) return 0;
    throw err;
  }
}

async function writeWatermark(lastId) {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: watermarkKey,
      Body: JSON.stringify({ last_id: lastId, updated_at: new Date().toISOString() }),
      ContentType: 'application/json',
    }),
  );
}

function toIso(v) {
  return v instanceof Date ? v.toISOString() : v ?? null;
}

/** NDJSON line for one time_log_events row, timestamps normalized to ISO strings. */
function rowToNdjsonLine(row) {
  return JSON.stringify({
    id: row.id,
    created_at: toIso(row.created_at),
    user_id: row.user_id,
    time_log_id: row.time_log_id,
    workspace_id: row.workspace_id,
    action: row.action,
    source: row.source,
    device_id: row.device_id,
    agent_version: row.agent_version,
    request_id: row.request_id,
    old_start_time: toIso(row.old_start_time),
    old_end_time: toIso(row.old_end_time),
    old_status: row.old_status,
    old_idle_seconds: row.old_idle_seconds,
    old_deducted_seconds: row.old_deducted_seconds,
    new_start_time: toIso(row.new_start_time),
    new_end_time: toIso(row.new_end_time),
    new_status: row.new_status,
    new_idle_seconds: row.new_idle_seconds,
    new_deducted_seconds: row.new_deducted_seconds,
    duration_delta_seconds: row.duration_delta_seconds,
    shortened: row.shortened,
    meta: row.meta,
  });
}

/** Group rows by their created_at (UTC) date so each S3 object stays inside one partition. */
function groupByDate(rows) {
  const groups = new Map();
  for (const row of rows) {
    const dt = toIso(row.created_at).slice(0, 10);
    if (!groups.has(dt)) groups.set(dt, []);
    groups.get(dt).push(row);
  }
  return groups;
}

let fromId = await readWatermark();
let totalExported = 0;
let filesWritten = 0;
let maxIdSeen = fromId;

for (;;) {
  const { rows } = await pool.query(
    `SELECT * FROM time_doctor.time_log_events WHERE id > $1 ORDER BY id ASC LIMIT $2`,
    [fromId, BATCH_SIZE],
  );
  if (rows.length === 0) break;

  const runTs = Date.now();
  const groups = groupByDate(rows);
  for (const [dt, groupRows] of groups) {
    const fromIdInGroup = groupRows[0].id;
    const toIdInGroup = groupRows[groupRows.length - 1].id;
    // .ndjson (not .json) so Glue/Athena treat these as newline-delimited JSON.
    // Exclude `_state/` from the Athena table LOCATION (watermark only).
    const key = `${prefix}/dt=${dt}/part-${runTs}-${fromIdInGroup}-${toIdInGroup}.ndjson`;
    const body = groupRows.map(rowToNdjsonLine).join('\n') + '\n';
    await s3.send(
      new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: 'application/x-ndjson' }),
    );
    filesWritten++;
  }

  totalExported += rows.length;
  maxIdSeen = rows[rows.length - 1].id;
  fromId = maxIdSeen;

  // Persist progress after every batch so a mid-run failure doesn't re-export what's already landed.
  await writeWatermark(maxIdSeen);

  if (rows.length < BATCH_SIZE) break;
}

console.log(
  JSON.stringify({
    exported: totalExported,
    files_written: filesWritten,
    watermark: maxIdSeen,
  }),
);
await pool.end();
