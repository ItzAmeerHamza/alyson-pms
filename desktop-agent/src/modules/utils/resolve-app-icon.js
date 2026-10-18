'use strict';

/**
 * Packaged Mac puts the .icns next to app.asar (Contents/Resources/icon.icns).
 * Paths inside app.asar often fail for app.dock.setIcon / nativeImage on .icns.
 */

const fs = require('fs');
const path = require('path');

function resolveAppIconPath(opts = {}) {
  const {
    platform = process.platform,
    resourcesPath = typeof process.resourcesPath === 'string' ? process.resourcesPath : null,
    appPath = null,
    preferIcns = platform === 'darwin',
  } = opts;

  const names = preferIcns
    ? ['icon.icns', 'icon.png']
    : platform === 'win32'
      ? ['icon.ico', 'icon.png']
      : ['icon.png'];

  const dirs = [];
  if (resourcesPath) dirs.push(resourcesPath);
  if (appPath) dirs.push(path.join(appPath, 'assets'));
  // Dev / unpackaged: desktop-agent/assets relative to this file
  dirs.push(path.join(__dirname, '../../../assets'));

  for (const dir of dirs) {
    if (!dir) continue;
    for (const name of names) {
      const candidate = path.join(dir, name);
      try {
        if (fs.existsSync(candidate)) return candidate;
      } catch {
        /* continue */
      }
    }
  }
  return null;
}

/** Electron often returns an empty image for .icns. The PNG is the same white plate. */
function imagePathForDock(iconPath) {
  if (!iconPath) return null;
  if (iconPath.toLowerCase().endsWith('.png')) return iconPath;
  const png = path.join(path.dirname(iconPath), 'icon.png');
  try {
    if (fs.existsSync(png)) return png;
  } catch {
    /* use the icns path */
  }
  return iconPath;
}

function setMacDockIcon(app, nativeImage, opts = {}) {
  if (process.platform !== 'darwin') return { ok: false, reason: 'not_darwin' };
  if (!app?.dock || typeof app.dock.setIcon !== 'function') {
    return { ok: false, reason: 'no_dock' };
  }
  const resolved = resolveAppIconPath({ ...opts, preferIcns: true });
  const iconPath = imagePathForDock(resolved);
  if (!iconPath) return { ok: false, reason: 'missing' };

  try {
    if (nativeImage && typeof nativeImage.createFromPath === 'function') {
      const image = nativeImage.createFromPath(iconPath);
      if (image && typeof image.isEmpty === 'function' && image.isEmpty()) {
        return { ok: false, reason: 'empty', path: iconPath };
      }
      app.dock.setIcon(image);
    } else {
      app.dock.setIcon(iconPath);
    }
    return { ok: true, path: iconPath };
  } catch (err) {
    return { ok: false, reason: err?.message || String(err), path: iconPath };
  }
}

module.exports = {
  resolveAppIconPath,
  imagePathForDock,
  setMacDockIcon,
};
