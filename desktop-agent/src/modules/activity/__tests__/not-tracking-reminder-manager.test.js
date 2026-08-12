'use strict';

/**
 * Unit tests for NotTrackingReminderManager (grace / repeat / tracking-off gate).
 */

jest.mock('../../core/cleanup-registry', () => ({
  registerInterval: jest.fn((id) => id),
  clearInterval: jest.fn((id) => clearInterval(id)),
  registerTimeout: jest.fn((id) => id),
  clearTimeout: jest.fn((id) => clearTimeout(id)),
}));

jest.mock('electron', () => ({
  powerMonitor: {
    getSystemIdleTime: jest.fn(() => 0),
  },
  app: {
    focus: jest.fn(),
  },
}));

const { powerMonitor } = require('electron');
const NotTrackingReminderManager = require('../not-tracking-reminder-manager');
const { GRACE_MS, REPEAT_MS } = NotTrackingReminderManager;

describe('NotTrackingReminderManager', () => {
  let mgr;
  let win;

  beforeEach(() => {
    jest.useFakeTimers();
    win = {
      isDestroyed: () => false,
      isMinimized: () => false,
      restore: jest.fn(),
      show: jest.fn(),
      focus: jest.fn(),
      setAlwaysOnTop: jest.fn(),
      setVisibleOnAllWorkspaces: jest.fn(),
    };
    global.mainWindow = win;
    global.currentUserId = '1195';
    global.isTracking = false;
    global.trackingManager = { isTracking: false };
    global.isScreenLocked = false;
    global.idlePromptManager = null;
    powerMonitor.getSystemIdleTime.mockReturnValue(0);
    mgr = new NotTrackingReminderManager();
  });

  afterEach(() => {
    mgr.stop();
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  test('does not focus while tracking is active', () => {
    mgr.start();
    global.isTracking = true;
    jest.advanceTimersByTime(GRACE_MS + 60_000);
    expect(win.show).not.toHaveBeenCalled();
  });

  test('focuses after grace when working and not tracking', () => {
    mgr.start();
    // First tick sets activeWorkSince
    jest.advanceTimersByTime(30_000);
    expect(win.show).not.toHaveBeenCalled();
    // Past grace
    jest.advanceTimersByTime(GRACE_MS);
    expect(win.show).toHaveBeenCalled();
    expect(win.focus).toHaveBeenCalled();
  });

  test('does not focus when OS idle is away', () => {
    mgr.start();
    powerMonitor.getSystemIdleTime.mockReturnValue(200);
    jest.advanceTimersByTime(GRACE_MS + 60_000);
    expect(win.show).not.toHaveBeenCalled();
  });

  test('onTrackingStarted suppresses further focus', () => {
    mgr.start();
    jest.advanceTimersByTime(GRACE_MS + 30_000);
    expect(win.show).toHaveBeenCalledTimes(1);
    win.show.mockClear();
    global.isTracking = true;
    mgr.onTrackingStarted();
    jest.advanceTimersByTime(REPEAT_MS + 60_000);
    expect(win.show).not.toHaveBeenCalled();
  });

  test('onTrackingStopped resets grace then reminds again', () => {
    mgr.start();
    jest.advanceTimersByTime(GRACE_MS + 30_000);
    expect(win.show).toHaveBeenCalledTimes(1);
    win.show.mockClear();
    mgr.onTrackingStopped();
    // Immediately after stop — grace not elapsed
    jest.advanceTimersByTime(30_000);
    expect(win.show).not.toHaveBeenCalled();
    jest.advanceTimersByTime(GRACE_MS);
    expect(win.show).toHaveBeenCalledTimes(1);
  });

  test('repeats every 30 minutes while still off and working', () => {
    mgr.start();
    jest.advanceTimersByTime(GRACE_MS + 30_000);
    expect(win.show).toHaveBeenCalledTimes(1);
    win.show.mockClear();
    jest.advanceTimersByTime(REPEAT_MS);
    expect(win.show).toHaveBeenCalledTimes(1);
  });
});
