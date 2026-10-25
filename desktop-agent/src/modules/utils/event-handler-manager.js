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
    
    // Lid-close / sleep is a full halt. Display-sleep is treated the same
    // because Windows often never emits suspend on lid close.
    this._displaySleepGraceTimer = null;
    this._screenLockGraceTimer = null;
    this.GRACE_PERIOD_MS = 2 * 60 * 1000; // unused for stop; kept for compatibility
    this._lidHaltInProgress = false;
    
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
   * Lid close, OS sleep, or display-off: stop tracking and kill leftover
   * capture / heartbeat / IPC. Stay stopped until the employee clicks Start.
   * A leftover or live meeting must not keep the session open.
   */
  handleLidCloseOrSleep(source = 'suspend') {
    if (this._lidHaltInProgress) {
      this.console.log(`💤 [LID] Halt already in progress, ignoring duplicate ${source}`);
      return;
    }
    this._lidHaltInProgress = true;
    this.systemSleepStart = this.systemSleepStart || Date.now();

    try {
      const cp = this.global.trackingManager?._readSessionCheckpoint?.();
      if (cp?.checkpointAt) {
        global._lidLastProofIso = cp.checkpointAt;
      }
    } catch (_) { /* ignore */ }
    global._lidDownArmed = true;
    global._startAfterSleep = true;
    global._resumeTrackingAfterWake = null;
    try {
      const { clearMeetingSession } = require('../../lib/meeting-context');
      clearMeetingSession();
    } catch (_) { /* meeting must never keep a session open across sleep */ }

    if (this.global.trayManager) {
      this.global.trayManager.onSystemSleep();
    }

    const hasOpenSession = !!(
      this.global.isTracking ||
      this.global.trackingManager?.isTracking ||
      this.global.currentTimeLogId ||
      this.global.trackingManager?.currentTimeLogId
    );
    // Remember what a very short suspend interrupted so resume can pick it back
    // up. Only an OS `suspend` qualifies; display-sleep keeps the plain halt.
    // A suspend delivered late, at wake (Windows), arrives seconds before
    // resume and looked like a blip — tracking restarted on its own after a
    // 31-minute nap. If the last awake proof is already a sleep gap old, or
    // the tray just saw a nap end, the machine really slept: no restart.
    let sleptAlready = false;
    try {
      const { SLEEP_GAP_MS } = require('./sleep-aware-elapsed');
      const now = Date.now();
      const proofs = [global._lastAwakeTickMs, Date.parse(global._lidLastProofIso || '')]
        .map(Number)
        .filter((t) => Number.isFinite(t) && t > 0);
      const lastProof = proofs.length ? Math.max(...proofs) : NaN;
      const napEnd = Number(global._lastSleepWindow?.toMs);
      sleptAlready =
        (Number.isFinite(lastProof) && now - lastProof > SLEEP_GAP_MS) ||
        (Number.isFinite(napEnd) && now - napEnd >= 0 && now - napEnd < SLEEP_GAP_MS);
    } catch (_) { /* unknown: keep the blip check below */ }
    this._suspendBlip =
      hasOpenSession && source === 'suspend' && !sleptAlready
        ? {
            atMs: Date.now(),
            projectId:
              this.global.currentProjectId ||
              this.global.trackingManager?.currentProjectId ||
              null,
          }
        : null;
    if (hasOpenSession) {
      this.console.log(`🛑 Laptop lid closed / ${source} - durable arm then stop`);
      try {
        if (typeof this.global.trackingManager?.armDurableSleepStop === 'function') {
          this.global.trackingManager.armDurableSleepStop('system_sleep');
        }
      } catch (armErr) {
        this.console.warn('⚠️ [SLEEP] Durable arm failed:', armErr?.message || armErr);
      }
      try {
        const gsm = this.global.gracefulShutdownManager;
        if (gsm?.captureStopMoment) gsm.captureStopMoment();
      } catch (_) { /* ignore */ }
      if (typeof this.global.stopTracking === 'function') {
        void this.global.stopTracking('system_sleep');
      }
      try {
        const { closeOpenSessionsAfterExplicitStop } = require('./session-recovery');
        void closeOpenSessionsAfterExplicitStop({
          reason: 'system_sleep',
          timeoutMs: 4000,
          protectLive: false,
        })
          .catch((closeErr) => {
            this.console.warn(
              '⚠️ [SLEEP] Session close queued locally:',
              closeErr?.message || closeErr,
            );
          });
      } catch (_) { /* ignore */ }
    }

    try {
      this.global.trackingManager?.haltBackgroundProcesses?.();
    } catch (haltErr) {
      this.console.warn('⚠️ [LID] Halt leftover processes failed:', haltErr?.message || haltErr);
    }

    if (this.antiCheatDetector) {
      this.antiCheatDetector.stopMonitoring();
    }
  }

  /**
   * Windows fires `suspend` then `resume` within a second or two with no real
   * sleep (Modern Standby transitions, a lid flick). Garima 15 Oct: a 0.2s and a
   * 4.4s suspend each stopped a live session and cost her 110 and 10 minutes
   * until she noticed. A suspend shorter than the sleep gap is not a nap, so
   * the session it interrupted is restarted from wake.
   *
   * Returns the interrupted session when resume should restart it, else null.
   * Always consumes the pending suspend so a later resume cannot reuse it.
   */
  /**
   * Resolve with the work's result, or null after timeoutMs. The timer is
   * cleared when the work wins, so the timeout warning only logs on a real timeout.
   */
  _withResumeTimeout(work, timeoutMs, warning) {
    let timer = null;
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => {
        this.console.warn(warning);
        resolve(null);
      }, timeoutMs);
    });
    return Promise.race([Promise.resolve(work), timeout]).finally(() => clearTimeout(timer));
  }

  _takeSuspendBlip() {
    const blip = this._suspendBlip;
    this._suspendBlip = null;
    if (!blip) return null;

    const { SLEEP_GAP_MS } = require('./sleep-aware-elapsed');
    const now = Date.now();
    const elapsedMs = now - blip.atMs;
    // Negative or huge means the clock moved or the machine really slept.
    if (!(elapsedMs >= 0 && elapsedMs < SLEEP_GAP_MS)) return null;

    // A device stuck cycling suspend/resume must not start/stop in a loop.
    const MAX_RESTARTS = 5;
    const WINDOW_MS = 10 * 60 * 1000;
    this._blipRestartTimes = (this._blipRestartTimes || []).filter((t) => now - t < WINDOW_MS);
    if (this._blipRestartTimes.length >= MAX_RESTARTS) {
      this.console.warn(
        `⚠️ [RESUME] ${MAX_RESTARTS} short-suspend restarts in 10 min — staying stopped`,
      );
      return null;
    }
    this._blipRestartTimes.push(now);
    return { ...blip, elapsedMs };
  }

  async _restartAfterSuspendBlip(blip) {
    try {
      if (this.global.isTracking || this.global.trackingManager?.isTracking) return false;
      if (typeof this.global.startTracking !== 'function') return false;
      this.console.log(
        `▶️ [RESUME] Suspend lasted ${(blip.elapsedMs / 1000).toFixed(1)}s (not a real sleep) — restarting tracking`,
      );
      await this.global.startTracking(blip.projectId || null);
      return true;
    } catch (err) {
      this.console.warn('⚠️ [RESUME] Restart after short suspend failed:', err?.message || err);
      return false;
    }
  }

  /**
   * Set up power monitoring events
   */
  setupPowerMonitoring() {
    if (!this.powerMonitor) {
      this.console.log('⚠️ PowerMonitor not available - skipping power monitoring');
      return;
    }

    // System suspend event (fires on lid close and manual sleep)
    this.powerMonitor.on('suspend', () => {
      this.console.log('💤 System suspended (laptop closed/sleep mode)');
      this.handleLidCloseOrSleep('suspend');
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
        const blip = this._takeSuspendBlip();
        this._lidHaltInProgress = false;
        global._lastWakeAtMs = Date.now();
        global._startAfterSleep = true;
        global._resumeTrackingAfterWake = null;
        // Clear shutdown flag so detection/polling can resume when tracking starts
        global.isShuttingDown = false;

        // Stop checkpoint/heartbeat BEFORE they can stamp NOW and re-freshen
        // an overnight orphan. Then close at last durable mark if stale.
        try {
          this.global.trackingManager?._stopTimeLogCheckpoint?.();
        } catch (_) { /* ignore */ }
        try {
          const { reconcileAfterWake } = require('./session-recovery');
          const wake = await reconcileAfterWake();
          if (
            wake?.continued &&
            !global._lidDownArmed &&
            this.global.trackingManager &&
            typeof this.global.trackingManager._startTimeLogCheckpoint === 'function'
          ) {
            this.global.trackingManager._startTimeLogCheckpoint();
          }
        } catch (wakeErr) {
          this.console.warn(
            '⚠️ [RESUME] Stale-session reconcile failed:',
            wakeErr?.message || wakeErr,
          );
          // Never leave a live session without a checkpoint writer — the next
          // health check would read a stale mark and close real working time.
          try {
            if (this.global.isTracking || this.global.trackingManager?.isTracking) {
              this.global.trackingManager?._startTimeLogCheckpoint?.();
            }
          } catch (_) { /* ignore */ }
        }
        // Safety net: always clear screen lock flag on resume (display-wake should also clear it,
        // but this prevents the flag from getting stuck if display-wake doesn't fire)
        global.isScreenLocked = false;
        
        // Re-sync tray state and fire any deferred auto-stop notification
        if (this.global.trayManager) {
          // "Your laptop went to sleep" would be wrong: we restart below.
          if (blip) {
            this.global.trayManager._pendingAutoStopReason = null;
            this.global.trayManager._pendingAutoStopMessage = null;
          }
          // Company day rollover first (lid-close overnight freezes midnight timers).
          try {
            if (typeof this.global.trayManager.ensureWorkDayRollover === 'function') {
              this.global.trayManager.ensureWorkDayRollover();
            }
          } catch (_) { /* ignore */ }
          this.global.trayManager.onSystemResume();
        }

        // Renderer midnight timers freeze in sleep. Tell the window to kill any
        // leftover live clock so "Not Tracking" cannot keep ticking since midnight.
        try {
          const { BrowserWindow } = require('electron');
          const payload = {
            isTracking: !!this.global.isTracking,
            lastWakeAtMs: global._lastWakeAtMs || Date.now(),
            startAfterSleep: true,
          };
          for (const win of BrowserWindow.getAllWindows()) {
            if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
              win.webContents.send('system-resumed', payload);
            }
          }
        } catch (_) { /* ignore */ }
        
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
        let userRestored = false;
        try {
          await new Promise(resolve => setTimeout(resolve, 100));
          const savedSession = await this._withResumeTimeout(
            (async () => {
              return this.global.loadDesktopAgentSession ? this.global.loadDesktopAgentSession() : null;
            })(),
            RESUME_TIMEOUT_MS,
            '⚠️ [RESUME] Session load timed out after 5s',
          );
          if (savedSession && savedSession.id) {
            this.console.log('✅ Desktop agent session loaded:', savedSession.email);
            if (this.global.config) {
              this.global.config.user_id = savedSession.id;
            }
            this.global._resumeTrackingAfterWake = null;
            userRestored = true;
            if (typeof this.global.showTrayNotification === 'function' && !blip) {
              if (this.global.isTracking) {
                this.global.showTrayNotification(
                  `Welcome back ${savedSession.email.split('@')[0]}! Tracking is still running — click Stop if this is unexpected.`,
                  'warning'
                );
              } else {
                this.global.showTrayNotification(
                  `Welcome back ${savedSession.email.split('@')[0]}! Click Start to track when ready.`,
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
            await this._withResumeTimeout(
              this.global.recoverScreenshotPermissions(),
              RESUME_TIMEOUT_MS,
              '⚠️ [RESUME] Screenshot permission recovery timed out after 5s',
            );
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
            ? '🌅 System resumed — tracking will restart from wake (sleep not billed)'
            : '🌅 System resumed — tracking is stopped',
        );

        // Not awaited: Start can take seconds and must not hold _resumeInProgress,
        // or a second suspend/resume cycle would be skipped.
        if (blip) {
          const restart = userRestored
            ? this._restartAfterSuspendBlip(blip)
            : Promise.resolve(false);
          void restart.then((restarted) => {
            if (restarted) return;
            // The stop notification was withheld; the employee still needs it.
            try {
              this.global.trayManager?.showAutoStopNotification?.('system_sleep');
            } catch (_) { /* ignore */ }
          });
        }
      } finally {
        this._resumeInProgress = false;
      }
    });

    // System shutdown event
    this.powerMonitor.on('shutdown', () => {
      this.console.log('🔴 System shutdown detected');
      // Skip the close prompt so it can't block the OS shutting down.
      this.global.isSystemShuttingDown = true;
      
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

    // Windows lid close often only fires display-sleep (not suspend).
    this.powerMonitor.on('display-sleep', () => {
      this.console.log('🖥️ Display sleep detected');
      global.isScreenLocked = true;
      this.console.log(`🔍 [DEBUG] Global tracking state: ${this.global.isTracking}, timestamp: ${new Date().toISOString()}`);
      if (this._displaySleepGraceTimer) {
        clearTimeout(this._displaySleepGraceTimer);
        this._displaySleepGraceTimer = null;
      }
      this.handleLidCloseOrSleep('display-sleep');
    });
    
    this.powerMonitor.on('display-wake', () => {
      this.console.log('🌅 Display wake detected');
      this._lidHaltInProgress = false;
      global.isScreenLocked = false;
      if (this._displaySleepGraceTimer) {
        clearTimeout(this._displaySleepGraceTimer);
        this._displaySleepGraceTimer = null;
      }

      // Display can wake without a full suspend/resume cycle — still roll the day.
      try {
        if (typeof this.global.trayManager?.ensureWorkDayRollover === 'function') {
          this.global.trayManager.ensureWorkDayRollover();
        }
      } catch (_) { /* ignore */ }

      try {
        const { isSleepGap } = require('./sleep-aware-elapsed');
        const cp = this.global.trackingManager?._readSessionCheckpoint?.();
        if (isSleepGap(cp?.checkpointAt)) {
          global._lastWakeAtMs = Date.now();
          global._startAfterSleep = true;
          if (typeof this.global.trackingManager?.noteMachineSlept === 'function') {
            void this.global.trackingManager.noteMachineSlept(
              new Date(cp.checkpointAt).getTime(),
            );
          }
        }
      } catch (_) { /* ignore */ }

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

      try {
        if (typeof this.global.trayManager?.ensureWorkDayRollover === 'function') {
          this.global.trayManager.ensureWorkDayRollover();
        }
      } catch (_) { /* ignore */ }

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