'use strict';

/** The "Start tracking?" popup follows the interval picked in Settings. */

let mockMinutes = 10;
jest.mock('../../utils/user-preferences', () => ({
  get: (key) => (key === 'notTrackingReminderMinutes' ? mockMinutes : undefined),
}));

jest.mock(
  'electron',
  () => ({ powerMonitor: { getSystemIdleTime: () => 0 }, app: { focus: jest.fn() } }),
  { virtual: true },
);

const NotTrackingReminderManager = require('../not-tracking-reminder-manager');

const MIN = 60 * 1000;

describe('NotTrackingReminderManager interval setting', () => {
  let mgr;
  let send;

  beforeEach(() => {
    jest.useFakeTimers();
    send = jest.fn();
    global.mainWindow = {
      isDestroyed: () => false,
      isMinimized: () => false,
      restore: jest.fn(),
      show: jest.fn(),
      focus: jest.fn(),
      setAlwaysOnTop: jest.fn(),
      setVisibleOnAllWorkspaces: jest.fn(),
      webContents: { send },
    };
    global.currentUserId = '1';
    global.isTracking = false;
    global.trackingManager = { isTracking: false };
    global.isScreenLocked = false;
    global.isQuitting = false;
    mockMinutes = 10;
    mgr = new NotTrackingReminderManager();
  });

  afterEach(() => {
    mgr.stop();
    jest.useRealTimers();
  });

  const shows = () => send.mock.calls.filter(([ch]) => ch === 'display-start-reminder').length;

  test('uses the chosen interval', () => {
    mockMinutes = 30;
    mgr.start();
    jest.advanceTimersByTime(29 * MIN);
    expect(shows()).toBe(0);
    jest.advanceTimersByTime(1 * MIN);
    expect(shows()).toBe(1);
  });

  test('"Never" stops the popup', () => {
    mockMinutes = 0;
    mgr.start();
    jest.advanceTimersByTime(3 * 60 * MIN);
    expect(shows()).toBe(0);
  });

  test('changing the setting restarts the countdown', () => {
    mgr.start();
    jest.advanceTimersByTime(5 * MIN);
    mockMinutes = 60;
    mgr.applyIntervalSetting();
    jest.advanceTimersByTime(59 * MIN);
    expect(shows()).toBe(0);
    jest.advanceTimersByTime(1 * MIN);
    expect(shows()).toBe(1);
  });

  test('turning it off clears a pending popup', () => {
    mgr.start();
    mockMinutes = 0;
    mgr.applyIntervalSetting();
    jest.advanceTimersByTime(2 * 60 * MIN);
    expect(shows()).toBe(0);
  });
});
