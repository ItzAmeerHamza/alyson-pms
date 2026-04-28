// Lightweight re-arm test for EnhancedScreenshotManager 10-min window logic
// Uses a 2s window and a mocked capture to validate next window scheduling

const path = require('path');
const EnhancedScreenshotManager = require('../src/modules/capture/enhanced-screenshot-manager');

(async () => {
  const mgr = new EnhancedScreenshotManager({}, {});
  const logs = { shots: 0, windows: 0 };

  // Inject wrappers with a fast, successful capture
  mgr.initialize({
    wrappers: {
      async captureScreenshot() {
        logs.shots += 1;
        return true;
      },
      scheduleRandomScreenshot() {}
    },
    supabaseService: {},
    mainWindow: { isDestroyed: () => false, webContents: { send() {} } }
  });

  // Make the limiter permissive for the test
  mgr._rateLimiter = { canTake: () => ({ allowed: true }), record: () => {} };

  // Shorten the window to 2 seconds; keep 3 shots requested (will usually take 1 due to min-gap)
  mgr.windowDurationMs = 2000;
  mgr.windowShots = 3;

  // Provide a fake session and start tracking
  const session = { id: 'test-session', user_id: 'user', project_id: 'proj' };
  mgr.updateTrackingState(true, session);

  // Count windows when end-timer re-arms
  const originalStart = mgr.startScreenshotCapture.bind(mgr);
  mgr.startScreenshotCapture = () => {
    logs.windows += 1;
    return originalStart();
  };

  // Run for ~5 seconds to span two windows
  setTimeout(() => {
    mgr.cleanup().then(() => {
      console.log(JSON.stringify({ ok: true, shots: logs.shots, windows: logs.windows }));
      process.exit(0);
    });
  }, 5200);
})();


