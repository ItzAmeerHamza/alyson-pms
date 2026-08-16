/**
 * Session lifecycle audit trail.
 *
 * Every line lands in the diagnostic JSONL that ships to S3, so a session can be
 * reconstructed later without the machine that produced it.
 *
 * These fields exist because reverse-engineering the Aug 14 over-counting needed
 * all of them and none were recorded — each had to be inferred by correlating
 * database rows, trigger events and raw log timestamps:
 *
 *   end_source        Where an end_time came from — a click, a checkpoint, the
 *                     server's liveness, or wall-clock. Distinguishing a genuine
 *                     offline recovery from a fabricated end took timestamp
 *                     archaeology; this makes it a field.
 *   reason            Why a session ended. `status` has four values and none of
 *                     them separate a user pressing Stop from a sleep, a crash,
 *                     or a server sweep.
 *   prior_open        Whether another session was still open. Overlapping
 *                     sessions were only detectable afterwards, in SQL.
 *   offline           Offline paths skip guards, so this conditions everything.
 *   agent_version     Which build wrote the row. Attributing damage to a version
 *                     required matching timestamps against update events.
 *   requested vs stored
 *                     What the client asked for against what came back. The
 *                     database trigger only records the stored value, so a
 *                     clamped or rejected write is invisible from the row alone.
 *
 * Emitted at low volume — a handful of lines per session — so full context is
 * affordable on every one.
 */

const { logger } = require('./logger');

const CATEGORY = 'SESSION_AUDIT';

function baseContext(extra = {}) {
  let deviceId = null;
  try {
    deviceId = require('./device-id').getDeviceId();
  } catch (_) { /* device id is best-effort */ }

  let offline = null;
  try {
    offline = require('./backend-time-logs').isLikelyOffline();
  } catch (_) { /* offline hint is best-effort */ }

  return {
    user_id: global.currentUserId || global.config?.user_id || null,
    device_id: deviceId,
    agent_version: global.appVersion || global.config?.version || null,
    offline,
    is_tracking: !!(global.isTracking || global.trackingManager?.isTracking),
    is_stopping: !!(global.isStopping || global._isStoppingTracking),
    ...extra,
  };
}

/** A session row was created. `trigger` is what asked for it (user, resume, recovery). */
function sessionCreated({ timeLogId, startTime, trigger, priorOpenId = null, queued = false }) {
  logger.info({
    category: CATEGORY,
    step: 'SESSION_CREATED',
    message: `Session ${timeLogId} started (${trigger})`,
    ctx: baseContext({
      time_log_id: timeLogId,
      start_time: startTime,
      trigger,
      // Non-null means a session was still open when this one began — the exact
      // condition that produces double-billed overlap.
      prior_open_id: priorOpenId,
      queued_offline: queued,
    }),
  });
}

/**
 * A session was closed. `endSource` is the provenance of end_time, which is the
 * single most useful field when deciding whether a duration is trustworthy.
 */
function sessionClosed({
  timeLogId,
  startTime,
  requestedEnd,
  storedEnd = null,
  endSource,
  reason,
  idleSeconds = null,
  synced = null,
}) {
  const drift =
    requestedEnd && storedEnd
      ? Math.round((new Date(storedEnd).getTime() - new Date(requestedEnd).getTime()) / 1000)
      : null;

  logger.info({
    category: CATEGORY,
    step: 'SESSION_CLOSED',
    message: `Session ${timeLogId} closed (${reason}, end from ${endSource})`,
    ctx: baseContext({
      time_log_id: timeLogId,
      start_time: startTime,
      requested_end: requestedEnd,
      stored_end: storedEnd,
      // Non-zero means the server did not accept the requested end — it was
      // clamped to proof-of-life or floored. Invisible from the row itself.
      stored_minus_requested_seconds: drift,
      end_source: endSource,
      reason,
      idle_seconds: idleSeconds,
      synced,
    }),
  });
}

/**
 * An overlap was prevented. Worth its own event: it is the only record that the
 * bug would have occurred, and its absence over time is the evidence a fix held.
 */
function overlapPrevented({ where, keptId, closedId, clampedTo, detail = null }) {
  logger.warn({
    category: CATEGORY,
    step: 'OVERLAP_PREVENTED',
    message: `Overlap prevented at ${where}: ${closedId} closed at ${clampedTo}`,
    ctx: baseContext({
      where,
      kept_id: keptId,
      closed_id: closedId,
      clamped_to: clampedTo,
      detail,
    }),
  });
}

/** A start had to wait on an in-flight stop, and how that resolved. */
function startBlockedByStop({ waitedMs, resolved }) {
  logger.warn({
    category: CATEGORY,
    step: 'START_WAITED_FOR_STOP',
    message: resolved
      ? `Start waited ${waitedMs}ms for prior stop to finish`
      : `Prior stop still unfinished after ${waitedMs}ms — forcing cleanup`,
    ctx: baseContext({ waited_ms: waitedMs, stop_resolved: resolved }),
  });
}

module.exports = {
  SESSION_AUDIT_CATEGORY: CATEGORY,
  sessionCreated,
  sessionClosed,
  overlapPrevented,
  startBlockedByStop,
};
