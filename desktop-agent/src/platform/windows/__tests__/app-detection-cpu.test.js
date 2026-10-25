jest.mock('active-win', () => jest.fn(), { virtual: true });
jest.mock('child_process', () => ({ spawn: jest.fn(), execFile: jest.fn() }));
jest.mock('../desktop-window-detection', () => ({
  detectActiveDesktopWindow: jest.fn().mockResolvedValue(null),
  getAllDesktopWindows: jest.fn().mockResolvedValue([]),
}));
jest.mock('../simple-app-detection', () => ({
  detectActiveApp: jest.fn().mockResolvedValue(null),
  getAllDesktopApplications: jest.fn().mockResolvedValue([]),
}));

const activeWin = require('active-win');
const { execFile, spawn } = require('child_process');
const detector = require('../app-detection');
const { _internals } = detector;

const TASKLIST = [
  '"System Idle Process","0","Services","0","8 K"',
  '"Chrome.exe","1234","Console","1","123,456 K"',
  '"firefox.exe","4321","Console","1","99,000 K"',
].join('\r\n');

describe('windows app-detection CPU fixes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    _internals.resetForTests();
    global.isTracking = true;
    global.isShuttingDown = false;
    global.isStopping = false;
  });

  it('parses tasklist image names case-insensitively', () => {
    const names = _internals.parseTasklistImageNames(TASKLIST);
    expect(names.has('chrome.exe')).toBe(true);
    expect(names.has('firefox.exe')).toBe(true);
    expect(names.has('msedge.exe')).toBe(false);
  });

  it('unwraps ApplicationFrameHost with one cached tasklist, same browser order', async () => {
    execFile.mockImplementation((file, args, opts, cb) => cb(null, TASKLIST, ''));
    // msedge not running → chrome comes before firefox in the old order.
    expect(await _internals.unwrapApplicationFrameHost('Calculator')).toBe('chrome');
    expect(await _internals.unwrapApplicationFrameHost('Settings')).toBe('chrome');
    expect(execFile).toHaveBeenCalledTimes(1);
    expect(execFile.mock.calls[0][0]).toBe('tasklist');
    expect(execFile.mock.calls[0][2].killSignal).toBe('SIGKILL');
  });

  it('title hints still win without spawning anything', async () => {
    expect(await _internals.unwrapApplicationFrameHost('New tab - Microsoft Edge')).toBe('msedge');
    expect(execFile).not.toHaveBeenCalled();
  });

  it('returns null when no browser is running or tasklist fails', async () => {
    execFile.mockImplementation((file, args, opts, cb) => cb(new Error('nope'), '', ''));
    expect(await _internals.unwrapApplicationFrameHost('Calculator')).toBeNull();
  });

  it('pauses active-win after 3 failures instead of disabling it forever', async () => {
    // PowerShell fallback: make spawn fail fast.
    spawn.mockImplementation(() => {
      throw new Error('no powershell');
    });
    activeWin.mockRejectedValue(new Error('active-win timeout (1s)'));
    const run = async () => {
      _internals.clearDetectionCache(); // force a cache miss, keep fail counts
      await detector.detectActiveApp();
    };
    await run();
    await run();
    await run();
    expect(activeWin).toHaveBeenCalledTimes(3);
    await run();
    expect(activeWin).toHaveBeenCalledTimes(3); // paused

    const realNow = Date.now;
    Date.now = () => realNow() + _internals.ACTIVE_WIN_COOLDOWN_MS + 1;
    try {
      activeWin.mockResolvedValueOnce({ owner: { name: 'Code', processId: 9 }, title: 'file.js' });
      _internals.clearDetectionCache();
      const app = await detector.detectActiveApp();
      expect(activeWin).toHaveBeenCalledTimes(4);
      expect(app.appName).toBeTruthy();
      expect(app.method).toBe('active-win-native');
    } finally {
      Date.now = realNow;
    }
  });
});
