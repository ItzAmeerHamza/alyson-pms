jest.mock('active-win', () => jest.fn(), { virtual: true });
jest.mock('child_process', () => ({
  exec: jest.fn(),
}));

const activeWin = require('active-win');
const { exec } = require('child_process');
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
    exec.mockImplementation((cmd, opts, cb) => {
      cb(new Error('Command failed: osascript System Events'), '');
    });

    await getMacActiveApplication();

    expect(OSA_TIMEOUT_MS).toBe(1500);
    expect(exec).toHaveBeenCalledTimes(1);
    expect(exec.mock.calls[0][1].timeout).toBe(1500);
  });

  it('does not spawn a second osascript while backoff is armed', async () => {
    activeWin.mockRejectedValue(new Error('active-win down'));
    exec.mockImplementation((cmd, opts, cb) => {
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
    exec.mockImplementation((cmd, opts, cb) => {
      cb(new Error('Command failed: osascript System Events'), '');
    });

    const first = await getMacActiveApplication();
    const second = await getMacActiveApplication();

    expect(first.name).toBe('Cursor');
    expect(first.method).toBe('active-win');
    expect(second.name).toBe('Cursor');
    expect(exec).toHaveBeenCalledTimes(1);
  });
});
