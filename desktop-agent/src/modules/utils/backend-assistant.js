/**
 * Pulse assistant (Tavilo Coach) — Cognito JWT to /pulse/assistant/*.
 */

const { getApiBase } = require('./backend-auth-fetch');
const { resolveAssistantToken } = require('./cognito-token');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function normalizeDate(date) {
  if (date == null || date === '') return null;
  const value = String(date).trim();
  if (!DATE_RE.test(value)) {
    const err = new Error('Invalid date');
    err.code = 'INVALID_DATE';
    throw err;
  }
  return value;
}

function genericError(status) {
  if (status === 401) return 'Please sign in again.';
  if (status === 429) return 'Tavilo Time is busy. Try again in a minute.';
  return 'Could not load Tavilo Coach right now.';
}

function workspaceIdFrom(authConfig, payload) {
  return (
    payload?.organizationId ||
    payload?.organization_id ||
    authConfig?.organization_id ||
    null
  );
}

async function callAssistant(authConfig, method, pathname, body, token, workspaceId) {
  const url = `${getApiBase(authConfig)}${pathname}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    ...(body ? { 'Content-Type': 'application/json' } : {}),
  };
  if (workspaceId) headers['X-Pulse-Workspace-Id'] = String(workspaceId);
  return fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function assistantFetch(authConfig, method, pathname, body, payload = {}) {
  let token = await resolveAssistantToken(authConfig, payload.idToken);
  if (!token) {
    return { success: false, error: 'Please sign in again.' };
  }
  const { readDiskSession } = require('./cognito-token');
  const disk = await readDiskSession();
  const workspaceId = workspaceIdFrom(authConfig, payload) || disk?.organization_id || null;

  let res = await callAssistant(authConfig, method, pathname, body, token, workspaceId);
  if (res.status === 401) {
    token = await resolveAssistantToken(authConfig, null, { forceRefresh: true });
    if (!token) {
      return { success: false, error: 'Please sign in again.' };
    }
    res = await callAssistant(authConfig, method, pathname, body, token, workspaceId);
  }

  if (!res.ok) {
    console.warn(`[assistant] ${method} ${pathname} -> ${res.status}`);
    return { success: false, error: genericError(res.status) };
  }
  const data = await res.json();
  return { success: true, data };
}

const briefingCache = new Map();
const BRIEFING_TTL_MS = 10 * 60 * 1000;

function briefingCacheKey(authConfig, payload = {}) {
  const date = payload?.date || 'today';
  const org =
    payload?.organizationId ||
    payload?.organization_id ||
    authConfig?.organization_id ||
    '';
  return `${org}|${date}`;
}

function resetBriefingCacheForTests() {
  briefingCache.clear();
}

async function fetchAssistantBriefing(authConfig, payload = {}) {
  try {
    const date = normalizeDate(payload?.date);
    const key = briefingCacheKey(authConfig, { ...payload, date });
    const hit = briefingCache.get(key);
    if (!payload?.force && hit && Date.now() - hit.at < BRIEFING_TTL_MS) {
      return { success: true, data: hit.data, cached: true };
    }
    const query = date ? `?date=${encodeURIComponent(date)}` : '';
    const result = await assistantFetch(
      authConfig,
      'GET',
      `/pulse/assistant/briefing${query}`,
      undefined,
      payload,
    );
    if (result?.success) {
      briefingCache.set(key, { at: Date.now(), data: result.data });
    }
    return result;
  } catch (err) {
    if (err?.code === 'INVALID_DATE') {
      return { success: false, error: 'Pick a valid day.' };
    }
    return { success: false, error: 'Could not load Tavilo Coach right now.' };
  }
}

async function fetchAssistantChat(authConfig, payload = {}) {
  try {
    const date = normalizeDate(payload?.date);
    const message = String(payload?.message || '').trim().slice(0, 500);
    if (!message) {
      return { success: false, error: 'Ask a question first.' };
    }
    const history = Array.isArray(payload?.history) ? payload.history.slice(-8) : [];
    return await assistantFetch(
      authConfig,
      'POST',
      '/pulse/assistant/chat',
      {
        ...(date ? { date } : {}),
        message,
        history,
      },
      payload,
    );
  } catch (err) {
    if (err?.code === 'INVALID_DATE') {
      return { success: false, error: 'Pick a valid day.' };
    }
    return { success: false, error: 'Could not reach Tavilo Coach right now.' };
  }
}

module.exports = {
  DATE_RE,
  normalizeDate,
  genericError,
  fetchAssistantBriefing,
  fetchAssistantChat,
  resetBriefingCacheForTests,
};
