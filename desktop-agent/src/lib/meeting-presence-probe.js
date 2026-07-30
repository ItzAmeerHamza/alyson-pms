'use strict';

/**
 * Live evidence that a video call is still open (not a timed sticky window).
 * - macOS browsers: AppleScript lists every tab URL
 * - All platforms: open window titles via active-win (Zoom/Teams native windows)
 */

const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

const PROBE_CACHE_MS = 45 * 1000;

let _cache = { at: 0, result: null };

function isActiveGoogleMeetCallUrl(url) {
  const u = String(url || '').toLowerCase();
  if (!u.includes('meet.google.com')) return false;
  // Lobby / left-call / new-meeting pages are NOT an active call
  if (/meet\.google\.com\/?(landing|new)?\/?(\?|#|$)/.test(u)) return false;
  if (/\/landing|\/new(\?|#|$)/.test(u)) return false;
  // In-call URLs look like meet.google.com/abc-defg-hij
  return /meet\.google\.com\/[a-z0-9]{2,}-[a-z0-9]{2,}-[a-z0-9]{2,}/.test(u);
}

function isZoomOrTeamsCallTitle(title, appName = '') {
  const hay = `${appName} ${title}`.toLowerCase();
  if (!hay.trim()) return false;
  if (/zoom/.test(hay) && /(meeting|webinar|personal room|waiting room|zoom workplace)/.test(hay)) {
    return true;
  }
  if (/microsoft teams|ms-?teams|\bteams\b/.test(hay) && !/teams\.microsoft\.com\/?(\?|#|$)/.test(hay)) {
    // Native Teams call windows usually include meeting subject + "Microsoft Teams"
    return /microsoft teams/.test(hay);
  }
  if (/\bwebex\b/.test(hay) && /meeting|webinar/.test(hay)) return true;
  return false;
}

function labelFromEvidence({ url, title, appName } = {}) {
  if (isActiveGoogleMeetCallUrl(url)) return 'Google Meet';
  const hay = `${appName || ''} ${title || ''} ${url || ''}`.toLowerCase();
  if (/zoom/.test(hay)) return 'Zoom';
  if (/teams/.test(hay)) return 'Microsoft Teams';
  if (/webex/.test(hay)) return 'Webex';
  if (/meet\.google|google meet/.test(hay)) return 'Google Meet';
  return 'Video meeting';
}

async function listChromeFamilyTabUrlsMac() {
  if (process.platform !== 'darwin') return [];

  const apps = ['Google Chrome', 'Chromium', 'Brave Browser', 'Microsoft Edge', 'Arc', 'Dia'];
  const urls = [];

  for (const appName of apps) {
    const script = `
tell application "System Events"
  if not (exists process "${appName}") then return ""
end tell
try
  tell application "${appName}"
    set out to ""
    repeat with w in windows
      try
        repeat with t in tabs of w
          try
            set out to out & (URL of t) & linefeed
          end try
        end repeat
      end try
    end repeat
    return out
  end tell
on error
  return ""
end try
`;
    try {
      const { stdout } = await execFileAsync('/usr/bin/osascript', ['-e', script], {
        timeout: 4000,
        maxBuffer: 2 * 1024 * 1024,
      });
      const lines = String(stdout || '')
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
      for (const line of lines) urls.push({ appName, url: line });
    } catch (_) {
      // App not running / Automation permission missing — ignore
    }
  }

  return urls;
}

async function listOpenWindowTitles() {
  try {
    const activeWin = require('active-win');
    if (typeof activeWin.getOpenWindows !== 'function') return [];
    const windows = await Promise.race([
      activeWin.getOpenWindows(),
      new Promise((resolve) => setTimeout(() => resolve([]), 1500)),
    ]);
    return (windows || []).map((w) => ({
      appName: w?.owner?.name || w?.owner?.path || '',
      title: w?.title || '',
    }));
  } catch (_) {
    return [];
  }
}

/**
 * @returns {Promise<{ active: boolean, label: string|null, evidence: string|null }>}
 */
async function probeMeetingStillOpen({ force = false } = {}) {
  const now = Date.now();
  if (!force && _cache.result && now - _cache.at < PROBE_CACHE_MS) {
    return _cache.result;
  }

  // 1) Browser tabs (macOS) — true signal for Google Meet in a background tab
  try {
    const tabs = await listChromeFamilyTabUrlsMac();
    for (const tab of tabs) {
      if (isActiveGoogleMeetCallUrl(tab.url)) {
        const result = {
          active: true,
          label: 'Google Meet',
          evidence: `tab:${tab.appName}:${tab.url}`,
        };
        _cache = { at: now, result };
        return result;
      }
    }
  } catch (_) {}

  // 2) Open window titles — Zoom / Teams native call windows
  try {
    const windows = await listOpenWindowTitles();
    for (const win of windows) {
      if (isZoomOrTeamsCallTitle(win.title, win.appName)) {
        const result = {
          active: true,
          label: labelFromEvidence(win),
          evidence: `window:${win.appName}:${win.title}`,
        };
        _cache = { at: now, result };
        return result;
      }
      if (isActiveGoogleMeetCallUrl(win.title)) {
        // Rare: URL in title
        const result = {
          active: true,
          label: 'Google Meet',
          evidence: `window-title-url:${win.title}`,
        };
        _cache = { at: now, result };
        return result;
      }
    }
  } catch (_) {}

  const result = { active: false, label: null, evidence: null };
  _cache = { at: now, result };
  return result;
}

function clearMeetingPresenceCache() {
  _cache = { at: 0, result: null };
}

module.exports = {
  probeMeetingStillOpen,
  clearMeetingPresenceCache,
  isActiveGoogleMeetCallUrl,
  isZoomOrTeamsCallTitle,
  listChromeFamilyTabUrlsMac,
  PROBE_CACHE_MS,
};
