/**
 * App Detection Constants and Defaults
 */

const IGNORED_APP_TITLES = new Set(['Electron|No Window', 'Unknown|No Window']);
const IGNORED_APP_NAMES = [/^background.*$/i];

function getNumberEnv(name, fallback) {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

const DEFAULTS = {
  // Session model: confirm focus briefly, then ONE row until the app switches
  DWELL_MS: getNumberEnv('APP_DETECT_DWELL_MS', 5000),
  STABILIZE_BROWSER: getNumberEnv('APP_DETECT_STABILIZE_SAMPLES_BROWSER', 1),
  STABILIZE_DEFAULT: getNumberEnv('APP_DETECT_STABILIZE_SAMPLES_DEFAULT', 1),
  // Kept for compatibility; session mode does not re-insert on this gap
  MIN_SAVE_GAP_MS: getNumberEnv('APP_DETECT_MIN_SAVE_GAP_MS', 15 * 60 * 1000),
  MAX_RECORD_MS: getNumberEnv('APP_DETECT_MAX_RECORD_MS', 2 * 60 * 60 * 1000), // 2h roll
};

module.exports = {
  IGNORED_APP_TITLES,
  IGNORED_APP_NAMES,
  DEFAULTS,
};


