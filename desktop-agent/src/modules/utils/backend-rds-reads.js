/**
 * Read time_doctor.* data via NestJS /sync/desktop-action (INTERNAL_API_KEY).
 */

const { normalizeTenantUserId } = require('./tenant-user-id');
const {
  isBackendTimeLogsEnabled,
  callDesktopAction,
  resolveSyncUrl,
} = require('./backend-time-logs');

function isBackendRdsEnabled(config = global.config) {
  return isBackendTimeLogsEnabled(config);
}

function requireTenantUserId(userId) {
  const normalized = normalizeTenantUserId(userId);
  if (!normalized) {
    throw new Error(
      `Invalid user_id for RDS reads (expected tenant.user integer, got: ${String(userId).slice(0, 64)})`,
    );
  }
  return normalized;
}

async function getTimeLogsInRange(userId, { start, end, beforeEnd } = {}, config = global.config) {
  const result = await callDesktopAction(
    'get_time_logs_in_range',
    {
      user_id: requireTenantUserId(userId),
      start,
      end,
      before_end: beforeEnd,
    },
    config,
  );
  return result.time_logs || [];
}

async function listAppLogs(userId, { start, end, limit } = {}, config = global.config) {
  const result = await callDesktopAction(
    'list_app_logs',
    {
      user_id: requireTenantUserId(userId),
      start,
      end,
      limit,
    },
    config,
  );
  return result.app_logs || [];
}

async function listUrlLogs(userId, { start, end, limit } = {}, config = global.config) {
  const result = await callDesktopAction(
    'list_url_logs',
    {
      user_id: requireTenantUserId(userId),
      start,
      end,
      limit,
    },
    config,
  );
  return result.url_logs || [];
}

async function listIdleLogs(userId, { start, end, timeLogId, id, limit } = {}, config = global.config) {
  const result = await callDesktopAction(
    'list_idle_logs',
    {
      user_id: requireTenantUserId(userId),
      start,
      end,
      time_log_id: timeLogId,
      id: id || undefined,
      limit,
    },
    config,
    { timeoutMs: 8_000 },
  );
  return result.idle_logs || [];
}

async function idleLogExists(userId, id, config = global.config) {
  if (!id) return false;
  const rows = await listIdleLogs(userId, { id, limit: 1 }, config);
  return rows.some((row) => String(row?.id) === String(id));
}

/**
 * Idle + low-activity seconds under the same rules Pulse uses for the web.
 * The agent applies min(total, idle + low) itself so the clock never depends
 * on this call.
 */
async function getEffectiveStats(
  userId,
  { start, end, tz, timeoutMs } = {},
  config = global.config,
) {
  // Display-only. Fail fast so a missing/slow endpoint cannot stall the clock
  // IPC (get-today-time-stats) or offline Start/Stop.
  const result = await callDesktopAction(
    'get_effective_stats',
    {
      user_id: requireTenantUserId(userId),
      start,
      end,
      tz,
    },
    config,
    { timeoutMs: Math.max(2000, Number(timeoutMs) || 8_000) },
  );
  const daily = {};
  const rawDaily = result.daily && typeof result.daily === 'object' ? result.daily : {};
  for (const [date, row] of Object.entries(rawDaily)) {
    const key = String(date).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !row || typeof row !== 'object') continue;
    daily[key] = {
      idleSeconds: Math.max(0, Math.floor(Number(row.idle_seconds ?? row.idleSeconds) || 0)),
      lowActivitySeconds: Math.max(
        0,
        Math.floor(Number(row.low_activity_seconds ?? row.lowActivitySeconds) || 0),
      ),
    };
  }
  return {
    idleSeconds: Math.max(0, Math.floor(Number(result.idle_seconds) || 0)),
    lowActivitySeconds: Math.max(0, Math.floor(Number(result.low_activity_seconds) || 0)),
    daily,
  };
}

/** Net leave / admin adjustments per work date. Keys are YYYY-MM-DD. */
async function getTimeAdjustmentsInRange(userId, { start, end } = {}, config = global.config) {
  const startDate = String(start || '').slice(0, 10);
  const endDate = String(end || start || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return {};
  }
  const result = await callDesktopAction(
    'get_time_adjustments',
    {
      user_id: requireTenantUserId(userId),
      start: startDate,
      end: endDate,
    },
    config,
    { timeoutMs: 8000 },
  );
  const byDate = {};
  for (const row of result.days || []) {
    const key = String(row?.work_date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue;
    const leaveSeconds = Math.trunc(Number(row.leave_seconds) || 0);
    const otherSeconds = Math.trunc(Number(row.other_seconds) || 0);
    byDate[key] = { otherSeconds, leaveSeconds };
  }
  return byDate;
}

module.exports = {
  isBackendRdsEnabled,
  resolveSyncUrl,
  getTimeLogsInRange,
  listAppLogs,
  listUrlLogs,
  listIdleLogs,
  idleLogExists,
  getEffectiveStats,
  getTimeAdjustmentsInRange,
};
