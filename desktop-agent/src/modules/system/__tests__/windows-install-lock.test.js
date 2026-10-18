/**
 * Oct 9 (Mohita): the relaunch bat started the old exe mid-install and that
 * process launched a second Setup over the first. One install at a time.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const mockUserDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'win-install-lock-'));
let mockVersion = '1.0.250';

jest.mock(
  'electron',
  () => ({
    app: { isPackaged: true, getVersion: () => mockVersion, getPath: () => mockUserDataDir, quit: jest.fn() },
    BrowserWindow: { getAllWindows: () => [] },
    dialog: {},
    ipcMain: { handle: jest.fn(), removeHandler: jest.fn() },
    shell: { openExternal: jest.fn() },
  }),
  { virtual: true },
);
jest.mock(
  'electron-updater',
  () => ({ autoUpdater: { on: jest.fn(), setFeedURL: jest.fn(), checkForUpdates: jest.fn(async () => null), downloadUpdate: jest.fn(), quitAndInstall: jest.fn() } }),
  { virtual: true },
);
jest.mock('child_process', () => ({ ...jest.requireActual('child_process'), spawn: jest.fn(() => ({ unref: jest.fn() })) }));

Object.defineProperty(process, 'versions', { value: { ...process.versions, electron: '28.0.0' } });
Object.defineProperty(process, 'type', { value: 'browser', configurable: true });

const ForceUpdater = require('../force-updater');
const { buildWindowsRelaunchBatHead, INSTALL_LOCK_MS } = ForceUpdater;
const lockPath = path.join(mockUserDataDir, 'update-install.lock');

describe('Windows install lock', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    try { fs.unlinkSync(lockPath); } catch (_) {}
    global.isInstallingUpdate = false;
    mockVersion = '1.0.250';
  });
  afterEach(() => jest.useRealTimers());
  afterAll(() => fs.rmSync(mockUserDataDir, { recursive: true, force: true }));

  function updaterWithSetup() {
    const u = new ForceUpdater();
    u.pendingVersion = '1.0.251';
    const setup = path.join(mockUserDataDir, 'Alyson.PM.Setup.1.0.251.exe');
    fs.writeFileSync(setup, 'x');
    return { u, setup };
  }

  it('launches Setup once and refuses a second install while the first may still run', () => {
    const { u, setup } = updaterWithSetup();
    expect(u.launchWindowsInstaller(setup).success).toBe(true);
    expect(JSON.parse(fs.readFileSync(lockPath, 'utf8')).version).toBe('1.0.251');

    // The old exe relaunched mid-install (new process) must not start another Setup.
    global.isInstallingUpdate = false;
    const second = updaterWithSetup().u;
    expect(second.launchWindowsInstaller(setup)).toMatchObject({ success: false, error: 'install_in_progress' });
  });

  it('allows a retry once the lock is stale', () => {
    const { u, setup } = updaterWithSetup();
    fs.writeFileSync(lockPath, JSON.stringify({ at: new Date(Date.now() - INSTALL_LOCK_MS - 1000).toISOString(), version: '1.0.251' }));
    expect(u.launchWindowsInstaller(setup).success).toBe(true);
  });

  it('clears the lock when the new version is running', () => {
    fs.writeFileSync(lockPath, JSON.stringify({ at: new Date().toISOString(), version: '1.0.251' }));
    mockVersion = '1.0.251';
    new ForceUpdater();
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it('keeps the lock while the old version is still running', () => {
    fs.writeFileSync(lockPath, JSON.stringify({ at: new Date().toISOString(), version: '1.0.251' }));
    new ForceUpdater();
    expect(fs.existsSync(lockPath)).toBe(true);
  });
});

describe('Windows relaunch bat', () => {
  it('waits for Setup and the NSIS temp uninstaller, and skips launch if the app is already up', () => {
    const lines = buildWindowsRelaunchBatHead('C:\\Users\\x\\pending\\Alyson.PM.Setup.1.0.251.exe').join('\n');
    expect(lines).toContain('start /wait "" "C:\\Users\\x\\pending\\Alyson.PM.Setup.1.0.251.exe" /S');
    expect(lines).toMatch(/IMAGENAME eq Alyson\.PM\.Setup\.1\.0\.251\.exe.*goto wait_setup/);
    expect(lines).toMatch(/IMAGENAME eq Au_\.exe.*goto wait_setup/);
    expect(lines).toMatch(/IMAGENAME eq Tavilo Time\.exe.*goto launch_skip/);
    expect(lines.indexOf('Au_.exe')).toBeLessThan(lines.indexOf('Tavilo Time.exe'));
  });
});
