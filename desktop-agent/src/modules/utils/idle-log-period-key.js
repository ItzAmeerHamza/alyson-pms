const crypto = require('crypto');

function unwrapIdleLog(log) {
  if (log && typeof log === 'object' && log.log && typeof log.log === 'object') {
    return { ...log.log, ...log };
  }
  return log && typeof log === 'object' ? log : {};
}

/**
 * Stable UUID for one idle episode. Same user + idle_start → same id, even when
 * idle_end grows (checkpoint, then resume). Hashing the end minted a new row
 * per slice; Pulse then dropped every piece under five minutes.
 * UUID v5 layout from SHA-1.
 */
function idleLogIdempotencyUuid({ user_id, idle_start } = {}) {
  const user = String(user_id ?? '');
  const start = String(idle_start || '');
  if (!user || !start) return '';
  const hash = crypto.createHash('sha1').update(`${user}|${start}`).digest();
  const b = Buffer.from(hash.subarray(0, 16));
  b[6] = (b[6] & 0x0f) | 0x50;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = b.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function idleLogIdempotencyKey(log) {
  const nested = unwrapIdleLog(log);
  const fromStart = idleLogIdempotencyUuid(nested);
  if (fromStart) return fromStart;
  const id = nested.id || nested.idempotency_key;
  if (id) return String(id);
  return '';
}

function idleLogPeriodKey(log) {
  return idleLogIdempotencyKey(log);
}

function isIdleWriteTimeout(err) {
  if (!err) return false;
  if (err.name === 'AbortError') return true;
  const msg = String(err.message || err || '');
  return /timeout|AbortError/i.test(msg);
}

function isMissingTimeLogFkError(err) {
  const msg = String(err?.message || err || '');
  const code = String(err?.code || err?.reason || '');
  return (
    code === '23503' ||
    code === 'unknown_time_log' ||
    /unknown_time_log|idle_logs_time_log_id_fkey|23503/i.test(msg) ||
    (/foreign key/i.test(msg) && /time_log/i.test(msg))
  );
}

function idleDurationSeconds(log) {
  const nested = unwrapIdleLog(log);
  const stated = Math.max(0, Math.floor(Number(nested.duration_seconds) || 0));
  const start = Date.parse(nested.idle_start);
  const end = Date.parse(nested.idle_end);
  const fromRange =
    Number.isFinite(start) && Number.isFinite(end) && end > start
      ? Math.round((end - start) / 1000)
      : 0;
  return Math.max(stated, fromRange);
}

function enqueueIdleLogOnce(queue, idleData) {
  if (!queue || !idleData) return false;
  const key = idleLogIdempotencyKey(idleData);
  if (!key) return false;
  if (!Array.isArray(queue.idleLogs)) queue.idleLogs = [];
  const incoming = {
    ...idleData,
    id: idleData.id || key,
    queuedAt: idleData.queuedAt || new Date().toISOString(),
    attempts: Number.isFinite(Number(idleData.attempts)) ? Number(idleData.attempts) : 0,
  };
  const idx = queue.idleLogs.findIndex((item) => idleLogIdempotencyKey(item) === key);
  if (idx >= 0) {
    if (idleDurationSeconds(incoming) > idleDurationSeconds(queue.idleLogs[idx])) {
      queue.idleLogs[idx] = {
        ...queue.idleLogs[idx],
        ...incoming,
        queuedAt: queue.idleLogs[idx].queuedAt || incoming.queuedAt,
      };
    }
    return false;
  }
  queue.idleLogs.push(incoming);
  return true;
}

function uniqueIdleLogs(items) {
  const byKey = new Map();
  const noKey = [];
  for (const item of items || []) {
    const key = idleLogIdempotencyKey(item);
    if (!key) {
      noKey.push(item);
      continue;
    }
    const prev = byKey.get(key);
    if (!prev || idleDurationSeconds(item) >= idleDurationSeconds(prev)) {
      byKey.set(key, item);
    }
  }
  return [...byKey.values(), ...noKey];
}

module.exports = {
  idleLogIdempotencyUuid,
  idleLogIdempotencyKey,
  idleLogPeriodKey,
  idleDurationSeconds,
  isIdleWriteTimeout,
  isMissingTimeLogFkError,
  enqueueIdleLogOnce,
  uniqueIdleLogs,
};
