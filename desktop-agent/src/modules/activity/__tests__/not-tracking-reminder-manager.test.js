'use strict';

/**
 * After Stop: popup at exactly 10 minutes, then every 10 minutes while still off.
 * No OS-idle / "actively typing" gate.
 */

jest.mock('../../core/cleanup-registry', () => ({
  registerInterval: jest.fn((id) => id),
  clearInterval: jest.fn((id) => clearInterval(id)),
  registerTimeout: jest.fn((id) => id),
  clearTimeout: jest.fn((id) => clearTimeout(id)),
}));

jest.mock(
  'electron',
  () => ({
    powerMonitor: {
      getSystemIdleTime: jest.fn(() => 0),
    },
    app: {
      focus: jest.fn(),
    },
  }),
  { virtual: true },
);

const { powerMonitor } = require('electron');
const NotTrackingReminderManager = require('../not-tracking-reminder-manager');
const { GRACE_MS, REPEAT_MS, BLOCKED_RETRY_MS } = NotTrackingReminderManager;

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
      webContents: { send: jest.fn() },
    };
    global.mainWindow = win;
    global.currentUserId = '1195';
    global.isTracking = false;
    global.trackingManager = { isTracking: false };
    global.isScreenLocked = false;
    global.isQuitting = false;
    global.idlePromptManager = null;
    global.enhancedIdleMonitor = null;
    powerMonitor.getSystemIdleTime.mockReturnValue(0);
    mgr = new NotTrackingReminderManager();
  });

  afterEach(() => {
    mgr.stop();
    jest.useRealTimers();
    jest.clearAllMocks();
    delete global.isQuitting;
  });

  test('does not show while tracking is active', () => {
    mgr.start();
    global.isTracking = true;
    jest.advanceTimersByTime(GRACE_MS + 60_000);
    expect(win.webContents.send).not.toHaveBeenCalledWith('display-start-reminder');
  });

  test('shows popup exactly 10 minutes after Stop', () => {
    mgr.start();
    mgr.onTrackingStopped();
    jest.advanceTimersByTime(GRACE_MS - 1_000);
    expect(win.webContents.send).not.toHaveBeenCalledWith('display-start-reminder');
    jest.advanceTimersByTime(1_000);
    expect(win.webContents.send).toHaveBeenCalledWith('display-start-reminder');
    expect(win.show).toHaveBeenCalled();
    expect(win.focus).toHaveBeenCalled();
  });

  test('still shows when OS idle is high (desk idle after Stop)', () => {
    powerMonitor.getSystemIdleTime.mockReturnValue(200);
    mgr.start();
    mgr.onTrackingStopped();
    jest.advanceTimersByTime(GRACE_MS);
    expect(win.webContents.send).toHaveBeenCalledWith('display-start-reminder');
  });

  test('onTrackingStarted suppresses further popups', () => {
    mgr.start();
    mgr.onTrackingStopped();
    jest.advanceTimersByTime(GRACE_MS);
    expect(win.webContents.send).toHaveBeenCalledWith('display-start-reminder');
    win.webContents.send.mockClear();
    global.isTracking = true;
    mgr.onTrackingStarted();
    jest.advanceTimersByTime(REPEAT_MS + 60_000);
    expect(win.webContents.send).not.toHaveBeenCalledWith('display-start-reminder');
  });

  test('onTrackingStopped resets the 10m clock', () => {
    mgr.start();
    mgr.onTrackingStopped();
    jest.advanceTimersByTime(GRACE_MS);
    expect(win.webContents.send).toHaveBeenCalledTimes(1);
    win.webContents.send.mockClear();
    mgr.onTrackingStopped();
    jest.advanceTimersByTime(30_000);
    expect(win.webContents.send).not.toHaveBeenCalled();
    jest.advanceTimersByTime(GRACE_MS);
    expect(win.webContents.send).toHaveBeenCalledWith('display-start-reminder');
  });

  test('ensureRunning does not reset the 10m clock', () => {
    mgr.start();
    mgr.onTrackingStopped();
    jest.advanceTimersByTime(GRACE_MS - 5_000);
    mgr.ensureRunning();
    jest.advanceTimersByTime(5_000);
    expect(win.webContents.send).toHaveBeenCalledWith('display-start-reminder');
  });

  test('repeats every 10 minutes while still off', () => {
    mgr.start();
    mgr.onTrackingStopped();
    jest.advanceTimersByTime(GRACE_MS);
    expect(win.webContents.send).toHaveBeenCalledWith('display-start-reminder');
    win.webContents.send.mockClear();
    jest.advanceTimersByTime(REPEAT_MS - 1_000);
    expect(win.webContents.send).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1_000);
    expect(win.webContents.send).toHaveBeenCalledWith('display-start-reminder');
  });

  test('Not now restarts the 10m clock from dismiss', () => {
    mgr.start();
    mgr.onTrackingStopped();
    jest.advanceTimersByTime(GRACE_MS);
    expect(win.webContents.send).toHaveBeenCalledWith('display-start-reminder');
    win.webContents.send.mockClear();
    jest.advanceTimersByTime(3 * 60_000);
    mgr.onSnoozed();
    win.webContents.send.mockClear();
    jest.advanceTimersByTime(REPEAT_MS - 1_000);
    expect(win.webContents.send).not.toHaveBeenCalledWith('display-start-reminder');
    jest.advanceTimersByTime(1_000);
    expect(win.webContents.send).toHaveBeenCalledWith('display-start-reminder');
  });

  test('skips while idle prompt is actively showing', () => {
    global.enhancedIdleMonitor = { _idlePromptActive: true };
    global.idlePromptManager = { _onTop: true, _responseCallback: () => {} };
    mgr.start();
    mgr.onTrackingStopped();
    jest.advanceTimersByTime(GRACE_MS + 60_000);
    expect(win.webContents.send).not.toHaveBeenCalledWith('display-start-reminder');
  });

  test('does not show while the screen is locked', () => {
    global.isScreenLocked = true;
    mgr.start();
    mgr.onTrackingStopped();
    jest.advanceTimersByTime(GRACE_MS + 60_000);
    expect(win.webContents.send).not.toHaveBeenCalledWith('display-start-reminder');
  });

  test('does not fire immediately after unlock — waits a full 10m', () => {
    mgr.start();
    mgr.onTrackingStopped();
    global.isScreenLocked = true;
    jest.advanceTimersByTime(GRACE_MS + BLOCKED_RETRY_MS);
    expect(win.webContents.send).not.toHaveBeenCalledWith('display-start-reminder');
    global.isScreenLocked = false;
    jest.advanceTimersByTime(BLOCKED_RETRY_MS);
    expect(win.webContents.send).not.toHaveBeenCalledWith('display-start-reminder');
    jest.advanceTimersByTime(GRACE_MS);
    expect(win.webContents.send).toHaveBeenCalledWith('display-start-reminder');
  });
});
