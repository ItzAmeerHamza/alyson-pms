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
  // 🔧 FIX: Apps should be saved quickly (within ~5-10 seconds of use)
  // Dwell threshold: 5 seconds - app must be active for 5s before saving
  DWELL_MS: getNumberEnv('APP_DETECT_DWELL_MS', 5000),
  // Single sample stabilization for all apps - save on first confirmed detection
  STABILIZE_BROWSER: getNumberEnv('APP_DETECT_STABILIZE_SAMPLES_BROWSER', 1),
  STABILIZE_DEFAULT: getNumberEnv('APP_DETECT_STABILIZE_SAMPLES_DEFAULT', 1),
  // Minimum gap between saves for same app: 15 seconds
  MIN_SAVE_GAP_MS: getNumberEnv('APP_DETECT_MIN_SAVE_GAP_MS', 15000),
  MAX_RECORD_MS: getNumberEnv('APP_DETECT_MAX_RECORD_MS', 2 * 60 * 60 * 1000), // 2h
};

module.exports = {
  IGNORED_APP_TITLES,
  IGNORED_APP_NAMES,
  DEFAULTS,
};


