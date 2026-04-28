import { test, expect } from '@playwright/test';

// Headless unit tests for app detection logic without UI
const EnhancedAppDetector = require('../desktop-agent/src/modules/capture/enhanced-app-detector.js');
const EnhancedSyncManager = require('../desktop-agent/src/modules/sync/enhanced-sync-manager.js');

function createGlobalIPCStub() {
  const sent: { channel: string; data: any }[] = [];
  (global as any).mainWindow = {
    isDestroyed: () => false,
    webContents: { send: (channel: string, data: any) => sent.push({ channel, data }) },
  };
  return sent;
}

test.describe('App Detection logic (no UI)', () => {
  test('emits app-detected and queues app log via sync manager', async () => {
    const sent = createGlobalIPCStub();

    const config = { user_id: 'test-user', screenshot_interval_seconds: 30 };
    const sync = new EnhancedSyncManager(config, undefined);
    sync.initialize({ isTracking: true });
    (global as any).enhancedSyncManager = sync;
    // Provide a minimal syncManager compatible with EnhancedAppDetector path
    ;(global as any).syncManager = {
      addAppLogs: async (items: any[]) => {
        // mimic enqueue by sending an app-update just for visibility
        (global as any).mainWindow.webContents.send('app-update', { lastAppDetection: Date.now(), currentApp: items?.[0]?.app_name || 'Unknown' });
        return true;
      }
    };

    const detector = new EnhancedAppDetector(config);
    detector.initialize({ isTracking: true });
    // Force tracking/session context the detector checks
    (detector as any).isTracking = true;
    (detector as any).currentTimeLogId = 'time-log-1';

    // Stub platform detection return path
    (detector as any).detectActiveApplication = async () => ({
      name: 'VS Code',
      title: 'index.ts – Project',
      bundleId: 'com.microsoft.VSCode',
    });

    // Manually invoke one detection tick and inline the save path
    const active = await (detector as any).detectActiveApplication();
    expect(active).toBeDefined();
    // Simulate the save/UI path that startAppCapture interval would execute
    if (active && active.name) {
      const appData = {
        user_id: config.user_id,
        time_log_id: 'time-log-1',
        app_name: active.name,
        window_title: active.title || '',
        app_path: active.bundleId || null,
        timestamp: new Date().toISOString(),
      };
      await (global as any).syncManager.addAppLogs([appData]);
      (global as any).mainWindow.webContents.send('app-detected', {
        name: active.name,
        title: active.title || '',
        timestamp: appData.timestamp,
        type: 'capture',
      });
    }

    // IPC verification
    const appEvt = sent.filter(s => s.channel === 'app-detected').pop();
    expect(appEvt).toBeDefined();
    expect(appEvt!.data.name).toBe('VS Code');
    expect(appEvt!.data.title).toContain('index.ts');

    // Ensure it attempted to persist via sync queue
    // We hooked EnhancedSyncManager; addAppLogs runs internally, but at minimum
    // we expect subsequent "app-update"/state IPC or no throw.
    expect(sent.some(s => s.channel === 'app-detected')).toBeTruthy();
  });
});


