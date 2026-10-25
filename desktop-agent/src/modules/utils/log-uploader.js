/**
 * Ships the local diagnostic JSONL log file to S3 (via a presigned PUT from the backend)
 * so issues can be traced per-user without asking someone to grab devtools output.
 *
 * Cadence:
 *  - every 30 minutes: upload today's (partial) JSONL
 *  - on UTC day roll: upload yesterday
 *  - on app quit: best-effort upload of today
 *
 * Never blocks tracking — every failure here is caught and logged, never thrown.
 */

const { createFeatureLogger, logFile } = require('./logger');
const { getDeviceId } = require('./device-id');

const log = createFeatureLogger('LOG_UPLOAD');

const ROTATION_CHECK_MS = 15 * 60 * 1000; // day-roll check
const PERIODIC_UPLOAD_MS = 30 * 60 * 1000; // mid-day ship of today's JSONL
let rotationTimer = null;
let periodicTimer = null;
let lastSeenDate = todayDateStr();
const uploadedDates = new Set();
let lastTodayUploadAt = 0;
// Size of each date's file at its last upload — skip re-sending an unchanged file.
const uploadedSizes = new Map();
// Never pull a runaway file into memory (one day once reached 4 GB).
const MAX_UPLOAD_BYTES = 80 * 1024 * 1024;
// Bound the S3 PUT so a half-open socket (e.g. after wake) can't pin up to 80 MB forever.
const PUT_TIMEOUT_MS = 5 * 60 * 1000;
// Serialize uploads: periodic / day-roll / shutdown runs never overlap (each holds
// a full copy of the file in memory). Periodic runs skip while one is pending;
// forced runs (day roll, startup catch-up, shutdown) queue behind it.
let uploadChain = null;

function fileSize(p) {
  try {
    const fs = require('fs');
    return p && fs.existsSync(p) ? fs.statSync(p).size : 0;
  } catch (_) {
    return 0;
  }
}

function todayDateStr() {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayDateStr(fromDateStr) {
  const d = new Date(`${fromDateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Cheap stat-only equivalent of `readLogFile(dateStr) !== null` (no file read).
 */
function hasUploadableLogFile(dateStr) {
  try {
    const fs = require('fs');
    const jsonlPath = typeof logFile.jsonlPathFor === 'function' ? logFile.jsonlPathFor(dateStr) : null;
    if (jsonlPath && fs.existsSync(jsonlPath)) {
      const size = fileSize(jsonlPath);
      if (size > MAX_UPLOAD_BYTES) return false;
      if (size > 0) return true;
    }
    const filePath = logFile.pathFor(dateStr);
    if (!filePath || !fs.existsSync(filePath)) return false;
    const size = fileSize(filePath);
    return size > 0 && size <= MAX_UPLOAD_BYTES;
  } catch (_) {
    return false;
  }
}

/** Prefer JSONL (Athena); fall back to legacy .log text if JSONL missing. */
async function readLogFile(dateStr) {
  try {
    const fs = require('fs');
    const jsonlPath = typeof logFile.jsonlPathFor === 'function' ? logFile.jsonlPathFor(dateStr) : null;
    if (jsonlPath && fs.existsSync(jsonlPath)) {
      if (fileSize(jsonlPath) > MAX_UPLOAD_BYTES) {
        log.warn({ step: 'TOO_LARGE', ctx: { date: dateStr, bytes: fileSize(jsonlPath) } });
        return null;
      }
      const content = await fs.promises.readFile(jsonlPath, 'utf8');
      if (content && content.length > 0) {
        return { content, contentType: 'application/x-ndjson', format: 'jsonl' };
      }
    }
    const filePath = logFile.pathFor(dateStr);
    if (!filePath || !fs.existsSync(filePath)) return null;
    if (fileSize(filePath) > MAX_UPLOAD_BYTES) return null;
    const content = await fs.promises.readFile(filePath, 'utf8');
    if (!content || content.length === 0) return null;
    // Wrap legacy free-text as a single JSONL message so Athena still ingests it.
    const wrapped =
      JSON.stringify({
        ts: new Date().toISOString(),
        level: 'info',
        message: content,
        category: 'legacy_text_log',
        log_date: dateStr,
      }) + '\n';
    return { content: wrapped, contentType: 'application/x-ndjson', format: 'legacy-wrapped' };
  } catch (err) {
    log.warn({ step: 'READ_FAILED', message: err?.message || String(err) });
    return null;
  }
}

/** Upload the log file for a given date. Returns true on success. */
function uploadLogFile(dateStr, opts = {}) {
  const force = !!(opts && opts.force);
  if (uploadChain && !force) return Promise.resolve(false); // periodic: one already running
  const prev = uploadChain || Promise.resolve();
  const run = prev.catch(() => {}).then(() => uploadLogFileNow(dateStr, { force }));
  const tracked = run.finally(() => {
    if (uploadChain === tracked) uploadChain = null;
  });
  uploadChain = tracked;
  return run;
}

async function uploadLogFileNow(dateStr, { force = false } = {}) {
  try {
    const backendTimeLogs = require('./backend-time-logs');
    if (!backendTimeLogs.isBackendTimeLogsEnabled()) return false;

    const userId = global.currentUserId || global.config?.user_id;
    if (!userId) return false;

    // Avoid hammering S3 with identical today uploads more than once per period
    // unless force (shutdown / day roll).
    if (!force && dateStr === todayDateStr()) {
      const age = Date.now() - lastTodayUploadAt;
      if (lastTodayUploadAt > 0 && age < PERIODIC_UPLOAD_MS - 5_000) {
        return false;
      }
    }

    logFile.flush();
    const sizeNow = fileSize(logFile.jsonlPathFor?.(dateStr)) || fileSize(logFile.pathFor(dateStr));
    if (sizeNow > 0 && uploadedSizes.get(dateStr) === sizeNow) return false; // nothing new
    const payload = await readLogFile(dateStr);
    if (!payload) return false;

    const { upload_url: uploadUrl, s3_key: s3Key } = await backendTimeLogs.getLogUploadUrl({
      user_id: userId,
      device_id: getDeviceId(),
      agent_version: global.config?.version || global.appVersion || null,
      log_date: dateStr,
      organization_id: global.currentOrganizationId || global.config?.organization_id || null,
    });
    if (!uploadUrl) return false;

    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const abortTimer = controller ? setTimeout(() => controller.abort(), PUT_TIMEOUT_MS) : null;
    try {
      const response = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': payload.contentType || 'application/x-ndjson' },
        body: payload.content,
        ...(controller ? { signal: controller.signal } : {}),
      });
      if (!response.ok) {
        throw new Error(`S3 PUT failed (${response.status})`);
      }
    } finally {
      if (abortTimer) clearTimeout(abortTimer);
    }

    uploadedDates.add(dateStr);
    uploadedSizes.set(dateStr, sizeNow);
    if (dateStr === todayDateStr()) lastTodayUploadAt = Date.now();
    log.info({
      step: 'UPLOADED',
      ctx: {
        date: dateStr,
        bytes: payload.content.length,
        format: payload.format,
        s3_key: s3Key || null,
      },
    });
    return true;
  } catch (err) {
    log.warn({ step: 'UPLOAD_FAILED', message: err?.message || String(err), ctx: { date: dateStr } });
    return false;
  }
}

/** Called on an interval: if the calendar day has rolled over, ship yesterday's file. */
async function checkRotation() {
  const today = todayDateStr();
  if (today === lastSeenDate) return;

  const rolledFrom = lastSeenDate;
  lastSeenDate = today;

  await uploadLogFile(rolledFrom, { force: true });
}

async function uploadTodayPeriodic() {
  await uploadLogFile(todayDateStr(), { force: false });
}

function startLogUploadSchedule() {
  if (rotationTimer) return;
  lastSeenDate = todayDateStr();
  rotationTimer = setInterval(() => {
    void checkRotation();
  }, ROTATION_CHECK_MS);
  if (rotationTimer.unref) rotationTimer.unref();

  periodicTimer = setInterval(() => {
    void uploadTodayPeriodic();
  }, PERIODIC_UPLOAD_MS);
  if (periodicTimer.unref) periodicTimer.unref();

  // Catch up on a file from a previous run that never got uploaded.
  const missed = yesterdayDateStr(lastSeenDate);
  if (hasUploadableLogFile(missed)) {
    void uploadLogFile(missed, { force: true });
  }

  // First mid-day ship shortly after startup (don't wait a full 30m).
  setTimeout(() => {
    void uploadTodayPeriodic();
  }, 60_000).unref?.();

  log.info({ step: 'SCHEDULE_STARTED', ctx: { periodic_ms: PERIODIC_UPLOAD_MS } });
}

/** Best-effort upload of today's (partial) log — call from the app-quit path. */
async function uploadTodayLogOnShutdown() {
  return uploadLogFile(todayDateStr(), { force: true });
}

module.exports = {
  startLogUploadSchedule,
  uploadTodayLogOnShutdown,
  uploadLogFile,
};
