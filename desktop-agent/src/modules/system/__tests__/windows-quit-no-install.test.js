/**
 * Windows: quitting must only quit. Installing on quit raced two installers and
 * showed "ffmpeg.dll was not found"; the update installs on next launch instead.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const mockUserDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'win-quit-no-install-'));
const mockAutoUpdater = {
  on: jest.fn(),
  setFeedURL: jest.fn(),
  checkForUpdates: jest.fn(async () => null),
  downloadUpdate: jest.fn(),
  quitAndInstall: jest.fn(),
};

jest.mock(
  'electron',
  () => ({
    app: { isPackaged: true, getVersion: () => '1.0.250', getPath: () => mockUserDataDir, quit: jest.fn() },
    BrowserWindow: { getAllWindows: () => [] },
    dialog: {},
    ipcMain: { handle: jest.fn(), removeHandler: jest.fn() },
    shell: { openExternal: jest.fn() },
  }),
  { virtual: true },
);
jest.mock('electron-updater', () => ({ autoUpdater: mockAutoUpdater }), { virtual: true });

Object.defineProperty(process, 'versions', { value: { ...process.versions, electron: '28.0.0' } });
Object.defineProperty(process, 'type', { value: 'browser', configurable: true });

const realPlatform = process.platform;

describe('Windows quit does not install updates', () => {
  afterAll(() => {
    Object.defineProperty(process, 'platform', { value: realPlatform });
    fs.rmSync(mockUserDataDir, { recursive: true, force: true });
  });

  it('turns off electron-updater install-on-quit on Windows', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    jest.isolateModules(() => {
      const ForceUpdater = require('../force-updater');
      new ForceUpdater();
    });
    expect(mockAutoUpdater.autoInstallOnAppQuit).toBe(false);
    // Only the Node Setup.exe download runs on Windows (no parallel electron-updater copy).
    expect(mockAutoUpdater.autoDownload).toBe(false);
  });

  it('keeps the main-process quit handler from launching Setup on Windows', () => {
    const main = fs.readFileSync(path.join(__dirname, '../../../main.js'), 'utf8');
    const block = main.slice(main.indexOf('Deferred restart update: apply in-place now that the user is quitting'));
    expect(block.slice(0, 600)).toMatch(/process\.platform !== 'win32' &&\s+global\.forceUpdater/);
  });
});
