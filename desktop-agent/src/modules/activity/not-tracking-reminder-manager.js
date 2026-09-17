'use strict';

/**
 * Not-tracking start reminder
 *
 * After Stop (app still running, not recording): wait 10 minutes, then show
 * a popup so the employee can Start. Repeat every 10 minutes until they
 * Start, Quit, lock, or the machine sleeps.
 */

const GRACE_MS = 10 * 60 * 1000;
const REPEAT_MS = 10 * 60 * 1000;
const POLL_MS = 30 * 1000;
const ALWAYS_ON_TOP_MS = 2000;

class NotTrackingReminderManager {
  constructor() {
    this._intervalId = null;
    this._armed = false;
    this._offSinceMs = null;
    this._lastReminderAtMs = null;
    this._alwaysOnTopTimer = null;
    this._promptVisible = false;
  }

  start() {
    if (this._intervalId) {
      this._armed = true;
      if (this._offSinceMs == null && !this._isTracking()) {
        this._offSinceMs = Date.now();
      }
      return;
    }
    this._armed = true;
    if (this._offSinceMs == null && !this._isTracking()) {
      this._offSinceMs = Date.now();
    }
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
    if (typeof this._intervalId.unref === 'function') {
      try { this._intervalId.unref(); } catch (_) { /* ignore */ }
    }
    console.log(
      '🔔 [NOT-TRACKING-REMINDER] Started (10m after Stop, repeat 10m, tracking-off only)',
    );
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
    this._hidePrompt();
    console.log('🔔 [NOT-TRACKING-REMINDER] Stopped');
  }

  onTrackingStarted() {
    this._clearState();
    this._hidePrompt();
    console.log('🔔 [NOT-TRACKING-REMINDER] Tracking started — reminders suppressed');
  }

  onTrackingStopped() {
    this._offSinceMs = Date.now();
    this._lastReminderAtMs = null;
    this._promptVisible = false;
    if (!this._intervalId) {
      this.start();
    } else {
      this._armed = true;
    }
    console.log('🔔 [NOT-TRACKING-REMINDER] Tracking stopped — 10m popup timer started');
  }

  _clearState() {
    this._offSinceMs = null;
    this._lastReminderAtMs = null;
    this._promptVisible = false;
  }

  _isTracking() {
    return !!(global.isTracking || global.trackingManager?.isTracking);
  }

  _isLoggedIn() {
    return !!(global.currentUserId || global.config?.user_id || global.config?.userId);
  }

  _isLockedOrSleeping() {
    if (global.isQuitting) return true;
    if (global.isScreenLocked) return true;
    if (global.trayManager?._systemSleeping) return true;
    try {
      const ehm = global.eventHandlerManager;
      if (ehm?.systemSleepStart) return true;
    } catch (_) { /* ignore */ }
    return false;
  }

  _idlePromptVisible() {
    try {
      const monitor = global.enhancedIdleMonitor;
      if (monitor && monitor._idlePromptActive === true) return true;

      const idle = global.idlePromptManager;
      if (!idle) return false;

      const managerShows =
        (typeof idle.isShowing === 'function' && idle.isShowing()) ||
        !!(idle._onTop || idle._responseCallback);

      if (!managerShows) return false;

      if (!monitor || monitor._idlePromptActive !== true) {
        try {
          if (typeof idle.hide === 'function') idle.hide();
          else if (typeof idle.clear === 'function') idle.clear();
        } catch (_) { /* ignore */ }
        return false;
      }
      return true;
    } catch (_) { /* ignore */ }
    return false;
  }

  _tick() {
    if (!this._armed) return;

    if (this._isTracking()) {
      if (this._offSinceMs != null || this._lastReminderAtMs != null) {
        this._clearState();
        this._hidePrompt();
      }
      return;
    }

    if (!this._isLoggedIn() || this._isLockedOrSleeping()) {
      return;
    }

    const now = Date.now();
    if (this._offSinceMs == null) {
      this._offSinceMs = now;
      return;
    }

    if (now - this._offSinceMs < GRACE_MS) return;

    const neverReminded = this._lastReminderAtMs == null;
    const dueForRepeat =
      this._lastReminderAtMs != null && now - this._lastReminderAtMs >= REPEAT_MS;

    if (!neverReminded && !dueForRepeat) return;

    if (this._isTracking()) {
      this._clearState();
      return;
    }
    if (this._idlePromptVisible()) {
      console.log('🔔 [NOT-TRACKING-REMINDER] Skipping — idle prompt visible');
      return;
    }

    const kind = neverReminded ? 'grace' : 'repeat';
    this.showStartReminder();
    this._lastReminderAtMs = now;
    console.log(`🔔 [NOT-TRACKING-REMINDER] Showing start popup (${kind})`);
  }

  showStartReminder() {
    if (this._isTracking()) return false;
    this.focusMainWindow();
    this._promptVisible = true;
    try {
      const win = global.mainWindow;
      if (win && !win.isDestroyed()) {
        win.webContents.send('display-start-reminder');
      }
    } catch (err) {
      console.warn(
        '⚠️ [NOT-TRACKING-REMINDER] display-start-reminder failed:',
        err?.message || err,
      );
    }
    return true;
  }

  _hidePrompt() {
    this._promptVisible = false;
    try {
      const win = global.mainWindow;
      if (win && !win.isDestroyed()) {
        win.webContents.send('hide-start-reminder');
      }
    } catch (_) { /* ignore */ }
  }

  focusMainWindow() {
    if (this._isTracking()) return false;

    const win = global.mainWindow;
    if (!win || win.isDestroyed()) {
      console.warn('⚠️ [NOT-TRACKING-REMINDER] Main window unavailable');
      return false;
    }

    try {
      if (win.isMinimized()) win.restore();
      try {
        if (typeof win.setSkipTaskbar === 'function') win.setSkipTaskbar(false);
      } catch (_) { /* ignore */ }
      win.show();
      win.focus();
      try {
        if (typeof win.moveTop === 'function') win.moveTop();
      } catch (_) { /* ignore */ }

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

      try {
        const { app } = require('electron');
        if (process.platform === 'darwin') {
          app.focus({ steal: true });
        } else if (typeof app.focus === 'function') {
          app.focus();
        }
      } catch (_) { /* ignore */ }

      if (process.platform === 'win32') {
        try {
          if (typeof win.flashFrame === 'function') win.flashFrame(true);
          setTimeout(() => {
            try {
              if (!win.isDestroyed() && typeof win.flashFrame === 'function') {
                win.flashFrame(false);
              }
            } catch (_) { /* ignore */ }
          }, 2000);
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
module.exports.POLL_MS = POLL_MS;
