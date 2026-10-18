/**
 * An agent with no working input hook (no uiohook, no Swift helper) reads 0
 * clicks/keys whatever the user does. Those screenshots must reach Pulse as
 * unknown (null), not 0% — Pulse counts sustained sub-10% shots as idle.
 */
jest.mock('../../../lib/meeting-context', () => ({
  ...jest.requireActual('../../../lib/meeting-context'),
  refreshMeetingPresence: jest.fn(async () => null),
}));
jest.mock('../../../platform/macos-uiohook-input', () => {
  const state = { available: true };
  class MacOSUiohookInput {
    static isAvailable() { return state.available; }
    static loadErrorMessage() { return 'dlopen: incompatible architecture'; }
    start() {}
    stop() {}
  }
  return { MacOSUiohookInput, __state: state };
});

const fs = require('fs');
const os = require('os');
const path = require('path');
const EnhancedScreenshotManager = require('../enhanced-screenshot-manager');
const CrossPlatformInputDetector = require('../../../cross-platform-input-detector');
const UnifiedInputManager = require('../../activity/input-manager');
const EnhancedIdleMonitor = require('../../activity/enhanced-idle-monitor');
const { OfflineScreenshotQueue } = require('../../utils/offline-screenshot-queue');
const { uploadScreenshotViaS3Api } = require('../../utils/screenshot-storage');
const { sumLowActivitySecondsFromScreenshots } = require('../../utils/today-effective-stats');
const { applyActivityFilter } = require('../../utils/backend-screenshots');
const uiohookMock = require('../../../platform/macos-uiohook-input');

const resolveShotActivity = EnhancedScreenshotManager.prototype._resolveScreenshotActivity;
const NO_INPUT = { clicks: 0, keys: 0, moves: 0 };

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
  delete global.unifiedInputManager;
  uiohookMock.__state.available = true;
});

describe('input source tracking', () => {
  it('records uiohook as the source when it starts', async () => {
    const detector = new CrossPlatformInputDetector();
    await expect(detector.startMacOSInProcessInput()).resolves.toBe(true);
    expect(detector.inputSource).toBe('uiohook');
  });

  it('has no source when uiohook cannot load (Intel build on Apple silicon)', async () => {
    uiohookMock.__state.available = false;
    const detector = new CrossPlatformInputDetector();
    await expect(detector.startMacOSInProcessInput()).resolves.toBe(false);
    expect(detector.inputSource).toBeNull();
  });

  it('drops the source when Accessibility is denied', () => {
    const detector = new CrossPlatformInputDetector();
    jest.spyOn(detector, '_notifyInputHelperPermissionNeeded').mockImplementation(() => {});
    detector.inputSource = 'swift-helper';
    detector.handleExternalPythonEvent({ type: 'permission_denied', message: 'not trusted' });
    expect(detector.inputSource).toBeNull();
  });

  it('InputManager reports whether the detector has a source', () => {
    const manager = new UnifiedInputManager();
    expect(manager.hasInputSource()).toBe(false);
    manager.platformDetector = { inputSource: 'swift-helper' };
    expect(manager.hasInputSource()).toBe(true);
    manager.platformDetector = { inputSource: null };
    expect(manager.hasInputSource()).toBe(false);
  });
});

describe('screenshot activity', () => {
  it('is unknown (null), not 0%, when no input source is running', async () => {
    global.unifiedInputManager = { getIdleTime: () => 0, hasInputSource: () => false };
    await expect(resolveShotActivity.call({}, NO_INPUT, 'Code', 'main.js')).resolves.toEqual({
      activityPercent: null,
      focusPercent: null,
      meetingLabel: null,
    });
  });

  it('stays a measured 0% when a source is running and the user is still', async () => {
    global.unifiedInputManager = { getIdleTime: () => 0, hasInputSource: () => true };
    const result = await resolveShotActivity.call({}, NO_INPUT, 'Code', 'main.js');
    expect(result.activityPercent).toBe(0);
    expect(result.focusPercent).toBe(0);
  });

  it('keeps today’s behaviour when the input manager is not wired up', async () => {
    const result = await resolveShotActivity.call({}, { clicks: 4, keys: 10, moves: 30 }, 'Code', 'main.js');
    expect(result.activityPercent).toBeGreaterThan(0);
  });

  it('unknown activity does not feed the idle monitor', () => {
    const monitor = { _markHighActivity: jest.fn(), _evaluateIdleState: jest.fn(async () => {}) };
    global.isTracking = true;
    EnhancedIdleMonitor.prototype.onScreenshotActivity.call(monitor, null);
    expect(monitor._evaluateIdleState).not.toHaveBeenCalled();
    delete global.isTracking;
  });
});

describe('unknown activity on the way to Pulse', () => {
  let tmp;
  let realFetch;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'unknown-activity-'));
    realFetch = global.fetch;
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
    global.fetch = realFetch;
    delete global.config;
  });

  it('the offline queue keeps null instead of turning it into 0', () => {
    const queue = new OfflineScreenshotQueue({ rootDir: tmp, isOnline: () => false });
    queue.enqueuePrepared({
      id: 'shot-1',
      buffer: Buffer.from('jpeg'),
      ext: 'jpg',
      contentType: 'image/jpeg',
      meta: { userId: '1195', activityPercent: null, focusPercent: null, clicks: 0 },
    });
    const [item] = queue._readMeta().items;
    expect(item.activityPercent).toBeNull();
    expect(item.focusPercent).toBeNull();
  });

  it('the upload sends activity_percent: null to the backend', async () => {
    global.config = { backend_api_url: 'http://localhost:3000', backend_api_key: 'test-key' };
    const sent = [];
    global.fetch = jest.fn(async (url, opts) => {
      if (opts.method === 'PUT') return { ok: true, status: 200, text: async () => '' };
      const body = JSON.parse(opts.body);
      sent.push(body);
      const reply =
        body.action === 'screenshot_upload_init'
          ? { id: 'shot-1', s3_key: 'screenshots/1195/shot-1.jpg', upload_url: 'https://s3.test/put' }
          : { success: true, id: 'shot-1' };
      return { ok: true, status: 200, json: async () => reply, text: async () => JSON.stringify(reply) };
    });

    await uploadScreenshotViaS3Api({
      userId: '1195',
      uploadBuffer: Buffer.from('jpeg'),
      contentType: 'image/jpeg',
      ext: 'jpg',
      activityPercent: null,
      focusPercent: null,
      clicks: 0,
      keys: 0,
      moves: 0,
      screenshotId: 'shot-1',
    });

    const complete = sent.find((b) => b.action === 'screenshot_upload_complete');
    expect(complete.data.metadata).toMatchObject({ activity_percent: null, focus_percent: null, mouse_clicks: 0 });
  });

  it('the tray does not count unknown shots as low activity (same as Pulse)', () => {
    const start = Date.parse('2026-10-09T13:00:00.000Z');
    const shots = (pct) =>
      Array.from({ length: 12 }, (_, i) => ({
        captured_at: new Date(start + i * 60_000).toISOString(),
        activity_percent: pct,
        app_name: 'Code',
      }));
    const dayStart = start - 3600_000;
    const dayEnd = start + 12 * 3600_000;

    expect(sumLowActivitySecondsFromScreenshots(shots(0), 60, dayStart, dayEnd)).toBeGreaterThan(0);
    expect(sumLowActivitySecondsFromScreenshots(shots(null), 60, dayStart, dayEnd)).toBe(0);
  });

  it('the screenshot gallery does not list unknown shots under "low"', () => {
    const shots = [{ id: 'a', activity_percent: null }, { id: 'b', activity_percent: 3 }];
    expect(applyActivityFilter(shots, 'low').map((s) => s.id)).toEqual(['b']);
    expect(applyActivityFilter(shots, 'all')).toHaveLength(2);
  });
});
