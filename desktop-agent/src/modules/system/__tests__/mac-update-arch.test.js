const ForceUpdater = require('../force-updater');

describe('mac update asset arch', () => {
  const realArch = process.arch;
  const realPlatform = process.platform;

  const setProcess = (key, value) => Object.defineProperty(process, key, { value, configurable: true });

  afterEach(() => {
    setProcess('arch', realArch);
    setProcess('platform', realPlatform);
  });

  const updaterOn = (arch, { rosetta }) => {
    setProcess('platform', 'darwin');
    setProcess('arch', arch);
    const updater = new ForceUpdater();
    jest.spyOn(updater, 'isRunningUnderArm64Translation').mockReturnValue(rosetta);
    return updater;
  };

  it('keeps Apple silicon on the arm64 build', () => {
    const updater = updaterOn('arm64', { rosetta: false });
    expect(updater.getMacZipUrl('1.0.250')).toMatch(/\/v1\.0\.250\/Alyson\.PM-1\.0\.250-arm64-mac\.zip$/);
    expect(updater.getManualDownloadUrl('1.0.250')).toMatch(/\/Alyson\.PM-1\.0\.250-arm64\.dmg$/);
  });

  it('moves the Intel build running under Rosetta onto the arm64 build', () => {
    const updater = updaterOn('x64', { rosetta: true });
    expect(updater.getMacDownloadArch()).toBe('arm64');
    expect(updater.getMacZipUrl('1.0.250')).toMatch(/\/Alyson\.PM-1\.0\.250-arm64-mac\.zip$/);
    expect(updater.getManualDownloadUrl('1.0.250')).toMatch(/\/Alyson\.PM-1\.0\.250-arm64\.dmg$/);
  });

  it('keeps real Intel Macs on the x64 build', () => {
    const updater = updaterOn('x64', { rosetta: false });
    expect(updater.getMacDownloadArch()).toBe('x64');
    expect(updater.getMacZipUrl('1.0.250')).toMatch(/\/Alyson\.PM-1\.0\.250-mac\.zip$/);
    expect(updater.getManualDownloadUrl('1.0.250')).toMatch(/\/Alyson\.PM-1\.0\.250\.dmg$/);
  });

  it('reads Rosetta from Electron only when the app is available', () => {
    setProcess('arch', 'x64');
    expect(new ForceUpdater().isRunningUnderArm64Translation()).toBe(false);
  });
});
