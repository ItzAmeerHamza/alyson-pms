jest.mock('active-win', () => jest.fn(), { virtual: true });
jest.mock('child_process', () => ({
  execFile: jest.fn(),
}));

const activeWin = require('active-win');
const { execFile: exec } = require('child_process');
const {
  getMacActiveApplication,
  OSA_TIMEOUT_MS,
  _resetActiveWinForTests,
  _getOsascriptBackoffForTests,
} = require('../app-detection');

describe('macos osascript backoff', () => {
  beforeEach(() => {
    _resetActiveWinForTests();
    jest.clearAllMocks();
  });

  it('caps System Events osascript at 1.5s', async () => {
    activeWin.mockRejectedValue(new Error('active-win down'));
    exec.mockImplementation((file, args, opts, cb) => {
      cb(new Error('Command failed: osascript System Events'), '');
    });

    await getMacActiveApplication();

    expect(OSA_TIMEOUT_MS).toBe(1500);
    expect(exec).toHaveBeenCalledTimes(1);
    expect(exec.mock.calls[0][0]).toBe('/usr/bin/osascript');
    expect(exec.mock.calls[0][2].timeout).toBe(1500);
    expect(exec.mock.calls[0][2].killSignal).toBe('SIGKILL');
  });

  it('does not spawn a second osascript while backoff is armed', async () => {
    activeWin.mockRejectedValue(new Error('active-win down'));
    exec.mockImplementation((file, args, opts, cb) => {
      cb(new Error('Command failed: osascript System Events'), '');
    });

    const first = await getMacActiveApplication();
    const second = await getMacActiveApplication();

    expect(exec).toHaveBeenCalledTimes(1);
    expect(first.method).toBe('osascript-fail');
    expect(second.method).toBe('osascript-backoff');
    expect(_getOsascriptBackoffForTests().failureCount).toBe(1);
    expect(_getOsascriptBackoffForTests().nextRetryTime).toBeGreaterThan(Date.now());
  });

  it('keeps the last native app instead of throwing after osascript fails', async () => {
    activeWin
      .mockResolvedValueOnce({
        owner: { name: 'Cursor', bundleId: 'com.todesktop.230313mzl4w4u92', processId: 11 },
        title: 'app-detection.js',
      })
      .mockRejectedValue(new Error('active-win down'));
    exec.mockImplementation((file, args, opts, cb) => {
      cb(new Error('Command failed: osascript System Events'), '');
    });

    const first = await getMacActiveApplication();
    const second = await getMacActiveApplication();

    expect(first.name).toBe('Cursor');
    expect(first.method).toBe('active-win');
    expect(second.name).toBe('Cursor');
    expect(exec).toHaveBeenCalledTimes(1);
  });

  it('pauses active-win after 3 failures, then retries it after the cooldown', async () => {
    const { ACTIVE_WIN_COOLDOWN_MS } = require('../app-detection');
    activeWin.mockRejectedValue(new Error('active-win down'));
    exec.mockImplementation((file, args, opts, cb) => cb(null, 'Cursor|com.x|t\n'));
    for (let i = 0; i < 3; i += 1) await getMacActiveApplication();
    expect(activeWin).toHaveBeenCalledTimes(3);

    await getMacActiveApplication();
    expect(activeWin).toHaveBeenCalledTimes(3); // paused

    const realNow = Date.now;
    Date.now = () => realNow() + ACTIVE_WIN_COOLDOWN_MS + 1;
    try {
      activeWin.mockResolvedValueOnce({ owner: { name: 'Safari', processId: 1 }, title: 'x' });
      const app = await getMacActiveApplication();
      expect(activeWin).toHaveBeenCalledTimes(4);
      expect(app.name).toBe('Safari');
      expect(app.method).toBe('active-win');
    } finally {
      Date.now = realNow;
    }
  });

  it('parses osascript output the same way as before', async () => {
    activeWin.mockRejectedValue(new Error('active-win down'));
    exec.mockImplementation((file, args, opts, cb) => cb(null, 'Notes|com.apple.Notes|My note\n'));
    const app = await getMacActiveApplication();
    expect(exec.mock.calls[0][1][0]).toBe('-e');
    expect(exec.mock.calls[0][1][1]).toContain('first application process whose frontmost is true');
    expect(app).toMatchObject({ name: 'Notes', bundleId: 'com.apple.Notes', title: 'My note', method: 'applescript' });
  });
});
