/**
 * Cached App Detection Wrapper
 * Coalesces in-flight calls onto the shared PlatformManager so app + URL
 * capture do not spawn duplicate AppleScript/PowerShell processes.
 */

let _fallbackPm = null;

function getPlatformManager() {
  if (global.platformManager && typeof global.platformManager.detectActiveApplication === 'function') {
    return global.platformManager;
  }
  if (!_fallbackPm) {
    const PlatformManager = require('../../platform/platform-manager');
    _fallbackPm = new PlatformManager();
  }
  return _fallbackPm;
}

class AppDetectionCache {
  constructor() {
    this.pending = null;
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Get active app. PlatformManager owns TTL; this wrapper only coalesces
   * overlapping callers onto one in-flight native call.
   */
  async detectActiveApp() {
    if (this.pending) {
      this.hits++;
      return this.pending;
    }

    this.misses++;
    const pm = getPlatformManager();
    this.pending = pm.detectActiveApplication()
      .then((result) => result)
      .catch((error) => {
        if (process.env.DEBUG_APP) {
          console.error('[APP-CACHE] Detection error:', error.message);
        }
        return { appName: 'Desktop Activity', windowTitle: '', platform: process.platform };
      })
      .finally(() => {
        this.pending = null;
      });

    return this.pending;
  }

  clearCache() {
    this.pending = null;
    try {
      getPlatformManager().clearCache?.();
    } catch (_) { /* ignore */ }
  }

  getStats() {
    return {
      hits: this.hits,
      misses: this.misses,
      hitRate: this.hits + this.misses > 0 ? (this.hits / (this.hits + this.misses)) * 100 : 0,
      hasCachedValue: !!getPlatformManager().cache?.lastDetection,
    };
  }
}

const cache = new AppDetectionCache();

module.exports = {
  detectActiveApp: () => cache.detectActiveApp(),
  clearCache: () => cache.clearCache(),
  getStats: () => cache.getStats(),
};
