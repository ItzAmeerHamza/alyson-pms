/**
 * Backend auth API (Cognito / RDS profile) — mirrors web/src/lib/auth-api.ts
 */

async function parseError(res) {
  try {
    const body = await res.json();
    return body.message || body.error || res.statusText;
  } catch {
    return res.statusText || 'Request failed';
  }
}

function getApiBase(authConfig) {
  const fromBackend = authConfig?.backend_api_url
    ? String(authConfig.backend_api_url).replace(/\/sync\/desktop-action\/?$/, '').replace(/\/$/, '')
    : '';
  const fromApi = authConfig?.api_base_url
    ? String(authConfig.api_base_url).replace(/\/$/, '')
    : '';
  if (fromApi && fromApi !== 'http://localhost:3000') return fromApi;
  if (fromBackend) return fromBackend;
  return fromApi || 'http://localhost:3000';
}

async function fetchAuthMe(idToken, authConfig, ipcRenderer) {
  if (ipcRenderer && typeof ipcRenderer.invoke === 'function') {
    return ipcRenderer.invoke('auth:fetch-me', { idToken });
  }

  const res = await fetch(`${getApiBase(authConfig)}/auth/me`, {
    headers: {
      Authorization: `Bearer ${idToken}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    throw new Error(await parseError(res));
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

async function fetchOrganizationBySlug(slug, authConfig) {
  const normalized = slug.trim().toLowerCase();
  const res = await fetch(
    `${getApiBase(authConfig)}/auth/organizations/by-slug/${encodeURIComponent(normalized)}`,
    { headers: { Accept: 'application/json' } },
  );
  if (!res.ok) {
    throw new Error('Invalid company name. Please check and try again.');
  }
  return res.json();
}

function isCognitoAuthEnabled(authConfig) {
  return (
    authConfig?.auth_provider === 'cognito' &&
    Boolean(authConfig?.cognito_user_pool_id && authConfig?.cognito_client_id)
  );
}

module.exports = {
  fetchAuthMe,
  fetchOrganizationBySlug,
  isCognitoAuthEnabled,
  getApiBase,
};
