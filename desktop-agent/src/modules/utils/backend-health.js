/**
 * Backend API health check (RDS via NestJS) — avoids probing legacy Supabase public.users.
 */

function resolveApiBase(config = global.config) {
  const raw =
    config?.api_base_url ||
    config?.backend_api_url ||
    process.env.VITE_API_BASE_URL ||
    process.env.API_BASE_URL ||
    process.env.BACKEND_API_URL ||
    'http://localhost:3000';
  return String(raw).replace(/\/sync\/desktop-action\/?$/, '').replace(/\/$/, '');
}

async function checkBackendHealth(config = global.config, timeoutMs = 15000) {
  const base = resolveApiBase(config);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}/health`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) {
      return { ok: false, status: res.status, error: `HTTP ${res.status}` };
    }
    const body = await res.json().catch(() => ({}));
    const dbOk = body?.checks?.database?.status === 'healthy' || body?.status === 'healthy';
    return { ok: dbOk, status: res.status, body };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  resolveApiBase,
  checkBackendHealth,
};
