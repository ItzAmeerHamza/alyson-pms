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
  const base =
    authConfig?.api_base_url ||
    authConfig?.backend_api_url?.replace(/\/sync\/desktop-action\/?$/, '') ||
    'http://localhost:3000';
  return String(base).replace(/\/$/, '');
}

async function fetchAuthMe(idToken, authConfig) {
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
