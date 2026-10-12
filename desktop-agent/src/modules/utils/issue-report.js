/**
 * Desktop "Report an issue" — Cognito JWT to POST /pulse/issue-reports.
 */

const { getApiBase } = require('./backend-auth-fetch');

const CATEGORIES = ['tracking', 'screenshots', 'login', 'permissions', 'updates', 'other'];
const DIAGNOSTICS_MAX = 12000;

function redactDiagnostics(value) {
  return String(value || '')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '[redacted]');
}

function normalizeReport(input) {
  const category = String(input?.category || '').trim();
  const message = String(input?.message || '').replace(/\u0000/g, '').trim();
  if (!CATEGORIES.includes(category)) {
    return { ok: false, error: 'Choose what the issue is about.' };
  }
  if (message.length < 10) {
    return { ok: false, error: 'Describe the issue in at least a few words.' };
  }
  if (message.length > 4000) {
    return { ok: false, error: 'Keep the description under 4,000 characters.' };
  }
  const includeDiagnostics = input?.includeDiagnostics !== false && input?.include_diagnostics !== false;
  return {
    ok: true,
    report: {
      category,
      message: message.slice(0, 4000),
      include_diagnostics: includeDiagnostics,
    },
  };
}

function collectIssueSnapshot() {
  let appVersion = 'unknown';
  let osSummary = process.platform || 'unknown';
  try {
    const { app } = require('electron');
    appVersion = app.getVersion();
  } catch {
    appVersion = 'unknown';
  }
  try {
    const os = require('os');
    osSummary = `${os.type()} ${os.release()} (${process.arch})`.slice(0, 160);
  } catch {
    osSummary = String(osSummary).slice(0, 160);
  }
  const health = global.systemMonitor?.systemState?.health || {};
  const tracking = Boolean(
    global.isTracking ||
      global.trackingManager?.isTracking ||
      global.trackingManager?.currentSession,
  );
  const logLines = (global.consoleLogBuffer || [])
    .slice(-40)
    .map((entry) => {
      if (typeof entry === 'string') return entry;
      if (entry && entry.message) return String(entry.message);
      return '';
    })
    .filter(Boolean);
  return {
    appVersion: String(appVersion).slice(0, 40),
    platform: String(process.platform || '').slice(0, 32),
    osSummary,
    tracking,
    healthOverall: String(health.overall || 'unknown').slice(0, 40),
    logLines,
  };
}

function buildDiagnostics(snapshot) {
  const lines = [
    '=== Tavilo Time issue diagnostics ===',
    `App: ${snapshot?.appVersion || 'unknown'}`,
    `Platform: ${snapshot?.platform || 'unknown'}`,
    `OS: ${snapshot?.osSummary || 'unknown'}`,
    `Tracking: ${snapshot?.tracking ? 'on' : 'off'}`,
    `Health: ${snapshot?.healthOverall || 'unknown'}`,
    '',
    '--- Recent logs ---',
    ...(Array.isArray(snapshot?.logLines) ? snapshot.logLines : []),
  ];
  return redactDiagnostics(lines.join('\n')).slice(0, DIAGNOSTICS_MAX);
}

function genericError(status) {
  if (status === 401) return 'Please sign in again.';
  if (status === 429) return 'You have sent several reports recently. Try again in a little while.';
  return 'Could not send the report. Try again.';
}

function workspaceIdFrom(authConfig, payload) {
  return (
    payload?.organizationId ||
    payload?.organization_id ||
    authConfig?.organization_id ||
    null
  );
}

async function submitIssueReport(authConfig, payload = {}, deps = {}) {
  const normalized = normalizeReport(payload);
  if (!normalized.ok) {
    return { success: false, error: normalized.error };
  }

  const { resolveAssistantToken, readDiskSession } = require('./cognito-token');
  let token = await resolveAssistantToken(authConfig, payload.idToken);
  if (!token) {
    return { success: false, error: 'Please sign in again.' };
  }

  const disk = await readDiskSession();
  const workspaceId = workspaceIdFrom(authConfig, payload) || disk?.organization_id || null;
  const snapshot = (deps.collect || collectIssueSnapshot)();
  const diagnostics = normalized.report.include_diagnostics ? buildDiagnostics(snapshot) : '';
  const body = {
    category: normalized.report.category,
    message: normalized.report.message,
    include_diagnostics: normalized.report.include_diagnostics && Boolean(diagnostics),
    app_version: snapshot.appVersion,
    platform: snapshot.platform,
    os_summary: snapshot.osSummary,
    ...(diagnostics ? { diagnostics } : {}),
  };

  const url = `${getApiBase(authConfig)}/pulse/issue-reports`;
  const send = async (bearer) => {
    const headers = {
      Authorization: `Bearer ${bearer}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
    if (workspaceId) headers['X-Pulse-Workspace-Id'] = String(workspaceId);
    return fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  };

  try {
    let res = await send(token);
    if (res.status === 401) {
      token = await resolveAssistantToken(authConfig, null, { forceRefresh: true });
      if (!token) return { success: false, error: 'Please sign in again.' };
      res = await send(token);
    }
    if (!res.ok) {
      console.warn(`[issue-report] POST /pulse/issue-reports -> ${res.status}`);
      return { success: false, error: genericError(res.status) };
    }
    const data = await res.json().catch(() => ({}));
    return { success: true, id: data?.id || null };
  } catch {
    console.warn('[issue-report] send failed');
    return { success: false, error: genericError(0) };
  }
}

module.exports = {
  CATEGORIES,
  normalizeReport,
  redactDiagnostics,
  buildDiagnostics,
  collectIssueSnapshot,
  genericError,
  submitIssueReport,
};
