/**
 * Platform Manager Module
 * Central manager for platform-specific functionality
 * Extracted from main.js for modular architecture
 */

class PlatformManager {
  constructor() {
    this.platform = process.platform;
    this.appDetector = null;
    this.cache = {
      lastDetection: null,
      lastDetectionTime: 0,
      cacheMs: Number(process.env.APP_DETECT_CACHE_MS) || 1800, // Default 1800ms cache (90% of 2s poll)
      adaptiveEnabled: process.env.APP_DETECT_ADAPTIVE_CACHE !== 'false',
      stableAppCount: 0,
      lastAppName: null
    };
    
    // Performance throttling for degraded states
    this.degradedState = {
      isThrottled: false,
      lastGoodDetection: 0,
      throttleUntil: 0,
      normalInterval: 2000,
      degradedInterval: 4000, // 4s when degraded
      failureCount: 0,
      circuitBreakerThreshold: 5,
      backoffMultiplier: 1
    };
    
    // Initialize platform-specific modules
    this.initializePlatform();
  }

  /**
   * Initialize platform-specific modules based on current platform
   */
  initializePlatform() {
    switch (this.platform) {
      case 'darwin': // macOS
        this.appDetector = require('./macos/app-detection');
        break;
      case 'win32': // Windows
        // CRITICAL: Detect ARM64 and use optimized detector
        const isARM64 = process.arch === 'arm64';
        if (isARM64) {
          console.log('🔧 [PLATFORM-MANAGER] ARM64 detected - using optimized app detector');
          this.appDetector = require('./windows/app-detection-arm64');
        } else {
          this.appDetector = require('./windows/app-detection');
        }
        break;
      case 'linux': // Linux
        this.appDetector = require('./linux/app-detection');
        break;
      default:
        throw new Error(`Platform ${this.platform} not supported`);
    }
  }

  /**
   * Detect active application using platform-specific method
   */
  async detectActiveApplication() {
    try {
      // Check cache first
      const now = Date.now();
      
      // Adaptive cache TTL based on app stability
      let currentCacheMs = this.cache.cacheMs;
      if (this.cache.adaptiveEnabled) {
        // If same app for 5+ detections, increase cache TTL
        if (this.cache.stableAppCount >= 5) {
          currentCacheMs = Math.min(this.cache.cacheMs * 2, 5000); // Up to 5s for stable apps
        } else if (this.cache.stableAppCount >= 3) {
          currentCacheMs = Math.min(this.cache.cacheMs * 1.5, 3000); // Up to 3s for semi-stable
        }
      }
      
      if (this.cache.lastDetection && (now - this.cache.lastDetectionTime) < currentCacheMs) {
        if (process.env.DEBUG_APP) {
          console.log('[PLATFORM-MANAGER] Returning cached detection (age:', now - this.cache.lastDetectionTime, 'ms, TTL:', currentCacheMs, 'ms)');
        }
        return { ...this.cache.lastDetection, method: 'cached' };
      }

      if (!this.appDetector) {
        throw new Error('App detector not initialized');
      }

      // Check circuit breaker
      if (this.shouldCircuitBreak()) {
        if (process.env.DEBUG_APP) {
          console.log('[PLATFORM-MANAGER] Circuit breaker active, returning last known app');
        }
        return this.cache.lastDetection ? { ...this.cache.lastDetection, method: 'circuit-breaker' } : null;
      }

      // Use the unified detectActiveApp method
      const activeApp = await this.appDetector.detectActiveApp();
      
      // Normalize the format for consumers (provide both legacy and new keys)
      if (activeApp) {
        const normalized = {
          // Legacy keys used by some paths
          name: activeApp.appName,
          title: activeApp.windowTitle,
          // New normalized keys
          appName: activeApp.appName,
          windowTitle: activeApp.windowTitle,
          bundleId: activeApp.bundleId,
          platform: activeApp.platform,
          method: activeApp.method,
          pid: activeApp.pid,
          isBrowser: activeApp.isBrowser,
          // Platform-specific flags
          waylandLimited: activeApp.waylandLimited,
          elevated: activeApp.elevated
        };
        
        // NEW: Linux/Wayland-specific adjustments
        if (this.platform === 'linux' && activeApp.waylandLimited) {
          // On Wayland, use longer cache for stability (less frequent polls)
          currentCacheMs = Math.min(currentCacheMs * 1.5, 4000); // Up to 4s on Wayland
          normalized.waylandDegraded = true;
          console.log('[PLATFORM-MANAGER] Wayland limited mode: extended cache to', currentCacheMs, 'ms');
        }
        
        // Track app stability for adaptive cache
        if (this.cache.lastAppName === activeApp.appName) {
          this.cache.stableAppCount++;
        } else {
          this.cache.stableAppCount = 1;
          this.cache.lastAppName = activeApp.appName;
        }
        
        // Check for degraded states and mark accordingly
        if (activeApp.waylandLimited || activeApp.method === 'unavailable' || activeApp.method === 'fallback') {
          this.markDegraded(`method: ${activeApp.method}, waylandLimited: ${activeApp.waylandLimited}`);
          this.degradedState.failureCount++;
          
          // Linux Wayland: Specific throttle (3s instead of 4s)
          if (this.platform === 'linux' && activeApp.waylandLimited) {
            this.degradedState.degradedInterval = 3000; // 3s for Wayland
          }
        } else if (activeApp.method === 'applescript' || activeApp.method === 'win32api' || activeApp.method === 'xprop' || activeApp.method === 'gdbus-wayland') {
          this.markHealthy();
          this.degradedState.failureCount = 0;
          this.degradedState.backoffMultiplier = 1;
        }
        
        // Update cache
        this.cache.lastDetection = normalized;
        this.cache.lastDetectionTime = now;
        
        return normalized;
      }
      
      // Detection failed
      this.degradedState.failureCount++;
      return null;
    } catch (error) {
      console.log('⚠️ [PLATFORM-MANAGER] App detection failed:', error.message);
      this.degradedState.failureCount++;
      return null;
    }
  }

  /**
   * Clear the detection cache (useful when tracking state changes)
   */
  clearCache() {
    this.cache.lastDetection = null;
    this.cache.lastDetectionTime = 0;
    this.cache.stableAppCount = 0;
    this.cache.lastAppName = null;
  }

  /**
   * Check if we should throttle due to degraded performance
   */
  shouldThrottle() {
    const now = Date.now();
    
    // If we're in throttled state, check if we should exit
    if (this.degradedState.isThrottled && now > this.degradedState.throttleUntil) {
      this.degradedState.isThrottled = false;
      if (process.env.DEBUG_APP) {
        console.log('[PLATFORM-MANAGER] Exiting throttled state');
      }
    }
    
    return this.degradedState.isThrottled;
  }

  /**
   * Check if circuit breaker should activate
   */
  shouldCircuitBreak() {
    // If too many consecutive failures, activate circuit breaker
    if (this.degradedState.failureCount >= this.degradedState.circuitBreakerThreshold) {
      const now = Date.now();
      
      // Exponential backoff: 10s → 30s → 1m → 5m
      const backoffMs = Math.min(10000 * Math.pow(2, this.degradedState.backoffMultiplier - 1), 300000);
      
      if (now < this.degradedState.throttleUntil) {
        return true; // Still in backoff period
      } else {
        // Try again, but increase backoff for next failure
        this.degradedState.backoffMultiplier = Math.min(this.degradedState.backoffMultiplier + 1, 5);
        this.degradedState.throttleUntil = now + backoffMs;
        this.degradedState.failureCount = 0; // Reset for next attempt
        
        if (process.env.DEBUG_APP) {
          console.log(`[PLATFORM-MANAGER] Circuit breaker reset, next backoff: ${backoffMs}ms`);
        }
        
        return false;
      }
    }
    
    return false;
  }

  /**
   * Mark detection as degraded and enable throttling
   */
  markDegraded(reason) {
    const now = Date.now();
    this.degradedState.isThrottled = true;
    
    // Platform-specific throttle durations
    let throttleMs = 10000; // Default 10s
    if (this.platform === 'linux' && this.isWayland()) {
      throttleMs = 8000; // 8s for Wayland (shorter than general 10s)
    }
    
    this.degradedState.throttleUntil = now + throttleMs;
    
    if (process.env.DEBUG_APP) {
      console.log(`[PLATFORM-MANAGER] Entering throttled state (${this.platform}): ${reason} for ${throttleMs}ms`);
    }
  }

  /**
   * Mark detection as healthy
   */
  markHealthy() {
    if (this.degradedState.isThrottled) {
      this.degradedState.isThrottled = false;
      this.degradedState.lastGoodDetection = Date.now();
      
      if (process.env.DEBUG_APP) {
        console.log('[PLATFORM-MANAGER] Detection restored to healthy state');
      }
    }
  }

  /**
   * Check if current platform is macOS
   */
  isMacOS() {
    return this.platform === 'darwin';
  }

  /**
   * Check if current platform is Windows
   */
  isWindows() {
    return this.platform === 'win32';
  }

  /**
   * Check if current platform is Linux
   */
  isLinux() {
    return this.platform === 'linux';
  }

  /**
   * Get current platform
   */
  getPlatform() {
    return this.platform;
  }

  /**
   * Get platform capabilities
   */
  getPlatformCapabilities() {
    const caps = {
      platform: this.platform,
      fullWindowProps: true, // Default
      adaptiveCaching: true,
      lowLevelHooks: false // Depends on platform
    };
    
    if (this.platform === 'linux') {
      caps.fullWindowProps = !this.isWayland(); // X11 yes, Wayland no
      caps.wayland = this.isWayland();
      caps.degradedOnWayland = caps.wayland;
    } else if (this.platform === 'darwin') {
      caps.requiresPermissions = true; // Accessibility/Screen Recording
      caps.fullWindowProps = true;
    } else if (this.platform === 'win32') {
      caps.fullWindowProps = true;
      caps.lowLevelHooks = true; // Windows API
    }
    
    return caps;
  }
  
  /**
   * Check if current platform is Wayland (Linux only)
   */
  isWayland() {
    if (this.platform !== 'linux') return false;
    try {
      const sessionType = process.env.XDG_SESSION_TYPE;
      const waylandDisplay = process.env.WAYLAND_DISPLAY;
      return sessionType === 'wayland' || !!waylandDisplay;
    } catch {
      return false;
    }
  }
}

module.exports = PlatformManager;