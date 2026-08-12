'use strict';

/**
 * Not-tracking front-of-screen reminder
 *
 * When the employee is working on the machine but Alyson PM is NOT tracking,
 * bring the main window to the front after a short activity grace, then every
 * 30 minutes while still off. Never runs while tracking is active.
 *
 * Detection uses Electron powerMonitor.getSystemIdleTime() (no Swift/Python).
 */

const GRACE_MS = 3 * 60 * 1000;
const REPEAT_MS = 30 * 60 * 1000;
const ACTIVE_IDLE_MAX_SEC = 60;
const AWAY_IDLE_SEC = 120;
const POLL_MS = 30 * 1000;
const ALWAYS_ON_TOP_MS = 2000;

class NotTrackingReminderManager {
  constructor() {
    this._intervalId = null;
    this._armed = false;
    this._activeWorkSinceMs = null;
    this._lastReminderAtMs = null;
    this._alwaysOnTopTimer = null;
  }

  start() {
    if (this._intervalId) {
      this._armed = true;
      return;
    }
    this._armed = true;
    this._intervalId = setInterval(() => {
      try {
        this._tick();
      } catch (err) {
        console.warn(
          '⚠️ [NOT-TRACKING-REMINDER] Tick failed:',
          err?.message || err,
        );
      }
    }, POLL_MS);
    // Do NOT register with cleanupRegistry — graceful Stop runs cleanupAll()
    // and was killing this interval, so the post-Stop reminder never fired.
    if (typeof this._intervalId.unref === 'function') {
      try { this._intervalId.unref(); } catch (_) { /* ignore */ }
    }
    console.log(
      '🔔 [NOT-TRACKING-REMINDER] Started (grace 3m, repeat 30m, tracking-off only)',
    );
    // Evaluate once immediately so a long-running session does not wait a full poll.
    try {
      this._tick();
    } catch (_) { /* ignore */ }
  }

  stop() {
    this._armed = false;
    this._clearState();
    if (this._intervalId) {
      clearInterval(this._intervalId);
      this._intervalId = null;
    }
    this._clearAlwaysOnTop();
    console.log('🔔 [NOT-TRACKING-REMINDER] Stopped');
  }

  /** Tracking became active — no purpose for reminders. */
  onTrackingStarted() {
    this._clearState();
    console.log('🔔 [NOT-TRACKING-REMINDER] Tracking started — reminders suppressed');
  }

  /**
   * Tracking stopped (manual or auto). Reset so Stop → work 3m → focus,
   * then every 30m while still off. Re-arm the poller if Stop cleanup killed it.
   */
  onTrackingStopped() {
    this._clearState();
    // GSM cleanupAll() used to wipe our interval — ensure we keep watching.
    if (!this._intervalId) {
      this.start();
    } else {
      this._armed = true;
    }
    console.log('🔔 [NOT-TRACKING-REMINDER] Tracking stopped — grace timer reset');
  }

  _clearState() {
    this._activeWorkSinceMs = null;
    this._lastReminderAtMs = null;
  }

  _isTracking() {
    return !!(global.isTracking || global.trackingManager?.isTracking);
  }

  _isLoggedIn() {
    return !!(global.currentUserId || global.config?.user_id || global.config?.userId);
  }

  _isLockedOrSleeping() {
    if (global.isScreenLocked) return true;
    if (global.trayManager?._systemSleeping) return true;
    try {
      const ehm = global.eventHandlerManager;
      if (ehm?.systemSleepStart) return true;
    } catch (_) { /* ignore */ }
    return false;
  }

  _getOsIdleSeconds() {
    try {
      const { powerMonitor } = require('electron');
      if (powerMonitor && typeof powerMonitor.getSystemIdleTime === 'function') {
        const secs = Number(powerMonitor.getSystemIdleTime());
        if (Number.isFinite(secs) && secs >= 0) return secs;
      }
    } catch (_) { /* ignore */ }
    try {
      if (typeof global.getSystemIdleTime === 'function') {
        const secs = Number(global.getSystemIdleTime());
        if (Number.isFinite(secs) && secs >= 0) return secs;
      }
    } catch (_) { /* ignore */ }
    return Number.POSITIVE_INFINITY;
  }

  _idlePromptVisible() {
    try {
      // IdlePromptManager sets _onTop while the idle overlay owns the window.
      const idle = global.idlePromptManager;
      if (idle && idle._onTop) return true;
      if (idle && idle._responseCallback) return true;
    } catch (_) { /* ignore */ }
    return false;
  }

  _tick() {
    if (!this._armed) return;

    if (this._isTracking()) {
      // Hard gate: never advance timers or focus while tracking.
      if (this._activeWorkSinceMs != null || this._lastReminderAtMs != null) {
        this._clearState();
      }
      return;
    }

    if (!this._isLoggedIn() || this._isLockedOrSleeping()) {
      this._activeWorkSinceMs = null;
      return;
    }

    const idleSec = this._getOsIdleSeconds();
    if (idleSec >= AWAY_IDLE_SEC) {
      this._activeWorkSinceMs = null;
      return;
    }

    if (idleSec >= ACTIVE_IDLE_MAX_SEC) {
      // Ambiguous band (60–120s): do not start/continue grace.
      return;
    }

    const now = Date.now();
    if (this._activeWorkSinceMs == null) {
      this._activeWorkSinceMs = now;
      return;
    }

    const activeFor = now - this._activeWorkSinceMs;
    if (activeFor < GRACE_MS) return;

    const neverReminded = this._lastReminderAtMs == null;
    const dueForRepeat =
      this._lastReminderAtMs != null && now - this._lastReminderAtMs >= REPEAT_MS;

    if (!neverReminded && !dueForRepeat) return;

    // Re-check tracking immediately before focus steal.
    if (this._isTracking()) {
      this._clearState();
      return;
    }
    if (this._idlePromptVisible()) {
      console.log('🔔 [NOT-TRACKING-REMINDER] Skipping — idle prompt visible');
      return;
    }

    const kind = neverReminded ? 'grace' : 'repeat';
    this.focusMainWindow();
    this._lastReminderAtMs = now;
    console.log(
      `🔔 [NOT-TRACKING-REMINDER] Focusing main window (${kind})`,
    );
  }

  /**
   * Bring the existing tracking window to the front (idle-prompt style).
   * Brief always-on-top so we surface over fullscreen apps, then clear.
   */
  focusMainWindow() {
    if (this._isTracking()) return false;

    const win = global.mainWindow;
    if (!win || win.isDestroyed()) {
      console.warn('⚠️ [NOT-TRACKING-REMINDER] Main window unavailable');
      return false;
    }

    try {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
      try {
        win.setAlwaysOnTop(true, 'screen-saver');
      } catch (_) {
        try {
          win.setAlwaysOnTop(true);
        } catch (_) { /* ignore */ }
      }
      try {
        win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      } catch (_) { /* ignore */ }

      if (process.platform === 'darwin') {
        try {
          const { app } = require('electron');
          app.focus({ steal: true });
        } catch (_) { /* ignore */ }
      }

      this._scheduleClearAlwaysOnTop(win);
      return true;
    } catch (err) {
      console.warn(
        '⚠️ [NOT-TRACKING-REMINDER] focusMainWindow failed:',
        err?.message || err,
      );
      return false;
    }
  }

  _scheduleClearAlwaysOnTop(win) {
    this._clearAlwaysOnTop();
    this._alwaysOnTopTimer = setTimeout(() => {
      this._alwaysOnTopTimer = null;
      if (!win || win.isDestroyed()) return;
      try {
        win.setAlwaysOnTop(false);
      } catch (_) { /* ignore */ }
      try {
        win.setVisibleOnAllWorkspaces(false);
      } catch (_) { /* ignore */ }
    }, ALWAYS_ON_TOP_MS);
  }

  _clearAlwaysOnTop() {
    if (this._alwaysOnTopTimer) {
      clearTimeout(this._alwaysOnTopTimer);
      this._alwaysOnTopTimer = null;
    }
  }
}

module.exports = NotTrackingReminderManager;
module.exports.GRACE_MS = GRACE_MS;
module.exports.REPEAT_MS = REPEAT_MS;
module.exports.ACTIVE_IDLE_MAX_SEC = ACTIVE_IDLE_MAX_SEC;
module.exports.AWAY_IDLE_SEC = AWAY_IDLE_SEC;
module.exports.POLL_MS = POLL_MS;
