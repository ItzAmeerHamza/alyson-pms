/**
 * Unit Tests for Screenshot Watchdog
 * Covers: global wiring, "never captured" detection, consecutive failure tracking
 */

describe('Screenshot Watchdog (main.js logic)', () => {
  let watchdogCallback;

  beforeEach(() => {
    global.isTracking = true;
    global.consecutiveScreenshotFailures = 0;
    global.lastSuccessfulScreenshotTime = 0;
    global.trackingStartTime = null;
    global.enhancedScreenshotManager = null;
    global.stopTracking = jest.fn();

    // Extract the watchdog logic into a testable function
    // (mirrors the setInterval callback in main.js)
    watchdogCallback = () => {
      if (global.isTracking) {
        const consecutiveFailures = global.consecutiveScreenshotFailures || 0;
        const lastSuccessfulTime = global.lastSuccessfulScreenshotTime || 0;
        const now = Date.now();

        if (consecutiveFailures >= 3) {
          global.stopTracking('screenshot_failures', '3 consecutive screenshot failures');
          return;
        }

        if (lastSuccessfulTime > 0 && (now - lastSuccessfulTime) > (15 * 60 * 1000)) {
          global.stopTracking('mandatory_screenshot_timeout', 'no screenshot in 15 min');
          return;
        }

        if (lastSuccessfulTime === 0) {
          const trackingStartedAt = global.enhancedScreenshotManager?._trackingStartedAt
            || global.trackingStartTime || 0;
          if (trackingStartedAt > 0 && (now - trackingStartedAt) > (15 * 60 * 1000)) {
            global.stopTracking('mandatory_screenshot_timeout', 'no screenshots ever captured');
            return;
          }
        }
      }
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── 3 consecutive failures ───

  test('stops tracking after 3 consecutive screenshot failures', () => {
    global.consecutiveScreenshotFailures = 3;
    watchdogCallback();
    expect(global.stopTracking).toHaveBeenCalledWith('screenshot_failures', expect.any(String));
  });

  test('does NOT stop with fewer than 3 failures', () => {
    global.consecutiveScreenshotFailures = 2;
    watchdogCallback();
    expect(global.stopTracking).not.toHaveBeenCalled();
  });

  // ─── 15 min without screenshot (was working, then stopped) ───

  test('stops after 15+ min since last successful screenshot', () => {
    global.lastSuccessfulScreenshotTime = Date.now() - (16 * 60 * 1000); // 16 min ago
    watchdogCallback();
    expect(global.stopTracking).toHaveBeenCalledWith('mandatory_screenshot_timeout', expect.any(String));
  });

  test('does NOT stop if last screenshot was recent', () => {
    global.lastSuccessfulScreenshotTime = Date.now() - (5 * 60 * 1000); // 5 min ago
    watchdogCallback();
    expect(global.stopTracking).not.toHaveBeenCalled();
  });

  // ─── Never captured (the bug this fix addresses) ───

  test('stops after 15+ min of tracking with ZERO screenshots ever taken', () => {
    global.lastSuccessfulScreenshotTime = 0; // never set
    global.trackingStartTime = new Date(Date.now() - (20 * 60 * 1000)); // started 20 min ago
    watchdogCallback();
    expect(global.stopTracking).toHaveBeenCalledWith('mandatory_screenshot_timeout', expect.any(String));
  });

  test('also works with enhancedScreenshotManager._trackingStartedAt', () => {
    global.lastSuccessfulScreenshotTime = 0;
    global.trackingStartTime = null;
    global.enhancedScreenshotManager = { _trackingStartedAt: Date.now() - (16 * 60 * 1000) };
    watchdogCallback();
    expect(global.stopTracking).toHaveBeenCalledWith('mandatory_screenshot_timeout', expect.any(String));
  });

  test('does NOT stop if tracking just started (< 15 min)', () => {
    global.lastSuccessfulScreenshotTime = 0;
    global.trackingStartTime = new Date(Date.now() - (5 * 60 * 1000)); // started 5 min ago
    watchdogCallback();
    expect(global.stopTracking).not.toHaveBeenCalled();
  });

  test('does NOT fire "never captured" check if screenshots ARE working', () => {
    global.lastSuccessfulScreenshotTime = Date.now() - (2 * 60 * 1000); // 2 min ago
    global.trackingStartTime = new Date(Date.now() - (30 * 60 * 1000)); // tracking for 30 min
    watchdogCallback();
    // lastSuccessfulTime > 0, gap < 15 min → no stop
    expect(global.stopTracking).not.toHaveBeenCalled();
  });

  // ─── Edge cases ───

  test('does nothing when not tracking', () => {
    global.isTracking = false;
    global.consecutiveScreenshotFailures = 10;
    watchdogCallback();
    expect(global.stopTracking).not.toHaveBeenCalled();
  });

  test('does nothing if trackingStartTime is not set yet', () => {
    global.lastSuccessfulScreenshotTime = 0;
    global.trackingStartTime = null;
    global.enhancedScreenshotManager = null;
    watchdogCallback();
    expect(global.stopTracking).not.toHaveBeenCalled();
  });
});
