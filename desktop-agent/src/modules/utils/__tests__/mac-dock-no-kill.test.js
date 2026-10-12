/**
 * Rebrand must not killall Dock (un-minimizes every window) or rename the
 * live .app while Tavilo is running (crash + relaunch loop).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const mockExecFile = jest.fn((cmd, args, opts, cb) => {
  if (typeof opts === 'function') {
    opts(null);
    return;
  }
  if (typeof cb === 'function') cb(null);
});

jest.mock('child_process', () => ({
  execFile: (...args) => mockExecFile(...args),
  spawn: jest.fn(() => ({ unref: jest.fn() })),
}));

jest.mock(
  'electron',
  () => ({
    app: {
      isPackaged: true,
      getVersion: () => '1.0.249',
      once: jest.fn(),
      dock: { setIcon: jest.fn() },
    },
    nativeImage: {
      createFromPath: () => ({ isEmpty: () => true }),
    },
  }),
  { virtual: true },
);

const {
  renameMacBundleForDock,
  restartDockOnce,
  refreshMacDisplayName,
} = require('../auto-launch');

describe('Mac Dock / bundle rename safety', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mac-dock-'));
  const legacy = path.join(tmp, 'Alyson PM.app');

  beforeEach(() => {
    mockExecFile.mockClear();
    global.__taviloBundleRenameScheduled = false;
    fs.mkdirSync(legacy, { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('does not rename the live bundle immediately', () => {
    const returned = renameMacBundleForDock(legacy);
    expect(returned).toBe(legacy);
    expect(fs.existsSync(legacy)).toBe(true);
    expect(fs.existsSync(path.join(tmp, 'Tavilo Time.app'))).toBe(false);
    const { app } = require('electron');
    expect(app.once).toHaveBeenCalledWith('will-quit', expect.any(Function));
  });

  it('never calls killall Dock from auto-launch helpers', () => {
    restartDockOnce(legacy);
    refreshMacDisplayName(legacy);
    const killDock = mockExecFile.mock.calls.some(
      (call) => call[0] === 'killall' && Array.isArray(call[1]) && call[1].includes('Dock'),
    );
    expect(killDock).toBe(false);
  });

  it('force-updater Mac install script does not killall Dock', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../system/force-updater.js'),
      'utf8',
    );
    expect(src).not.toMatch(/^\s*killall Dock/m);
  });
});
