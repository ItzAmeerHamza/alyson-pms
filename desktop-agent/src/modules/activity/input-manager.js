/**
 * UNIFIED INPUT MANAGER
 * Consolidates 6 duplicate input detection systems into one
 * All detectors emit the same events: mouseClick, keyPress, mouseMovement
 * 
 * SAFETY: This is a consolidation of duplicate logic, not new functionality
 * Original implementations: UnifiedInputTracker, CrossPlatformInputDetector, 
 * RealOSInputDetector, plus 3 other detection methods in main.js
 */

const { EventEmitter } = require('events');
const debugLogger = require('../utils/debug-logger');
const { logger } = require('../utils/logger');

class UnifiedInputManager extends EventEmitter {
  constructor() {
    super();
    this.isActive = false;
    this.stats = {
      mouseClicks: 0,
      keystrokes: 0,
      mouseMovements: 0,
      lastActivity: Date.now(),
      lastClickTime: 0,
      lastKeyPressTime: 0,
      lastMoveTime: 0
    };
    this.detectionMethods = new Set();
    this.intervals = [];
  }

  /**
   * Initialize all detection methods
   * Preserves all original detection approaches
   * CRITICAL FIX: Only prepares the system, does NOT start monitoring
   * Monitoring starts when startTracking() is called
   */
  async initialize(electronModules = {}) {
    
    this.electronModules = electronModules;
    const { powerMonitor, screen } = electronModules;

    logger.info({ category: 'INPUT', step: 'MONITOR INIT', message: 'Unified input detection initializing (NOT starting)' });

    // CRITICAL FIX: DO NOT start detection methods during initialization
    // Only prepare the electron modules - actual monitoring starts when tracking begins
    
    this.isActive = false; // Explicitly set to false on init
    
    // [IN0] Hooks init
    debugLogger.in0('Input hooks initialized (dormant until tracking starts)', {
      platform: process.platform,
      hasPowerMonitor: !!powerMonitor,
      hasScreen: !!screen
    });

    logger.info({ category: 'INPUT', step: 'MONITOR INIT COMPLETE', message: 'Ready to start when tracking begins' });
  }

  /**
   * Start monitoring when tracking begins
   * CRITICAL FIX: Always starts fresh, allowing clean restarts
   * OPTIMIZED: Returns immediately for fast UI, Python process starts in background
   */
  async startTracking() {
    // CRITICAL FIX: Stop first to ensure clean state if already running
    if (this.isActive) {
      logger.info({ category: 'INPUT', step: 'MONITOR RESTART', message: 'Stopping before restart' });
      this.stopTracking();
    }
    
    logger.info({ category: 'INPUT', step: 'MONITOR START', message: 'Starting input detection monitoring' });
    const { powerMonitor, screen } = this.electronModules;

    // Clear old state
    this.intervals = [];
    this.detectionMethods.clear();

    // Method 1: PowerMonitor (most reliable on Electron)
    if (powerMonitor && powerMonitor.on) {
      this.initializePowerMonitor(powerMonitor);
    }

    // Mark as active early so UI is responsive
    this.isActive = true;

    // Method 2: Cross-platform detection (external Python process)
    // OPTIMIZED: Start in background for faster UI response, other methods work immediately
    if (process.platform === 'darwin' || process.platform === 'win32' || process.platform === 'linux') {
      this.initializePlatformSpecific().catch(error => {
        logger.error({ category: 'INPUT', step: 'PLATFORM INIT ERROR', message: error.message });
      });
    }

    // Method 3: Mouse position polling (disabled/no-op)
    if (screen && typeof this.initializeMousePositionPolling === 'function') {
      this.initializeMousePositionPolling(screen);
    }

    // Method 4: System idle monitoring
    if (powerMonitor) {
      this.initializeSystemIdleMonitoring(powerMonitor);
    }

    // Start periodic aggregated summary (every 60s) to avoid per-event spam
    const summaryInterval = setInterval(() => {
      if (!this.isActive) return;
      const ctx = {
        mouse_clicks: this.stats.mouseClicks,
        keystrokes: this.stats.keystrokes,
        mouse_movements: this.stats.mouseMovements,
        last_activity_iso: new Date(this.stats.lastActivity).toISOString(),
      };
      logger.info({ category: 'INPUT', step: 'SUMMARY', message: 'Aggregated input metrics', ctx });
    }, 60000);
    this.intervals.push(summaryInterval);
    
    // [IN0] Hooks init (for tracking start)
    debugLogger.in0('Input tracking started', {
      providersEnabled: Array.from(this.detectionMethods),
      totalMethods: this.detectionMethods.size,
      platform: process.platform,
      hasPowerMonitor: !!powerMonitor,
      hasScreen: !!screen
    });
    
    logger.info({ category: 'INPUT', step: 'MONITOR STARTED', message: `Methods: ${this.detectionMethods.size}` });
  }

  /**
   * Stop monitoring when tracking ends
   * CRITICAL FIX: Properly stops external Python process
   */
  stopTracking() {
    if (!this.isActive) {
      logger.debug({ category: 'INPUT', step: 'MONITOR STOP SKIPPED', message: 'Already stopped' });
      return;
    }
    
    logger.info({ category: 'INPUT', step: 'MONITOR STOP', message: 'Stopping input detection monitoring' });
    this.isActive = false;
    
    // CRITICAL FIX: Stop platform-specific detector (kills external Python process)
    if (this.platformDetector && typeof this.platformDetector.stop === 'function') {
      try {
        logger.info({ category: 'INPUT', step: 'PLATFORM STOP', message: 'Stopping platform detector...' });
        this.platformDetector.stop();
        logger.info({ category: 'INPUT', step: 'PLATFORM STOPPED', message: 'Platform detector stopped' });
      } catch (error) {
        logger.error({ category: 'INPUT', step: 'PLATFORM STOP ERROR', message: error.message });
      }
      this.platformDetector = null;
    }
    
    // Clear all intervals and event listeners
    this.intervals.forEach(interval => {
      if (interval) clearInterval(interval);
    });
    this.intervals = [];
    
    // Remove PowerMonitor listeners if they exist
    const { powerMonitor } = this.electronModules;
    if (powerMonitor && powerMonitor.removeAllListeners) {
      powerMonitor.removeAllListeners('user-activity');
    }
    
    this.detectionMethods.clear();
    
    // CRITICAL FIX: Reset stats when stopping to ensure clean state for next session
    // This prevents old lastActivity from affecting idle calculations in the next session
    this.stats = {
      mouseClicks: 0,
      keystrokes: 0,
      mouseMovements: 0,
      lastActivity: Date.now(),
      lastClickTime: 0,
      lastKeyPressTime: 0,
      lastMoveTime: 0
    };
    logger.info({ category: 'INPUT', step: 'STATS RESET', message: 'Input stats reset for next session' });
    
    logger.info({ category: 'SYSTEM', step: 'INPUT MONITOR STOPPED' });
  }

  /**
   * PowerMonitor detection (from UnifiedInputTracker)
   * CRITICAL FIX: PowerMonitor now ONLY updates idle timer, does NOT generate synthetic activity
   * Synthetic click/key generation removed - only real Python-detected input should count
   */
  initializePowerMonitor(powerMonitor) {
    let lastPowerActivity = Date.now();

    powerMonitor.on('user-activity', () => {
      const now = Date.now();
      lastPowerActivity = now;
      
      // CRITICAL FIX: Check system idle time before updating lastActivity
      // This prevents PowerMonitor events from resetting idle timer when user is truly idle
      try {
        const systemIdleSeconds = powerMonitor.getSystemIdleTime();
        // Only update lastActivity if system is NOT reporting idle
        // PowerMonitor events can fire from background processes even when idle
        if (systemIdleSeconds < 5) {
          this.stats.lastActivity = now;
        }
      } catch (_) {
        // Fallback: update lastActivity if we can't check idle time
        this.stats.lastActivity = now;
      }
      
      // REMOVED: Synthetic click/key generation from PowerMonitor
      // PowerMonitor doesn't know if user clicked or typed - it just fires on any activity
      // Real input detection happens via Python external monitors on all platforms
      // This prevents false activity during idle periods
    });

    this.detectionMethods.add('powerMonitor');
    logger.debug({ category: 'INPUT', step: 'METHOD', message: 'PowerMonitor active (idle timer only, no synthetic activity)' });
  }

  /**
   * Platform-specific detection (from CrossPlatformInputDetector)
   */
  async initializePlatformSpecific() {
    // Import existing platform detector if available
    try {
      const CrossPlatformInputDetector = require('../../cross-platform-input-detector.js');
      const detector = new CrossPlatformInputDetector();
      
      detector.on('mouseClick', (data) => {
        // data.method already contains platform prefix from CrossPlatformInputDetector
        this.recordActivity('click', data.method);
      });
      
      detector.on('keyPress', (data) => {
        // data.method already contains platform prefix from CrossPlatformInputDetector
        this.recordActivity('key', data.method);
      });
      
      detector.on('mouseMovement', (data) => {
        // data.method already contains platform prefix from CrossPlatformInputDetector
        this.recordActivity('move', data.method);
      });

      await detector.start(this.electronModules);
      this.platformDetector = detector;
      this.detectionMethods.add('platform');
      logger.debug({ category: 'INPUT', step: 'METHOD', message: 'Platform-specific detection active' });
    } catch (error) {
      logger.warn({ category: 'INPUT', step: 'METHOD WARN', message: 'Platform detection not available', ctx: { error: error.message } });
    }
  }

  /**
   * Mouse position polling - intentionally a no-op to avoid artificial activity
   */
  initializeMousePositionPolling() {
    // Intentionally left blank
  }

  /**
   * System idle monitoring (from UnifiedInputTracker)
   */
  initializeSystemIdleMonitoring(powerMonitor) {
    const interval = setInterval(() => {
      if (!this.isActive) return;

      try {
        const systemIdle = powerMonitor.getSystemIdleTime();
        const timeSinceLastActivity = Date.now() - this.stats.lastActivity;

        // In user-only mode we never synthesize input from idle APIs.
        // Keep this path purely informational for higher-level idle checks.
      } catch (error) {
        // Ignore monitoring errors
      }
    }, 4000);

    this.intervals.push(interval);
    this.detectionMethods.add('systemIdle');
    logger.debug({ category: 'INPUT', step: 'METHOD', message: 'System idle monitoring active' });
  }

  /**
   * Record activity - unified interface for all detection methods
   */
  recordActivity(type, method) {
    const now = Date.now();
// CRITICAL FIX (Bug 2): Check isPlatformDetector FIRST, BEFORE the early return
    // Platform detector events (from Python, native monitors) are real OS-level input
    // and should ALWAYS be recorded, even during stop sequence
    const isPlatformDetector = method && (
      method.includes('darwin') || 
      method.includes('win32') || 
      method.includes('linux') || 
      method.includes('python') ||
      method.includes('platform') ||
      method.includes('external') ||
      method.includes('native')
    );
    
    // For NON-platform events: gate when tracking is stopped
    // For platform events: always allow through (they're real OS input)
    if (!isPlatformDetector) {
      if (!this.isActive || global.isTracking === false || global.isStopping === true) {
        return;
      }
    }
    // Platform detector events pass through without gating
    
    // CRITICAL FIX: Trust platform detector events - they come from real OS input monitoring
    // Only gate activity from potentially synthetic sources (powerMonitor, polling, etc.)
    if (!isPlatformDetector) {
      try {
        const powerMonitor = this.electronModules?.powerMonitor;
        if (powerMonitor && typeof powerMonitor.getSystemIdleTime === 'function') {
          const systemIdleSeconds = powerMonitor.getSystemIdleTime();
          // Configurable threshold via environment variable (default 60s, was 30s)
          const idleThreshold = Number(process.env.INPUT_IDLE_GATE_SECONDS) || 60;
          // Only drop non-platform events if system is truly idle
          if (systemIdleSeconds > idleThreshold) {
            // Throttle logging to avoid spam
            if (!this._lastIdleDropLog || now - this._lastIdleDropLog > 10000) {
              logger.debug({ category: 'INPUT', step: 'IDLE-GATE', message: `Dropped ${type} from ${method} - system idle ${systemIdleSeconds}s (threshold: ${idleThreshold}s)` });
              this._lastIdleDropLog = now;
            }
            return;
          }
        }
      } catch (_) {}
    }
    
    // Update lastActivity now that we've passed the gate
    this.stats.lastActivity = now;

    // Do NOT call global.recordEnhancedActivity here: main.js already listens for mouseClick/keyPress/mouseMovement
    // and runs recordEnhancedActivity — calling it from both places doubled clicks/keys/moves in DB + screenshots.

    switch (type) {
      case 'click':
        this.stats.mouseClicks++;
        this.stats.lastClickTime = now;
        
        // [IN2] Mouse click
        debugLogger.in2('Mouse click detected', {
          button: 'left', // Default assumption
          method: method,
          total: this.stats.mouseClicks,
          throttled: false
        });
        
        this.emit('mouseClick', {
          timestamp: now,
          total: this.stats.mouseClicks,
          method: method
        });
        break;

      case 'key':
        this.stats.keystrokes++;
        this.stats.lastKeyPressTime = now;
        
        // [IN3] Key press
        debugLogger.in3('Key press detected', {
          keycode: 'unknown', // Platform-specific detector would provide this
          modifiers: 'unknown',
          method: method,
          total: this.stats.keystrokes
        });
        
        this.emit('keyPress', {
          timestamp: now,
          total: this.stats.keystrokes,
          method: method
        });
        // Avoid per-key console spam; rely on DEBUG_INPUT via debugLogger if needed
        break;

      case 'move': {
        const moveMinMs = Number(process.env.ACTIVITY_MOVE_MIN_MS) || 750;
        if (now - (this._lastMoveEmitAt || 0) < moveMinMs) {
          break;
        }
        this._lastMoveEmitAt = now;
        this.stats.mouseMovements++;
        this.stats.lastMoveTime = now;

        const shouldLogMove = this.stats.mouseMovements % 50 === 0;
        if (shouldLogMove) {
          debugLogger.in1('Mouse move detected', {
            dx: 'unknown',
            dy: 'unknown',
            method: method,
            total: this.stats.mouseMovements,
            throttled: true
          });
        }

        this.emit('mouseMovement', {
          timestamp: now,
          total: this.stats.mouseMovements,
          method: method
        });
        break;
      }
    }
  }

  /**
   * Get current stats
   */
  getStats() {
    return {
      ...this.stats,
      activeMethods: Array.from(this.detectionMethods),
      isActive: this.isActive
    };
  }

  /**
   * Return system idle time in seconds.
   * Primary source: OS-level getSystemIdleTime() (Win32 GetLastInputInfo / macOS CGEventSource).
   * Fallback to lastActivity ONLY when powerMonitor is genuinely unavailable.
   */
  getIdleTime() {
    try {
      const powerMonitor = this.electronModules?.powerMonitor;
      if (powerMonitor && typeof powerMonitor.getSystemIdleTime === 'function') {
        const secs = Number(powerMonitor.getSystemIdleTime());
        if (!Number.isNaN(secs)) {
          if (secs > 0 && secs % 30 === 0) {
            console.log(`🧍 [IDLE] User idle for ${secs}s (source: OS)`);
          }
          return secs;
        }
      }
    } catch (_) {}
    
    // Fallback: only when powerMonitor is unavailable (not when it returns 0)
    const sinceLast = Math.floor((Date.now() - (this.stats.lastActivity || Date.now())) / 1000);
    const idleSeconds = Math.max(0, sinceLast);
    if (idleSeconds > 0 && idleSeconds % 30 === 0) {
      console.log(`🧍 [IDLE] User idle for ${idleSeconds}s (source: lastActivity fallback)`);
    }
    return idleSeconds;
  }

  /**
   * Stop all detection
   */
  stop() {
    this.isActive = false;

    // Clear all intervals
    this.intervals.forEach(interval => clearInterval(interval));
    this.intervals = [];

    // Stop platform detector
    if (this.platformDetector) {
      this.platformDetector.stop();
      this.platformDetector = null;
    }

    logger.info({ category: 'INPUT', step: 'MONITOR STOPPED' });
  }
}

module.exports = UnifiedInputManager;