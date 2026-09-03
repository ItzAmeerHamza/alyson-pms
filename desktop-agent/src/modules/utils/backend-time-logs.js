/**
 * Time log CRUD via NestJS /sync/desktop-action → RDS.
 * Used when Cognito + INTERNAL_API_KEY are configured.
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

/**
 * Offline hint so Start/Stop do not re-discover the outage on every call.
 * Three stacked 5–8s timeouts made an offline Start take ~18s; with this the
 * network preamble is skipped and the session is armed locally straight away.
 */
let _lastNetworkFailureAt = 0;
let _lastNetworkSuccessAt = 0;
const OFFLINE_HINT_MS = 20_000;

function isLikelyOffline() {
  if (!_lastNetworkFailureAt) return false;
  if (_lastNetworkSuccessAt > _lastNetworkFailureAt) return false;
  return Date.now() - _lastNetworkFailureAt < OFFLINE_HINT_MS;
}

function noteNetworkResult(ok) {
  if (ok) _lastNetworkSuccessAt = Date.now();
  else _lastNetworkFailureAt = Date.now();
}

async function callDesktopAction(action, data, config = global.config, options = {}) {
  const { key } = resolveBackendCredentials(config);
  if (!key) {
    throw new Error('Missing INTERNAL_API_KEY for backend time logs');
  }

  // Low-internet / RDS blips must fail fast so the agent can continue offline.
  // Default 12s; start-critical paths pass a shorter timeout.
  const timeoutMs = Math.max(
    2000,
    Number(options.timeoutMs ?? config?.backend_api_timeout_ms ?? 12_000) || 12_000,
  );
  const controller = new AbortController();
  const timer = setTimeout(() => {
    try {
      controller.abort();
    } catch (_) { /* ignore */ }
  }, timeoutMs);

  let response;
  try {
    response = await fetch(resolveSyncUrl(config), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
      },
      body: JSON.stringify({ action, data }),
      signal: controller.signal,
    });
  } catch (err) {
    const aborted = err?.name === 'AbortError' || controller.signal.aborted;
    noteNetworkResult(false);
    throw new Error(
      aborted
        ? `Backend sync timeout after ${timeoutMs}ms (${action})`
        : err?.message || `Backend sync network error (${action})`,
    );
  } finally {
    clearTimeout(timer);
  }
  noteNetworkResult(true);

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

async function createTimeLog(payload, config = global.config, options = {}) {
  const result = await callDesktopAction(
    'create_time_log',
    {
      // Stamped here rather than at each call site so every session records the
      // build that made it, including offline rows replayed later. The audit
      // trigger copies it from the row onto every event.
      log: { agent_version: global.appVersion || config?.version || null, ...payload },
    },
    config,
    options,
  );
  return result.time_log || result;
}

async function updateTimeLog(id, updates, config = global.config, options = {}) {
  const result = await callDesktopAction(
    'update_time_log',
    { id, updates },
    config,
    options,
  );
  // Backend may return 200 with updated:0 when the row does not exist.
  if (result && result.success === false) {
    const reason = result.reason || 'update_failed';
    throw new Error(
      reason === 'no_row'
        ? `update_time_log no rows for ${id}`
        : `update_time_log failed (${reason}) for ${id}`,
    );
  }
  return result;
}

/**
 * KILL ALL open sessions for this device. Each row closes at its own last
 * proof-of-life, so this is safe to call from stop / lid-close / quit / logout
 * without knowing (or inventing) an end time.
 */
async function killAllSessions(userId, deviceId = null, config = global.config, options = {}) {
  return callDesktopAction(
    'close_active_sessions',
    {
      user_id: requireTenantUserId(userId),
      device_id: deviceId,
      close_at_own_liveness: true,
      reason: options.reason || 'kill_all',
      except_time_log_id: options.exceptTimeLogId || null,
    },
    config,
    { timeoutMs: options.timeoutMs || 8000 },
  );
}

async function closeActiveSessions(userId, deviceId = null, config = global.config, options = {}) {
  return callDesktopAction(
    'close_active_sessions',
    {
      user_id: requireTenantUserId(userId),
      device_id: deviceId,
      // Without end_time → inspect; stale rows close at last heartbeat.
      end_time: options.end_time || null,
      confirm_with_local_checkpoint: options.confirm_with_local_checkpoint === true,
      admin_confirmed: options.admin_confirmed === true,
      allow_unconfirmed_end: options.allow_unconfirmed_end === true,
      prefer_recover: options.prefer_recover === true,
      client_last_seen_at: options.client_last_seen_at || null,
      freshness_minutes: options.freshness_minutes || 15,
    },
    config,
    { timeoutMs: options.timeoutMs },
  );
}

/**
 * Inspect open sessions: recover if fresh.
 * Stale sessions are closed at last heartbeat / checkpoint (never NOW).
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
    { timeoutMs: options.timeoutMs },
  );
}

/**
 * Confirmed close using local durable checkpoint, last heartbeat, or admin.
 */
async function confirmStaleSessionClose(payload, config = global.config, options = {}) {
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
    { timeoutMs: options.timeoutMs },
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

async function getTodayTimeLogsPayload(userId, config = global.config) {
  const { startOfLocalDay, endOfLocalDayExclusive, localDateKey } = require('./today-time-log-stats');
  const startOfDay = startOfLocalDay();
  const endOfDay = endOfLocalDayExclusive();
  const result = await callDesktopAction(
    'get_today_time_logs',
    {
      user_id: requireTenantUserId(userId),
      start_of_day: startOfDay.toISOString(),
      end_of_day: endOfDay.toISOString(),
      work_date: localDateKey(),
    },
    config,
  );
  return {
    timeLogs: result.time_logs || [],
    adjustmentSeconds: Math.trunc(Number(result.other_seconds) || 0),
    leaveCreditSeconds: Math.trunc(Number(result.leave_seconds) || 0),
    otherAdjustmentSeconds: Math.trunc(Number(result.other_seconds) || 0),
  };
}

async function getTodayTimeLogs(userId, config = global.config) {
  const { timeLogs } = await getTodayTimeLogsPayload(userId, config);
  return timeLogs;
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

async function upsertIdleLog(log, config = global.config, options = {}) {
  const userId = requireTenantUserId(log.user_id);
  const { idleLogIdempotencyUuid } = require('./idle-log-period-key');
  const id = log.id || idleLogIdempotencyUuid({ ...log, user_id: userId });
  return callDesktopAction(
    'upsert_idle_log',
    { log: { ...log, user_id: userId, id } },
    config,
    { timeoutMs: options.timeoutMs || 20_000 },
  );
}

async function insertIdleLog(log, config = global.config, options = {}) {
  return upsertIdleLog(log, config, options);
}

/**
 * Append-only events into time_doctor.time_log_events (CPU samples, diagnostics).
 * @param {Array<object>|object} events
 */
/** Presigned PUT URL for a diagnostic log file (one per user per day). */
async function getLogUploadUrl(payload, config = global.config) {
  return callDesktopAction(
    'log_upload_init',
    {
      user_id: requireTenantUserId(payload.user_id),
      device_id: payload.device_id || null,
      agent_version: payload.agent_version || null,
      log_date: payload.log_date,
      organization_id: payload.organization_id || null,
    },
    config,
  );
}

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
  isLikelyOffline,
  callDesktopAction,
  createTimeLog,
  updateTimeLog,
  closeActiveSessions,
  killAllSessions,
  reconcileOpenSessions,
  confirmStaleSessionClose,
  upsertSessionHeartbeat,
  reconcileInflatedTimeLogs,
  getTodayTimeLogs,
  getTodayTimeLogsPayload,
  getActiveTimeLog,
  listUserProjects,
  insertAppLogsBatch,
  insertUrlLogsBatch,
  closeOpenAppLogs,
  closeOpenUrlLogs,
  insertIdleLog,
  upsertIdleLog,
  insertTimeLogEvents,
  getLogUploadUrl,
};
