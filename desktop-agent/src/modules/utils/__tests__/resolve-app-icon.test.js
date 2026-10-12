const fs = require('fs');
const os = require('os');
const path = require('path');
const { resolveAppIconPath, setMacDockIcon } = require('../resolve-app-icon');

describe('resolveAppIconPath', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'icon-res-'));

  afterAll(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('prefers Resources/icon.icns over asar assets (packaged Mac)', () => {
    const resources = path.join(tmp, 'Resources');
    fs.mkdirSync(resources, { recursive: true });
    const icns = path.join(resources, 'icon.icns');
    fs.writeFileSync(icns, 'fake');
    const asarAssets = path.join(tmp, 'app.asar', 'assets');
    fs.mkdirSync(asarAssets, { recursive: true });
    fs.writeFileSync(path.join(asarAssets, 'icon.icns'), 'asar');

    const resolved = resolveAppIconPath({
      platform: 'darwin',
      resourcesPath: resources,
      appPath: path.join(tmp, 'app.asar'),
      preferIcns: true,
    });
    expect(resolved).toBe(icns);
  });

  it('falls back to icon.png when icns is absent', () => {
    const resources = path.join(tmp, 'Resources-png');
    fs.mkdirSync(resources, { recursive: true });
    const png = path.join(resources, 'icon.png');
    fs.writeFileSync(png, 'png');

    const resolved = resolveAppIconPath({
      platform: 'darwin',
      resourcesPath: resources,
      preferIcns: true,
    });
    expect(resolved).toBe(png);
  });

  it('setMacDockIcon uses nativeImage when provided', () => {
    const resources = path.join(tmp, 'Resources-dock');
    fs.mkdirSync(resources, { recursive: true });
    const icns = path.join(resources, 'icon.icns');
    fs.writeFileSync(icns, 'fake');

    const setIcon = jest.fn();
    const app = { dock: { setIcon } };
    const image = { isEmpty: () => false };
    const nativeImage = { createFromPath: jest.fn(() => image) };

    const prev = process.platform;
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    try {
      const result = setMacDockIcon(app, nativeImage, { resourcesPath: resources });
      expect(result.ok).toBe(true);
      expect(nativeImage.createFromPath).toHaveBeenCalledWith(icns);
      expect(setIcon).toHaveBeenCalledWith(image);
    } finally {
      Object.defineProperty(process, 'platform', { value: prev });
    }
  });
});
