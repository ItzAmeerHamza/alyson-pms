import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserPool,
  CognitoUserSession,
} from 'amazon-cognito-identity-js';
import {
  assertCognitoConfig,
  cognitoClientId,
  cognitoUserPoolId,
} from './config';
import {
  clearCognitoSession,
  loadCognitoSession,
  saveCognitoSession,
  type StoredCognitoSession,
} from './session-storage';

let userPool: CognitoUserPool | null = null;

function getUserPool(): CognitoUserPool {
  assertCognitoConfig();
  if (!userPool) {
    userPool = new CognitoUserPool({
      UserPoolId: cognitoUserPoolId,
      ClientId: cognitoClientId,
    });
  }
  return userPool;
}

function sessionToStored(
  email: string,
  session: CognitoUserSession,
): StoredCognitoSession {
  const idToken = session.getIdToken().getJwtToken();
  const accessToken = session.getAccessToken().getJwtToken();
  const refreshToken = session.getRefreshToken().getToken();
  const expiresAt = session.getIdToken().getExpiration() * 1000;

  return {
    idToken,
    accessToken,
    refreshToken,
    email,
    expiresAt,
  };
}

export function signInWithEmailPassword(
  email: string,
  password: string,
): Promise<StoredCognitoSession> {
  const pool = getUserPool();
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
        const stored = sessionToStored(normalizedEmail, session);
        saveCognitoSession(stored);
        resolve(stored);
      },
      onFailure: (err) => {
        reject(new Error(err.message || 'Invalid credentials'));
      },
      newPasswordRequired: () => {
        reject(
          new Error(
            'Password change required. Complete it in Cognito, then try again.',
          ),
        );
      },
    });
  });
}

export function signOutCognito(): void {
  clearCognitoSession();
  const pool = getUserPool();
  const user = pool.getCurrentUser();
  if (user) {
    user.signOut();
  }
}

export function getCurrentCognitoSession(): Promise<StoredCognitoSession | null> {
  const stored = loadCognitoSession();
  if (stored) {
    return Promise.resolve(stored);
  }

  return new Promise((resolve) => {
    try {
      const pool = getUserPool();
      const user = pool.getCurrentUser();
      if (!user) {
        resolve(null);
        return;
      }

      user.getSession((err: Error | null, session: CognitoUserSession | null) => {
        if (err || !session || !session.isValid()) {
          resolve(null);
          return;
        }
        const email =
          session.getIdToken().payload.email?.toLowerCase?.() ??
          user.getUsername();
        const next = sessionToStored(email, session);
        saveCognitoSession(next);
        resolve(next);
      });
    } catch {
      resolve(null);
    }
  });
}
