/**
 * Write one idle stretch. The client owns the id; a timeout is not a failed
 * insert — check whether that id already landed before queueing a retry.
 */

const IDLE_UPSERT_TIMEOUT_MS = 20_000;

async function persistIdleLog(log, config, deps = {}) {
  const backendTimeLogs = require('./backend-time-logs');
  const {
    upsertIdleLog = backendTimeLogs.upsertIdleLog,
    isBackendTimeLogsEnabled = backendTimeLogs.isBackendTimeLogsEnabled,
    idleLogExists = require('./backend-rds-reads').idleLogExists,
  } = deps;

  if (!isBackendTimeLogsEnabled(config)) {
    throw new Error('Backend not configured for idle logs');
  }

  const {
    idleLogIdempotencyUuid,
    isIdleWriteTimeout,
    isMissingTimeLogFkError,
  } = require('./idle-log-period-key');

  const canonicalId = idleLogIdempotencyUuid(log);
  const payload = {
    ...log,
    id: canonicalId || log.id,
  };

  const write = (body) => upsertIdleLog(body, config, { timeoutMs: IDLE_UPSERT_TIMEOUT_MS });

  try {
    await write(payload);
    return { status: 'written', log: payload };
  } catch (firstError) {
    if (isMissingTimeLogFkError(firstError) && payload.time_log_id) {
      const withoutFk = { ...payload, time_log_id: null };
      try {
        await write(withoutFk);
        return { status: 'written', log: withoutFk, strippedTimeLogId: true };
      } catch (fkRetryErr) {
        return recoverAfterWriteError(fkRetryErr, withoutFk, idleLogExists, config);
      }
    }
    return recoverAfterWriteError(firstError, payload, idleLogExists, config);
  }
}

async function recoverAfterWriteError(err, log, idleLogExists, config) {
  const { isIdleWriteTimeout } = require('./idle-log-period-key');
  if (isIdleWriteTimeout(err) && log.id && log.user_id) {
    try {
      if (await idleLogExists(log.user_id, log.id, config)) {
        return { status: 'already_written', log };
      }
    } catch (_) {
      // Existence unknown — fall through to queue the same id, not a new one.
    }
  }
  return { status: 'queue', log, error: err };
}

/**
 * Offline flusher: one persist per idempotency key. A 15s loop must not push
 * nine copies of the same stretch.
 */
async function flushIdleLogQueue(queue, config, persist = persistIdleLog) {
  if (!queue?.idleLogs?.length) return { flushed: 0, requeued: 0 };
  const { uniqueIdleLogs, enqueueIdleLogOnce } = require('./idle-log-period-key');
  const pending = uniqueIdleLogs(queue.idleLogs);
  queue.idleLogs = [];
  let flushed = 0;
  let requeued = 0;
  for (const item of pending) {
    const { attempts, queuedAt, duration_minutes, ...log } = item;
    try {
      const result = await persist(log, config);
      if (result.status === 'queue') {
        enqueueIdleLogOnce(queue, {
          ...result.log,
          attempts: (attempts || 0) + 1,
        });
        requeued += 1;
      } else {
        flushed += 1;
      }
    } catch (error) {
      enqueueIdleLogOnce(queue, {
        ...item,
        attempts: (attempts || 0) + 1,
      });
      requeued += 1;
    }
  }
  return { flushed, requeued };
}

module.exports = { persistIdleLog, flushIdleLogQueue, IDLE_UPSERT_TIMEOUT_MS };
