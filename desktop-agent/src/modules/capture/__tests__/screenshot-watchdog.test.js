/**
 * Unit Tests for Screenshot Watchdog
 * PAYROLL POLICY: screenshot problems must WARN, never auto-stop tracking.
 */

describe('Screenshot Watchdog (main.js logic)', () => {
  let watchdogCallback;
  let warnings;

  beforeEach(() => {
    warnings = [];
    global.isTracking = true;
    global.consecutiveScreenshotFailures = 0;
    global.lastSuccessfulScreenshotTime = 0;
    global.trackingStartTime = null;
    global.enhancedScreenshotManager = null;
    global._lastScreenshotHealthWarnAt = 0;
    global.stopTracking = jest.fn();
    global.trayManager = {
      showNotification: jest.fn((title, body) => {
        warnings.push({ title, body });
      }),
    };

    // Mirrors the setInterval callback in main.js (warn-only, never stop)
    watchdogCallback = () => {
      if (!global.isTracking) return;

      const consecutiveFailures = global.consecutiveScreenshotFailures || 0;
      const lastSuccessfulTime = global.lastSuccessfulScreenshotTime || 0;
      const now = Date.now();
      let warnMsg = null;

      if (consecutiveFailures >= 3) {
        warnMsg = `Screenshot capture failing (${consecutiveFailures} consecutive failures) — timer keeps running`;
      } else if (lastSuccessfulTime > 0 && (now - lastSuccessfulTime) > (15 * 60 * 1000)) {
        const minutesWithoutScreenshot = Math.floor((now - lastSuccessfulTime) / (60 * 1000));
        warnMsg = `No successful screenshot for ${minutesWithoutScreenshot} minutes — timer keeps running`;
      } else if (lastSuccessfulTime === 0) {
        const trackingStartedAt = global.enhancedScreenshotManager?._trackingStartedAt
          || global.trackingStartTime || 0;
        if (trackingStartedAt > 0 && (now - trackingStartedAt) > (15 * 60 * 1000)) {
          const minutesSinceStart = Math.floor((now - trackingStartedAt) / (60 * 1000));
          warnMsg = `${minutesSinceStart} minutes tracking with no screenshots yet — timer keeps running`;
        }
      }

      if (!warnMsg) return;

      const lastWarnAt = global._lastScreenshotHealthWarnAt || 0;
      if (now - lastWarnAt < 5 * 60 * 1000) return;
      global._lastScreenshotHealthWarnAt = now;

      global.trayManager?.showNotification?.(
        'Screenshot issue (timer still running)',
        warnMsg,
      );
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('does NOT stop tracking after 3 consecutive screenshot failures', () => {
    global.consecutiveScreenshotFailures = 3;
    watchdogCallback();
    expect(global.stopTracking).not.toHaveBeenCalled();
    expect(global.trayManager.showNotification).toHaveBeenCalled();
  });

  test('does NOT stop after 15+ min since last successful screenshot', () => {
    global.lastSuccessfulScreenshotTime = Date.now() - (16 * 60 * 1000);
    watchdogCallback();
    expect(global.stopTracking).not.toHaveBeenCalled();
    expect(global.trayManager.showNotification).toHaveBeenCalled();
  });

  test('does NOT stop after 15+ min with ZERO screenshots ever taken', () => {
    global.lastSuccessfulScreenshotTime = 0;
    global.trackingStartTime = new Date(Date.now() - (20 * 60 * 1000));
    watchdogCallback();
    expect(global.stopTracking).not.toHaveBeenCalled();
    expect(global.trayManager.showNotification).toHaveBeenCalled();
  });

  test('does NOT warn with fewer than 3 failures', () => {
    global.consecutiveScreenshotFailures = 2;
    watchdogCallback();
    expect(global.stopTracking).not.toHaveBeenCalled();
    expect(global.trayManager.showNotification).not.toHaveBeenCalled();
  });

  test('does NOT warn if last screenshot was recent', () => {
    global.lastSuccessfulScreenshotTime = Date.now() - (5 * 60 * 1000);
    watchdogCallback();
    expect(global.stopTracking).not.toHaveBeenCalled();
    expect(global.trayManager.showNotification).not.toHaveBeenCalled();
  });

  test('does nothing when not tracking', () => {
    global.isTracking = false;
    global.consecutiveScreenshotFailures = 10;
    watchdogCallback();
    expect(global.stopTracking).not.toHaveBeenCalled();
    expect(global.trayManager.showNotification).not.toHaveBeenCalled();
  });

  test('throttles repeated warnings within 5 minutes', () => {
    global.consecutiveScreenshotFailures = 5;
    watchdogCallback();
    watchdogCallback();
    expect(global.trayManager.showNotification).toHaveBeenCalledTimes(1);
  });
});
