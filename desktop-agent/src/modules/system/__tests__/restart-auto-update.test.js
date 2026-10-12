/**
 * Restart auto-update: staged Mac path survives reload; install defers while tracking.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const mockUserDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'restart-auto-update-'));

jest.mock(
  'electron',
  () => ({
    app: {
      isPackaged: true,
      getVersion: () => '1.0.248',
      getPath: () => mockUserDataDir,
      quit: jest.fn(),
    },
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
    autoUpdater: {
      on: jest.fn(),
      setFeedURL: jest.fn(),
      checkForUpdates: jest.fn(async () => null),
      downloadUpdate: jest.fn(),
      quitAndInstall: jest.fn(),
    },
  }),
  { virtual: true },
);

Object.defineProperty(process, 'versions', {
  value: { ...process.versions, electron: '28.0.0' },
});
Object.defineProperty(process, 'type', { value: 'browser', configurable: true });

const ForceUpdater = require('../force-updater');

describe('restart auto-update', () => {
  afterAll(() => {
    fs.rmSync(mockUserDataDir, { recursive: true, force: true });
  });

  it('persists and reloads the Mac staged .app path across restart', () => {
    const staged = path.join(mockUserDataDir, 'Tavilo Time.app');
    fs.mkdirSync(staged, { recursive: true });
    const updater = new ForceUpdater();
    updater.isDevMode = false;
    updater.pendingVersion = '1.0.249';
    updater.isUpdateAvailable = true;
    updater.isUpdateDownloaded = true;
    updater.macStagedAppPath = staged;
    updater.macUpdateWorkDir = mockUserDataDir;
    updater.saveUpdateState();

    const again = new ForceUpdater();
    again.isDevMode = false;
    expect(again.macStagedAppPath).toBe(staged);
    expect(again.hasInstallablePayload()).toBe(true);
  });

  it('defers install while tracking and applies when idle', async () => {
    const staged = path.join(mockUserDataDir, 'staged-idle', 'Tavilo Time.app');
    fs.mkdirSync(staged, { recursive: true });
    const updater = new ForceUpdater();
    updater.isDevMode = false;
    updater.currentVersion = '1.0.248';
    updater.pendingVersion = '1.0.249';
    updater.macStagedAppPath = staged;
    updater.isUpdateDownloaded = true;
    updater.installUpdate = jest.fn(async () => ({ success: true, installing: true }));

    global.isTracking = true;
    const deferred = await updater.applyUpdateOnRestart();
    expect(deferred.deferred).toBe(true);
    expect(updater.installUpdate).not.toHaveBeenCalled();

    global.isTracking = false;
    expect(updater.maybeInstallWhenIdle()).toBe(true);
    expect(updater.installUpdate).toHaveBeenCalled();
  });

  it('reports no payload when staged path is missing after restart', () => {
    const updater = new ForceUpdater();
    updater.isDevMode = false;
    updater.macStagedAppPath = path.join(mockUserDataDir, 'missing.app');
    updater.isUpdateDownloaded = true;
    expect(updater.hasInstallablePayload()).toBe(false);
  });
});
