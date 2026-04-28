import { test, expect } from '@playwright/test';

// These imports reference desktop-agent modules directly to test logic without the UI.
// We exercise activity aggregation and screenshot timer propagation paths that the
// Activity Monitor UI listens to, but call them headlessly.

// Using require to avoid ESM resolution issues in Playwright runner
const EnhancedActivityManager = require('../desktop-agent/src/modules/activity/enhanced-activity-manager.js');
const EnhancedScreenshotManager = require('../desktop-agent/src/modules/capture/enhanced-screenshot-manager.js');
const EnhancedSyncManager = require('../desktop-agent/src/modules/sync/enhanced-sync-manager.js');

// Minimal global stubs the modules expect
function createGlobalStubs() {
  // Stub a minimal mainWindow.webContents for IPC sends
  const sent: { channel: string; data: any }[] = [];
  const mainWindow = {
    isDestroyed: () => false,
    webContents: {
      send: (channel: string, data: any) => {
        sent.push({ channel, data });
      },
    },
  };

  // Attach to global as modules rely on it
  (global as any).mainWindow = mainWindow as any;
  (global as any).isTracking = true;
  (global as any).isPaused = false;
  (global as any).currentSession = { startTime: Date.now() - 5000 };
  (global as any).displayActivityStats = { clicks: 0, keys: 0, moves: 0, lastUpdate: Date.now() };

  return { sent, mainWindow };
}

test.describe('Activity Monitor logic (no UI)', () => {
  test('aggregates activity and emits activity-update with mapped fields', async () => {
    const { sent } = createGlobalStubs();

    const config = { screenshot_interval_seconds: 30 };
    const sync = new EnhancedSyncManager(config, /* supabase */ undefined);
    sync.initialize({ isTracking: true });

    const activity = new EnhancedActivityManager(config);
    activity.initialize({ isTracking: true, activityStats: {}, periodActivityStats: {}, loggingThrottle: {}, betweenScreenshotsActivity: {} });

    // Simulate activity via the enhanced manager pathway used by the agent
    activity.recordEnhancedActivity('click', 'unit-test');
    activity.recordEnhancedActivity('key', 'unit-test');
    activity.recordEnhancedActivity('move', 'unit-test');

    // Force a batched send using sync manager
    sync.batchActivityUpdate({ mouseClicks: 1, keystrokes: 1, mouseMovements: 1 });

    // Assert we emitted an activity-update with normalized fields
    const last = sent.filter(s => s.channel === 'activity-update').pop();
    expect(last).toBeDefined();
    expect(last!.data.mouseClicks).toBeGreaterThanOrEqual(1);
    expect(last!.data.keystrokes).toBeGreaterThanOrEqual(1);
    expect(last!.data.mouseMovements).toBeGreaterThanOrEqual(1);
  });

  test('emits next-screenshot-update and mirrored screenshot/activity updates', async () => {
    const { sent } = createGlobalStubs();

    const config = { screenshot_interval_seconds: 30 };
    const sync = new EnhancedSyncManager(config, /* supabase */ undefined);
    sync.initialize({ isTracking: true });

    const screenshotMgr = new EnhancedScreenshotManager(config, { BrowserWindow: undefined, desktopCapturer: undefined });
    screenshotMgr.initialize({ wrappers: {}, supabaseService: undefined, mainWindow: (global as any).mainWindow, systemPreferences: {} });
    // Ensure manager thinks tracking is on and a next screenshot is scheduled
    (screenshotMgr as any).isTracking = true;
    (screenshotMgr as any).nextScreenshotTime = Date.now() + 5000;

    // Seed between-screenshot activity that manager reads from global
    const activitySinceLast = { clicks: 2, keys: 3, moves: 4 };
    (global as any).betweenScreenshotsActivity = { ...activitySinceLast, lastUpdate: Date.now() };
    (global as any).enhancedSyncManager = sync;

    // Trigger the timer update method used by the manager
    (screenshotMgr as any).sendNextScreenshotUpdate();

    const next = sent.filter(s => s.channel === 'next-screenshot-update').pop();
    const mirrored = sent.filter(s => s.channel === 'screenshot-update').pop();
    const act = sent.filter(s => s.channel === 'activity-update').pop();

    expect(next).toBeDefined();
    expect(next!.data.activitySinceLastScreenshot).toMatchObject(activitySinceLast);

    expect(mirrored).toBeDefined();
    expect(mirrored!.data.activitySinceLastScreenshot).toMatchObject(activitySinceLast);

    expect(act).toBeDefined();
    expect(act!.data.mouseClicks).toBeGreaterThanOrEqual(0);
    expect(act!.data.keystrokes).toBeGreaterThanOrEqual(0);
    expect(act!.data.mouseMovements).toBeGreaterThanOrEqual(0);
  });
});


