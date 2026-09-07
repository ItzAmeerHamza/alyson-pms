'use strict';

/**
 * Shared URL extract cache for Mac and Windows.
 * Same browser tab (stable title) → reuse last result instead of AppleScript / UIA / CDP.
 */

const DEFAULT_TTL_MS = 10 * 60 * 1000;

function stableUrlCacheTitle(title) {
  return String(title || '')
    .replace(/\s[-–—]\s*(Google Chrome|Microsoft Edge|Brave|Arc|Firefox|Safari|Chromium|Dia)$/i, '')
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function urlCacheKey(appName, title) {
  return `${appName || ''}|${stableUrlCacheTitle(title)}`;
}

class UrlResultCache {
  constructor(ttlMs) {
    const fromEnv = Number(process.env.URL_RESULT_CACHE_TTL_MS);
    this.ttlMs = Number.isFinite(fromEnv) && fromEnv > 0
      ? fromEnv
      : (Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : DEFAULT_TTL_MS);
    this.map = new Map();
  }

  get(appName, title) {
    const hit = this.map.get(urlCacheKey(appName, title));
    if (hit && (Date.now() - hit.timestamp) < this.ttlMs) {
      return { hit: true, result: hit.result };
    }
    return { hit: false, result: undefined };
  }

  set(appName, title, result) {
    this.map.set(urlCacheKey(appName, title), { result, timestamp: Date.now() });
  }
}

module.exports = {
  UrlResultCache,
  stableUrlCacheTitle,
  urlCacheKey,
  DEFAULT_TTL_MS,
};
