const fs = require('fs');
const os = require('os');
const path = require('path');

const mockUserDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'updater-async-'));
jest.mock(
  'electron',
  () => ({
    app: { isPackaged: true, getVersion: () => '1.0.248', getPath: () => mockUserDataDir, quit: jest.fn() },
    BrowserWindow: { getAllWindows: () => [] },
    dialog: {},
    ipcMain: { handle: jest.fn(), removeHandler: jest.fn() },
    shell: { openExternal: jest.fn() },
  }),
  { virtual: true },
);
jest.mock(
  'electron-updater',
  () => ({
    autoUpdater: { on: jest.fn(), setFeedURL: jest.fn(), checkForUpdates: jest.fn(async () => null), downloadUpdate: jest.fn(), quitAndInstall: jest.fn() },
  }),
  { virtual: true },
);
Object.defineProperty(process, 'versions', { value: { ...process.versions, electron: '28.0.0' } });
Object.defineProperty(process, 'type', { value: 'browser', configurable: true });

const ForceUpdater = require('../force-updater');

describe('mac update staging without blocking the main thread', () => {
  afterAll(() => fs.rmSync(mockUserDataDir, { recursive: true, force: true }));

  it('shares one in-flight checkForUpdates across concurrent callers', async () => {
    const updater = new ForceUpdater();
    let release;
    updater._checkForUpdatesImpl = jest.fn(() => new Promise((r) => { release = r; }));
    const a = updater.checkForUpdates();
    const b = updater.checkForUpdates();
    await Promise.resolve();
    expect(updater._checkForUpdatesImpl).toHaveBeenCalledTimes(1);
    release({ updateAvailable: false });
    expect(await a).toEqual({ updateAvailable: false });
    expect(await b).toBe(await a);
    updater.checkForUpdates();
    await Promise.resolve();
    expect(updater._checkForUpdatesImpl).toHaveBeenCalledTimes(2);
  });

  it('_execFileAsync resolves stdout and rejects on non-zero exit like execFileSync', async () => {
    const updater = new ForceUpdater();
    await expect(updater._execFileAsync('echo', ['hi'], { encoding: 'utf8' })).resolves.toBe('hi\n');
    await expect(updater._execFileAsync('false', [], {})).rejects.toThrow();
  });

  it('getVolumeFreeBytes parses df asynchronously', async () => {
    const updater = new ForceUpdater();
    const free = await updater.getVolumeFreeBytes(os.tmpdir());
    expect(free).toBeGreaterThan(0);
  });

  it('_spawnCollectAsync mirrors spawnSync status/stdout/stderr', async () => {
    const updater = new ForceUpdater();
    const r = await updater._spawnCollectAsync('sh', ['-c', 'echo out; echo err 1>&2; exit 3'], { encoding: 'utf8', timeout: 5000 });
    expect(r.status).toBe(3);
    expect(r.stdout).toBe('out\n');
    expect(r.stderr).toBe('err\n');
  });

  it('_ensureMacBundleSignature is async and keeps a stable identity', async () => {
    const updater = new ForceUpdater();
    updater._spawnCollectAsync = jest.fn(async () => ({ status: 0, stdout: '', stderr: 'Authority=Alyson PM Code Signing\n' }));
    updater._execFileAsync = jest.fn();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    await updater._ensureMacBundleSignature('/x/Tavilo Time.app');
    expect(updater._execFileAsync).not.toHaveBeenCalled();
    jest.restoreAllMocks();
  });

  it('removes older staging dirs but never the current one', async () => {
    const updater = new ForceUpdater();
    const tmp = fs.mkdtempSync(path.join(mockUserDataDir, 'tmp-'));
    jest.spyOn(os, 'tmpdir').mockReturnValue(tmp);
    const old = path.join(tmp, `alyson-pm-update-9.9.9-${Date.now() - 100000}`);
    const current = path.join(tmp, `alyson-pm-update-9.9.9-${Date.now()}`);
    const newer = path.join(tmp, `alyson-pm-update-9.9.9-${Date.now() + 100000}`);
    for (const d of [old, current, newer]) fs.mkdirSync(d, { recursive: true });
    updater.macUpdateWorkDir = old;
    const removed = updater._cleanupStaleMacUpdateWorkDirs(current);
    expect(removed).toContain(path.resolve(old));
    expect(removed).not.toContain(path.resolve(current));
    expect(removed).not.toContain(path.resolve(newer));
    expect(updater.macUpdateWorkDir).toBeNull();
    await new Promise((r) => setTimeout(r, 50));
    expect(fs.existsSync(old)).toBe(false);
    expect(fs.existsSync(current)).toBe(true);
    fs.rmSync(current, { recursive: true, force: true });
    fs.rmSync(newer, { recursive: true, force: true });
    jest.restoreAllMocks();
  });
});

describe('automatic install never ends a live session', () => {
  afterEach(() => { global.isTracking = false; });

  function stagedMacUpdater() {
    const updater = new ForceUpdater();
    updater.isMacPackaged = () => true;
    updater.macStagedAppPath = os.tmpdir(); // any path that exists on disk
    updater.manualInstallRequired = false;
    updater.installMacInPlace = jest.fn(() => ({ success: true, installing: true }));
    return updater;
  }

  it('defers an automatic install when tracking started meanwhile', async () => {
    const updater = stagedMacUpdater();
    global.isTracking = true;
    const result = await updater.installUpdate();
    expect(result).toMatchObject({ deferred: true, reason: 'tracking_active' });
    expect(updater.installMacInPlace).not.toHaveBeenCalled();
    expect(updater._installWhenIdle).toBe(true);
  });

  it('installs automatically when not tracking', async () => {
    const updater = stagedMacUpdater();
    global.isTracking = false;
    await updater.installUpdate();
    expect(updater.installMacInPlace).toHaveBeenCalledTimes(1);
  });

  it('a click on Install still installs while tracking (unchanged)', async () => {
    const updater = stagedMacUpdater();
    global.isTracking = true;
    await updater.installUpdate({ userInitiated: true });
    expect(updater.installMacInPlace).toHaveBeenCalledTimes(1);
  });
});
