/**
 * ps / tasklist snapshot is async now (was execFileSync on the main thread).
 * Same answers, one shared spawn, stale snapshot served while refreshing.
 */
describe('meeting-presence-probe process snapshot', () => {
  const realPlatform = process.platform;
  let execFile;
  let probe;
  let pending;

  function load(platform) {
    Object.defineProperty(process, 'platform', { value: platform });
    jest.resetModules();
    pending = [];
    jest.doMock('child_process', () => ({
      execFile: jest.fn((file, args, opts, cb) => {
        pending.push((stdout, err) => cb(err || null, { stdout, stderr: '' }));
      }),
    }));
    execFile = require('child_process').execFile;
    probe = require('../meeting-presence-probe');
  }

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: realPlatform });
    jest.dontMock('child_process');
  });

  it('mac: first call awaits, concurrent calls share one ps run', async () => {
    load('darwin');
    const a = probe.isMacAppRunning('zoom.us');
    const b = probe.isMacAppRunning('Google Chrome');
    await Promise.resolve();
    expect(execFile).toHaveBeenCalledTimes(1);
    expect(execFile.mock.calls[0][0]).toBe('/bin/ps');
    expect(execFile.mock.calls[0][1]).toEqual(['-axo', 'command=']);
    pending[0]('/Applications/zoom.us.app/Contents/MacOS/zoom.us\n/sbin/launchd\n');
    await expect(a).resolves.toBe(true);
    await expect(b).resolves.toBe(false);
    // Cached for 15 s: no second spawn.
    await expect(probe.isDesktopAppRunning('zoom.us')).resolves.toBe(true);
    expect(execFile).toHaveBeenCalledTimes(1);
  });

  it('serves the stale snapshot while a refresh is running', async () => {
    load('darwin');
    const first = probe.isMacAppRunning('zoom.us');
    await Promise.resolve();
    pending[0]('zoom.us\n');
    await first;

    const realNow = Date.now;
    Date.now = () => realNow() + 16 * 1000;
    try {
      await expect(probe.isMacAppRunning('zoom.us')).resolves.toBe(true); // stale
      await expect(probe.isMacAppRunning('zoom.us')).resolves.toBe(true);
      expect(execFile).toHaveBeenCalledTimes(2); // one refresh, shared
      pending[1]('/sbin/launchd\n');
      await new Promise((r) => setImmediate(r));
      await expect(probe.isMacAppRunning('zoom.us')).resolves.toBe(false); // fresh
      expect(execFile).toHaveBeenCalledTimes(2);
    } finally {
      Date.now = realNow;
    }
  });

  it('a failed ps run means "not running" (same as before)', async () => {
    load('darwin');
    const p = probe.isMacAppRunning('zoom.us');
    await Promise.resolve();
    pending[0]('', new Error('timeout'));
    await expect(p).resolves.toBe(false);
  });

  it('windows: tasklist CSV image match is case-insensitive', async () => {
    load('win32');
    const p = probe.isWinAppRunning('Microsoft Teams');
    await Promise.resolve();
    expect(execFile.mock.calls[0][0]).toBe('tasklist');
    pending[0]('"System","4","Services","0","1 K"\r\n"MS-TEAMS.EXE","99","Console","1","1 K"\r\n');
    await expect(p).resolves.toBe(true);
    await expect(probe.isWinAppRunning('Zoom')).resolves.toBe(false);
  });
});
