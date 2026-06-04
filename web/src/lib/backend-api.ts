import { loadCognitoSession } from '@/integrations/cognito/session-storage';
import { ApiError } from '@/lib/api-error';

const API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ||
  'http://localhost:3000';

const GET_CACHE_TTL_MS = 5_000;
const getCache = new Map<string, { expiresAt: number; value: unknown }>();
const inflightGets = new Map<string, Promise<unknown>>();

export function invalidateBackendCache(pathPrefix?: string): void {
  if (!pathPrefix) {
    getCache.clear();
    return;
  }
  for (const key of getCache.keys()) {
    if (key.includes(pathPrefix)) {
      getCache.delete(key);
    }
  }
}

async function parseError(response: Response): Promise<string> {
  try {
    const json = await response.json();
    return json?.message || json?.error || response.statusText;
  } catch {
    return response.statusText || 'Request failed';
  }
}

export async function backendGet<T>(path: string, withAuth = true): Promise<T> {
  const cacheKey = `${withAuth ? 'auth' : 'anon'}:GET:${path}`;
  const now = Date.now();
  const cached = getCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.value as T;
  }

  const inflight = inflightGets.get(cacheKey);
  if (inflight) {
    return inflight as Promise<T>;
  }

  const request = backendRequest<T>('GET', path, undefined, withAuth)
    .then((data) => {
      getCache.set(cacheKey, { expiresAt: Date.now() + GET_CACHE_TTL_MS, value: data });
      inflightGets.delete(cacheKey);
      return data;
    })
    .catch((err) => {
      inflightGets.delete(cacheKey);
      throw err;
    });

  inflightGets.set(cacheKey, request);
  return request;
}

export async function backendPost<T>(path: string, body?: unknown, withAuth = true): Promise<T> {
  const result = await backendRequest<T>('POST', path, body, withAuth);
  invalidateBackendCache('/data/');
  return result;
}

export async function backendPatch<T>(path: string, body?: unknown, withAuth = true): Promise<T> {
  const result = await backendRequest<T>('PATCH', path, body, withAuth);
  invalidateBackendCache('/data/');
  return result;
}

export async function backendDelete<T>(path: string, withAuth = true): Promise<T> {
  const result = await backendRequest<T>('DELETE', path, undefined, withAuth);
  invalidateBackendCache('/data/');
  return result;
}

async function backendRequest<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
  withAuth = true,
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (withAuth) {
    const session = loadCognitoSession();
    if (session?.idToken) {
      headers.Authorization = `Bearer ${session.idToken}`;
    }
  }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    throw new ApiError(await parseError(response), response.status);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

