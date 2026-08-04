/**
 * EVENT HANDLER MANAGER MODULE
 * 
 * Manages event handlers and power monitoring for the TimeFlow desktop agent.
 * This includes app events, power monitor events, and system event handling.
 * 
 * Part of TimeFlow Desktop Agent modular refactoring
 */

class EventHandlerManager {
  constructor(dependencies = {}) {
    this.global = dependencies.global || global;
    this.console = dependencies.console || console;
    this.setTimeout = dependencies.setTimeout || setTimeout;
    this.clearInterval = dependencies.clearInterval || clearInterval;
    this.clearTimeout = dependencies.clearTimeout || clearTimeout;
    
    // Dependencies
    this.app = dependencies.app;
    this.powerMonitor = dependencies.powerMonitor;
    this.mainWindow = dependencies.mainWindow;
    this.isTracking = dependencies.isTracking;
    this.stopTracking = dependencies.stopTracking;
    this.antiCheatDetector = dependencies.antiCheatDetector;
    this.safeLog = dependencies.safeLog;
    this.debounceEvent = dependencies.debounceEvent;
    
    // State variables
    this.systemSleepStart = null;
    
    // Legacy grace timers (cleared if present). Sleep/lock no longer stop tracking —
    // only screenshots pause so the continuous timer matches Time Doctor.
    this._displaySleepGraceTimer = null;
    this._screenLockGraceTimer = null;
    this.GRACE_PERIOD_MS = 2 * 60 * 1000; // unused for stop; kept for compatibility
    
    console.log('✅ EventHandlerManager initialized');
  }

  /**
   * Set up application event handlers
   */
  setupAppEventHandlers() {
    if (!this.app) {
      this.console.log('⚠️ App not available - skipping app event handlers');
      return;
    }

    // App activate event with debouncing
    this.app.on('activate', this.debounceEvent('app-activate', () => {
      if (this.mainWindow) {
        this.safeLog('📱 App activate event (debounced)');
        
        try {
          // Properly restore window when dock/taskbar icon is clicked
          if (this.mainWindow.isMinimized()) {
            this.mainWindow.restore();
          }
          this.mainWindow.show();
          this.mainWindow.focus();
          
          // Ensure window is brought to front on all platforms
          if (process.platform === 'darwin') {
            this.app.focus();
          }
          
          this.safeLog('📱 Window activated from dock/taskbar click');
        } catch (error) {
          this.console.error('❌ Error in activate event:', error);
        }
      } else {
        // FALLBACK: Try to use global.mainWindow or windowUIManager
        if (this.global.windowManager && typeof this.global.windowManager.showMainWindow === 'function') {
          this.global.windowManager.showMainWindow();
        } else if (this.global.windowUIManager && typeof this.global.windowUIManager.showWindow === 'function') {
          this.global.windowUIManager.showWindow();
        } else if (this.global.mainWindow) {
          try {
            if (this.global.mainWindow.isMinimized()) {
              this.global.mainWindow.restore();
            }
            this.global.mainWindow.show();
            this.global.mainWindow.focus();
            if (process.platform === 'darwin') {
              this.app.focus();
            }
          } catch (error) {
            this.console.error('❌ Fallback window show failed:', error);
          }
        }
      }
    }));

    this.console.log('✅ [EVENT-HANDLERS] App event handlers set up');
  }

  /**
   * Set up power monitoring events
   */
  setupPowerMonitoring() {
    if (!this.powerMonitor) {
      this.console.log('⚠️ PowerMonitor not available - skipping power monitoring');
      return;
    }

    // System suspend event
    this.powerMonitor.on('suspend', () => {
      this.console.log('💤 System suspended (laptop closed/sleep mode)');
      this.systemSleepStart = Date.now();
      
      // Notify tray manager so it can defer notifications
      if (this.global.trayManager) {
        this.global.trayManager.onSystemSleep();
      }
      
      // Keep tracking through sleep (Time Doctor parity). Wall-clock elapsed
      // (Date.now() - sessionStart) still counts sleep time on wake. Stopping
      // here created multi-hour gaps vs other timers with no idle prompt shown.
      if (this.global.isTracking) {
        this.console.log('💤 Laptop sleep — keeping tracking active; pausing screenshots only');
        try {
          const screenshotMgr = this.global.enhancedScreenshotManager || global.enhancedScreenshotManager;
          if (screenshotMgr && typeof screenshotMgr.pauseScreenshotsOnly === 'function') {
            screenshotMgr.pauseScreenshotsOnly();
          }
        } catch (e) {
          this.console.log('⚠️ [SLEEP] Failed to pause screenshots:', e?.message);
        }
      }
      
      // Pause anti-cheat during sleep (restart on resume if still tracking)
      if (this.antiCheatDetector) {
        this.antiCheatDetector.stopMonitoring();
      }
    });

    // System resume event
    // NOTE: This is the SINGLE consolidated resume handler.
    // system-initialization-manager.js resume handler has been removed to prevent
    // duplicate work, race conditions, and process spawning storms on low-memory machines.
    this.powerMonitor.on('resume', async () => {
      // Prevent concurrent resume handling (can fire multiple times on some Windows machines)
      if (this._resumeInProgress) {
        this.console.log('⚠️ [RESUME] Already processing resume, skipping duplicate');
        return;
      }
      this._resumeInProgress = true;

      try {
        this.console.log('🌅 System resumed from sleep');
        // Clear shutdown flag so detection/polling can resume when tracking starts
        global.isShuttingDown = false;
        // Safety net: always clear screen lock flag on resume (display-wake should also clear it,
        // but this prevents the flag from getting stuck if display-wake doesn't fire)
        global.isScreenLocked = false;
        
        // Re-sync tray state and fire any deferred auto-stop notification
        if (this.global.trayManager) {
          this.global.trayManager.onSystemResume();
        }
        
        if (this.systemSleepStart) {
          const sleepDuration = Date.now() - this.systemSleepStart;
          const sleepMinutes = Math.floor(sleepDuration / (60 * 1000));
          
          this.console.log(`💤 System was asleep for ${sleepMinutes} minutes`);
          
          // Reset sleep tracking
          this.systemSleepStart = null;
        }
        
        // Restore user authentication (but NOT tracking session)
        // FREEZE FIX: Wrap in 5s timeout to prevent hangs when network is not ready after resume
        const RESUME_TIMEOUT_MS = 5000;
        try {
          await new Promise(resolve => setTimeout(resolve, 100));
          const savedSession = await Promise.race([
            (async () => {
              return this.global.loadDesktopAgentSession ? this.global.loadDesktopAgentSession() : null;
            })(),
            new Promise(resolve => setTimeout(() => {
              this.console.warn('⚠️ [RESUME] Session load timed out after 5s');
              resolve(null);
            }, RESUME_TIMEOUT_MS))
          ]);
          if (savedSession && savedSession.id) {
            this.console.log('✅ Desktop agent session loaded:', savedSession.email);
            if (this.global.config) {
              this.global.config.user_id = savedSession.id;
            }
            if (typeof this.global.showTrayNotification === 'function') {
              if (this.global.isTracking) {
                this.global.showTrayNotification(
                  `Welcome back ${savedSession.email.split('@')[0]}! Tracking continued through sleep.`,
                  'info'
                );
              } else {
                this.global.showTrayNotification(
                  `Welcome back ${savedSession.email.split('@')[0]}! Click to start tracking when ready.`,
                  'info'
                );
              }
            }
          } else {
            this.console.warn('⚠️ No saved session - user must log in before tracking');
            if (typeof this.global.showTrayNotification === 'function') {
              this.global.showTrayNotification('Please log in to start tracking', 'warning');
            }
          }
        } catch (error) {
          this.console.error('❌ Failed to restore user authentication:', error);
        }

        // FREEZE FIX: Recover screenshot permissions with timeout (merged from system-initialization-manager)
        try {
          if (this.global.recoverScreenshotPermissions) {
            await Promise.race([
              this.global.recoverScreenshotPermissions(),
              new Promise(resolve => setTimeout(() => {
                this.console.warn('⚠️ [RESUME] Screenshot permission recovery timed out after 5s');
                resolve();
              }, RESUME_TIMEOUT_MS))
            ]);
          }
        } catch (e) {
          this.console.warn('⚠️ [RESUME] Screenshot permission recovery error:', e?.message);
        }
        
        // Restart anti-cheat monitoring if needed (merged from system-initialization-manager)
        if (this.antiCheatDetector && this.global.isTracking) {
          this.antiCheatDetector.startMonitoring();
        } else if (this.global.appSettings?.enable_anti_cheat && this.global.isTracking) {
          try {
            if (!this.global.antiCheatDetector) {
              const AntiCheatDetector = require('../activity/anti-cheat-detector');
              this.global.antiCheatDetector = new AntiCheatDetector(
                this.global.appSettings, 
                this.global.syncManager
              );
            }
            this.global.antiCheatDetector.startMonitoring();
          } catch (e) {
            this.console.warn('⚠️ [RESUME] Anti-cheat restart failed:', e?.message);
          }
        }

        // Resume screenshots + tray clock if tracking stayed active through sleep.
        if (this.global.isTracking) {
          try {
            const screenshotMgr = this.global.enhancedScreenshotManager || global.enhancedScreenshotManager;
            if (screenshotMgr && typeof screenshotMgr.resumeScreenshotsOnly === 'function') {
              screenshotMgr.resumeScreenshotsOnly();
            }
          } catch (e) {
            this.console.warn('⚠️ [RESUME] Screenshot resume failed:', e?.message);
          }
          try {
            if (this.global.trayManager?.startTrayTimer) {
              this.global.trayManager.startTrayTimer();
            }
          } catch (e) {
            this.console.warn('⚠️ [RESUME] Tray timer restart failed:', e?.message);
          }
        }

        if (typeof this.global.updateTrayMenuThrottled === 'function') {
          this.global.updateTrayMenuThrottled();
        }
        
        this.console.log(
          this.global.isTracking
            ? '🌅 System resumed — tracking still active (continuous timer)'
            : '🌅 System resumed — tracking is stopped',
        );
      } finally {
        this._resumeInProgress = false;
      }
    });

    // System shutdown event
    this.powerMonitor.on('shutdown', () => {
      this.console.log('🔴 System shutdown detected');
      
      if (this.global.isTracking) {
        this.console.log('🛑 System shutdown - stopping tracking immediately');
        if (typeof this.global.stopTracking === 'function') {
          this.global.stopTracking('system_shutdown', 'System shutdown - tracking stopped automatically');
        }
      }
      
      // Clear all intervals and timeouts
      if (this.global.clearAllIntervals) {
        this.global.clearAllIntervals();
      }
    });

    // Display sleep/wake — pause screenshots only; never stop the timer.
    this.powerMonitor.on('display-sleep', () => {
      this.console.log('🖥️ Display sleep detected');
      global.isScreenLocked = true; // Treat display sleep same as lock for all systems
      this.console.log(`🔍 [DEBUG] Global tracking state: ${this.global.isTracking}, timestamp: ${new Date().toISOString()}`);
      
      if (this.global.isTracking) {
        // Pause screenshots to prevent black screen captures; keep timer running.
        try {
          const screenshotMgr = this.global.enhancedScreenshotManager || global.enhancedScreenshotManager;
          if (screenshotMgr && typeof screenshotMgr.pauseScreenshotsOnly === 'function') {
            screenshotMgr.pauseScreenshotsOnly();
            this.console.log('📸 [SLEEP] Screenshots paused on display sleep (tracking continues)');
          }
        } catch (e) {
          this.console.log('⚠️ [SLEEP] Failed to pause screenshots:', e?.message);
        }
        // Cancel any legacy grace-stop timer from older builds still in memory.
        if (this._displaySleepGraceTimer) {
          clearTimeout(this._displaySleepGraceTimer);
          this._displaySleepGraceTimer = null;
        }
      }
    });
    
    this.powerMonitor.on('display-wake', () => {
      this.console.log('🌅 Display wake detected');
      global.isScreenLocked = false;
      if (this._displaySleepGraceTimer) {
        clearTimeout(this._displaySleepGraceTimer);
        this._displaySleepGraceTimer = null;
      }

      if (this.global.isTracking) {
        try {
          const screenshotMgr = this.global.enhancedScreenshotManager || global.enhancedScreenshotManager;
          if (screenshotMgr && typeof screenshotMgr.resumeScreenshotsOnly === 'function') {
            screenshotMgr.resumeScreenshotsOnly();
            this.console.log('📸 [WAKE] Screenshots resumed after display wake');
          }
        } catch (e) {
          this.console.log('⚠️ [WAKE] Failed to resume screenshots:', e?.message);
        }
      }
    });

    // Screen lock/unlock — pause screenshots only; never stop the timer.
    this.powerMonitor.on('lock-screen', () => {
      this.console.log('🔒 Screen locked');
      global.isScreenLocked = true;
      this.console.log(`🔍 [DEBUG] Global tracking state: ${this.global.isTracking}, timestamp: ${new Date().toISOString()}`);
      
      if (this.global.isTracking) {
        try {
          const screenshotMgr = this.global.enhancedScreenshotManager || global.enhancedScreenshotManager;
          if (screenshotMgr && typeof screenshotMgr.pauseScreenshotsOnly === 'function') {
            screenshotMgr.pauseScreenshotsOnly();
            this.console.log('📸 [LOCK] Screenshots paused on screen lock (tracking continues)');
          }
        } catch (e) {
          this.console.log('⚠️ [LOCK] Failed to pause screenshots:', e?.message);
        }
        if (this._screenLockGraceTimer) {
          clearTimeout(this._screenLockGraceTimer);
          this._screenLockGraceTimer = null;
        }
      }
    });
    
    this.powerMonitor.on('unlock-screen', () => {
      this.console.log('🔓 Screen unlocked');
      global.isScreenLocked = false;
      
      if (this._screenLockGraceTimer) {
        clearTimeout(this._screenLockGraceTimer);
        this._screenLockGraceTimer = null;
      }

      if (this.global.isTracking) {
        try {
          const screenshotMgr = this.global.enhancedScreenshotManager || global.enhancedScreenshotManager;
          if (screenshotMgr && typeof screenshotMgr.resumeScreenshotsOnly === 'function') {
            screenshotMgr.resumeScreenshotsOnly();
            this.console.log('📸 [UNLOCK] Screenshots resumed after screen unlock');
          }
        } catch (e) {
          this.console.log('⚠️ [UNLOCK] Failed to resume screenshots:', e?.message);
        }
      } else {
        // Fire any deferred auto-stop notification from older builds
        const trayManager = global.trayManager;
        if (trayManager && trayManager._pendingAutoStopReason) {
          const reason = trayManager._pendingAutoStopReason;
          const message = trayManager._pendingAutoStopMessage;
          trayManager._pendingAutoStopReason = null;
          trayManager._pendingAutoStopMessage = null;
          this.console.log(`🔔 [UNLOCK] Firing deferred auto-stop notification: ${reason}`);
          setTimeout(() => {
            trayManager.showAutoStopNotification(reason, message);
          }, 1500);
        }
      }
    });

    this.console.log('✅ [POWER-MONITOR] Power monitoring events set up (suspend, resume, shutdown, display-sleep, display-wake, lock-screen, unlock-screen)');
  }

  /**
   * Perform aggressive cleanup of intervals and timeouts
   */
  performAggressiveCleanup() {
    this.console.log('🧹 [CLEANUP] Starting aggressive cleanup...');
    
    // Clear grace period timers
    if (this._displaySleepGraceTimer) {
      clearTimeout(this._displaySleepGraceTimer);
      this._displaySleepGraceTimer = null;
    }
    if (this._screenLockGraceTimer) {
      clearTimeout(this._screenLockGraceTimer);
      this._screenLockGraceTimer = null;
    }
    
    // Nuclear option: clear ALL possible intervals
    for (let i = 1; i < 10000; i++) {
      this.clearInterval(i);
      this.clearTimeout(i);
    }
    
    // Stop notification checking if available
    // FIXED: Use global.notificationManager directly instead of non-existent global.stopNotificationChecking
    if (this.global.notificationManager && typeof this.global.notificationManager.stopNotificationChecking === 'function') {
      this.global.notificationManager.stopNotificationChecking();
      this.console.log('✅ Notification checking stopped');
    }
    
    // Force garbage collection if available
    if (this.global.gc) {
      this.global.gc();
      this.console.log('✅ Garbage collection forced on shutdown');
    }
    
    this.console.log('✅ Aggressive cleanup completed');
  }

  /**
   * Set up app before-quit event handler
   */
  setupBeforeQuitHandler() {
    if (!this.app) {
      this.console.log('⚠️ App not available - skipping before-quit handler');
      return;
    }

    this.app.on('before-quit', () => {
      this.console.log('🛑 App before-quit event - performing cleanup');
      this.performAggressiveCleanup();
    });

    this.console.log('✅ [EVENT-HANDLERS] Before-quit handler set up');
  }

  /**
   * Set up window-all-closed event handler
   */
  setupWindowAllClosedHandler() {
    if (!this.app) {
      this.console.log('⚠️ App not available - skipping window-all-closed handler');
      return;
    }

    this.app.on('window-all-closed', () => {
      // On macOS, keep the app running even when all windows are closed
      if (process.platform !== 'darwin') {
        this.app.quit();
      }
    });

    this.console.log('✅ [EVENT-HANDLERS] Window-all-closed handler set up');
  }

  /**
   * Get power monitoring statistics
   */
  getPowerMonitoringStats() {
    return {
      powerMonitorAvailable: !!this.powerMonitor,
      systemSleepStart: this.systemSleepStart,
      currentSleepDuration: this.systemSleepStart ? Date.now() - this.systemSleepStart : 0,
      isSystemSleeping: !!this.systemSleepStart
    };
  }

  /**
   * Initialize all event handlers
   */
  initializeAllEventHandlers() {
    this.setupAppEventHandlers();
    this.setupPowerMonitoring();
    this.setupBeforeQuitHandler();
    this.setupWindowAllClosedHandler();
    
    this.console.log('✅ [EVENT-HANDLERS] All event handlers initialized');
  }

  /**
   * Initialize the event handler manager
   */
  async initialize() {
    try {
      this.initializeAllEventHandlers();
      console.log('⚡ EventHandlerManager initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ EventHandlerManager initialization failed:', error);
      throw error;
    }
  }

  /**
   * Shutdown the event handler manager
   */
  async shutdown() {
    try {
      this.performAggressiveCleanup();
      console.log('⚡ EventHandlerManager shutdown complete');
    } catch (error) {
      console.error('❌ EventHandlerManager shutdown failed:', error);
    }
  }
}

module.exports = EventHandlerManager;