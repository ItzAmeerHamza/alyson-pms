const PlatformManager = require('../platform-manager');

describe('platform-manager in-flight sharing', () => {
  it('concurrent cache misses share one detector run', async () => {
    const pm = new PlatformManager();
    let release;
    pm.appDetector = {
      detectActiveApp: jest.fn(() => new Promise((r) => { release = r; })),
    };
    const a = pm.detectActiveApplication();
    const b = pm.detectActiveApplication();
    await Promise.resolve();
    await Promise.resolve();
    release({ appName: 'Safari', windowTitle: 'x', platform: 'darwin', method: 'active-win' });
    const [ra, rb] = await Promise.all([a, b]);
    expect(pm.appDetector.detectActiveApp).toHaveBeenCalledTimes(1);
    expect(ra.appName).toBe('Safari');
    expect(rb.appName).toBe('Safari');

    // A later miss runs the detector again.
    pm.cache.lastDetection = null;
    pm.appDetector.detectActiveApp.mockResolvedValue({ appName: 'Notes', method: 'active-win' });
    const rc = await pm.detectActiveApplication();
    expect(rc.appName).toBe('Notes');
    expect(pm.appDetector.detectActiveApp).toHaveBeenCalledTimes(2);
  });

  it('a rejected detector run does not stick', async () => {
    const pm = new PlatformManager();
    pm.appDetector = { detectActiveApp: jest.fn().mockRejectedValueOnce(new Error('boom')) };
    expect(await pm.detectActiveApplication()).toBeNull();
    pm.appDetector.detectActiveApp.mockResolvedValue({ appName: 'Code', method: 'active-win' });
    expect((await pm.detectActiveApplication()).appName).toBe('Code');
  });
});
