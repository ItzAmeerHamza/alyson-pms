'use strict';

/**
 * Not-tracking start reminder
 *
 * App running + tracking off: show a Start popup on a fixed 10-minute
 * stopwatch. Stop / launch-while-off starts the clock. After each show
 * (or Not now) wait exactly 10 minutes again. Lock / sleep does not
 * dump a popup the moment the machine wakes.
 */

const INTERVAL_MS = 10 * 60 * 1000;
const BLOCKED_RETRY_MS = 5 * 1000;
const SLEEP_CATCHUP_MS = 2 * 60 * 1000;
const ALWAYS_ON_TOP_MS = 2000;

class NotTrackingReminderManager {
  constructor() {
    this._timeoutId = null;
    this._armed = false;
    this._nextDueAtMs = null;
    this._deferAfterBlock = false;
    this._alwaysOnTopTimer = null;
    this._promptVisible = false;
  }

  start() {
    this._armed = true;
    if (this._isTracking()) return;
    if (this._timeoutId && this._nextDueAtMs != null) return;
    this._scheduleFromNow(INTERVAL_MS);
    console.log(
      '🔔 [NOT-TRACKING-REMINDER] Started (10m after Stop, repeat 10m, tracking-off only)',
    );
  }

  stop() {
    this._armed = false;
    this._clearState();
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
    this._deferAfterBlock = false;
    this._scheduleFromNow(INTERVAL_MS);
    console.log('🔔 [NOT-TRACKING-REMINDER] Tracking stopped — 10m popup timer started');
  }

  /**
   * Stop cleanup must not restart the 10-minute clock.
   */
  ensureRunning() {
    this._armed = true;
    if (this._isTracking()) return;
    if (this._timeoutId && this._nextDueAtMs != null) return;
    this._scheduleFromNow(INTERVAL_MS);
  }

  /**
   * "Not now" — full 10 minutes from dismiss, not from the previous show.
   */
  onSnoozed() {
    this._hidePrompt();
    if (this._isTracking()) return;
    this._deferAfterBlock = false;
    this._scheduleFromNow(INTERVAL_MS);
    console.log('🔔 [NOT-TRACKING-REMINDER] Snoozed — next popup in 10m');
  }

  _clearState() {
    this._clearTimer();
    this._nextDueAtMs = null;
    this._deferAfterBlock = false;
    this._promptVisible = false;
  }

  _clearTimer() {
    if (this._timeoutId) {
      clearTimeout(this._timeoutId);
      this._timeoutId = null;
    }
  }

  _scheduleFromNow(ms) {
    this._armed = true;
    const delay = Math.max(0, Math.floor(Number(ms) || 0));
    this._nextDueAtMs = Date.now() + delay;
    this._armTimeout();
  }

  _armTimeout() {
    this._clearTimer();
    if (!this._armed || this._nextDueAtMs == null) return;
    const delay = Math.max(0, this._nextDueAtMs - Date.now());
    this._timeoutId = setTimeout(() => {
      this._timeoutId = null;
      try {
        this._onDue();
      } catch (err) {
        console.warn(
          '⚠️ [NOT-TRACKING-REMINDER] Tick failed:',
          err?.message || err,
        );
      }
    }, delay);
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

  _onDue() {
    if (!this._armed) return;

    if (this._isTracking()) {
      this._clearState();
      this._hidePrompt();
      return;
    }

    if (!this._isLoggedIn()) {
      this._scheduleFromNow(INTERVAL_MS);
      return;
    }

    if (this._isLockedOrSleeping()) {
      this._deferAfterBlock = true;
      this._nextDueAtMs = Date.now() + BLOCKED_RETRY_MS;
      this._armTimeout();
      return;
    }

    if (this._deferAfterBlock) {
      this._deferAfterBlock = false;
      this._scheduleFromNow(INTERVAL_MS);
      console.log('🔔 [NOT-TRACKING-REMINDER] Unlock/wake — next popup in 10m');
      return;
    }

    const scheduledAt = this._nextDueAtMs;
    const overdue = scheduledAt == null ? 0 : Date.now() - scheduledAt;
    if (overdue > SLEEP_CATCHUP_MS) {
      this._scheduleFromNow(INTERVAL_MS);
      console.log('🔔 [NOT-TRACKING-REMINDER] Timer jumped (sleep) — next popup in 10m');
      return;
    }

    if (this._idlePromptVisible()) {
      console.log('🔔 [NOT-TRACKING-REMINDER] Skipping — idle prompt visible');
      this._nextDueAtMs = Date.now() + BLOCKED_RETRY_MS;
      this._armTimeout();
      return;
    }

    const kind = this._promptVisible ? 'repeat' : 'grace';
    this.showStartReminder();
    this._scheduleFromNow(INTERVAL_MS);
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
module.exports.INTERVAL_MS = INTERVAL_MS;
module.exports.GRACE_MS = INTERVAL_MS;
module.exports.REPEAT_MS = INTERVAL_MS;
module.exports.POLL_MS = BLOCKED_RETRY_MS;
module.exports.BLOCKED_RETRY_MS = BLOCKED_RETRY_MS;
