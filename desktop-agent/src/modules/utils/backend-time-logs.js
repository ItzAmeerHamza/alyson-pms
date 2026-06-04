/**
 * Time log CRUD via NestJS /sync/desktop-action → RDS.
 * Used when Cognito + INTERNAL_API_KEY are configured (Supabase JWT not required).
 */

function isBackendTimeLogsEnabled(config = global.config) {
  const url = config?.backend_api_url || process.env.BACKEND_API_URL;
  const key = config?.backend_api_key || process.env.INTERNAL_API_KEY;
  return Boolean(url && key);
}

function resolveSyncUrl(config = global.config) {
  const base =
    config?.backend_api_url ||
    process.env.BACKEND_API_URL ||
    'http://localhost:3000/sync/desktop-action';
  return base.includes('/sync/desktop-action')
    ? base
    : `${base.replace(/\/$/, '')}/sync/desktop-action`;
}

async function callDesktopAction(action, data, config = global.config) {
  const apiKey = config?.backend_api_key || process.env.INTERNAL_API_KEY;
  if (!apiKey) {
    throw new Error('Missing INTERNAL_API_KEY for backend time logs');
  }

  const response = await fetch(resolveSyncUrl(config), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({ action, data }),
  });

  let body = {};
  try {
    body = await response.json();
  } catch {
    body = {};
  }

  if (!response.ok) {
    throw new Error(body?.message || body?.error || `Backend sync failed (${response.status})`);
  }

  return body;
}

async function createTimeLog(payload, config = global.config) {
  const result = await callDesktopAction('create_time_log', { log: payload }, config);
  return result.time_log || result;
}

async function updateTimeLog(id, updates, config = global.config) {
  return callDesktopAction('update_time_log', { id, updates }, config);
}

async function closeActiveSessions(userId, deviceId = null, config = global.config) {
  return callDesktopAction(
    'close_active_sessions',
    { user_id: userId, device_id: deviceId },
    config,
  );
}

async function getTodayTimeLogs(userId, config = global.config) {
  const result = await callDesktopAction('get_today_time_logs', { user_id: userId }, config);
  return result.time_logs || [];
}

async function getActiveTimeLog(userId, deviceId = null, config = global.config) {
  const result = await callDesktopAction(
    'get_active_time_log',
    { user_id: userId, device_id: deviceId },
    config,
  );
  return result.time_log || null;
}

module.exports = {
  isBackendTimeLogsEnabled,
  callDesktopAction,
  createTimeLog,
  updateTimeLog,
  closeActiveSessions,
  getTodayTimeLogs,
  getActiveTimeLog,
};
