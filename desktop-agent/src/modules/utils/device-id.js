/**
 * Device ID - Persistent unique identifier for this machine.
 * Used to distinguish sessions across multiple devices for the same user.
 *
 * Strategy: Generate a UUIDv4 on first run, persist to the app's userData directory.
 * This survives app restarts but is unique per machine installation.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const DEVICE_ID_FILENAME = 'device-id.json';

let cachedDeviceId = null;

function getAppDataDir() {
  try {
    const { app } = require('electron');
    return app.getPath('userData');
  } catch {
    const base = process.env.APPDATA
      || (process.platform === 'darwin'
        ? path.join(os.homedir(), 'Library', 'Application Support')
        : path.join(os.homedir(), '.config'));
    return path.join(base, 'Ebdaa Work Time');
  }
}

function generateDeviceFingerprint() {
  const hostname = os.hostname();
  const platform = os.platform();
  const arch = os.arch();
  const cpus = os.cpus();
  const cpuModel = cpus.length > 0 ? cpus[0].model : 'unknown';

  return `${hostname}-${platform}-${arch}-${cpuModel}`;
}

function generateDeviceId() {
  return crypto.randomUUID();
}

/**
 * Get or create a persistent device ID for this machine.
 * Returns a short, human-readable device label plus a unique ID.
 */
function getDeviceId() {
  if (cachedDeviceId) return cachedDeviceId;

  const appDataDir = getAppDataDir();
  const filePath = path.join(appDataDir, DEVICE_ID_FILENAME);

  try {
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (data && data.deviceId) {
        cachedDeviceId = data.deviceId;
        console.log(`[DEVICE-ID] Loaded existing device ID: ${cachedDeviceId}`);
        return cachedDeviceId;
      }
    }
  } catch (err) {
    console.warn('[DEVICE-ID] Failed to read device ID file:', err.message);
  }

  const deviceId = generateDeviceId();
  const fingerprint = generateDeviceFingerprint();

  try {
    if (!fs.existsSync(appDataDir)) {
      fs.mkdirSync(appDataDir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify({
      deviceId,
      fingerprint,
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      createdAt: new Date().toISOString()
    }, null, 2));
    console.log(`[DEVICE-ID] Generated new device ID: ${deviceId}`);
  } catch (err) {
    console.warn('[DEVICE-ID] Failed to persist device ID:', err.message);
  }

  cachedDeviceId = deviceId;
  return cachedDeviceId;
}

/**
 * Get a human-readable device label (hostname + platform).
 */
function getDeviceLabel() {
  return `${os.hostname()} (${os.platform()}-${os.arch()})`;
}

module.exports = { getDeviceId, getDeviceLabel };
