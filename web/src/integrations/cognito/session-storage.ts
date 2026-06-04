const STORAGE_KEY = 'timeflow.cognito.session';

export interface StoredCognitoSession {
  idToken: string;
  accessToken: string;
  refreshToken: string;
  email: string;
  expiresAt: number;
}

export function saveCognitoSession(session: StoredCognitoSession): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function loadCognitoSession(): StoredCognitoSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredCognitoSession;
    if (!parsed.idToken || !parsed.accessToken) return null;
    if (parsed.expiresAt && Date.now() > parsed.expiresAt) {
      clearCognitoSession();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearCognitoSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}
