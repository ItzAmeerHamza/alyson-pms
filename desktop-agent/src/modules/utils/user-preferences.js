'use strict';

/**
 * Personal preferences from the Settings page, saved per computer in
 * userData/user-preferences.json. Tracking rules stay with the workspace
 * admin; these only change how the app behaves for this person.
 *
 * Auto-start and close behavior keep their own files (auto-launch.js,
 * close-prompt.js) because older builds already read them.
 */

const fs = require('fs');
const path = require('path');

const PREF_FILENAME = 'user-preferences.json';

/** Allowed "Start tracking?" reminder intervals, in minutes. 0 = off. */
const REMINDER_MINUTES = [0, 10, 15, 30, 60];

const DEFAULTS = Object.freeze({
  // true = show the main window when the app starts at login.
  openWindowAtLogin: true,
  // macOS: today's time next to the Tavilo icon in the menu bar.
  showMenuBarTimer: true,
  // Minutes between "Start tracking?" popups while not tracking. 0 = off.
  notTrackingReminderMinutes: 10,
  // System notifications. Timer-stopped alerts always show.
  desktopNotifications: true,
});

let cache = null;

function prefPath() {
  try {
    const { app } = require('electron');
    if (app?.getPath) return path.join(app.getPath('userData'), PREF_FILENAME);
  } catch (_) { /* not in Electron (tests) */ }
  return null;
}

/** Drop unknown keys and fix bad values so callers can trust the result. */
function sanitize(raw) {
  const out = { ...DEFAULTS };
  if (!raw || typeof raw !== 'object') return out;
  for (const key of ['openWindowAtLogin', 'showMenuBarTimer', 'desktopNotifications']) {
    if (typeof raw[key] === 'boolean') out[key] = raw[key];
  }
  const mins = Number(raw.notTrackingReminderMinutes);
  if (REMINDER_MINUTES.includes(mins)) out.notTrackingReminderMinutes = mins;
  return out;
}

function getAll() {
  if (cache) return { ...cache };
  let raw = null;
  try {
    const p = prefPath();
    if (p && fs.existsSync(p)) raw = JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (err) {
    console.warn('⚠️ [PREFS] Could not read preferences:', err?.message || err);
  }
  cache = sanitize(raw);
  return { ...cache };
}

function get(key) {
  return getAll()[key];
}

/** Merge a partial update and save it. */
function update(partial) {
  const next = sanitize({ ...getAll(), ...(partial || {}) });
  try {
    const p = prefPath();
    if (p) {
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(
        p,
        JSON.stringify({ ...next, updatedAt: new Date().toISOString() }, null, 2),
        'utf8',
      );
    }
  } catch (err) {
    console.warn('⚠️ [PREFS] Could not save preferences:', err?.message || err);
    throw err;
  }
  cache = next;
  return { ...next };
}

/** Electron marks login launches on macOS; on Windows we pass LOGIN_ARG. */
const LOGIN_ARG = '--opened-at-login';

function wasOpenedAtLogin(argv = process.argv) {
  if (Array.isArray(argv) && argv.includes(LOGIN_ARG)) return true;
  if (process.platform !== 'darwin') return false;
  try {
    const { app } = require('electron');
    return !!app?.getLoginItemSettings?.().wasOpenedAtLogin;
  } catch (_) {
    return false;
  }
}

/** Keep the main window hidden on this launch? Checked once, then cached. */
let startHidden = null;
function shouldStartHidden() {
  if (startHidden === null) {
    startHidden = !get('openWindowAtLogin') && wasOpenedAtLogin();
    if (startHidden) console.log('🪟 [PREFS] Opened at login — starting in the background');
  }
  return startHidden;
}

module.exports = {
  DEFAULTS,
  REMINDER_MINUTES,
  LOGIN_ARG,
  getAll,
  get,
  update,
  sanitize,
  wasOpenedAtLogin,
  shouldStartHidden,
  _resetForTests: () => { cache = null; startHidden = null; },
};
