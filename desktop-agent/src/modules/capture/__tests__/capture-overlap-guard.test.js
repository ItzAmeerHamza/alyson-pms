/**
 * macOS/Windows captures return from dedicated platform modules, so the
 * in-progress guard must wrap them (and a hung capture must time out).
 */

jest.mock('../../../platform/macos/screenshot-capture', () => ({ captureScreenshot: jest.fn() }));
jest.mock('../../../platform/windows/screenshot-capture', () => ({ captureScreenshot: jest.fn() }));

const EnhancedScreenshotManager = require('../enhanced-screenshot-manager');

const realPlatform = process.platform;
function setPlatform(p) {
  Object.defineProperty(process, 'platform', { value: p });
}

describe.each(['darwin', 'win32'])('capture overlap guard (%s)', (platform) => {
  let mgr;
  let platformCapture;

  beforeEach(() => {
    setPlatform(platform);
    platformCapture = platform === 'darwin'
      ? require('../../../platform/macos/screenshot-capture').captureScreenshot
      : require('../../../platform/windows/screenshot-capture').captureScreenshot;
    platformCapture.mockReset();
    mgr = new EnhancedScreenshotManager({}, {});
    mgr.isTracking = true;
    mgr.currentSession = { id: 'tl' };
    global.isTracking = true;
    global._lastScreenshotAttempt = 0;
    mgr._prepareRendererForCapture = jest.fn().mockResolvedValue();
  });

  afterEach(() => {
    jest.useRealTimers();
    setPlatform(realPlatform);
    mgr.cleanup();
    delete global.isTracking;
    delete global._lastScreenshotAttempt;
  });

  test('sets the flag during capture, rejects overlap, clears after', async () => {
    let release;
    platformCapture.mockImplementation(() => new Promise((r) => { release = r; }));
    const first = mgr.captureScreenshot(false);
    await Promise.resolve();
    expect(mgr._captureInProgress).toBe(true);

    global._lastScreenshotAttempt = 0; // bypass the 30s debounce to reach the guard
    await expect(mgr.captureScreenshot(false)).resolves.toBe(false);
    expect(platformCapture).toHaveBeenCalledTimes(1);

    release({ success: false, error: 'x' });
    await expect(first).resolves.toBe(false);
    expect(mgr._captureInProgress).toBe(false);
  });

  test('health check bypasses the busy flag and does not clear it', async () => {
    let release;
    platformCapture.mockImplementationOnce(() => new Promise((r) => { release = r; }));
    const first = mgr.captureScreenshot(false);
    await Promise.resolve();
    platformCapture.mockResolvedValueOnce({ success: false });
    await mgr.captureScreenshot(true);
    expect(platformCapture).toHaveBeenCalledTimes(2);
    expect(mgr._captureInProgress).toBe(true);
    release({ success: false });
    await first;
    expect(mgr._captureInProgress).toBe(false);
  });

  test('flag cleared on early return (tracking stopped)', async () => {
    mgr.isTracking = false;
    await expect(mgr.captureScreenshot(false)).resolves.toBe(false);
    expect(mgr._captureInProgress).toBe(false);
  });

  test('hung platform capture times out as a failed capture and frees the flag', async () => {
    jest.useFakeTimers();
    platformCapture.mockImplementation(() => new Promise(() => {}));
    const p = mgr.captureScreenshot(false);
    await Promise.resolve();
    await Promise.resolve();
    expect(mgr._captureInProgress).toBe(true);
    await jest.advanceTimersByTimeAsync(45 * 1000);
    await expect(p).resolves.toBe(false);
    expect(mgr._captureInProgress).toBe(false);
  });

  test('stale flag does not block forever', () => {
    mgr._captureInProgress = true;
    mgr._captureInProgressSince = Date.now() - 6 * 60 * 1000;
    expect(mgr._isCaptureBusy()).toBe(false);
    mgr._captureInProgressSince = Date.now();
    expect(mgr._isCaptureBusy()).toBe(true);
  });
});
