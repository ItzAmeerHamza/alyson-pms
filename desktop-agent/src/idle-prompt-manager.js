'use strict';

/**
 * Idle-confirmation prompt.
 *
 * When the user has had no keyboard/mouse input for a while, the main tracking
 * window is brought forward with a countdown and two choices:
 *   - "I'm working"                 -> keep tracking (resolves 'working')
 *   - "On break — stop Time Doctor" -> stop now, no 10m cut (resolves 'break')
 *   - countdown finishes unanswered -> stop + deduct 10m (resolves 'timeout')
 *     ONLY if this overlay was actually shown.
 *
 * This renders inside the existing tracking window (no separate window). The
 * main process owns the authoritative countdown; this manager only surfaces the
 * window/overlay and relays the user's choice back through the response callback.
 *
 * IMPORTANT: hide()/clear() must always wipe `_onTop` and `_responseCallback`,
 * even when the BrowserWindow is gone (sleep/quit). Otherwise NotTrackingReminder
 * sees a stale "idle prompt visible" and never focuses the Start UI.
 */
class IdlePromptManager {
  constructor() {
    this._responseCallback = null;
    this._ipcBound = false;
    this._onTop = false;
  }

  _getMainWindow() {
    const win = global.mainWindow;
    return win && !win.isDestroyed() ? win : null;
  }

  _bindIpc() {
    if (this._ipcBound) return;
    const { ipcMain } = require('electron');
    try {
      ipcMain.removeAllListeners('idle-prompt-response');
    } catch (_) {}
    ipcMain.on('idle-prompt-response', (_event, action) => {
      const choice = action === 'break' ? 'break' : 'working';
      this._deliver(choice);
    });
    this._ipcBound = true;
  }

  /** True only while a live prompt is waiting for a response. */
  isShowing() {
    return !!(this._onTop || this._responseCallback);
  }

  /** Wipe overlay ownership flags even if the window is already gone. */
  clear() {
    this._responseCallback = null;
    this._onTop = false;
  }

  _deliver(choice) {
    const cb = this._responseCallback;
    // Clear before invoke so re-entrant hide/show cannot see a stale callback.
    this.clear();
    this.hide();
    if (cb) {
      try {
        cb(choice);
      } catch (_) {}
    }
  }

  /**
   * Show the prompt overlay inside the main tracking window.
   * @param {number} countdownSeconds visual countdown length
   * @param {(choice: 'working'|'break') => void} onResponse
   */
  show(countdownSeconds, onResponse) {
    this._bindIpc();
    // Drop any leftover ownership from a previous prompt (timeout/sleep race).
    this.clear();
    this._responseCallback = onResponse;

    const win = this._getMainWindow();
    if (!win) {
      this.clear();
      throw new Error('Main window unavailable for idle prompt');
    }

    // Bring the existing tracking window to the front — even over other apps or
    // a fullscreen meeting on macOS.
    try {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
      win.setAlwaysOnTop(true, 'screen-saver');
      try {
        win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      } catch (_) {}
      this._onTop = true;
      if (process.platform === 'darwin') {
        const { app } = require('electron');
        try {
          app.focus({ steal: true });
        } catch (_) {}
      }
    } catch (_) {}

    try {
      win.webContents.send('display-idle-prompt', { countdownSeconds });
    } catch (_) {}
  }

  hide() {
    const win = this._getMainWindow();
    if (win) {
      try {
        win.webContents.send('hide-idle-prompt');
      } catch (_) {}
      // Restore normal window layering.
      try {
        win.setAlwaysOnTop(false);
      } catch (_) {}
      try {
        win.setVisibleOnAllWorkspaces(false);
      } catch (_) {}
    }
    // Always clear — window may be null after sleep/quit, and the timeout path
    // used to leave `_responseCallback` set, blocking not-tracking reminders.
    this.clear();
  }
}

module.exports = IdlePromptManager;
