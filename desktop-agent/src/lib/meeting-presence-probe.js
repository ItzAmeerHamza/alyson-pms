'use strict';

/**
 * Live evidence that a video call is still open (not a timed sticky window).
 *
 * Cheap path (every screenshot): front window + Chrome-family *window*
 * titles/active-tab URLs. Dual-screen Meet is its own window, so this
 * catches Word-in-front without walking every tab (the 200+ Energy Impact spike).
 *
 * Expensive path (only while a call is already in session): Mac lists every
 * tab URL; Windows UIA reads the tab strip. Used to notice hangup when Meet
 * is an unselected tab in the same Chrome window.
 *
 * All platforms: Zoom / Teams / Skype / Webex desktop window titles.
 */

const http = require('http');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

const PROBE_CACHE_MS = Number(process.env.MEETING_PROBE_CACHE_MS) > 0
  ? Number(process.env.MEETING_PROBE_CACHE_MS)
  : 5 * 60 * 1000;
const CDP_PORTS = [9222, 9223, 9224, 9225, 9229];
const WIN_TAB_UIA_TIMEOUT_MS = 2500;

let _cache = { at: 0, result: null };

/** Leftover "you left / meeting ended" pages are not a live call. */
function isEndedOrLeftMeetingHay(hay) {
  return /you (have )?left|left the (meeting|call)|meeting ended|call ended|postattendee|\/leave(\b|[/?#])|ask to join|join now|waiting room|ready to join|about to join|\blobby\b|pre-join|prejoin/.test(
    String(hay || '').toLowerCase(),
  );
}

function isActiveGoogleMeetCallUrl(url) {
  const u = String(url || '').toLowerCase();
  const host = /meet\.google\.com/.test(u) || /(^|[/.])meet\.com([/?#:]|$)/.test(u);
  if (!host) return false;
  // Lobby / left-call / new-meeting pages are NOT an active call
  if (isEndedOrLeftMeetingHay(u)) return false;
  if (/meet\.(google\.)?com\/?(landing|new)?\/?(\?|#|$)/.test(u)) return false;
  if (/\/landing|\/new(\?|#|$)/.test(u)) return false;
  // In-call URLs look like meet.google.com/abc-defg-hij (or meet.com/…)
  return /meet\.(google\.)?com\/[a-z0-9]{2,}-[a-z0-9]{2,}-[a-z0-9]{2,}/.test(u);
}

function isVideoMeetingUrl(url) {
  const u = String(url || '').toLowerCase();
  if (!u) return false;
  if (isEndedOrLeftMeetingHay(u)) return false;
  if (isActiveGoogleMeetCallUrl(u)) return true;
  if (/zoom\.us\/(j|s|wc|my)\//.test(u)) return true;
  if (/teams\.(microsoft|live)\.com\/.*(meetup-join|meet\/)/.test(u)) return true;
  if (/webex\.com\/(meet|wbxmjs|webappng)/.test(u)) return true;
  if (/join\.skype\.com|skype\.com\/.*\/(call|join)/.test(u)) return true;
  return false;
}

/** Chrome tab title while Google Meet is open (selected window or tab-strip name). */
function isGoogleMeetWindowTitle(title, appName = '') {
  const hay = `${appName} ${title}`.toLowerCase();
  if (!hay.trim() || isEndedOrLeftMeetingHay(hay)) return false;
  if (/google meet|meet\.google\.com|(^|[/.])meet\.com([/?#:]|$)/.test(hay)) return true;
  if (/\bmeet\s+-/.test(hay)) return true;
  if (/microphone recording/.test(hay) && /cintara|brave|chrome|edge/.test(hay)) return true;
  return /\b[a-z]{3}-[a-z]{4}-[a-z]{3}\b/.test(hay) && /chrome|edge|brave|arc|dia|chromium/.test(hay);
}

function isZoomOrTeamsCallTitle(title, appName = '') {
  const hay = `${appName} ${title}`.toLowerCase();
  if (!hay.trim() || isEndedOrLeftMeetingHay(hay)) return false;
  if (/zoom/.test(hay) && /(meeting|webinar|personal room|zoom workplace)/.test(hay)) {
    return true;
  }
  if (/microsoft teams|ms-?teams/.test(hay) && /meetup-join|webinar|\bmeeting\b|\bcall\b/.test(hay)) {
    return true;
  }
  if (/\bwebex\b/.test(hay) && /meeting|webinar/.test(hay)) return true;
  if (/\bskype\b/.test(hay) && /\bcall\b|\bmeeting\b/.test(hay)) return true;
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
async function listBrowserTabsWindows({ allowUia = false } = {}) {
  if (process.platform !== 'win32') {
    return { urls: [], titles: [], enumerated: false, source: null };
  }

  if (!isWinChromiumFamilyRunning()) {
    return { urls: [], titles: [], enumerated: false, source: null };
  }

  const cdp = await listBrowserTabsWindowsViaCdp();
  if (cdp.enumerated) {
    return { ...cdp, source: 'cdp' };
  }

  // PowerShell UIA walks the whole Chrome AX tree — skip unless we already
  // think a call is on and need to confirm hangup.
  if (!allowUia) {
    return { urls: [], titles: [], enumerated: false, source: null };
  }

  const titles = await listBrowserTabTitlesWindowsViaUia();
  return {
    urls: [],
    titles,
    enumerated: titles.length > 0,
    source: titles.length > 0 ? 'uia' : null,
  };
}

function isMacAppRunning(appName) {
  try {
    const { execFileSync } = require('child_process');
    execFileSync('/usr/bin/pgrep', ['-f', appName], {
      timeout: 300,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return true;
  } catch (_) {
    return false;
  }
}

function isWinImageRunning(imageName) {
  try {
    const { execFileSync } = require('child_process');
    const out = execFileSync('tasklist', ['/FI', `IMAGENAME eq ${imageName}`, '/NH'], {
      timeout: 400,
      windowsHide: true,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const text = String(out || '');
    return /\.exe/i.test(text) && !/No tasks are running/i.test(text);
  } catch (_) {
    return false;
  }
}

const WIN_APP_IMAGES = {
  'zoom.us': ['Zoom.exe'],
  Zoom: ['Zoom.exe'],
  'Microsoft Teams': ['Teams.exe', 'ms-teams.exe'],
  Skype: ['Skype.exe'],
  'Google Chrome': ['chrome.exe'],
  Chromium: ['chromium.exe'],
  'Brave Browser': ['brave.exe'],
  'Microsoft Edge': ['msedge.exe'],
  Arc: ['Arc.exe'],
  Dia: ['Dia.exe'],
};

function isWinAppRunning(appName) {
  const images = WIN_APP_IMAGES[appName] || [`${String(appName || '').replace(/\.exe$/i, '')}.exe`];
  return images.some(isWinImageRunning);
}

/** Cheap "is this desktop app running?" used to skip AppleScript / UIA / window walks. */
function isDesktopAppRunning(appName) {
  if (process.platform === 'darwin') return isMacAppRunning(appName);
  if (process.platform === 'win32') return isWinAppRunning(appName);
  return false;
}

function isWinChromiumFamilyRunning() {
  return ['chrome.exe', 'msedge.exe', 'brave.exe', 'chromium.exe'].some(isWinImageRunning);
}

const CHROME_FAMILY_MAC_APPS = [
  'Google Chrome',
  'Chromium',
  'Brave Browser',
  'Microsoft Edge',
  'Arc',
  'Dia',
];

function shouldWalkBrowserTabs(options = {}) {
  return options.needBackgroundTabs === true;
}

async function osascriptChromeFamily(appName, innerTell) {
  const script = `
tell application "System Events"
  if not (exists process "${appName}") then return ""
end tell
try
  tell application "${appName}"
    ${innerTell}
  end tell
on error
  return ""
end try
`;
  const { stdout } = await execFileAsync('/usr/bin/osascript', ['-e', script], {
    timeout: 2500,
    maxBuffer: 512 * 1024,
  });
  return String(stdout || '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** One row per window (title + selected tab URL). Not every background tab. */
async function listChromeFamilyWindowTitlesMac() {
  if (process.platform !== 'darwin') return [];

  const windows = [];
  const inner = `
    set out to ""
    repeat with w in windows
      try
        set t to ""
        set u to ""
        try
          set t to title of w as string
        end try
        try
          set u to URL of active tab of w as string
        end try
        set out to out & t & tab & u & linefeed
      end try
    end repeat
    return out
  `;

  for (const appName of CHROME_FAMILY_MAC_APPS) {
    if (!isMacAppRunning(appName)) continue;
    try {
      const lines = await osascriptChromeFamily(appName, inner);
      for (const line of lines) {
        const tabAt = line.indexOf('\t');
        const title = tabAt >= 0 ? line.slice(0, tabAt) : line;
        const url = tabAt >= 0 ? line.slice(tabAt + 1) : '';
        windows.push({ appName, title, url });
        if (
          isVideoMeetingUrl(url) ||
          isGoogleMeetWindowTitle(title, appName) ||
          isActiveGoogleMeetCallUrl(title)
        ) {
          return windows;
        }
      }
    } catch (_) {
      // App not running / Automation permission missing — ignore
    }
  }

  return windows;
}

async function listChromeFamilyTabUrlsMac() {
  if (process.platform !== 'darwin') return [];

  const apps = ['Google Chrome', 'Chromium', 'Brave Browser', 'Microsoft Edge', 'Arc', 'Dia'];
  const urls = [];

  for (const appName of apps) {
    if (!isMacAppRunning(appName)) continue;

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
        timeout: 2500,
        maxBuffer: 512 * 1024,
      });
      const lines = String(stdout || '')
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
      for (const line of lines) {
        urls.push({ appName, url: line });
        if (isVideoMeetingUrl(line)) return urls;
      }
    } catch (_) {
      // App not running / Automation permission missing — ignore
    }
  }

  return urls;
}

async function listOpenWindowTitles() {
  // Front window first. getOpenWindows() walks every AX window and is the
  // 100+ Energy Impact spike while Meet / Chrome / Figma are open.
  const windows = [];
  try {
    const activeWin = require('active-win');
    const front = await Promise.race([
      activeWin(),
      new Promise((resolve) => setTimeout(() => resolve(null), 800)),
    ]);
    if (front) {
      windows.push({
        appName: front?.owner?.name || front?.owner?.path || '',
        title: front?.title || '',
      });
    }

    const frontIsMeeting = windows.some(
      (win) =>
        isZoomOrTeamsCallTitle(win.title, win.appName) ||
        isGoogleMeetWindowTitle(win.title, win.appName) ||
        isActiveGoogleMeetCallUrl(win.title),
    );
    if (frontIsMeeting) return windows;

    // Background Zoom/Teams desktop windows only — skip the full window walk
    // when those apps are not running.
    const needNativeWindows =
      typeof activeWin.getOpenWindows === 'function' &&
      (isDesktopAppRunning('zoom.us') ||
        isDesktopAppRunning('Zoom') ||
        isDesktopAppRunning('Microsoft Teams') ||
        isDesktopAppRunning('Skype'));
    if (!needNativeWindows) return windows;

    const all = await Promise.race([
      activeWin.getOpenWindows(),
      new Promise((resolve) => setTimeout(() => resolve([]), 800)),
    ]);
    for (const w of all || []) {
      windows.push({
        appName: w?.owner?.name || w?.owner?.path || '',
        title: w?.title || '',
      });
    }
  } catch (_) {}
  return windows;
}

/**
 * @returns {Promise<{ active: boolean, conclusive: boolean, label: string|null, evidence: string|null }>}
 */
async function probeMeetingStillOpen(options = {}) {
  const force = options.force === true;
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

  // 2) Cheap: Chrome-family window titles + selected-tab URL (dual-screen Meet).
  try {
    if (process.platform === 'darwin') {
      const chromeWindows = await listChromeFamilyWindowTitlesMac();
      for (const win of chromeWindows) {
        if (
          isVideoMeetingUrl(win.url) ||
          isGoogleMeetWindowTitle(win.title, win.appName) ||
          isActiveGoogleMeetCallUrl(win.title)
        ) {
          const result = {
            active: true,
            conclusive: true,
            label: labelFromEvidence(win),
            evidence: `chrome-window:${win.appName}:${win.title || win.url}`,
          };
          _cache = { at: now, result };
          return result;
        }
      }
    }
  } catch (_) {}

  // 3) Expensive: every tab URL / Windows UIA. Only while a call is already
  //    in session (confirm hangup). Skipping this is what drops Energy Impact
  //    from ~230 → Time-Doctor-like idle while sitting in Word/Cursor.
  const walkTabs = shouldWalkBrowserTabs(options);
  let tabsEnumerated = false;
  if (walkTabs) {
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
        const tabs = await listBrowserTabsWindows({ allowUia: true });
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
  } else if (process.platform === 'win32') {
    try {
      const tabs = await listBrowserTabsWindows({ allowUia: false });
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
    } catch (_) {}
  }

  // Full tab walk found nothing → call is over. Cheap path only → inconclusive
  // (2-min grace). Do not keep leftover hidden Meet tabs effective for hours.
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
  isEndedOrLeftMeetingHay,
  isVideoMeetingUrl,
  isGoogleMeetWindowTitle,
  isZoomOrTeamsCallTitle,
  isMeetingBrowserTabTitle,
  tabEvidenceLooksLikeMeeting,
  parseCdpTabTargets,
  listChromeFamilyTabUrlsMac,
  listChromeFamilyWindowTitlesMac,
  listBrowserTabsWindows,
  shouldWalkBrowserTabs,
  isMacAppRunning,
  isWinAppRunning,
  isDesktopAppRunning,
  PROBE_CACHE_MS,
};
