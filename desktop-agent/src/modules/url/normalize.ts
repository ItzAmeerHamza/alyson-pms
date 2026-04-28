/**
 * URL Normalization Utility
 * Normalizes and validates URL events
 */

import { UrlEvent, UrlSource } from './types';

const INTERNAL_PREFIXES = ['chrome://', 'edge://', 'about:', 'file://', 'localhost', '127.0.0.1'];

// Map of process/app names to browser sources
const BROWSER_MAP: { [key: string]: UrlSource } = {
  'chrome': 'chrome',
  'google chrome': 'chrome',
  'com.google.chrome': 'chrome',
  'edge': 'edge',
  'microsoft edge': 'edge',
  'com.microsoft.edge': 'edge',
  'brave': 'brave',
  'brave browser': 'brave',
  'com.brave.browser': 'brave',
  'firefox': 'firefox',
  'mozilla firefox': 'firefox',
  'org.mozilla.firefox': 'firefox',
  'safari': 'safari',
  'com.apple.safari': 'safari'
};

/**
 * Infer browser source from app name or bundle ID
 */
export function inferBrowserSource(app: string): UrlSource {
  if (!app) return 'unknown';
  
  const normalized = app.toLowerCase().trim();
  
  // Check direct mappings
  if (BROWSER_MAP[normalized]) {
    return BROWSER_MAP[normalized];
  }
  
  // Check if app contains browser name
  for (const [pattern, source] of Object.entries(BROWSER_MAP)) {
    if (normalized.includes(pattern)) {
      return source;
    }
  }
  
  return 'unknown';
}

/**
 * Normalize a URL event
 */
export function normalizeUrlEvent(raw: UrlEvent): UrlEvent {
  const e: UrlEvent = { ...raw };
  
  // Ensure timestamp
  if (!e.ts || typeof e.ts !== 'number') {
    e.ts = Date.now();
  }
  
  // Normalize app name
  if (typeof e.app === 'string') {
    e.app = e.app.trim();
  } else {
    e.app = 'unknown';
  }
  
  // Infer source from app if not provided
  if (!e.source || e.source === 'unknown') {
    e.source = inferBrowserSource(e.app);
  }

  // Ensure confidence exists
  if (!e.confidence) {
    e.confidence = 'unknown';
  }
  
  // Normalize URL
  if (typeof e.url === 'string') {
    const trimmed = e.url.trim();
    
    // Handle empty URLs
    if (!trimmed) {
      e.url = null;
    }
    // Handle internal URLs (keep them as-is for now, can be filtered later)
    else if (INTERNAL_PREFIXES.some(p => trimmed.startsWith(p))) {
      e.url = trimmed;
    }
    // Validate and normalize regular URLs
    else {
      try {
        const u = new URL(trimmed);
        e.url = u.toString();
      } catch {
        // If not a valid URL, try to fix common issues
        if (trimmed.match(/^[a-z0-9-]+\.[a-z]{2,}/i)) {
          // Looks like a domain without protocol
          try {
            const u = new URL(`https://${trimmed}`);
            e.url = u.toString();
          } catch {
            e.url = null;
          }
        } else {
          e.url = null;
        }
      }
    }
  } else {
    e.url = null;
  }
  
  // Normalize title
  if (typeof e.title === 'string') {
    e.title = e.title.trim() || null;
  } else {
    e.title = null;
  }
  
  // Ensure windowId is set
  if (e.windowId === undefined) {
    e.windowId = null;
  }
  
  // Ensure pid is set
  if (e.pid === undefined || typeof e.pid !== 'number') {
    e.pid = null;
  }
  
  return e;
}

/**
 * Check if URL is internal/special
 */
export function isInternalUrl(url: string | null): boolean {
  if (!url) return true;
  try {
    if (INTERNAL_PREFIXES.some(p => url.startsWith(p))) return true;
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    const host = u.hostname || '';
    return host === 'localhost' || host === '127.0.0.1';
  } catch {
    return false;
  }
}

/**
 * Extract domain from URL
 */
export function extractDomain(url: string | null): string | null {
  if (!url) return null;
  
  try {
    const u = new URL(url);
    return u.hostname.toLowerCase();
  } catch {
    return null;
  }
}

