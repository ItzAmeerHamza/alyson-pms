/**
 * URL Capture Performance Configuration for macOS
 * Optimizes async AppleScript execution and smart detection
 */

module.exports = {
  // Smart detection settings
  smartDetection: {
    appCheckCacheMs: 500,        // Cache app detection for 500ms
    browserCacheTTL: 3000,       // Cache browser URLs for 3 seconds
    browserChangeThreshold: 1000, // Minimum time between browser checks
    maxCacheSize: 50             // Maximum cached entries
  },

  // Async AppleScript timeouts (in milliseconds)
  timeouts: {
    safari: {
      direct: 500,      // Direct Safari API - fast
      fallback: 1500    // System Events fallback - slower but more reliable
    },
    chromium: {
      standard: 2000    // Chrome/Edge/Brave - complex UI
    },
    firefox: {
      standard: 2000    // Firefox - complex UI structure
    },
    combined: 1200      // Combined app detection query
  },

  // Performance optimizations
  performance: {
    maxConcurrentScripts: 2,     // Maximum concurrent AppleScript executions
    backoffDuration: 3000,       // Backoff for 3 seconds on failures
    maxRetries: 2,               // Maximum retry attempts
    enableSmartPolling: true     // Enable smart polling (only when needed)
  },

  // Environment variable overrides
  env: {
    URL_CAPTURE_POLL_INTERVAL: process.env.URL_CAPTURE_POLL_INTERVAL || 2000,
    URL_TRACKING_POLL_MS_IDLE: process.env.URL_TRACKING_POLL_MS_IDLE || 5000,
    URL_TRACKING_MIN_POLL_MS_ACTIVE: process.env.URL_TRACKING_MIN_POLL_MS_ACTIVE || 1000
  }
};
