/**
 * Time log CRUD via NestJS /sync/desktop-action → RDS.
 * Used when Cognito + INTERNAL_API_KEY are configured (Supabase JWT not required).
 */

const { normalizeTenantUserId } = require('./tenant-user-id');

function requireTenantUserId(userId) {
  const normalized = normalizeTenantUserId(userId);
  if (!normalized) {
    throw new Error(
      `Invalid user_id for backend sync (expected integer tenant.user id, got: ${String(userId).slice(0, 64)})`,
    );
  }
  return normalized;
}

function resolveBackendCredentials(config = global.config) {
  const url =
    config?.backend_api_url ||
    config?.BACKEND_API_URL ||
    process.env.BACKEND_API_URL ||
    '';
  const key =
    config?.backend_api_key ||
    config?.INTERNAL_API_KEY ||
    process.env.INTERNAL_API_KEY ||
    '';
  return { url: String(url || '').trim(), key: String(key || '').trim() };
}

function isBackendTimeLogsEnabled(config = global.config) {
  const { url, key } = resolveBackendCredentials(config);
  return Boolean(url && key);
}

function resolveSyncUrl(config = global.config) {
  const { url } = resolveBackendCredentials(config);
  const base = url || 'http://localhost:3000/sync/desktop-action';
  return base.includes('/sync/desktop-action')
    ? base
    : `${base.replace(/\/$/, '')}/sync/desktop-action`;
}

async function callDesktopAction(action, data, config = global.config) {
  const { key } = resolveBackendCredentials(config);
  if (!key) {
    throw new Error('Missing INTERNAL_API_KEY for backend time logs');
  }

  const response = await fetch(resolveSyncUrl(config), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
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

async function closeActiveSessions(userId, deviceId = null, config = global.config, options = {}) {
  return callDesktopAction(
    'close_active_sessions',
    {
      user_id: requireTenantUserId(userId),
      device_id: deviceId,
      // Without end_time → inspect/flag only (does not mutate time_logs).
      end_time: options.end_time || null,
      confirm_with_local_checkpoint: options.confirm_with_local_checkpoint === true,
      admin_confirmed: options.admin_confirmed === true,
      allow_unconfirmed_end: options.allow_unconfirmed_end === true,
      prefer_recover: options.prefer_recover === true,
      client_last_seen_at: options.client_last_seen_at || null,
      freshness_minutes: options.freshness_minutes || 15,
    },
    config,
  );
}

/**
 * Inspect open sessions: recover if fresh, flag if stale.
 * Does NOT auto-close from heartbeat.
 */
async function reconcileOpenSessions(userId, deviceId = null, config = global.config, options = {}) {
  return callDesktopAction(
    'inspect_open_sessions',
    {
      user_id: requireTenantUserId(userId),
      device_id: deviceId,
      prefer_recover: options.prefer_recover !== false,
      client_last_seen_at: options.client_last_seen_at || null,
      freshness_minutes: options.freshness_minutes || 15,
      flag_stale: options.flag_stale !== false,
    },
    config,
  );
}

/**
 * Confirmed close using local durable checkpoint (or admin). Never heartbeat-alone.
 */
async function confirmStaleSessionClose(payload, config = global.config) {
  return callDesktopAction(
    'confirm_stale_session_close',
    {
      user_id: requireTenantUserId(payload.user_id),
      time_log_id: payload.time_log_id,
      end_time: payload.end_time,
      confirm_with_local_checkpoint: payload.confirm_with_local_checkpoint === true,
      admin_confirmed: payload.admin_confirmed === true,
    },
    config,
  );
}

async function upsertSessionHeartbeat(payload, config = global.config) {
  return callDesktopAction(
    'insert_session_heartbeat',
    {
      user_id: requireTenantUserId(payload.user_id),
      time_log_id: payload.time_log_id,
      device_id: payload.device_id || null,
      organization_id: payload.organization_id || null,
      seen_at: payload.last_seen_at || payload.seen_at || new Date().toISOString(),
      reason: payload.reason || 'interval',
      agent_version: payload.agent_version || null,
      meta: payload.meta || {},
    },
    config,
  );
}

async function reconcileInflatedTimeLogs(userId, deviceId = null, config = global.config) {
  return callDesktopAction(
    'reconcile_inflated_time_logs',
    { user_id: requireTenantUserId(userId), device_id: deviceId },
    config,
  );
}

async function getTodayTimeLogs(userId, config = global.config) {
  const { startOfLocalDay, endOfLocalDayExclusive } = require('./today-time-log-stats');
  const startOfDay = startOfLocalDay();
  const endOfDay = endOfLocalDayExclusive();
  const result = await callDesktopAction(
    'get_today_time_logs',
    {
      user_id: requireTenantUserId(userId),
      start_of_day: startOfDay.toISOString(),
      end_of_day: endOfDay.toISOString(),
    },
    config,
  );
  return result.time_logs || [];
}

async function getActiveTimeLog(userId, deviceId = null, config = global.config) {
  const result = await callDesktopAction(
    'get_active_time_log',
    { user_id: requireTenantUserId(userId), device_id: deviceId },
    config,
  );
  return result.time_log || null;
}

async function listUserProjects(userId, config = global.config) {
  const result = await callDesktopAction(
    'list_user_projects',
    { user_id: requireTenantUserId(userId) },
    config,
  );
  return result.projects || [];
}

function normalizeAppLogRow(row, config = global.config) {
  const base = Array.isArray(row) ? row[0] : row;
  const { attempts, queuedAt, app_path, ...rest } = base || {};
  return {
    user_id: rest.user_id || rest.userId || config?.user_id,
    time_log_id: rest.time_log_id ?? rest.timeLogId ?? null,
    app_name: rest.app_name || rest.application_name || null,
    window_title: rest.window_title || 'Unknown',
    timestamp: rest.timestamp || rest.started_at || new Date().toISOString(),
    organization_id: rest.organization_id || config?.organization_id || null,
  };
}

function normalizeUrlLogRow(row, config = global.config) {
  const base = Array.isArray(row) ? row[0] : row;
  const { attempts, queuedAt, ...rest } = base || {};
  return {
    user_id: rest.user_id || rest.userId || config?.user_id,
    time_log_id: rest.time_log_id ?? rest.timeLogId ?? null,
    site_url: rest.site_url || rest.url || null,
    title: rest.title || null,
    domain: rest.domain || null,
    browser: rest.browser || null,
    timestamp: rest.timestamp || rest.started_at || new Date().toISOString(),
    organization_id: rest.organization_id || config?.organization_id || null,
  };
}

async function insertAppLogsBatch(logs, config = global.config) {
  const rows = (Array.isArray(logs) ? logs : [logs])
    .map((row) => normalizeAppLogRow(row, config))
    .filter((row) => row.user_id && row.app_name);
  if (!rows.length) return { success: true, inserted: 0, ids: [] };
  return callDesktopAction('insert_app_logs', { logs: rows }, config);
}

async function insertUrlLogsBatch(logs, config = global.config) {
  const rows = (Array.isArray(logs) ? logs : [logs])
    .map((row) => normalizeUrlLogRow(row, config))
    .filter((row) => row.user_id && row.site_url);
  if (!rows.length) return { success: true, inserted: 0, ids: [] };
  return callDesktopAction('insert_url_logs', { logs: rows }, config);
}

/** Close open app focus session(s) — session model (not per-minute snapshots). */
async function closeOpenAppLogs({ user_id, ended_at, app_name } = {}, config = global.config) {
  const userId = requireTenantUserId(user_id);
  return callDesktopAction(
    'close_open_app_logs',
    {
      user_id: userId,
      ended_at: ended_at || new Date().toISOString(),
      app_name: app_name || null,
    },
    config,
  );
}

/** Close open URL visit session(s). */
async function closeOpenUrlLogs({ user_id, ended_at, site_url } = {}, config = global.config) {
  const userId = requireTenantUserId(user_id);
  return callDesktopAction(
    'close_open_url_logs',
    {
      user_id: userId,
      ended_at: ended_at || new Date().toISOString(),
      site_url: site_url || null,
    },
    config,
  );
}

async function insertIdleLog(log, config = global.config) {
  const userId = requireTenantUserId(log.user_id);
  return callDesktopAction(
    'insert_idle_log',
    { log: { ...log, user_id: userId } },
    config,
  );
}

/**
 * Append-only events into time_doctor.time_log_events (CPU samples, diagnostics).
 * @param {Array<object>|object} events
 */
async function insertTimeLogEvents(events, config = global.config) {
  const list = Array.isArray(events) ? events : events ? [events] : [];
  if (!list.length) return { success: true, inserted: 0 };
  const normalized = list.map((ev) => ({
    ...ev,
    user_id: requireTenantUserId(ev.user_id),
  }));
  return callDesktopAction('insert_time_log_events', { events: normalized }, config);
}

module.exports = {
  resolveBackendCredentials,
  isBackendTimeLogsEnabled,
  callDesktopAction,
  createTimeLog,
  updateTimeLog,
  closeActiveSessions,
  reconcileOpenSessions,
  confirmStaleSessionClose,
  upsertSessionHeartbeat,
  reconcileInflatedTimeLogs,
  getTodayTimeLogs,
  getActiveTimeLog,
  listUserProjects,
  insertAppLogsBatch,
  insertUrlLogsBatch,
  closeOpenAppLogs,
  closeOpenUrlLogs,
  insertIdleLog,
  insertTimeLogEvents,
};
