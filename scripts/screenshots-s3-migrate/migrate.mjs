/**
 * Migrate Supabase Storage screenshots → S3 with AVIF/WebP compression.
 * See README.md for env vars and usage.
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const out = {
    dryRun: false,
    limit: null,
    batchSize: 150,
    skipExisting: false,
    startOffset: 0,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--skip-existing') out.skipExisting = true;
    else if (a === '--limit') out.limit = Number(argv[++i] || 0) || null;
    else if (a === '--batch-size') out.batchSize = Math.max(1, Number(argv[++i] || 150));
    else if (a === '--start-offset') out.startOffset = Math.max(0, Number(argv[++i] || 0));
  }
  return out;
}

function loadEnv() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const region = process.env.AWS_REGION || 'us-east-1';
  const bucket = process.env.S3_BUCKET || 'alyson-pm';
  const prefix = (process.env.S3_PREFIX || 'alyson-td-screenshots').replace(/^\/+|\/+$/g, '');
  const since = process.env.SINCE || null;
  const until = process.env.UNTIL || null;
  const auditMode = (process.env.AUDIT_LOSSLESS_MODE || 'never').toLowerCase();
  const auditIdsFile = process.env.AUDIT_LOSSLESS_IDS_FILE || null;
  const distractionMin = Number(process.env.AUDIT_DISTRACTION_MIN || 75);

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  if (!accessKeyId || !secretAccessKey) {
    throw new Error('Missing AWS_ACCESS_KEY_ID or AWS_SECRET_ACCESS_KEY');
  }

  return {
    supabaseUrl,
    supabaseKey,
    s3: new S3Client({ region, credentials: { accessKeyId, secretAccessKey } }),
    bucket,
    prefix,
    since,
    until,
    auditMode,
    auditIdsFile: auditIdsFile ? resolve(__dirname, auditIdsFile) : null,
    distractionMin,
  };
}

function loadAuditIdSet(filePath) {
  if (!filePath || !existsSync(filePath)) return new Set();
  const text = readFileSync(filePath, 'utf8');
  const set = new Set();
  for (const line of text.split(/\r?\n/)) {
    const id = line.trim();
    if (/^[0-9a-f-]{36}$/i.test(id)) set.add(id.toLowerCase());
  }
  return set;
}

function isAuditLossless(row, env, auditIdSet) {
  switch (env.auditMode) {
    case 'file':
      return auditIdSet.has(String(row.id).toLowerCase());
    case 'db_privacy': {
      const v = row.vision_privacy_concerns;
      if (v == null) return false;
      if (typeof v === 'object') return Object.keys(v).length > 0 || (Array.isArray(v) && v.length > 0);
      const s = String(v);
      return s.length > 2 && s !== '[]' && s !== '{}';
    }
    case 'db_distraction': {
      const d = row.distraction_score;
      return typeof d === 'number' && d >= env.distractionMin;
    }
    case 'never':
    default:
      return false;
  }
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function buildS3Key({ prefix, capturedAt, organizationId, userId, screenshotId, ext }) {
  const d = new Date(capturedAt);
  const y = d.getUTCFullYear();
  const m = pad2(d.getUTCMonth() + 1);
  const day = pad2(d.getUTCDate());
  const orgSeg = organizationId ? String(organizationId) : 'none';
  return `${prefix}/${y}/${m}/${day}/organization_${orgSeg}/user_${userId}/${screenshotId}.${ext}`;
}

/**
 * Primary: AVIF lossy q≈42 (40–45). Fallback: WebP lossy q≈78 (75–80).
 * Audit: WebP lossless vs AVIF lossless — smaller upload wins.
 */
async function transcodeForArchive(buffer, auditLossless) {
  const base = sharp(buffer, { failOn: 'none' }).rotate();

  if (auditLossless) {
    let webpLossless = null;
    let avifLossless = null;
    try {
      webpLossless = await base.clone().webp({ lossless: true, effort: 6 }).toBuffer();
    } catch {
      /* ignore */
    }
    try {
      avifLossless = await base.clone().avif({ lossless: true, effort: 4 }).toBuffer();
    } catch {
      /* ignore */
    }
    if (webpLossless && avifLossless) {
      if (avifLossless.length <= webpLossless.length) {
        return { body: avifLossless, contentType: 'image/avif', ext: 'avif', tier: 'audit-avif-lossless' };
      }
      return { body: webpLossless, contentType: 'image/webp', ext: 'webp', tier: 'audit-webp-lossless' };
    }
    if (avifLossless) {
      return { body: avifLossless, contentType: 'image/avif', ext: 'avif', tier: 'audit-avif-lossless' };
    }
    if (webpLossless) {
      return { body: webpLossless, contentType: 'image/webp', ext: 'webp', tier: 'audit-webp-lossless' };
    }
    throw new Error('Lossless transcode failed (WebP and AVIF)');
  }

  try {
    const avif = await base.clone().avif({ quality: 42, effort: 4 }).toBuffer();
    if (avif && avif.length > 0) {
      return { body: avif, contentType: 'image/avif', ext: 'avif', tier: 'avif-lossy-42' };
    }
  } catch {
    /* AVIF unavailable or unsupported input — fall back */
  }

  const webp = await base.webp({ quality: 78, effort: 4 }).toBuffer();
  return { body: webp, contentType: 'image/webp', ext: 'webp', tier: 'webp-lossy-78' };
}

async function downloadOriginal(supabase, row) {
  const path = row.file_path;
  if (path) {
    const { data, error } = await supabase.storage.from('screenshots').download(path);
    if (!error && data) {
      const buf = Buffer.from(await data.arrayBuffer());
      if (buf.length > 0) return buf;
    }
  }
  if (row.image_url && String(row.image_url).startsWith('http')) {
    const res = await fetch(row.image_url);
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching image_url`);
    const arr = new Uint8Array(await res.arrayBuffer());
    return Buffer.from(arr);
  }
  throw new Error('No file_path download and no usable image_url');
}

async function existsOnS3(client, bucket, key) {
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (e) {
    if (e?.$metadata?.httpStatusCode === 404 || e?.name === 'NotFound') return false;
    throw e;
  }
}

async function run() {
  const args = parseArgs(process.argv);
  const env = loadEnv();
  const supabase = createClient(env.supabaseUrl, env.supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const auditIdSet =
    env.auditMode === 'file' ? loadAuditIdSet(env.auditIdsFile) : new Set();
  if (env.auditMode === 'file' && auditIdSet.size === 0) {
    console.warn('[warn] AUDIT_LOSSLESS_MODE=file but no UUIDs loaded; check AUDIT_LOSSLESS_IDS_FILE');
  }

  let cursor = args.startOffset;
  let processed = 0;
  let uploaded = 0;
  let skipped = 0;
  let failed = 0;
  let stoppedByLimit = false;

  const selectCols =
    'id, user_id, file_path, image_url, captured_at, organization_id, vision_privacy_concerns, distraction_score';

  console.log(
    JSON.stringify(
      {
        dryRun: args.dryRun,
        bucket: env.bucket,
        prefix: env.prefix,
        batchSize: args.batchSize,
        startOffset: cursor,
        since: env.since,
        until: env.until,
        auditMode: env.auditMode,
        skipExisting: args.skipExisting,
      },
      null,
      2,
    ),
  );

  outer: while (true) {
    if (args.limit != null && processed >= args.limit) break;

    const batchStart = cursor;
    const rangeEnd = cursor + args.batchSize - 1;
    let q = supabase
      .from('screenshots')
      .select(selectCols)
      .order('captured_at', { ascending: true })
      .order('id', { ascending: true })
      .range(cursor, rangeEnd);

    if (env.since) q = q.gte('captured_at', env.since);
    if (env.until) q = q.lte('captured_at', env.until);

    const { data: rows, error } = await q;
    if (error) throw error;
    if (!rows?.length) {
      console.log('[done] no more rows');
      break;
    }

    let indexInBatch = 0;
    for (const row of rows) {
      if (args.limit != null && processed >= args.limit) {
        cursor = batchStart + indexInBatch;
        stoppedByLimit = true;
        break outer;
      }

      const audit = isAuditLossless(row, env, auditIdSet);
      const keyBase = {
        prefix: env.prefix,
        capturedAt: row.captured_at,
        organizationId: row.organization_id,
        userId: row.user_id,
        screenshotId: row.id,
      };

      try {
        const raw = await downloadOriginal(supabase, row);
        const out = await transcodeForArchive(raw, audit);
        const key = buildS3Key({ ...keyBase, ext: out.ext });

        if (args.skipExisting && !args.dryRun) {
          const exists = await existsOnS3(env.s3, env.bucket, key);
          if (exists) {
            skipped++;
            processed++;
            indexInBatch++;
            console.log('[skip-existing]', key);
            continue;
          }
        }

        if (args.dryRun) {
          console.log('[dry-run]', { key, tier: out.tier, bytes: out.body.length, audit });
          uploaded++;
        } else {
          await env.s3.send(
            new PutObjectCommand({
              Bucket: env.bucket,
              Key: key,
              Body: out.body,
              ContentType: out.contentType,
                Metadata: {
                  'source-screenshot-id': String(row.id).replace(/[^a-z0-9-]/gi, ''),
                  'source-user-id': String(row.user_id).replace(/[^a-z0-9-]/gi, ''),
                  'captured-at-utc': String(row.captured_at).replace(/[^\w.+-]/g, '_'),
                  'compression-tier': String(out.tier).replace(/[^\w.-]/g, '_'),
                  'audit-lossless': audit ? 'true' : 'false',
                },
            }),
          );
          uploaded++;
          console.log('[upload]', key, out.tier, out.body.length);
        }
      } catch (e) {
        failed++;
        console.error('[fail]', row.id, e?.message || e);
      }
      processed++;
      indexInBatch++;
    }

    cursor = batchStart + rows.length;
    if (rows.length < args.batchSize) break;
  }

  console.log(
    JSON.stringify(
      { processed, uploaded, skipped, failed, finalCursor: cursor, stoppedByLimit },
      null,
      2,
    ),
  );
  if (failed > 0) process.exitCode = 1;
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
