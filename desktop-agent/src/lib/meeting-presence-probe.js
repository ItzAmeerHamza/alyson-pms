'use strict';

/**
 * Live evidence that a video call is still open (not a timed sticky window).
 *
 * Mac: AppleScript lists every Chrome-family tab URL.
 * Windows: CDP /json (if the browser has remote debugging) plus UI Automation
 * tab-strip titles on Chrome / Edge / Brave — same “Meet in a background tab”
 * case as Mac, even when Word is in front.
 * All platforms: open window titles (Zoom / Teams / Skype / Webex apps).
 */

const http = require('http');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

const PROBE_CACHE_MS = 45 * 1000;
const CDP_PORTS = [9222, 9223, 9224, 9225, 9229];
const WIN_TAB_UIA_TIMEOUT_MS = 2500;

let _cache = { at: 0, result: null };

function isActiveGoogleMeetCallUrl(url) {
  const u = String(url || '').toLowerCase();
  const host = /meet\.google\.com/.test(u) || /(^|[/.])meet\.com([/?#:]|$)/.test(u);
  if (!host) return false;
  // Lobby / left-call / new-meeting pages are NOT an active call
  if (/meet\.(google\.)?com\/?(landing|new)?\/?(\?|#|$)/.test(u)) return false;
  if (/\/landing|\/new(\?|#|$)/.test(u)) return false;
  // In-call URLs look like meet.google.com/abc-defg-hij (or meet.com/…)
  return /meet\.(google\.)?com\/[a-z0-9]{2,}-[a-z0-9]{2,}-[a-z0-9]{2,}/.test(u);
}

function isVideoMeetingUrl(url) {
  const u = String(url || '').toLowerCase();
  if (!u) return false;
  if (isActiveGoogleMeetCallUrl(u)) return true;
  if (/zoom\.us\/(j|s|wc)\//.test(u)) return true;
  if (/teams\.microsoft\.com\/.*meetup-join/.test(u)) return true;
  if (/webex\.com\/(meet|wbxmjs)/.test(u)) return true;
  if (/join\.skype\.com|skype\.com\/.*\/(call|join)/.test(u)) return true;
  return false;
}

/** Chrome tab title while Google Meet is open (selected window or tab-strip name). */
function isGoogleMeetWindowTitle(title, appName = '') {
  const hay = `${appName} ${title}`.toLowerCase();
  if (!hay.trim()) return false;
  if (/google meet|meet\.google\.com|(^|[/.])meet\.com([/?#:]|$)/.test(hay)) return true;
  if (/\bmeet\s+-/.test(hay)) return true;
  return /\b[a-z]{3}-[a-z]{4}-[a-z]{3}\b/.test(hay) && /chrome|edge|brave|arc|dia|chromium/.test(hay);
}

function isZoomOrTeamsCallTitle(title, appName = '') {
  const hay = `${appName} ${title}`.toLowerCase();
  if (!hay.trim()) return false;
  if (/zoom/.test(hay) && /(meeting|webinar|personal room|waiting room|zoom workplace)/.test(hay)) {
    return true;
  }
  if (/microsoft teams|ms-?teams|\bteams\b/.test(hay) && !/teams\.microsoft\.com\/?(\?|#|$)/.test(hay)) {
    return /microsoft teams/.test(hay);
  }
  if (/\bwebex\b/.test(hay) && /meeting|webinar/.test(hay)) return true;
  if (/\bskype\b/.test(hay)) return true;
  return false;
}

function isMeetingBrowserTabTitle(title) {
  const t = String(title || '').trim();
  if (!t) return false;
  return isGoogleMeetWindowTitle(t, 'Google Chrome') || isZoomOrTeamsCallTitle(t, 'Google Chrome');
}

function labelFromEvidence({ url, title, appName } = {}) {
  if (isActiveGoogleMeetCallUrl(url) || isGoogleMeetWindowTitle(title, appName)) return 'Google Meet';
  const hay = `${appName || ''} ${title || ''} ${url || ''}`.toLowerCase();
  if (/zoom/.test(hay)) return 'Zoom';
  if (/teams/.test(hay)) return 'Microsoft Teams';
  if (/webex/.test(hay)) return 'Webex';
  if (/skype/.test(hay)) return 'Skype';
  if (/meet\.google|google meet|(^|[/.])meet\.com([/?#:]|$)/.test(hay)) return 'Google Meet';
  return 'Video meeting';
}

function tabEvidenceLooksLikeMeeting({ urls = [], titles = [] } = {}) {
  for (const url of urls) {
    if (isVideoMeetingUrl(url)) {
      return { hit: true, label: labelFromEvidence({ url }) };
    }
  }
  for (const title of titles) {
    if (isMeetingBrowserTabTitle(title)) {
      return { hit: true, label: labelFromEvidence({ title, appName: 'Google Chrome' }) };
    }
  }
  return { hit: false, label: null };
}

function parseCdpTabTargets(tabs) {
  const urls = [];
  const titles = [];
  if (!Array.isArray(tabs)) return { urls, titles };
  for (const t of tabs) {
    if (!t) continue;
    const type = String(t.type || 'page');
    if (type !== 'page') continue;
    if (t.url) urls.push(String(t.url));
    if (t.title) titles.push(String(t.title));
  }
  return { urls, titles };
}

function fetchCdpJson(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/json`, { timeout: 400 }, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(Array.isArray(parsed) ? parsed : []);
        } catch (_) {
          resolve([]);
        }
      });
    });
    req.on('error', () => resolve([]));
    req.on('timeout', () => {
      req.destroy();
      resolve([]);
    });
  });
}

async function listBrowserTabsWindowsViaCdp() {
  if (process.platform !== 'win32') {
    return { urls: [], titles: [], enumerated: false };
  }

  const batches = await Promise.all(CDP_PORTS.map((port) => fetchCdpJson(port)));
  const urls = [];
  const titles = [];
  for (const tabs of batches) {
    const parsed = parseCdpTabTargets(tabs);
    urls.push(...parsed.urls);
    titles.push(...parsed.titles);
  }
  return { urls, titles, enumerated: urls.length + titles.length > 0 };
}

const WIN_TAB_UIA_PS = [
  '[Console]::OutputEncoding = [Text.Encoding]::UTF8',
  'Add-Type -AssemblyName UIAutomationClient,UIAutomationTypes',
  '$names = New-Object System.Collections.Generic.List[string]',
  "$procs = Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -match '^(chrome|msedge|brave|chromium)$' -and $_.MainWindowHandle -ne [IntPtr]::Zero }",
  'foreach ($p in $procs) {',
  '  try {',
  '    $root = [System.Windows.Automation.AutomationElement]::FromHandle($p.MainWindowHandle)',
  '    if (-not $root) { continue }',
  '    $cond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::TabItem)',
  '    $tabs = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $cond)',
  '    for ($i = 0; $i -lt $tabs.Count; $i++) {',
  '      $n = $tabs.Item($i).Current.Name',
  '      if ($n) { [void]$names.Add($n) }',
  '    }',
  '  } catch {}',
  '}',
  '$names | Select-Object -Unique',
].join('; ');

async function listBrowserTabTitlesWindowsViaUia() {
  if (process.platform !== 'win32') return [];

  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-NoLogo', '-ExecutionPolicy', 'Bypass', '-Command', WIN_TAB_UIA_PS],
      { timeout: WIN_TAB_UIA_TIMEOUT_MS, windowsHide: true, maxBuffer: 1024 * 1024 },
    );
    return String(stdout || '')
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  } catch (_) {
    return [];
  }
}

/**
 * Windows equivalent of Mac AppleScript tab listing.
 * CDP gives real URLs when the browser was started with remote debugging.
 * UIA reads Chrome/Edge tab-strip names even when Word is the foreground app.
 */
async function listBrowserTabsWindows() {
  if (process.platform !== 'win32') {
    return { urls: [], titles: [], enumerated: false, source: null };
  }

  const cdp = await listBrowserTabsWindowsViaCdp();
  if (cdp.enumerated) {
    return { ...cdp, source: 'cdp' };
  }

  const titles = await listBrowserTabTitlesWindowsViaUia();
  return {
    urls: [],
    titles,
    enumerated: titles.length > 0,
    source: titles.length > 0 ? 'uia' : null,
  };
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
 * @returns {Promise<{ active: boolean, conclusive: boolean, label: string|null, evidence: string|null }>}
 */
async function probeMeetingStillOpen({ force = false } = {}) {
  const now = Date.now();
  if (!force && _cache.result && now - _cache.at < PROBE_CACHE_MS) {
    return _cache.result;
  }

  // 1) Native / browser window titles first (cheap on Mac and Windows).
  //    Zoom / Teams / Skype apps, or Chrome whose selected tab is still Meet.
  try {
    const windows = await listOpenWindowTitles();
    for (const win of windows) {
      if (
        isZoomOrTeamsCallTitle(win.title, win.appName) ||
        isGoogleMeetWindowTitle(win.title, win.appName) ||
        isActiveGoogleMeetCallUrl(win.title)
      ) {
        const result = {
          active: true,
          conclusive: true,
          label: labelFromEvidence(win),
          evidence: `window:${win.appName}:${win.title}`,
        };
        _cache = { at: now, result };
        return result;
      }
    }
  } catch (_) {}

  // 2) Background browser tabs — Mac AppleScript URLs, Windows CDP + tab-strip titles.
  let tabsEnumerated = false;
  try {
    if (process.platform === 'darwin') {
      const tabs = await listChromeFamilyTabUrlsMac();
      tabsEnumerated = true;
      for (const tab of tabs) {
        if (isVideoMeetingUrl(tab.url)) {
          const result = {
            active: true,
            conclusive: true,
            label: labelFromEvidence({ url: tab.url, appName: tab.appName }),
            evidence: `tab:${tab.appName}:${tab.url}`,
          };
          _cache = { at: now, result };
          return result;
        }
      }
    } else if (process.platform === 'win32') {
      const tabs = await listBrowserTabsWindows();
      tabsEnumerated = tabs.enumerated;
      const match = tabEvidenceLooksLikeMeeting(tabs);
      if (match.hit) {
        const result = {
          active: true,
          conclusive: true,
          label: match.label,
          evidence: `win-tabs:${tabs.source}:${(tabs.urls[0] || tabs.titles[0] || '').slice(0, 120)}`,
        };
        _cache = { at: now, result };
        return result;
      }
    }
  } catch (_) {}

  // Mac listed every tab (or Windows CDP/UIA listed tabs) and none were a call → over.
  // If Windows could not list tabs, keep inconclusive so Word-in-front is not "call ended".
  const result = {
    active: false,
    conclusive: tabsEnumerated,
    label: null,
    evidence: null,
  };
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
  isVideoMeetingUrl,
  isGoogleMeetWindowTitle,
  isZoomOrTeamsCallTitle,
  isMeetingBrowserTabTitle,
  tabEvidenceLooksLikeMeeting,
  parseCdpTabTargets,
  listChromeFamilyTabUrlsMac,
  listBrowserTabsWindows,
  PROBE_CACHE_MS,
};
