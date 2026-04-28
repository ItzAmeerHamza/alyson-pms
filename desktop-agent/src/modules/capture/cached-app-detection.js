/**
 * Cached App Detection Wrapper
 * Reduces process spawning by caching results
 * Multiple features can share one detection call
 */

const PlatformManager = require('../../platform/platform-manager');
const platformManager = new PlatformManager();

class AppDetectionCache {
  constructor() {
    this.cache = null;
    this.lastDetection = 0;
    // PERFORMANCE FIX: Increase cache TTL on Windows due to slow PowerShell
    // PowerShell detection takes 2-7 seconds, so cache longer to prevent overlapping calls
    this.cacheTTL = process.platform === 'win32' ? 6000 : 4000; // 6 seconds on Windows, 4s elsewhere
    this.pending = null; // Promise for in-flight detection
    this.hits = 0;
    this.misses = 0;
    this.consecutiveHits = 0; // Track consecutive hits for adaptive caching
    
    console.log('[APP-CACHE] Initialized with', this.cacheTTL, 'ms TTL (platform:', process.platform, ')');
  }
  
  /**
   * Get active app with caching
   * Returns cached result if fresh, otherwise triggers new detection
   */
  async detectActiveApp() {
    const now = Date.now();
    const age = now - this.lastDetection;
    
    // Return cached result if still fresh
    if (this.cache && age < this.cacheTTL) {
      this.hits++;
      if (this.hits % 10 === 0) {
        console.log(`[APP-CACHE] Cache hit (${this.hits} hits, ${this.misses} misses, ${Math.round((this.hits/(this.hits+this.misses))*100)}% hit rate)`);
      }
      return this.cache;
    }
    
    // If detection is already in progress, wait for it
    if (this.pending) {
      console.log('[APP-CACHE] Waiting for in-flight detection...');
      return this.pending;
    }
    
    // Start new detection
    this.misses++;
    console.log(`[APP-CACHE] Cache miss (age: ${age}ms) - detecting...`);
    
    this.pending = platformManager.detectActiveApplication()
      .then(result => {
        this.cache = result;
        this.lastDetection = Date.now();
        this.pending = null;
        return result;
      })
      .catch(error => {
        console.error('[APP-CACHE] Detection error:', error.message);
        this.pending = null;
        return this.cache || { appName: 'Desktop Activity', windowTitle: '', platform: process.platform };
      });
    
    return this.pending;
  }
  
  /**
   * Force clear cache (e.g., on user action)
   */
  clearCache() {
    this.cache = null;
    this.lastDetection = 0;
    console.log('[APP-CACHE] Cache cleared');
  }
  
  /**
   * Get cache stats
   */
  getStats() {
    return {
      hits: this.hits,
      misses: this.misses,
      hitRate: this.hits + this.misses > 0 ? (this.hits / (this.hits + this.misses)) * 100 : 0,
      cacheAge: Date.now() - this.lastDetection,
      hasCachedValue: !!this.cache
    };
  }
}

// Singleton instance
const cache = new AppDetectionCache();

module.exports = {
  detectActiveApp: () => cache.detectActiveApp(),
  clearCache: () => cache.clearCache(),
  getStats: () => cache.getStats()
};

