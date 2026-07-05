/**
 * Main-process backend auth calls (no browser CORS).
 */

function getApiBase(authConfig) {
  const fromBackend = authConfig?.backend_api_url
    ? String(authConfig.backend_api_url).replace(/\/sync\/desktop-action\/?$/, '').replace(/\/$/, '')
    : '';
  const fromApi = authConfig?.api_base_url
    ? String(authConfig.api_base_url).replace(/\/$/, '')
    : '';
  if (fromApi && fromApi !== 'http://localhost:3000') return fromApi;
  if (fromBackend) return fromBackend;
  return (
    fromApi ||
    process.env.VITE_API_BASE_URL?.replace(/\/$/, '') ||
    process.env.BACKEND_API_URL?.replace(/\/sync\/desktop-action\/?$/, '').replace(/\/$/, '') ||
    'http://localhost:3000'
  );
}

async function parseError(res) {
  try {
    const body = await res.json();
    return body.message || body.error || res.statusText;
  } catch {
    return res.statusText || 'Request failed';
  }
}

async function fetchAuthMeFromApi(idToken, authConfig) {
  const res = await fetch(`${getApiBase(authConfig)}/auth/me`, {
    headers: {
      Authorization: `Bearer ${idToken}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    const message = await parseError(res);
    throw new Error(`${res.status} ${message}`);
  }
  const data = await res.json();
  return {
    user: {
      ...data.user,
      is_org_admin: data.user.is_org_admin ?? false,
      is_super_admin: data.user.is_super_admin ?? false,
    },
    organization: data.organization,
  };
}

module.exports = {
  fetchAuthMeFromApi,
  getApiBase,
};
