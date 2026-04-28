#!/usr/bin/env node

// Smoke test: ensure input events reach ScreenshotManager via connectInputManager

const path = require('path');
const ScreenshotManager = require('../src/modules/screenshot-manager');
const UnifiedInputManager = require('../src/modules/activity/input-manager');

async function run() {
  const mockConfigManager = {
    getConfig: () => ({
      user_id: 'test-user',
      currentTimeLogId: 'log-1',
      currentProjectId: 'proj-1',
      screenshotRedaction: { enabled: false }
    })
  };

  const electronModules = {
    desktopCapturer: null,
    systemPreferences: { getMediaAccessStatus: () => 'granted' },
    screen: { getPrimaryDisplay: () => ({ workAreaSize: { width: 1920, height: 1080 } }) },
    powerMonitor: { on: () => {}, getSystemIdleTime: () => 0 }
  };

  // Provide globals expected by screenshot manager
  global.enhancedSyncManager = null;
  global.configManager = mockConfigManager;

  const screenshotManager = new ScreenshotManager(mockConfigManager, electronModules, null);
  const inputManager = new UnifiedInputManager();
  await inputManager.initialize(electronModules);

  screenshotManager.connectInputManager(inputManager);

  // Simulate input events
  inputManager.recordActivity('click', 'test');
  inputManager.recordActivity('key', 'test');
  inputManager.recordActivity('move', 'test');

  // Read stats back
  const stats = screenshotManager.getCurrentInputStats();
  console.log('SMOKE_STATS', JSON.stringify(stats));

  const ok = stats.mouseClicks === 1 && stats.keystrokes === 1 && stats.mouseMovements === 1;
  console.log('SMOKE_RESULT', ok ? 'PASS' : 'FAIL');
  process.exit(ok ? 0 : 1);
}

run().catch((e) => { console.error('SMOKE_ERROR', e?.message || e); process.exit(1); });





