/**
 * Fresh Cognito ID token for Pulse employee APIs.
 * Uses the disk session refresh token so Coach does not force a new login
 * while the employee is already signed in.
 */

const fs = require('fs').promises;
const os = require('os');
const path = require('path');

const SESSION_PATH = path.join(os.homedir(), '.alyson_work_time_agent_session.json');
const SKEW_MS = 60_000;

function jwtExpMs(token) {
  try {
    const part = String(token || '').split('.')[1];
    if (!part) return 0;
    const padded = part.replace(/-/g, '+').replace(/_/g, '/');
    const json = Buffer.from(padded, 'base64').toString('utf8');
    const exp = Number(JSON.parse(json).exp);
    return Number.isFinite(exp) ? exp * 1000 : 0;
  } catch {
    return 0;
  }
}

function isJwtFresh(token, now = Date.now()) {
  const exp = jwtExpMs(token);
  return Boolean(token) && exp > now + SKEW_MS;
}

function diskToken(session) {
  return session?.access_token || session?.idToken || session?.id_token || null;
}

function diskRefreshToken(session) {
  return session?.refresh_token || session?.refreshToken || null;
}

async function readDiskSession(sessionPath = SESSION_PATH) {
  try {
    return JSON.parse(await fs.readFile(sessionPath, 'utf8'));
  } catch {
    return null;
  }
}

async function persistDiskTokens(tokens, sessionPath = SESSION_PATH) {
  const existing = (await readDiskSession(sessionPath)) || {};
  const next = {
    ...existing,
    access_token: tokens.idToken || existing.access_token,
    refresh_token: tokens.refreshToken || existing.refresh_token,
    expires_at: tokens.expiresAt || existing.expires_at,
    saved_at: Date.now(),
  };
  await fs.writeFile(sessionPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return next;
}

async function refreshWithCognito(authConfig, refreshToken) {
  const clientId = String(authConfig?.cognito_client_id || '').trim();
  const region = String(authConfig?.cognito_region || 'us-west-2').trim() || 'us-west-2';
  if (!clientId || !refreshToken) return null;

  const res = await fetch(`https://cognito-idp.${region}.amazonaws.com/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
    },
    body: JSON.stringify({
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      ClientId: clientId,
      AuthParameters: { REFRESH_TOKEN: refreshToken },
    }),
  });
  const data = await res.json().catch(() => ({}));
  const idToken = data?.AuthenticationResult?.IdToken;
  if (!res.ok || !idToken) return null;
  const rotated = data.AuthenticationResult.RefreshToken;
  return {
    idToken,
    refreshToken: rotated || refreshToken,
    expiresAt: jwtExpMs(idToken) || Date.now() + 3600 * 1000,
  };
}

async function resolveAssistantToken(authConfig, providedToken, opts = {}) {
  const forceRefresh = Boolean(opts.forceRefresh);
  const sessionPath = opts.sessionPath || SESSION_PATH;
  if (!forceRefresh && isJwtFresh(providedToken)) return providedToken;

  const session = await readDiskSession(sessionPath);
  const fromDisk = diskToken(session);
  if (!forceRefresh && isJwtFresh(fromDisk)) return fromDisk;

  const refreshToken = diskRefreshToken(session);
  const refreshExpired =
    session?.refresh_expires_at && Date.now() > Number(session.refresh_expires_at);
  if (!refreshToken || refreshExpired) {
    return (!forceRefresh && (providedToken || fromDisk)) || null;
  }

  const refreshed = await refreshWithCognito(authConfig, refreshToken);
  if (!refreshed?.idToken) return null;
  try {
    await persistDiskTokens(refreshed, sessionPath);
  } catch {
    /* keep going with the in-memory token */
  }
  return refreshed.idToken;
}

module.exports = {
  SESSION_PATH,
  jwtExpMs,
  isJwtFresh,
  readDiskSession,
  persistDiskTokens,
  refreshWithCognito,
  resolveAssistantToken,
};
