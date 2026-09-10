'use strict';

/**
 * IdlePromptManager must always clear overlay ownership flags on hide(),
 * even when mainWindow is gone — otherwise NotTrackingReminder skips forever.
 */

jest.mock('electron', () => ({
  ipcMain: {
    removeAllListeners: jest.fn(),
    on: jest.fn(),
  },
  app: { focus: jest.fn() },
}));

const IdlePromptManager = require('../../../idle-prompt-manager');

describe('IdlePromptManager', () => {
  let mgr;
  let win;

  beforeEach(() => {
    win = {
      isDestroyed: () => false,
      isMinimized: () => false,
      restore: jest.fn(),
      show: jest.fn(),
      focus: jest.fn(),
      setAlwaysOnTop: jest.fn(),
      setVisibleOnAllWorkspaces: jest.fn(),
      webContents: { send: jest.fn() },
    };
    global.mainWindow = win;
    mgr = new IdlePromptManager();
  });

  afterEach(() => {
    global.mainWindow = null;
  });

  test('hide() clears _responseCallback and _onTop even with no window', () => {
    mgr._responseCallback = () => {};
    mgr._onTop = true;
    global.mainWindow = null;

    mgr.hide();

    expect(mgr._responseCallback).toBeNull();
    expect(mgr._onTop).toBe(false);
    expect(mgr.isShowing()).toBe(false);
  });

  test('timeout-style leftover callback is cleared by hide()', () => {
    // Reproduces Fawad Sep 10: timeout path called hide() but left callback set.
    const cb = jest.fn();
    mgr.show(60, cb);
    expect(mgr.isShowing()).toBe(true);
    expect(mgr._responseCallback).toBe(cb);

    // Simulate enhanced-idle-monitor timeout resolve: hide without _deliver.
    mgr.hide();

    expect(mgr._responseCallback).toBeNull();
    expect(mgr._onTop).toBe(false);
    expect(mgr.isShowing()).toBe(false);
    expect(win.webContents.send).toHaveBeenCalledWith('hide-idle-prompt');
  });

  test('clear() wipes ownership flags', () => {
    mgr._responseCallback = () => {};
    mgr._onTop = true;
    mgr.clear();
    expect(mgr.isShowing()).toBe(false);
  });

  test('show() replaces any stale callback from a prior prompt', () => {
    const stale = jest.fn();
    const next = jest.fn();
    mgr._responseCallback = stale;
    mgr._onTop = true;

    mgr.show(30, next);

    expect(mgr._responseCallback).toBe(next);
    expect(stale).not.toHaveBeenCalled();
  });
});
