/**
 * Read time_doctor.* data via NestJS /sync/desktop-action (INTERNAL_API_KEY).
 * Avoids legacy Supabase public.* table queries (users, time_logs, etc.).
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

module.exports = {
  isBackendRdsEnabled,
  resolveSyncUrl,
  getTimeLogsInRange,
  listAppLogs,
  listUrlLogs,
};
