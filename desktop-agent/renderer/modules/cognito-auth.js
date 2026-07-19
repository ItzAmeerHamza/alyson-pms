/**
 * Cognito sign-in for desktop agent (same pool as web portal).
 * Requires amazon-cognito-identity-js and auth config from get-config IPC.
 *
 * Persistence: ID/access tokens expire ~1h; refresh tokens last much longer
 * (Cognito app-client setting — default 30d, configurable up to 10 years).
 * Always refresh when the ID token is stale so users stay signed in across
 * app/OS restarts for the refresh-token lifetime.
 */

const {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserPool,
  CognitoRefreshToken,
} = require('amazon-cognito-identity-js');

const STORAGE_KEY = 'alyson.cognito.session';

/**
 * Soft upper bound for treating a stored refresh token as usable.
 * Must be >= Cognito app-client "Refresh token expiration".
 * Default: 365 days (1 year). Real logout happens when Cognito rejects refresh.
 */
const REFRESH_TOKEN_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

function saveCognitoSession(session) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

function loadCognitoSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.idToken && !parsed?.refreshToken) return null;
    return parsed;
  } catch {
    return null;
  }
}

function clearCognitoSession() {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Seed / merge Cognito localStorage from the main-process disk session.
 * Needed after restarts when ID token expired but refresh token was persisted.
 */
function hydrateCognitoSessionFromDisk(diskSession) {
  if (!diskSession) return loadCognitoSession();
  const existing = loadCognitoSession() || {};
  const email = (
    diskSession.email ||
    existing.email ||
    ''
  )
    .toString()
    .trim()
    .toLowerCase();
  const refreshToken = diskSession.refresh_token || existing.refreshToken;
  const idToken = diskSession.access_token || existing.idToken;
  const accessToken = existing.accessToken || idToken;
  const expiresAt = diskSession.expires_at || existing.expiresAt || 0;
  const refreshExpiresAt =
    diskSession.refresh_expires_at ||
    existing.refreshExpiresAt ||
    (diskSession.saved_at
      ? Number(diskSession.saved_at) + REFRESH_TOKEN_MAX_AGE_MS
      : Date.now() + REFRESH_TOKEN_MAX_AGE_MS);

  if (!refreshToken && !idToken) return existing.idToken || existing.refreshToken ? existing : null;

  const merged = {
    ...existing,
    idToken: idToken || existing.idToken,
    accessToken: accessToken || existing.accessToken,
    refreshToken,
    email: email || existing.email,
    expiresAt,
    refreshExpiresAt,
  };
  saveCognitoSession(merged);
  return merged;
}

function createPool(authConfig) {
  if (!authConfig?.cognito_user_pool_id || !authConfig?.cognito_client_id) {
    throw new Error('Cognito is not configured on the desktop agent');
  }
  return new CognitoUserPool({
    UserPoolId: authConfig.cognito_user_pool_id,
    ClientId: authConfig.cognito_client_id,
  });
}

function sessionFromCognitoSession(session, emailFallback) {
  const idToken = session.getIdToken().getJwtToken();
  const accessToken = session.getAccessToken().getJwtToken();
  const refreshToken = session.getRefreshToken().getToken();
  const email =
    session.getIdToken().payload.email?.toLowerCase?.() ||
    emailFallback ||
    '';
  return {
    idToken,
    accessToken,
    refreshToken,
    email,
    expiresAt: session.getIdToken().getExpiration() * 1000,
    refreshExpiresAt: Date.now() + REFRESH_TOKEN_MAX_AGE_MS,
  };
}

function signInWithEmailPassword(email, password, authConfig) {
  const pool = createPool(authConfig);
  const normalizedEmail = email.trim().toLowerCase();

  const authDetails = new AuthenticationDetails({
    Username: normalizedEmail,
    Password: password,
  });

  const cognitoUser = new CognitoUser({
    Username: normalizedEmail,
    Pool: pool,
  });

  return new Promise((resolve, reject) => {
    cognitoUser.authenticateUser(authDetails, {
      onSuccess: (session) => {
        const stored = sessionFromCognitoSession(session, normalizedEmail);
        saveCognitoSession(stored);
        resolve(stored);
      },
      onFailure: (err) => {
        reject(new Error(err.message || 'Invalid credentials'));
      },
      newPasswordRequired: () => {
        reject(
          new Error(
            'Password change required. Complete it in the AWS Cognito console or web portal, then try again.',
          ),
        );
      },
    });
  });
}

/**
 * Refresh Cognito ID/access tokens using the stored refresh token.
 * Returns null when refresh is impossible or Cognito rejects the token.
 */
function refreshCognitoSession(authConfig, seed = null) {
  const stored = seed || loadCognitoSession();
  if (!stored?.refreshToken || !stored?.email) {
    return Promise.resolve(null);
  }

  if (
    stored.refreshExpiresAt &&
    Date.now() > Number(stored.refreshExpiresAt)
  ) {
    console.warn('⚠️ [COGNITO] Refresh token soft-expired (1y) — re-login required');
    return Promise.resolve(null);
  }

  let pool;
  try {
    pool = createPool(authConfig);
  } catch {
    return Promise.resolve(null);
  }

  const cognitoUser = new CognitoUser({
    Username: String(stored.email).trim().toLowerCase(),
    Pool: pool,
  });
  const token = new CognitoRefreshToken({ RefreshToken: stored.refreshToken });

  return new Promise((resolve) => {
    cognitoUser.refreshSession(token, (err, session) => {
      if (err || !session) {
        console.warn(
          '⚠️ [COGNITO] refreshSession failed:',
          err?.message || err || 'no session',
        );
        resolve(null);
        return;
      }
      const next = sessionFromCognitoSession(session, stored.email);
      // Keep previous soft expiry if Cognito did not rotate refresh token semantics
      if (stored.refreshExpiresAt && !next.refreshExpiresAt) {
        next.refreshExpiresAt = stored.refreshExpiresAt;
      }
      saveCognitoSession(next);
      console.log('✅ [COGNITO] Tokens refreshed; ID token valid until', new Date(next.expiresAt).toISOString());
      resolve(next);
    });
  });
}

/**
 * Return a usable Cognito session (refreshing when the ID token is expired).
 */
async function getCurrentCognitoSession(authConfig) {
  const stored = loadCognitoSession();
  if (stored?.idToken && stored.expiresAt && Date.now() < stored.expiresAt - 60_000) {
    return stored;
  }

  // Prefer explicit refresh from our persisted refresh token (survives app restarts)
  if (stored?.refreshToken) {
    const refreshed = await refreshCognitoSession(authConfig, stored);
    if (refreshed?.idToken) return refreshed;
  }

  // Fallback: Cognito SDK in-memory / cookie user (often empty in Electron)
  return new Promise((resolve) => {
    try {
      const pool = createPool(authConfig);
      const user = pool.getCurrentUser();
      if (!user) {
        resolve(null);
        return;
      }
      user.getSession((err, session) => {
        if (err || !session || !session.isValid()) {
          resolve(null);
          return;
        }
        const next = sessionFromCognitoSession(session, user.getUsername());
        saveCognitoSession(next);
        resolve(next);
      });
    } catch {
      resolve(null);
    }
  });
}

function signOutCognito(authConfig) {
  clearCognitoSession();
  try {
    const pool = createPool(authConfig);
    const user = pool.getCurrentUser();
    if (user) user.signOut();
  } catch {
    /* ignore */
  }
}

module.exports = {
  signInWithEmailPassword,
  getCurrentCognitoSession,
  refreshCognitoSession,
  hydrateCognitoSessionFromDisk,
  signOutCognito,
  clearCognitoSession,
  loadCognitoSession,
  REFRESH_TOKEN_MAX_AGE_MS,
};
