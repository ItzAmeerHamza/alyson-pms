/**
 * Cognito sign-in for desktop agent (same pool as web portal).
 * Requires amazon-cognito-identity-js and auth config from get-config IPC.
 */

const {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserPool,
} = require('amazon-cognito-identity-js');

const STORAGE_KEY = 'alyson.cognito.session';

function saveCognitoSession(session) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

function loadCognitoSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.idToken) return null;
    return parsed;
  } catch {
    return null;
  }
}

function clearCognitoSession() {
  localStorage.removeItem(STORAGE_KEY);
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
        const idToken = session.getIdToken().getJwtToken();
        const accessToken = session.getAccessToken().getJwtToken();
        const refreshToken = session.getRefreshToken().getToken();
        const expiresAt = session.getIdToken().getExpiration() * 1000;
        const stored = {
          idToken,
          accessToken,
          refreshToken,
          email: normalizedEmail,
          expiresAt,
        };
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

function getCurrentCognitoSession(authConfig) {
  const stored = loadCognitoSession();
  if (stored?.idToken && stored.expiresAt && Date.now() < stored.expiresAt) {
    return Promise.resolve(stored);
  }

  return new Promise((resolve) => {
    try {
      const pool = createPool(authConfig);
      const user = pool.getCurrentUser();
      if (!user) {
        resolve(stored?.idToken ? stored : null);
        return;
      }
      user.getSession((err, session) => {
        if (err || !session || !session.isValid()) {
          resolve(null);
          return;
        }
        const idToken = session.getIdToken().getJwtToken();
        const accessToken = session.getAccessToken().getJwtToken();
        const refreshToken = session.getRefreshToken().getToken();
        const email =
          session.getIdToken().payload.email?.toLowerCase?.() || user.getUsername();
        const next = {
          idToken,
          accessToken,
          refreshToken,
          email,
          expiresAt: session.getIdToken().getExpiration() * 1000,
        };
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
  signOutCognito,
  clearCognitoSession,
  loadCognitoSession,
};
