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

  it('does not open the installer while the in-place download is already running', async () => {
    const { shell } = require('electron');
    shell.openExternal.mockClear();
    const updater = new ForceUpdater();
    updater.isDevMode = false;
    updater.isMacPackaged = () => true;
    updater.currentVersion = '1.1.1';
    updater.macStagedAppPath = null;
    updater.isUpdateDownloaded = false;
    updater.isDownloading = true;
    updater.isUpdateAvailable = true;
    updater.pendingVersion = '1.1.2';
    updater.installMacInPlace = jest.fn();
    updater.openManualDownload = jest.fn();
    updater.checkForUpdates = jest.fn(async () => ({
      updateAvailable: true,
      updateDownloaded: false,
      newVersion: '1.1.2',
      currentVersion: '1.1.1',
    }));
    updater.notifyUpdateAvailable = jest.fn();

    const outcome = await updater.applyUpdateOnRestart();

    expect(outcome.reason).toBe('download_in_progress');
    expect(updater.openManualDownload).not.toHaveBeenCalled();
    expect(shell.openExternal).not.toHaveBeenCalled();
  });

  it('keeps Install inside the app when the ZIP is not staged yet', async () => {
    const { shell } = require('electron');
    shell.openExternal.mockClear();
    const updater = new ForceUpdater();
    updater.isMacPackaged = () => true;
    updater.macStagedAppPath = null;
    updater.isUpdateDownloaded = false;
    updater.isUpdateAvailable = true;
    updater.pendingVersion = '1.1.2';
    updater.isDownloading = true;
    updater.installMacInPlace = jest.fn();
    updater.downloadMacInPlaceUpdate = jest.fn(async () => ({ success: true, inProgress: true }));

    const result = await updater.installUpdate({ userInitiated: true });

    expect(result.inProgress).toBe(true);
    expect(result.dmgOpened).toBeFalsy();
    expect(shell.openExternal).not.toHaveBeenCalled();
  });

  it('does not open the installer when the in-place download fails', async () => {
    const { shell } = require('electron');
    shell.openExternal.mockClear();
    const updater = new ForceUpdater();
    updater.isMacPackaged = () => true;
    updater.macStagedAppPath = null;
    updater.isUpdateDownloaded = false;
    updater.isUpdateAvailable = true;
    updater.pendingVersion = '1.1.2';
    updater.isDownloading = false;
    updater.manualInstallRequired = false;
    updater.downloadMacInPlaceUpdate = jest.fn(async () => ({ success: false, error: 'in_place_failed' }));

    const result = await updater.installUpdate({ userInitiated: true });

    expect(result.dmgOpened).toBeFalsy();
    expect(shell.openExternal).not.toHaveBeenCalled();
  });

  it('leaves the installer closed unless someone explicitly asks for it', () => {
    const { shell } = require('electron');
    shell.openExternal.mockClear();
    const updater = new ForceUpdater();
    updater.pendingVersion = '1.1.2';

    const blocked = updater.openManualDownload();
    expect(blocked.success).toBe(false);
    expect(blocked.error).toBe('installer_not_opened');
    expect(shell.openExternal).not.toHaveBeenCalled();

    const opened = updater.openManualDownload({ userInitiated: true });
    expect(opened.success).toBe(true);
    expect(shell.openExternal).toHaveBeenCalledTimes(1);
  });
});
