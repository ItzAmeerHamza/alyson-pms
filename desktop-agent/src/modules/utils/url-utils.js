/**
 * URL utilities: canonicalization and redaction
 */

const TRACKER_PARAMS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'gclid', 'fbclid'
];

const SENSITIVE_KEYS = [
  'token', 'session', 'code', 'password', 'pass', 'auth', 'key', 'access_token'
];

function canonicalizeUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return rawUrl;
  const trimmed = rawUrl.trim();
  try {
    const url = new URL(trimmed);

    // Normalize protocol/host
    url.protocol = (url.protocol || 'https:').toLowerCase();
    const lowerHost = (url.hostname || '').toLowerCase();
    url.hostname = lowerHost.startsWith('www.') ? lowerHost.slice(4) : lowerHost;

    // Remove tracking params and redact sensitive ones
    for (const key of [...url.searchParams.keys()]) {
      const k = key.toLowerCase();
      if (TRACKER_PARAMS.includes(k)) {
        url.searchParams.delete(key);
      } else if (SENSITIVE_KEYS.includes(k)) {
        url.searchParams.set(key, '[redacted]');
      }
    }

    // Normalize root path
    if ((url.pathname === '' || url.pathname === '/') && !url.search) {
      url.pathname = '/';
    }

    return url.toString();
  } catch {
    return trimmed;
  }
}

module.exports = { canonicalizeUrl };


