const fs = require('fs').promises;
const os = require('os');
const path = require('path');

const SESSION_PATH = path.join(os.homedir(), '.alyson_work_time_agent_session.json');

async function loadDesktopSession() {
  try {
    const raw = await fs.readFile(SESSION_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function getApiBase(config) {
  return (
    config?.api_base_url ||
    process.env.VITE_API_BASE_URL ||
    process.env.API_BASE_URL ||
    'http://localhost:3000'
  ).replace(/\/$/, '');
}

function localDateIso(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function sameUserId(a, b) {
  return a != null && b != null && String(a) === String(b);
}

function resolveDesktopSync(config) {
  const { resolveBackendCredentials } = require('./backend-time-logs');
  const { url, key } = resolveBackendCredentials(config);
  if (!url || !key) return null;
  const syncUrl = url.includes('/sync/desktop-action')
    ? url
    : `${url.replace(/\/$/, '')}/sync/desktop-action`;
  return { syncUrl, apiKey: key };
}

function usesBackendScreenshots(config) {
  if (config?.auth_provider === 'cognito') return true;
  if (process.env.VITE_AUTH_PROVIDER === 'cognito') return true;
  if (process.env.BACKEND_API_URL || config?.backend_api_url) return true;
  return false;
}

/** Local calendar day bounds (matches Supabase fallback and "today" in the UI). */
function resolveDateRange(opts = {}) {
  if (opts.startIso && opts.endIso) {
    return { start: new Date(opts.startIso), end: new Date(opts.endIso) };
  }
  if (opts.date) {
    const [y, m, d] = opts.date.split('-').map(Number);
    if (y && m && d) {
      return {
        start: new Date(y, m - 1, d, 0, 0, 0, 0),
        end: new Date(y, m - 1, d, 23, 59, 59, 999),
      };
    }
  }
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function isValidS3ScreenshotKey(key) {
  if (!key || typeof key !== 'string') return false;
  const k = key.trim();
  return k.length >= 12 && k.includes('/');
}

function normalizeScreenshotRow(row) {
  if (!row) return row;
  const key = row.s3_key || row.file_path;
  if (!isValidS3ScreenshotKey(key)) {
    return { ...row, image_url: null };
  }
  const imageUrl = row.image_url;
  const filePath = row.file_path;
  const displayUrl =
    imageUrl ||
    (filePath && /^https?:\/\//i.test(String(filePath)) ? filePath : null);
  return { ...row, image_url: displayUrl };
}

async function fetchScreenshotsViaInternalApi(userId, config, opts = {}) {
  const sync = resolveDesktopSync(config);
  if (!sync) return null;

  const { start, end } = resolveDateRange(opts);
  const limit = Math.min(Math.max(opts.limit || 50, 1), 500);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);

  try {
    const res = await fetch(sync.syncUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': sync.apiKey,
      },
      body: JSON.stringify({
        action: 'list_screenshots',
        data: {
          user_id: userId,
          start: start.toISOString(),
          end: end.toISOString(),
          limit,
        },
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const text = await res.text();
      console.warn('[BACKEND-SCREENSHOTS] Internal list failed:', res.status, text.slice(0, 200));
      return null;
    }

    const body = await res.json();
    const rows = body?.screenshots;
    if (!Array.isArray(rows)) return null;
    return rows.map(normalizeScreenshotRow);
  } catch (err) {
    clearTimeout(timer);
    console.warn('[BACKEND-SCREENSHOTS] Internal list error:', err?.message || err);
    return null;
  }
}

/** POST a screenshot action to the NestJS internal desktop-action endpoint. */
async function postScreenshotAction(action, payload, config) {
  const sync = resolveDesktopSync(config);
  if (!sync) return { success: false, error: 'Backend sync not configured' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(sync.syncUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': sync.apiKey,
      },
      body: JSON.stringify({ action, data: payload }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    let body = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }

    if (!res.ok) {
      const msg = body?.message || body?.error || `HTTP ${res.status}`;
      console.warn(`[BACKEND-SCREENSHOTS] ${action} failed:`, res.status, String(msg).slice(0, 200));
      return { success: false, error: typeof msg === 'string' ? msg : `HTTP ${res.status}` };
    }
    return body || { success: true };
  } catch (err) {
    clearTimeout(timer);
    console.warn(`[BACKEND-SCREENSHOTS] ${action} error:`, err?.message || err);
    return { success: false, error: err?.message || String(err) };
  }
}

/** Estimate time deduction for a screenshot via the backend (RDS). */
async function estimateDeductionViaBackend(userId, screenshotId, config) {
  return postScreenshotAction(
    'estimate_screenshot_deduction',
    { user_id: userId, screenshot_id: screenshotId },
    config,
  );
}

/** Delete a screenshot (and deduct time) via the backend (RDS + S3). */
async function deleteScreenshotViaBackend(userId, screenshotId, config) {
  return postScreenshotAction(
    'delete_screenshot',
    { user_id: userId, screenshot_id: screenshotId },
    config,
  );
}

/**
 * Fetch screenshots from NestJS + RDS (presigned S3 image_url on each row).
 */
async function fetchScreenshotsFromBackend(userId, config, opts = {}) {
  if (!userId) return null;

  const internalRows = await fetchScreenshotsViaInternalApi(userId, config, opts);
  if (Array.isArray(internalRows)) {
    return internalRows;
  }

  const session = await loadDesktopSession();
  const token = session?.access_token;
  if (!token) {
    return null;
  }

  const { start, end } = resolveDateRange(opts);
  const limit = Math.min(Math.max(opts.limit || 50, 1), 10000);
  const params = new URLSearchParams({
    userId,
    start: start.toISOString(),
    end: end.toISOString(),
    limit: String(limit),
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);

  try {
    const res = await fetch(`${getApiBase(config)}/data/screenshots?${params}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const text = await res.text();
      console.warn('[BACKEND-SCREENSHOTS] JWT fetch failed:', res.status, text.slice(0, 200));
      return null;
    }

    const rows = await res.json();
    return Array.isArray(rows) ? rows.map(normalizeScreenshotRow) : [];
  } catch (err) {
    clearTimeout(timer);
    console.warn('[BACKEND-SCREENSHOTS] JWT fetch error:', err?.message || err);
    return null;
  }
}

function applyActivityFilter(screenshots, activityFilter = 'all') {
  if (!activityFilter || activityFilter === 'all') return screenshots;
  return screenshots.filter((s) => {
    const pct = s.activity_percent ?? 0;
    if (activityFilter === 'high') return pct >= 70;
    if (activityFilter === 'medium') return pct >= 30 && pct < 70;
    if (activityFilter === 'low') return pct < 30;
    return true;
  });
}

function buildEnhancedResponse(screenshots) {
  const duplicates = [];
  const duplicateGroups = new Map();

  (screenshots || []).forEach((screenshot) => {
    if (screenshot.is_duplicate) {
      duplicates.push({
        id: screenshot.id,
        reason: screenshot.duplicate_reason || 'Detected by backend analysis',
        group_hash: screenshot.duplicate_group_hash,
        detected_method: 'backend_analysis',
      });
      if (screenshot.duplicate_group_hash) {
        if (!duplicateGroups.has(screenshot.duplicate_group_hash)) {
          duplicateGroups.set(screenshot.duplicate_group_hash, []);
        }
        duplicateGroups.get(screenshot.duplicate_group_hash).push(screenshot.id);
      }
    }
  });

  return {
    success: true,
    screenshots: screenshots || [],
    duplicates: duplicates.map((d) => d.id),
    duplicate_details: duplicates,
    duplicate_groups: Object.fromEntries(duplicateGroups),
    count: screenshots?.length || 0,
    source: 'backend',
  };
}

async function fetchTodayScreenshotsFromBackend(userId, config) {
  return fetchScreenshotsFromBackend(userId, config, { date: localDateIso(), limit: 50 });
}

module.exports = {
  fetchScreenshotsFromBackend,
  fetchTodayScreenshotsFromBackend,
  usesBackendScreenshots,
  estimateDeductionViaBackend,
  deleteScreenshotViaBackend,
  loadDesktopSession,
  applyActivityFilter,
  buildEnhancedResponse,
  normalizeScreenshotRow,
  localDateIso,
  sameUserId,
};
