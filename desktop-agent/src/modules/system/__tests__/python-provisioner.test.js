/**
 * Packaged Mac must never pip-install PyObjC. Overlapping ensurePython
 * calls (startup + session restore + Start Tracking) used to spawn several
 * 120s pip processes and freeze the Electron UI.
 */

jest.mock('electron', () => ({
  app: {
    isPackaged: true,
    getAppPath: () => '/Applications/Alyson PM.app/Contents/Resources/app.asar',
    getPath: () => '/tmp',
  },
}));

jest.mock('child_process', () => {
  const { promisify } = require('util');
  const exec = jest.fn((command, options, callback) => {
    if (typeof options === 'function') {
      callback = options;
    }
    const cmd = String(command);
    if (cmd.includes('pip install')) {
      const err = new Error('pip must not run in packaged tests');
      callback(err);
      return;
    }
    if (cmd.includes('CGEventTapCreate')) {
      callback(new Error('no pyobjc'));
      return;
    }
    callback(null, 'Python 3.12.0\n', '');
  });
  exec[promisify.custom] = (command, options = {}) =>
    new Promise((resolve, reject) => {
      exec(command, options, (err, stdout, stderr) => {
        if (err) {
          reject(err);
          return;
        }
        resolve({ stdout, stderr });
      });
    });
  return { exec, execFile: jest.fn() };
});

const { exec } = require('child_process');
const electron = require('electron');
const PythonProvisioner = require('../python-provisioner');

function pipInstallCalls() {
  return exec.mock.calls.filter(([command]) => String(command).includes('pip install'));
}

describe('PythonProvisioner packaged Mac', () => {
  beforeEach(() => {
    PythonProvisioner.resetForTests();
    electron.app.isPackaged = true;
    exec.mockClear();
    if (typeof console.log.mockClear === 'function') console.log.mockClear();
    if (typeof console.warn.mockClear === 'function') console.warn.mockClear();
  });

  test('shouldAllowPipInstall is false unless unpackaged', () => {
    expect(PythonProvisioner.shouldAllowPipInstall(true)).toBe(false);
    expect(PythonProvisioner.shouldAllowPipInstall(undefined)).toBe(false);
    expect(PythonProvisioner.shouldAllowPipInstall(null)).toBe(false);
    expect(PythonProvisioner.shouldAllowPipInstall(false)).toBe(true);
  });

  test('packaged macOS never runs pip install', async () => {
    const provisioner = new PythonProvisioner();
    provisioner.platform = 'darwin';

    const result = await provisioner.ensurePython({ allowDownload: false });

    expect(pipInstallCalls()).toEqual([]);
    expect(result.ready).toBe(true);
    expect(result.message).toMatch(/PyObjC missing|reduced functionality|System Python|Bundled Python/i);
  });

  test('_pipInstallPyObjC is a no-op when packaged', async () => {
    const provisioner = new PythonProvisioner();
    const installed = await provisioner._pipInstallPyObjC('/usr/bin/python3');
    expect(installed).toBe(false);
    expect(pipInstallCalls()).toEqual([]);
  });

  test('concurrent ensurePython shares one in-flight run', async () => {
    let runs = 0;
    const orig = PythonProvisioner.prototype._ensurePythonUncached;
    PythonProvisioner.prototype._ensurePythonUncached = async function () {
      runs += 1;
      await new Promise((r) => setTimeout(r, 40));
      return { ready: true, pythonPath: '/usr/bin/python3', message: 'ok', errors: [] };
    };

    try {
      const a = new PythonProvisioner();
      const b = new PythonProvisioner();
      const [ra, rb, rc] = await Promise.all([
        a.ensurePython(),
        b.ensurePython(),
        a.ensurePython(),
      ]);

      expect(runs).toBe(1);
      expect(ra).toBe(rb);
      expect(rb).toBe(rc);
    } finally {
      PythonProvisioner.prototype._ensurePythonUncached = orig;
    }
  });

  test('five packaged callers never pip and share one probe', async () => {
    const spy = jest.spyOn(PythonProvisioner.prototype, '_ensurePythonUncached');
    try {
      const results = await Promise.all(
        Array.from({ length: 5 }, () => {
          const provisioner = new PythonProvisioner();
          provisioner.platform = 'darwin';
          return provisioner.ensurePython({ allowDownload: false });
        })
      );

      expect(pipInstallCalls()).toEqual([]);
      expect(results.every((r) => r.ready)).toBe(true);
      expect(new Set(results).size).toBe(1);
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });

  test('ready result is reused without probing again', async () => {
    const first = new PythonProvisioner();
    first.platform = 'darwin';
    await first.ensurePython({ allowDownload: false });
    exec.mockClear();

    const second = new PythonProvisioner();
    second.platform = 'darwin';
    const result = await second.ensurePython({ allowDownload: false });

    expect(result.ready).toBe(true);
    expect(exec.mock.calls).toEqual([]);
    expect(pipInstallCalls()).toEqual([]);
  });

  test('unpackaged macOS may pip-install when PyObjC is missing', async () => {
    electron.app.isPackaged = false;
    const provisioner = new PythonProvisioner();
    provisioner.platform = 'darwin';
    provisioner._checkPyObjC = async () => false;
    provisioner._checkPyObjCWithPath = async () => false;

    await provisioner._ensureMacOSSystemPythonFallback();

    expect(pipInstallCalls().length).toBe(1);
  });
});
