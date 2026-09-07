const PlatformManager = require('../platform-manager');

describe('platform-manager adaptive cache', () => {
  let prevEnv;

  beforeEach(() => {
    prevEnv = process.env.APP_DETECT_CACHE_MS;
    delete process.env.APP_DETECT_CACHE_MS;
  });

  afterEach(() => {
    if (prevEnv === undefined) delete process.env.APP_DETECT_CACHE_MS;
    else process.env.APP_DETECT_CACHE_MS = prevEnv;
  });

  it('lengthens TTL when the same app is stable instead of shortening it', async () => {
    const pm = new PlatformManager();
    pm.appDetector = {
      detectActiveApp: jest.fn().mockResolvedValue({
        appName: 'Safari',
        windowTitle: 'Inbox',
        bundleId: 'com.apple.Safari',
        platform: 'darwin',
        method: 'active-win',
        isBrowser: true,
      }),
    };

    const first = await pm.detectActiveApplication();
    expect(first.method).toBe('active-win');
    pm.cache.stableAppCount = 5;
    // Old inverted cap was 5s. 8s later must still be cached with the longer TTL.
    pm.cache.lastDetectionTime = Date.now() - 8000;

    const second = await pm.detectActiveApplication();
    expect(second.method).toBe('cached');
    expect(pm.appDetector.detectActiveApp).toHaveBeenCalledTimes(1);
  });

  it('returns cached result within the base TTL', async () => {
    const pm = new PlatformManager();
    const detect = jest.fn().mockResolvedValue({
      appName: 'Safari',
      windowTitle: 'Inbox',
      bundleId: 'com.apple.Safari',
      platform: 'darwin',
      method: 'active-win',
      isBrowser: true,
    });
    pm.appDetector = { detectActiveApp: detect };

    await pm.detectActiveApplication();
    await pm.detectActiveApplication();
    expect(detect).toHaveBeenCalledTimes(1);
  });
});
