const ForceUpdater = require('../force-updater');

describe('mac in-place update disk errors', () => {
  const updater = new ForceUpdater();

  it('treats ENOSPC as insufficient disk, not a DMG-only failure', () => {
    expect(updater.isInsufficientDiskError(new Error('ENOSPC: no space left on device, write'))).toBe(true);
    expect(updater.isInsufficientDiskError('Not enough free disk space to install the update')).toBe(true);
    expect(updater.isInsufficientDiskError('ZIP file not provided')).toBe(false);
  });
});
