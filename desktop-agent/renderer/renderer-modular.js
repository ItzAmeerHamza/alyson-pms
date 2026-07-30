// === MODULAR RENDERER ARCHITECTURE ===
// Modular renderer system - consolidated from legacy monolithic renderer (~200 lines)

// Boot guards to prevent duplicate initialization/listeners when the script is loaded twice
if (typeof window !== 'undefined') {
  window.__rendererInitAttached = window.__rendererInitAttached || false;
  window.__rendererInitialized = window.__rendererInitialized || false;
}

const { ipcRenderer } = require('electron');
const {
  initWorkTimezone,
  workDateKey,
  elapsedSecondsSinceWorkMidnight,
  nextWorkDayMidnight,
  formatWorkTimezoneLabel,
  getWorkTimezone,
} = require('../src/modules/utils/work-timezone');

try {
  initWorkTimezone(typeof global !== 'undefined' ? global.config : undefined);
} catch {
  /* config may load later */
}

// Expose ipcRenderer to window for version loading and other UI code
window.ipc = { invoke: ipcRenderer.invoke.bind(ipcRenderer) };
window.electronAPI = {
  ipcRenderer,
  getAppVersion: () => ipcRenderer.invoke('get-app-version')
};

/** Work-calendar date as YYYY-MM-DD (Pacific Time by default). */
function localDateIso(d = new Date()) {
  return workDateKey(d);
}

/** HH:MM:SS from total seconds (for tracker / tray). */
function formatSecondsAsHMS(totalSec) {
  const sec = Math.max(0, Math.floor(Number(totalSec) || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const TRAY_TICK_STALE_MS = 1500;
window.__trayTimerActive = false;
window.__lastTrayTimerTickAt = 0;
window.__lastTrayCumulativeSeconds = 0;
/** Non-effective seconds (idle + low activity) for today — used to show effective time. */
window.__todayNonEffectiveSeconds = 0;
window.__todayTrackedSeconds = 0;
window.__effectiveStatsReady = false;

function getTrackerTimerElement() {
  return document.getElementById('trackerTime');
}

function formatHmsCompact(totalSec) {
  const sec = Math.max(0, Math.floor(Number(totalSec) || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function _nonEffectiveStorageKey() {
  return `tf_non_effective_${localDateIso()}`;
}

function hydrateNonEffectiveFromCache() {
  try {
    // Prefer sessionStorage (same app session), then localStorage (survives restart).
    let raw = sessionStorage.getItem(_nonEffectiveStorageKey());
    if (raw == null || raw === '') {
      raw = localStorage.getItem(_nonEffectiveStorageKey());
    }
    if (raw == null || raw === '') return;
    const n = Math.max(0, Math.floor(Number(raw) || 0));
    // Cache may be 0 for a fully-effective day — still treat as hydrated.
    window.__todayNonEffectiveSeconds = n;
    window.__effectiveStatsReady = true;
  } catch (_) {}
}

function persistNonEffectiveCache(nonEff) {
  const value = String(Math.max(0, Math.floor(Number(nonEff) || 0)));
  try {
    sessionStorage.setItem(_nonEffectiveStorageKey(), value);
  } catch (_) {}
  try {
    localStorage.setItem(_nonEffectiveStorageKey(), value);
  } catch (_) {}
}

/** Apply effective-time fields from get-today-time-stats and refresh the cards. */
function applyTodayEffectiveStats(stats) {
  if (!stats || typeof stats !== 'object') return;

  // Ignore incomplete responses that would flash "0 non-effective / all effective"
  // before idle + low-activity queries finish (common right after app launch).
  if (stats.effectiveStatsComputed === false) {
    if (typeof stats.totalTime === 'number') {
      const incoming = Math.max(0, Math.floor(stats.totalTime));
      window.__todayTrackedSeconds = Math.max(
        Math.max(0, Math.floor(Number(window.__todayTrackedSeconds) || 0)),
        incoming,
      );
    }
    updateTrackerEffectiveMeta();
    return;
  }

  if (typeof stats.nonEffectiveSeconds === 'number') {
    window.__todayNonEffectiveSeconds = Math.max(0, Math.floor(stats.nonEffectiveSeconds));
    window.__effectiveStatsReady = true;
  } else if (
    typeof stats.idleSeconds === 'number' ||
    typeof stats.lowActivitySeconds === 'number'
  ) {
    window.__todayNonEffectiveSeconds = Math.max(
      0,
      Math.floor(Number(stats.idleSeconds) || 0) + Math.floor(Number(stats.lowActivitySeconds) || 0),
    );
    window.__effectiveStatsReady = true;
  } else if (typeof stats.effectiveSeconds === 'number' && typeof stats.totalTime === 'number') {
    const tracked = Math.max(0, Math.floor(stats.totalTime));
    const effective = Math.max(0, Math.floor(stats.effectiveSeconds));
    window.__todayNonEffectiveSeconds = Math.max(0, tracked - effective);
    window.__effectiveStatsReady = true;
  }
  if (typeof stats.totalTime === 'number') {
    const incoming = Math.max(0, Math.floor(stats.totalTime));
    // Never let a lagging DB total pull tracked seconds backwards while the live
    // clock is ahead (that caused the big timer to bounce 08:37 ↔ 08:38).
    const live = Math.max(
      0,
      Math.floor(Number(window.__todayTrackedSeconds) || 0),
      typeof readLocalTrackingCumulativeSeconds === 'function'
        ? readLocalTrackingCumulativeSeconds()
        : 0,
    );
    window.__todayTrackedSeconds = Math.max(live, incoming);
  }
  if (window.__effectiveStatsReady) {
    persistNonEffectiveCache(window.__todayNonEffectiveSeconds);
  }
  updateTrackerEffectiveMeta();
}

function toEffectiveSeconds(trackedSeconds) {
  const tracked = Math.max(0, Math.floor(Number(trackedSeconds) || 0));
  if (!window.__effectiveStatsReady) return tracked;
  const nonEff = Math.max(0, Math.floor(Number(window.__todayNonEffectiveSeconds) || 0));
  return Math.max(0, tracked - Math.min(tracked, nonEff));
}

function updateTrackerEffectiveMeta() {
  let tracked = Math.max(0, Math.floor(Number(window.__todayTrackedSeconds) || 0));
  if (tracked <= 0) {
    tracked = Math.max(0, readLocalTrackingCumulativeSeconds() || 0);
  }

  const nonEffEl = document.getElementById('trackerNonEffectiveValue');
  const effectiveEl = document.getElementById('trackerEffectiveValue');

  // Until idle/low-activity stats load, don't pretend non-effective is 0
  // (that made Effective look equal to Tracked on first paint).
  if (!window.__effectiveStatsReady) {
    if (nonEffEl) nonEffEl.textContent = '—';
    if (effectiveEl) effectiveEl.textContent = '—';
    return;
  }

  // Big clock = tracked; cards under it show effective / non-effective.
  const nonEff = Math.min(tracked, Math.max(0, Math.floor(Number(window.__todayNonEffectiveSeconds) || 0)));
  const effective = Math.max(0, tracked - nonEff);

  if (nonEffEl) nonEffEl.textContent = formatHmsCompact(nonEff);
  if (effectiveEl) effectiveEl.textContent = formatHmsCompact(effective);
}

window.applyTodayEffectiveStats = applyTodayEffectiveStats;
window.toEffectiveSeconds = toEffectiveSeconds;
window.updateTrackerEffectiveMeta = updateTrackerEffectiveMeta;

function readTrackerDisplaySeconds() {
  return parseHmsToSeconds(getTrackerTimerElement()?.textContent);
}

/**
 * Set the big tracker clock to TRACKED (complete recorded) time.
 * Effective / non-effective are shown in the cards underneath.
 */
function setTrackerDisplaySeconds(trackedSeconds, { allowDecrease = false } = {}) {
  const el = getTrackerTimerElement();
  if (!el) return 0;
  const todayKey = localDateIso();
  if (window.__trackerDisplayDayKey && window.__trackerDisplayDayKey !== todayKey) {
    allowDecrease = true;
    window.__todayNonEffectiveSeconds = 0;
    window.__effectiveStatsReady = false;
    try { sessionStorage.removeItem(_nonEffectiveStorageKey()); } catch (_) {}
  }
  window.__trackerDisplayDayKey = todayKey;

  const incomingTracked = Math.max(0, Math.floor(Number(trackedSeconds) || 0));
  const prevTracked = Math.max(0, Math.floor(Number(window.__todayTrackedSeconds) || 0));
  const tracked = allowDecrease ? incomingTracked : Math.max(prevTracked, incomingTracked);
  window.__todayTrackedSeconds = tracked;

  const currentDisplay = readTrackerDisplaySeconds();
  const resolved = allowDecrease ? tracked : Math.max(currentDisplay, tracked);
  el.textContent = formatSecondsAsHMS(resolved);
  updateTrackerEffectiveMeta();
  return resolved;
}

// Avoid first-paint flash of full tracked time before IPC returns non-effective.
hydrateNonEffectiveFromCache();
try { updateTrackerEffectiveMeta(); } catch (_) {}

function resolveStoppedDisplaySeconds(dbSeconds, extraFloor = 0) {
  const db = Math.max(0, Math.floor(Number(dbSeconds) || 0));
  const todayKey = localDateIso();
  const floorFromStop = window.__trackerDisplayDayKey === todayKey
    ? Math.max(0, Math.floor(Number(window.__todayBaseAtLastStop) || 0))
    : 0;
  // Use tracked floor only — big clock display is effective and must not inflate tracked.
  const floorFromTracked = window.__trackerDisplayDayKey === todayKey
    ? Math.max(0, Math.floor(Number(window.__todayTrackedSeconds) || 0))
    : 0;
  const floor = Math.max(
    floorFromTracked,
    floorFromStop,
    Math.max(0, Math.floor(Number(extraFloor) || 0)),
  );
  return Math.max(db, floor);
}

function getTodayElapsedSeconds(sessionStart) {
  return elapsedSecondsSinceWorkMidnight(sessionStart);
}

function readLocalTrackingCumulativeSeconds() {
  const start = window.__lastTrackingStartTime;
  if (!start) return 0;
  const elapsed = getTodayElapsedSeconds(start);
  const base = Math.max(0, Math.floor(Number(window.__completedTodayBaseSeconds) || 0));
  return base + elapsed;
}

/** Tray IPC is preferred when fresh, but local clock wins if it is ahead (e.g. during optimistic start). */
function isTrayTimerDrivingDisplay() {
  if (window.__localTrackingClockActive) return false;
  if (!window.__trayTimerActive) return false;
  if (Date.now() - (window.__lastTrayTimerTickAt || 0) >= TRAY_TICK_STALE_MS) return false;
  const local = readLocalTrackingCumulativeSeconds();
  const tray = Math.max(0, Math.floor(Number(window.__lastTrayCumulativeSeconds) || 0));
  if (local > 0 && local > tray + 1) return false;
  return true;
}
window.isTrayTimerDrivingDisplay = isTrayTimerDrivingDisplay;

function beginLocalTrackingClock(startTime) {
  window.__lastTrackingStartTime = startTime;
  window.__localTrackingClockActive = true;
  window.__trayTimerActive = false;
  window.__lastTrayTimerTickAt = 0;
  ensureTrackingDisplayWatchdog();
  updateRendererTrackingClock();
}
window.beginLocalTrackingClock = beginLocalTrackingClock;
window.updateRendererTrackingClock = updateRendererTrackingClock;

function updateRendererTrackingClock() {
  const start = window.__lastTrackingStartTime;
  if (!start) return;
  const dashboardTimer = document.getElementById('sessionTime');
  const elapsed = getTodayElapsedSeconds(start);
  const base = Math.max(0, Math.floor(Number(window.__completedTodayBaseSeconds) || 0));
  const localCumulative = base + elapsed;
  const trayCumulative = Math.max(0, Math.floor(Number(window.__lastTrayCumulativeSeconds) || 0));
  const cumulativeSec = Math.max(localCumulative, trayCumulative);
  window.__todayTrackedSeconds = Math.max(
    Math.max(0, Math.floor(Number(window.__todayTrackedSeconds) || 0)),
    cumulativeSec,
  );
  const sessionStr = formatSecondsAsHMS(elapsed);
  if (dashboardTimer) dashboardTimer.textContent = sessionStr;
  // Big clock is TRACKED time and must never jump backwards while the session is live.
  // Effective / non-effective cards update separately via applyTodayEffectiveStats.
  setTrackerDisplaySeconds(cumulativeSec, { allowDecrease: false });
}

function ensureTrackingDisplayWatchdog() {
  if (window.__trackingDisplayWatchdog) return;
  window.__trackingDisplayWatchdog = setInterval(() => {
    if (!window.__lastTrackingStartTime) return;
    updateRendererTrackingClock();
  }, 1000);
  // Refresh idle/low-activity deductions periodically while the session is live.
  if (!window.__effectiveStatsRefresh) {
    window.__effectiveStatsRefresh = setInterval(() => {
      const tracking =
        !!window.__lastTrackingStartTime ||
        !!(typeof moduleInstances !== 'undefined' && moduleInstances?.ipcManager?.isTracking);
      if (!tracking) return;
      void refreshTodayCompletedBaseSeconds().then(() => {
        if (window.__lastTrackingStartTime) {
          updateRendererTrackingClock();
        } else if (typeof window.__todayTrackedSeconds === 'number') {
          setTrackerDisplaySeconds(window.__todayTrackedSeconds, { allowDecrease: true });
        }
      });
    }, 60 * 1000);
  }
}

function stopTrackingDisplayWatchdog() {
  if (window.__trackingDisplayWatchdog) {
    clearInterval(window.__trackingDisplayWatchdog);
    window.__trackingDisplayWatchdog = null;
  }
  window.__localTrackingClockActive = false;
}

/** Closed time_logs today (local day), excluding the current open session — for cumulative "worked today" UI. */
async function refreshTodayCompletedBaseSeconds() {
  try {
    const s = await ipcRenderer.invoke('get-today-time-stats');
    applyTodayEffectiveStats(s);
    const dbBase = Math.max(0, Math.floor(Number(s?.completedTodayBeforeCurrentSessionSeconds) || 0));
    const floor = Math.max(
      0,
      Math.floor(Number(window.__todayBaseAtLastStop) || 0),
      Math.floor(Number(window.__completedTodayBaseSeconds) || 0),
    );
    window.__completedTodayBaseSeconds = Math.max(dbBase, floor);
    if (dbBase >= floor) {
      window.__todayBaseAtLastStop = null;
    }
  } catch {
    window.__completedTodayBaseSeconds = Math.max(
      0,
      Math.floor(Number(window.__todayBaseAtLastStop) || 0),
    );
  }
}

function parseHmsToSeconds(text) {
  const parts = String(text || '').trim().split(':').map((n) => Number(n));
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return 0;
  return Math.max(0, parts[0] * 3600 + parts[1] * 60 + parts[2]);
}

function handleLocalDayRollover(isTracking) {
  console.log('🌙 [RENDERER] Work-day rollover — resetting daily clock to 00:00:00');
  window.__todayBaseAtLastStop = null;
  window.__completedTodayBaseSeconds = 0;
  window.__lastTrayCumulativeSeconds = 0;
  window.__trackerDisplayDayKey = localDateIso();
  void ipcRenderer.invoke('clear-frozen-total-at-stop').catch(() => {});

  // Snap to zero at local midnight (e.g. 10h 20m → 00:00:00)
  setTrackerDisplaySeconds(0, { allowDecrease: true });
  const todayTimeElement = document.getElementById('todayTime');
  if (todayTimeElement) todayTimeElement.textContent = '0h 0m';

  if (isTracking) {
    const dashboardTimer = document.getElementById('sessionTime');
    if (dashboardTimer) dashboardTimer.textContent = '00:00:00';
    void refreshTodayCompletedBaseSeconds().then(() => updateRendererTrackingClock());
  } else {
    const dashboardTimer = document.getElementById('sessionTime');
    if (dashboardTimer) dashboardTimer.textContent = '--:--:--';
    void refreshTodayCompletedBaseSeconds();
    if (moduleInstances?.uiManager?.loadTodaysTotalTime) {
      void moduleInstances.uiManager.loadTodaysTotalTime();
    }
  }
  updateTrackerDailyRefreshHint();
}

function ensureLocalDayRolloverWatch() {
  if (window.__localDayRolloverWatch) return;
  window.__localDayKey = localDateIso();
  window.__localDayRolloverWatch = setInterval(() => {
    const todayKey = localDateIso();
    if (window.__localDayKey && window.__localDayKey !== todayKey) {
      const isTracking = !!(moduleInstances?.ipcManager?.isTracking);
      handleLocalDayRollover(isTracking);
      window.__localDayKey = todayKey;
    }
  }, 1000);
}

/** Next work-day boundary (Pacific midnight by default) — shown under the Time Tracker clock */
function updateTrackerDailyRefreshHint() {
  const el = document.getElementById('trackerTodayHint');
  if (!el) return;
  const next = nextWorkDayMidnight();
  const tz = getWorkTimezone();
  const datePart = next.toLocaleDateString('en-US', {
    timeZone: tz,
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
  const timePart = next.toLocaleTimeString('en-US', {
    timeZone: tz,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  const tzLabel = formatWorkTimezoneLabel(tz);
  el.textContent = `Daily total resets at midnight ${tzLabel} (${datePart} at ${timePart}).`;
}

window.updateTrackerDailyRefreshHint = updateTrackerDailyRefreshHint;
window.refreshTodayCompletedBaseSeconds = refreshTodayCompletedBaseSeconds;
window.readTrackerDisplaySeconds = readTrackerDisplaySeconds;
window.setTrackerDisplaySeconds = setTrackerDisplaySeconds;
window.resolveStoppedDisplaySeconds = resolveStoppedDisplaySeconds;
window.ensureLocalDayRolloverWatch = ensureLocalDayRolloverWatch;
window.getTodayElapsedSeconds = getTodayElapsedSeconds;
window.readLocalTrackingCumulativeSeconds = readLocalTrackingCumulativeSeconds;

// Import our focused modules
let AuthManager, UIManager, NotificationManager, IPCManager, AppHistoryManager, ActivityMonitor;

// Try to import modules (they may not be available in all contexts)
try {
  console.log('🔧 Attempting to load renderer modules...');
  AuthManager = require('./modules/auth-manager');
  console.log('✅ AuthManager loaded');
  UIManager = require('./modules/ui-manager');
  console.log('✅ UIManager loaded');
  NotificationManager = require('./modules/notification-manager');
  console.log('✅ NotificationManager loaded');
  IPCManager = require('./modules/ipc-manager');
  console.log('✅ IPCManager loaded');
  AppHistoryManager = require('./modules/app-history-manager');
  console.log('✅ AppHistoryManager loaded');
  ActivityMonitor = require('./modules/activity-monitor');
  console.log('✅ ActivityMonitor loaded');
  console.log('✅ All renderer modules loaded successfully');
} catch (error) {
  console.error('❌ Module import failed:', error);
  console.error('❌ Error details:', error.message);
  console.log('⚠️ Module import failed, showing error without destroying DOM');
  // CRITICAL: Never wipe document.body.innerHTML - it destroys the login form.
  // Instead, hide the startup overlay and show a non-destructive error overlay.
  try {
    const overlay = document.getElementById('startupOverlay');
    if (overlay) overlay.style.display = 'none';
  } catch (_) {}
  const errDiv = document.createElement('div');
  errDiv.id = 'moduleErrorOverlay';
  errDiv.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(248,250,252,0.97);display:flex;align-items:center;justify-content:center;z-index:20000;font-family:-apple-system,BlinkMacSystemFont,sans-serif;';
  errDiv.innerHTML = `
    <div style="background:white;padding:40px;border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,0.1);max-width:500px;text-align:center;">
      <div style="font-size:48px;margin-bottom:20px;">⚠️</div>
      <h2 style="color:#dc2626;margin-bottom:16px;">Module Loading Error</h2>
      <p style="color:#64748b;margin-bottom:20px;">${error.message}</p>
      <button onclick="location.reload()" style="padding:12px 24px;background:#3b82f6;color:white;border:none;border-radius:8px;cursor:pointer;font-size:16px;">Retry</button>
    </div>
  `;
  document.body.appendChild(errDiv);
  throw error;
}

// === GLOBAL STATE ===
let supabaseClient = null;
let moduleInstances = {};

// CRITICAL FIX: Expose moduleInstances globally so IPC manager can stop ActivityMonitor
window.moduleInstances = moduleInstances;

// === SUPABASE CLIENT SETUP ===
async function initializeSupabaseClient() {
  try {
    // Use the global Supabase object that's already loaded via CDN in index.html
    console.log('🔧 Checking for global Supabase object...');
    console.log('🔍 Available window objects:', Object.keys(window).filter(key => key.toLowerCase().includes('supabase')));
    
    // Check different possible global object names
    let createClient;
    if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
      createClient = window.supabase.createClient;
      console.log('✅ Found Supabase at window.supabase');
    } else if (typeof window.Supabase !== 'undefined' && window.Supabase.createClient) {
      createClient = window.Supabase.createClient;
      console.log('✅ Found Supabase at window.Supabase');
    } else if (typeof supabase !== 'undefined' && supabase.createClient) {
      createClient = supabase.createClient;
      console.log('✅ Found Supabase in global scope');
    } else {
      console.error('❌ Supabase global object not found. Available objects:', Object.keys(window));
      throw new Error('Global Supabase object not found. Make sure the CDN script is loaded properly in index.html');
    }
    
    // Get config from main process via IPC (with retry for timing issues)
    console.log('🔄 Getting Supabase config from main process...');
    let config;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        config = await ipcRenderer.invoke('get-config');
        if (config && config.supabase_url && config.supabase_key) break;
        console.warn(`⚠️ [INIT] get-config attempt ${attempt} returned incomplete config, retrying...`);
        await new Promise(r => setTimeout(r, 500 * attempt));
      } catch (ipcErr) {
        console.warn(`⚠️ [INIT] get-config attempt ${attempt} failed:`, ipcErr.message);
        if (attempt === 3) throw ipcErr;
        await new Promise(r => setTimeout(r, 500 * attempt));
      }
    }
    
    console.log('✅ Config received from main process:', {
      hasUrl: !!config.supabase_url,
      hasKey: !!config.supabase_key,
      urlLength: config.supabase_url?.length || 0,
      keyLength: config.supabase_key?.length || 0,
      fullConfig: config
    });
    
    // Validate config before creating client
    if (!config.supabase_url || !config.supabase_key) {
      console.error('❌ Invalid config received:', config);
      console.error('❌ URL:', config.supabase_url);
      console.error('❌ Key:', config.supabase_key ? '[REDACTED]' : 'null');
      console.error('❌ Full config object:', JSON.stringify(config, null, 2));
      throw new Error('Missing Supabase configuration from main process');
    }
    
    // Connectivity check: if direct Supabase URL is unreachable, fall back to proxy
    const PROXY_URL = 'https://timeflow-sb-proxy.vercel.app';
    let supabaseUrl = config.supabase_url;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      await fetch(`${config.supabase_url}/rest/v1/`, {
        method: 'HEAD', signal: controller.signal,
        headers: { apikey: config.supabase_key }
      });
      clearTimeout(timer);
      console.log('✅ Direct Supabase URL reachable');
    } catch (connErr) {
      console.warn('⚠️ [INIT] Direct Supabase URL unreachable, switching to proxy:', connErr.message);
      supabaseUrl = PROXY_URL;
      console.log('🔄 Using proxy URL:', supabaseUrl);
    }

    console.log('🔧 Creating Supabase client with URL:', supabaseUrl);
    
    supabaseClient = createClient(supabaseUrl, config.supabase_key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false
      },
      realtime: {
        // Disable realtime to prevent WebSocket connection issues
        enabled: false,
        params: {
          eventsPerSecond: 2
        }
      },
      global: {
        headers: {
          apikey: config.supabase_key,
          Authorization: `Bearer ${config.supabase_key}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      }
    });
    try {
      supabaseClient.auth.onAuthStateChange((event, session) => {
        // Detect refresh failures: session becomes null while tracking
        if (!session) {
          try {
            console.warn('⚠️ [AUTH] Session became null, stopping tracking');
            ipcRenderer.invoke('stop-timer', 'auth_refresh_failed');
          } catch (_) {}
        }
      });
    } catch (_) {}
    
    console.log('✅ Supabase client initialized successfully');
    // Expose client globally for inline pages (history fallbacks, etc.)
    try {
      window.supabaseClient = supabaseClient;
      window.RendererModules = window.RendererModules || {};
      window.RendererModules.supabaseClient = supabaseClient;
    } catch(_) {}

    // Initialize realtime listener for admin-driven settings
    try {
      const channel = supabaseClient.channel('tf_settings');
      channel.on('broadcast', { event: 'monitoring_visibility' }, (payload) => {
        try {
          const enabled = !!(payload && payload.payload && payload.payload.enabled);
          localStorage.setItem('tf_monitoring_enabled', enabled ? '1' : '0');
          try { window.dispatchEvent(new Event('tf-monitoring-visibility-changed')); } catch (_) {}
        } catch (e) { console.error('⚠️ realtime monitoring_visibility handling failed', e); }
      });
      channel.subscribe().catch(() => {});
    } catch (_) {}
    return supabaseClient;
  } catch (error) {
    console.error('❌ Failed to initialize Supabase client:', error);
    console.error('❌ Error details:', error.message);
    throw error;
  }
}

// === MODULE INITIALIZATION ===
async function initializeModules() {
  try {
    console.log('🔧 Initializing modular renderer system...');
    
    // Check if module classes are available
    console.log('🔍 Module availability check:', {
      AuthManager: typeof AuthManager,
      UIManager: typeof UIManager,
      NotificationManager: typeof NotificationManager,
      IPCManager: typeof IPCManager
    });
    
    const runtimeConfig = await ipcRenderer.invoke('get-config');
    const useCognito =
      runtimeConfig?.auth_provider === 'cognito' &&
      runtimeConfig?.cognito_user_pool_id &&
      runtimeConfig?.cognito_client_id;

    if (!supabaseClient && !useCognito) {
      console.log('🔧 Initializing Supabase client...');
      await initializeSupabaseClient();
      console.log('✅ Supabase client ready');
    } else if (useCognito) {
      console.log('🔐 Cognito auth enabled — skipping Supabase client init for login');
    }
    
    // Initialize modules in dependency order
    console.log('🔧 Creating NotificationManager...');
    moduleInstances.notificationManager = new NotificationManager();
    console.log('✅ NotificationManager created');
    
    console.log('🔧 Creating UIManager...');
    moduleInstances.uiManager = new UIManager(ipcRenderer, moduleInstances.notificationManager);
    console.log('✅ UIManager created');
    
    console.log('🔧 Creating IPCManager...');
    moduleInstances.ipcManager = new IPCManager(ipcRenderer, moduleInstances.notificationManager);
    console.log('✅ IPCManager created');
    
    console.log('🔧 Creating AuthManager...');
    moduleInstances.authManager = new AuthManager(
      supabaseClient, 
      ipcRenderer, 
      moduleInstances.uiManager, 
      moduleInstances.notificationManager
    );
    console.log('✅ AuthManager created');
    
    // Initialize Activity Monitor (binds IPC + polling) once UI is ready
    // PERF FIX: Only auto-mount if monitoring tools are enabled. When hidden (default for employees),
    // the ActivityMonitor page elements don't exist in the DOM, so its 3 polling intervals
    // (stats, screenshots, rate updates) and IPC listeners are pure overhead.
    // It will be mounted on-demand when user navigates to the Activity Monitor page.
    try {
      moduleInstances.activityMonitor = new ActivityMonitor(ipcRenderer);
      const monitoringEnabled = localStorage.getItem('tf_monitoring_enabled') === '1';
      if (monitoringEnabled) {
        moduleInstances.activityMonitor.mount();
        console.log('✅ ActivityMonitor initialized and mounted (monitoring tools enabled)');
      } else {
        console.log('✅ ActivityMonitor initialized (deferred mount - monitoring tools hidden)');
      }
    } catch (e) {
      console.warn('⚠️ ActivityMonitor init failed:', e?.message);
    }

    console.log('✅ All modules initialized successfully');

    // Expose key instances globally for legacy inline scripts (e.g., index.html)
    // This ensures URL History and other features can access IPC reliably.
    try {
      if (typeof window !== 'undefined') {
        // Provide direct access used by index.html fallbacks
        window.uiManager = moduleInstances.uiManager;
        // Safe electronAPI fallback so inline scripts can call invoke/handle
        if (!window.electronAPI) {
          window.electronAPI = {
            ipcRenderer
          };
        } else if (!window.electronAPI.ipcRenderer) {
          // Preserve existing electronAPI but inject ipcRenderer if missing
          window.electronAPI.ipcRenderer = ipcRenderer;
        }
      }
    } catch (exposeErr) {
      console.warn('⚠️ Failed to expose globals for legacy scripts:', exposeErr);
    }
    return moduleInstances;
  } catch (error) {
    console.error('❌ Failed to initialize modules:', error);
    console.error('❌ Error details:', error.message);
    console.error('❌ Error stack:', error.stack);
    throw error;
  }
}

// === INTER-MODULE COMMUNICATION ===
function setupModuleCommunication() {
  const { authManager, uiManager, ipcManager, notificationManager } = moduleInstances;
  
  // Auth events
  ipcManager.on('tracking-state-changed', (data) => {
    console.log('🔄 Tracking state changed:', data);
    
    // CRITICAL FIX: Validate status before updating UI
    let validStatus = data.status;
    if (!validStatus || !['active', 'paused', 'stopped'].includes(validStatus)) {
      console.log('⚠️ [RENDERER-MODULAR] Invalid tracking status received:', validStatus, '- defaulting to stopped');
      validStatus = 'stopped';
    }
    
    // Update UIManager tracking state first
    uiManager.setTrackingStatus(validStatus);
    
    // Update auth manager with current user if needed
    if (data.isTracking && !authManager.getCurrentUser()) {
      const savedUser = localStorage.getItem('alyson_user');
      if (savedUser) {
        authManager.setCurrentUser(JSON.parse(savedUser));
        authManager.updateUserInfo();
      }
    }
  });
  
  // Activity stats updates
  let __lastTodayTimeRefresh = 0;
  ipcManager.on('activity-stats-updated', (stats) => {
    console.log('📊 Activity stats updated:', stats);
    // Throttle today's time refresh (30s)
    const now = Date.now();
    if (uiManager.loadTodaysTotalTime && (now - __lastTodayTimeRefresh > 30000)) {
      __lastTodayTimeRefresh = now;
      uiManager.loadTodaysTotalTime();
    }
  });
  
  // MONITORING STATUS UPDATES WITH DIAGNOSTICS
  console.log('🔧 [MONITORING] Setting up monitoring event listeners...');
  
  // Test IPC communication
  const testIPC = () => {
    console.log('🧪 [MONITORING] Testing IPC communication...');
    ipcManager.emit('test-event', { message: 'test' });
  };
  testIPC();
  
  // Listen for screenshot updates
  ipcManager.on('screenshot-captured', (data) => {
    console.log('📸 [MONITORING] Screenshot captured event received:', data);
    if (uiManager && uiManager.updateMonitoringStatus) {
      uiManager.updateMonitoringStatus('screenshot', 'captured', {
        message: 'Screenshot taken',
        nextTime: new Date().toLocaleTimeString()
      });
      console.log('✅ [MONITORING] Screenshot status updated');
    } else {
      console.error('❌ [MONITORING] UIManager not available for screenshot update');
    }
  });
  
  ipcManager.on('next-screenshot-update', (data) => {
    console.log('📸 [MONITORING] Screenshot timer update received:', data);
    if (data.secondsUntilNext !== undefined) {
      const nextTime = data.secondsUntilNext > 0 ? `${data.secondsUntilNext}s` : 'Taking now...';
      if (uiManager && uiManager.updateMonitoringStatus) {
        uiManager.updateMonitoringStatus('screenshot', 'active', {
          message: `Next in ${nextTime}`,
          nextTime: nextTime
        });
        console.log('✅ [MONITORING] Screenshot timer updated');
      }
    }
  });
  
  // Listen for URL detection updates
  ipcManager.on('url-detected', (data) => {
    console.log('🌐 [MONITORING] URL detected event received:', data);
    if (uiManager && uiManager.updateMonitoringStatus) {
      uiManager.updateMonitoringStatus('url', 'active', {
        url: data.url || 'URL detected',
        browser: data.browser || data.appName || 'Browser'
      });
      console.log('✅ [MONITORING] URL status updated');
    } else {
      console.error('❌ [MONITORING] UIManager not available for URL update');
    }
  });
  
  // Listen for app detection updates  
  ipcManager.on('app-detected', (data) => {
    console.log('📱 [MONITORING] App detected event received:', data);
    if (uiManager && uiManager.updateMonitoringStatus) {
      uiManager.updateMonitoringStatus('app', 'active', {
        app: data.name || data.appName || 'Application detected',
        window: data.title || data.windowTitle || '--'
      });
      console.log('✅ [MONITORING] App status updated');
    } else {
      console.error('❌ [MONITORING] UIManager not available for app update');
    }
  });
  
  // DIAGNOSTIC: Log all IPC events received
  const originalOn = ipcManager.on;
  ipcManager.on = function(event, listener) {
    const wrappedListener = function(...args) {
      console.log(`🔍 [IPC-DEBUG] Event received: ${event}`, args);
      return listener.apply(this, args);
    };
    return originalOn.call(this, event, wrappedListener);
  };
  
  // Main-process tray timer pushes elapsed time every second when the event loop is healthy.
  // Renderer-side watchdog takes over if tray ticks stall for >2.5s.
  ensureLocalDayRolloverWatch();
  ipcRenderer.on('local-day-rollover', (_event, data) => {
    window.__localDayKey = data?.date || localDateIso();
    handleLocalDayRollover(!!data?.isTracking);
  });
  ipcRenderer.on('tray-timer-tick', (_event, data) => {
    window.__trayTimerActive = true;
    window.__lastTrayTimerTickAt = Date.now();
    const localAhead = readLocalTrackingCumulativeSeconds();
    const incomingTray = Math.max(
      0,
      Math.floor(Number(data?.cumulativeSeconds) || 0),
      parseHmsToSeconds(data?.cumulativeDisplay),
    );
    // Only prefer local clock when it is actively running. If watchdog was killed
    // (stop→start race), always accept tray ticks so the UI does not freeze.
    const localClockAlive = !!(window.__trackingDisplayWatchdog && window.__lastTrackingStartTime);
    if (localClockAlive && localAhead > incomingTray + 1) {
      return;
    }
    window.__localTrackingClockActive = false;
    const dashboardTimer = document.getElementById('sessionTime');
    if (data && (data.display || data.cumulativeDisplay)) {
      const sessionStr = data.display || formatSecondsAsHMS(data.sessionElapsedSeconds ?? 0);
      const trayCumulative = Math.max(
        0,
        Math.floor(Number(data.cumulativeSeconds) || 0),
        parseHmsToSeconds(data.cumulativeDisplay),
      );
      window.__lastTrayCumulativeSeconds = trayCumulative;
      const base = Math.max(0, Math.floor(Number(window.__completedTodayBaseSeconds) || 0));
      const start = window.__lastTrackingStartTime;
      const localCumulative = start
        ? base + getTodayElapsedSeconds(start)
        : trayCumulative;
      const cumulativeSec = Math.max(localCumulative, trayCumulative);
      window.__todayTrackedSeconds = Math.max(
        Math.max(0, Math.floor(Number(window.__todayTrackedSeconds) || 0)),
        cumulativeSec,
      );
      if (dashboardTimer) dashboardTimer.textContent = sessionStr;
      setTrackerDisplaySeconds(cumulativeSec, { allowDecrease: false });
    }
  });

  ipcRenderer.on('tracking-stopped', (_event, data) => {
    const trackedFloor = Math.max(
      Math.max(0, Math.floor(Number(window.__todayTrackedSeconds) || 0)),
      Math.max(0, Math.floor(Number(data?.frozenTotalSeconds) || 0)),
    );
    if (trackedFloor > 0) {
      window.__todayBaseAtLastStop = trackedFloor;
      window.__todayTrackedSeconds = Math.max(
        Math.max(0, Math.floor(Number(window.__todayTrackedSeconds) || 0)),
        trackedFloor,
      );
      setTrackerDisplaySeconds(window.__todayTrackedSeconds, { allowDecrease: true });
      void ipcRenderer.invoke('set-frozen-total-at-stop', trackedFloor).catch(() => {});
    }
    // Refresh idle/low so effective reflects the closed session soon after stop.
    void refreshTodayCompletedBaseSeconds().then(() => {
      const tracked = Math.max(
        trackedFloor,
        Math.max(0, Math.floor(Number(window.__todayTrackedSeconds) || 0)),
      );
      setTrackerDisplaySeconds(tracked, { allowDecrease: true });
    });
  });

  // Session timer updates (renderer-side fallback — only used when tray timer is NOT active)
  ipcManager.on('session-timer-update', (timerData) => {
    if (isTrayTimerDrivingDisplay()) return;
    if (typeof updateRendererTrackingClock === 'function' && window.__lastTrackingStartTime) {
      updateRendererTrackingClock();
      return;
    }

    const dashboardTimer = document.getElementById('sessionTime');
    const trackerTimer = document.getElementById('trackerTime');
    
    if (timerData.startTime) {
      const elapsed = getTodayElapsedSeconds(timerData.startTime);
      const hours = Math.floor(elapsed / 3600);
      const minutes = Math.floor((elapsed % 3600) / 60);
      const seconds = elapsed % 60;
      const timeString = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
      const base = Math.max(0, Math.floor(Number(window.__completedTodayBaseSeconds) || 0));
      const cumulativeSec = base + elapsed;

      if (dashboardTimer) {
        dashboardTimer.textContent = timeString;
      }
      if (trackerTimer) {
        setTrackerDisplaySeconds(cumulativeSec, { allowDecrease: true });
      }
    }
  });

  // Manual timer update mechanism (fallback if IPC updates aren't sent)
  let timerUpdateInterval = null;
  // Store globally so IPC manager can clear it
  window.timerUpdateInterval = timerUpdateInterval;
  
  // Global cleanup function for all timers
  window.clearAllTimers = function() {
    console.log('🧹 [TIMER] Clearing all timer intervals...');
    if (timerUpdateInterval) {
      clearInterval(timerUpdateInterval);
      timerUpdateInterval = null;
    }
    if (window.timerUpdateInterval) {
      clearInterval(window.timerUpdateInterval);
      window.timerUpdateInterval = null;
    }
    stopTrackingDisplayWatchdog();
    window.__lastTrackingStartTime = null;
    window.__trayTimerActive = false;
    console.log('✅ [TIMER] All timer intervals cleared');
  };
  
  // FIX-9: Debounce non-optimistic tracking-state-changed events to prevent
  // rapid duplicate events from causing timer flicker.
  let _trackingStateDebounceTimer = null;

  ipcManager.on('tracking-state-changed', async (state) => {
    console.log('📊 [TIMER] Tracking state changed:', state);
    const dashboardTimer = document.getElementById('sessionTime'); // Dashboard element
    const trackerTimer = document.getElementById('trackerTime'); // Tracker page element
    
    // OPTIMISTIC START: skip async verification — main process isn't ready yet.
    if (state.optimistic) {
      console.log('⚡ [TIMER] Optimistic start — starting timer directly');
      const startTime = state.sessionStartTime || state.startTime || new Date();
      beginLocalTrackingClock(startTime);
      if (timerUpdateInterval) clearInterval(timerUpdateInterval);
      if (window.timerUpdateInterval) clearInterval(window.timerUpdateInterval);
      void refreshTodayCompletedBaseSeconds().then(() => updateRendererTrackingClock());
      timerUpdateInterval = setInterval(() => {
        updateRendererTrackingClock();
      }, 1000);
      window.timerUpdateInterval = timerUpdateInterval;
      return;
    }
    
    // FIX-2: Synced events come from the 30-second tracking sync which already
    // called get-tracking-state. Skip redundant re-verification to avoid
    // doubling the IPC failure risk.
    if (state.synced && state.isTracking && state.startTime) {
      console.log('🔄 [TIMER] Synced event — updating start time without re-verification');
      window.__lastTrackingStartTime = state.startTime;
      ensureTrackingDisplayWatchdog();
      void refreshTodayCompletedBaseSeconds();
      return;
    }
    
    // FIX-9: Debounce non-optimistic events by 200ms to prevent rapid
    // duplicate events from creating conflicting setInterval instances.
    if (_trackingStateDebounceTimer) clearTimeout(_trackingStateDebounceTimer);
    _trackingStateDebounceTimer = setTimeout(async () => {
      _trackingStateDebounceTimer = null;

      if (ipcManager.optimisticMode || ipcManager.startInProgress) {
        console.log('⚡ [TIMER] Skipping verification — start still in progress');
        return;
      }
      
      // Verify tracking state with main process before updating UI
      try {
        // FIX-3: getTrackingState() now returns null on IPC failure instead of
        // { isTracking: false }. If null, preserve current state.
        const mainState = await ipcManager.getTrackingState();
        if (!mainState) {
          console.log('⚠️ [TIMER] Verification failed (IPC error) — preserving current state');
          return;
        }
        console.log('🔍 [TIMER] Main process state verification:', mainState);
        
        // Use main process state as source of truth, fallback to event state
        const verifiedState = {
          isTracking: mainState?.isTracking || false,
          startTime: mainState?.sessionStartTime || state.startTime,
          status: mainState?.isPaused ? 'paused' : (mainState?.isTracking ? 'active' : 'stopped')
        };
        
        console.log('✅ [TIMER] Verified state:', verifiedState);
        
        // Guard: only start manual updates if main confirms an active session with a valid time log
        if (verifiedState.isTracking && verifiedState.startTime && mainState?.currentTimeLogId) {
          // Keep a resilient start time across events
          window.__lastTrackingStartTime = verifiedState.startTime;
          ensureTrackingDisplayWatchdog();
          console.log('⏱️ [TIMER] Starting manual timer updates with verified start time:', window.__lastTrackingStartTime);
          
          // Clear any existing interval
          if (timerUpdateInterval) clearInterval(timerUpdateInterval);
          if (window.timerUpdateInterval) clearInterval(window.timerUpdateInterval);

          await refreshTodayCompletedBaseSeconds();
          
          // Immediate update to avoid 1s delay
          const startTime = new Date(window.__lastTrackingStartTime);
          const elapsed = getTodayElapsedSeconds(startTime);
          const hours = Math.floor(elapsed / 3600);
          const minutes = Math.floor((elapsed % 3600) / 60);
          const seconds = elapsed % 60;
          const timeString = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
          const base0 = Math.max(0, Math.floor(Number(window.__completedTodayBaseSeconds) || 0));
          const trackedNow = base0 + elapsed;
          window.__todayTrackedSeconds = trackedNow;
          
          if (dashboardTimer) {
            dashboardTimer.textContent = timeString;
          }
          if (trackerTimer) {
            setTrackerDisplaySeconds(trackedNow, { allowDecrease: true });
          }
          
          window.__localTrackingClockActive = true;
          timerUpdateInterval = setInterval(() => {
            updateRendererTrackingClock();
          }, 1000);
          // Store globally so IPC manager can clear it
          window.timerUpdateInterval = timerUpdateInterval;
        } else {
          // FIX-1: If the tray timer is actively sending ticks, it is the
          // authoritative timer source. Do NOT reset the display — the tray
          // timer will correct any stale state within 1 second.
          if (isTrayTimerDrivingDisplay()) {
            console.log('⏹️ [TIMER] Verification says not tracking, but tray timer is active — deferring to tray');
            return;
          }
          
          console.log('⏹️ [TIMER] Stopping timer updates - verified state shows not tracking');
          stopTrackingDisplayWatchdog();
          // Clear interval when not tracking
          if (timerUpdateInterval) {
            clearInterval(timerUpdateInterval);
            timerUpdateInterval = null;
          }
          if (window.timerUpdateInterval) {
            clearInterval(window.timerUpdateInterval);
            window.timerUpdateInterval = null;
          }
          // Session clock stops; tracker shows today's completed total (no live session)
          if (dashboardTimer) {
            dashboardTimer.textContent = '00:00:00';
          }
          if (trackerTimer) {
            ipcRenderer.invoke('get-today-time-stats').then((s) => {
              if (trackerTimer && s && typeof s.totalTime === 'number') {
                applyTodayEffectiveStats(s);
                const resolved = resolveStoppedDisplaySeconds(s.totalTime);
                setTrackerDisplaySeconds(resolved, { allowDecrease: true });
              }
            }).catch(() => {
              const current = readTrackerDisplaySeconds();
              if (current <= 0 && trackerTimer) trackerTimer.textContent = '00:00:00';
            });
          }
          window.__lastTrackingStartTime = null;
          window.__trayTimerActive = false;
          window.__lastTrayTimerTickAt = 0;
        }
      } catch (error) {
        console.error('❌ [TIMER] Failed to verify tracking state with main process:', error);
        // FIX-1: If tray timer is active, it's the authoritative source.
        // Don't reset the display on verification errors.
        if (isTrayTimerDrivingDisplay()) {
          console.log('⚠️ [TIMER] Verification error, but tray timer is active — preserving display');
          return;
        }
        if (window.__lastTrackingStartTime) {
          ensureTrackingDisplayWatchdog();
          return;
        }
        console.log('⏹️ [TIMER] Stopping timer updates - verification failed (no fallback start)');
        stopTrackingDisplayWatchdog();
        window.__trayTimerActive = false;
        window.__lastTrayTimerTickAt = 0;
        if (timerUpdateInterval) {
          clearInterval(timerUpdateInterval);
          timerUpdateInterval = null;
        }
        if (window.timerUpdateInterval) {
          clearInterval(window.timerUpdateInterval);
          window.timerUpdateInterval = null;
        }
        if (dashboardTimer) {
          dashboardTimer.textContent = '00:00:00';
        }
        if (trackerTimer) {
          ipcRenderer.invoke('get-today-time-stats').then((s) => {
            if (trackerTimer && s && typeof s.totalTime === 'number') {
              applyTodayEffectiveStats(s);
              const resolved = resolveStoppedDisplaySeconds(s.totalTime);
              setTrackerDisplaySeconds(resolved, { allowDecrease: true });
            }
          }).catch(() => {
            const current = readTrackerDisplaySeconds();
            if (current <= 0 && trackerTimer) trackerTimer.textContent = '00:00:00';
          });
        }
        window.__lastTrackingStartTime = null;
      }
    }, 200); // 200ms debounce
  });
  
  // Permission updates
  ipcManager.on('permissions-updated', (permissions) => {
    console.log('🔐 Permissions updated:', permissions);
    notificationManager.showNotification(
      permissions.granted ? 'Permissions granted successfully' : 'Some permissions were denied',
      permissions.granted ? 'success' : 'warning'
    );
  });
  
  // Health check results
  ipcManager.on('health-check-completed', (result) => {
    console.log('🏥 Health check completed:', result);
    const message = result.overall === 'pass' ? 'System health check passed' : 'System health check found issues';
    notificationManager.showNotification(message, result.overall === 'pass' ? 'success' : 'warning');
  });
  
  // ================================
  // PERFORMANCE OPTIMIZATION: CONSOLIDATED IPC HANDLER
  // ================================
  
  let lastPerfUpdate = 0;
  
  // Handle consolidated performance updates (replaces multiple individual IPC handlers)
  ipcManager.on('perf-update', (data) => {
    // Throttle UI updates to prevent flooding
    const now = Date.now();
    if (now - lastPerfUpdate < 5000) {
      return; // Skip update if less than 5 seconds since last update
    }
    lastPerfUpdate = now;
    
    console.log('📦 [PERF-IPC] Received consolidated update:', {
      activity: data.activity ? 'present' : 'missing',
      timer: data.timer ? 'present' : 'missing', 
      screenshot: data.screenshot ? 'present' : 'missing',
      memory: data.memory ? Math.round(data.memory.heapUsed / 1024 / 1024) + 'MB' : 'missing'
    });
    
    try {
      // Update activity display if available
      if (data.activity && typeof updateLiveActivityDisplay === 'function') {
        updateLiveActivityDisplay(data.activity);
      }
      
      // Update timer display if available
      // FIX-6: Skip if tray timer is the authoritative source to prevent overwrites
      if (data.timer && data.timer.isTracking && !isTrayTimerDrivingDisplay()) {
        const timerDisplay = document.getElementById('trackerTime');
        // Only update if we have valid elapsed time to avoid overwriting
        if (timerDisplay && data.timer.elapsed !== undefined && data.timer.elapsed !== null) {
          const elapsed = Math.floor(data.timer.elapsed / 1000);
          const base = Math.max(0, Math.floor(Number(window.__completedTodayBaseSeconds) || 0));
          timerDisplay.textContent = formatSecondsAsHMS(base + elapsed);
        }
      }
      
      // Update screenshot countdown if available
      if (data.screenshot) {
        console.log('📸 [PERF-IPC] Processing screenshot data from consolidated update:', data.screenshot);
        // Use IPC manager's existing function to handle screenshot data
        if (moduleInstances.ipcManager && moduleInstances.ipcManager.updateScreenshotActivityMonitor) {
          moduleInstances.ipcManager.updateScreenshotActivityMonitor(data.screenshot);
        } else {
          console.log('⚠️ [PERF-IPC] IPC manager not available for screenshot update');
        }
      }
      
      // Update memory display if element exists
      const memoryDisplay = document.getElementById('memoryUsage');
      if (memoryDisplay && data.memory) {
        memoryDisplay.textContent = Math.round(data.memory.heapUsed / 1024 / 1024) + 'MB';
      }
      
    } catch (error) {
      console.error('❌ [PERF-IPC] Error processing consolidated update:', error.message);
    }
  });
  
  console.log('✅ Inter-module communication established');
}

// === DASHBOARD INITIALIZATION ===
// Initialize dashboard when modules are ready
function initializeDashboard() {
  console.log('🔄 [DASHBOARD] Initializing dashboard displays...');
  
  if (moduleInstances.uiManager && moduleInstances.uiManager.updateDashboardTimeDisplays) {
    moduleInstances.uiManager.updateDashboardTimeDisplays();
  }
  
  // DIAGNOSTIC: Check IPC availability
  console.log('🔍 [DASHBOARD] IPC availability check:', {
    electronAPI: !!window.electronAPI,
    invoke: !!(window.electronAPI && window.electronAPI.invoke),
    ipcRenderer: !!(window.require && window.require('electron').ipcRenderer)
  });
  
  // Try multiple IPC access methods
  let ipcRenderer = null;
  if (window.electronAPI && window.electronAPI.invoke) {
    console.log('✅ [DASHBOARD] Using electronAPI for IPC');
    // Check current tracking state and update UI
    window.electronAPI.invoke('get-tracking-state').then(state => {
      console.log('📊 [DASHBOARD] Initial tracking state:', state);
      // FIX: Always emit tracking state, not just when active
      // This ensures Stop button is disabled on startup when not tracking
      if (moduleInstances.ipcManager) {
        moduleInstances.ipcManager.emit('tracking-state-changed', {
          isTracking: state.isTracking,
          status: state.isTracking ? 'active' : 'stopped',
          startTime: state.sessionStartTime
        });
      }
      // Also directly update button states
      if (moduleInstances.uiManager) {
        moduleInstances.uiManager.setTrackingStatus(state.isTracking ? 'active' : 'stopped');
      }
    }).catch(err => {
      console.error('❌ [DASHBOARD] Could not get initial tracking state:', err);
    });
  } else if (window.require) {
    try {
      ipcRenderer = window.require('electron').ipcRenderer;
      console.log('✅ [DASHBOARD] Using direct ipcRenderer access');
      
      ipcRenderer.invoke('get-tracking-state').then(state => {
        console.log('📊 [DASHBOARD] Initial tracking state (direct):', state);
        // FIX: Always update button states on startup
        if (moduleInstances.uiManager) {
          moduleInstances.uiManager.setTrackingStatus(state.isTracking ? 'active' : 'stopped');
        }
      }).catch(err => {
        console.error('❌ [DASHBOARD] Direct IPC failed:', err);
      });
    } catch (error) {
      console.error('❌ [DASHBOARD] Could not access ipcRenderer directly:', error);
    }
  } else {
    console.error('❌ [DASHBOARD] No IPC access method available');
  }
  
  // Add diagnostic buttons only when explicitly enabled via localStorage flag
  if (debugButtonsEnabled()) {
    addDiagnosticButton();
  }
}

// Determine if debug buttons should be displayed (hidden by default)
function debugButtonsEnabled() {
  // Force-disable debug buttons in production UI
  return false;
}

// Add a diagnostic button for manual testing
function addDiagnosticButton() {
  const dashboardPage = document.getElementById('dashboardPage');
  if (dashboardPage) {
    const diagnosticButton = document.createElement('button');
    diagnosticButton.textContent = 'Test IPC & Monitoring';
    diagnosticButton.style.cssText = 'position: fixed; top: 10px; right: 10px; z-index: 9999; background: #3b82f6; color: white; border: none; padding: 8px 12px; border-radius: 6px; font-size: 12px; cursor: pointer;';
    diagnosticButton.onclick = runDiagnostics;
    document.body.appendChild(diagnosticButton);

    // Add a second button to test screenshot capture and DB save
    const testShotBtn = document.createElement('button');
    testShotBtn.textContent = 'Test Screenshot & Verify';
    testShotBtn.style.cssText = 'position: fixed; top: 10px; right: 180px; z-index: 9999; background: #10b981; color: white; border: none; padding: 8px 12px; border-radius: 6px; font-size: 12px; cursor: pointer;';
    testShotBtn.onclick = testScreenshotAndVerify;
    document.body.appendChild(testShotBtn);
  }
}

// Comprehensive diagnostic function
async function runDiagnostics() {
  console.log('🧪 [DIAGNOSTICS] Starting comprehensive diagnostics...');
  
  const results = {
    ipc: false,
    todayTime: false,
    tracking: false,
    monitoring: false
  };
  
  // Test 1: IPC Communication
  try {
    if (moduleInstances.uiManager && moduleInstances.uiManager.ipcRenderer) {
      const response = await moduleInstances.uiManager.ipcRenderer.invoke('get-tracking-state');
      console.log('✅ [DIAGNOSTICS] IPC working, response:', response);
      results.ipc = true;
    } else {
      console.error('❌ [DIAGNOSTICS] IPC not available');
    }
  } catch (error) {
    console.error('❌ [DIAGNOSTICS] IPC test failed:', error);
  }
  
  // Test 2: Today's Time Calculation
  try {
    if (moduleInstances.uiManager && moduleInstances.uiManager.loadTodaysTotalTime) {
      await moduleInstances.uiManager.loadTodaysTotalTime();
      results.todayTime = true;
      console.log('✅ [DIAGNOSTICS] Today\'s time calculation attempted');
    }
  } catch (error) {
    console.error('❌ [DIAGNOSTICS] Today\'s time test failed:', error);
  }
  
  // Test 3: Force monitoring status updates
  try {
    if (moduleInstances.uiManager && moduleInstances.uiManager.updateMonitoringStatus) {
      moduleInstances.uiManager.updateMonitoringStatus('screenshot', 'active', {
        message: 'Test screenshot',
        nextTime: 'Test time'
      });
      moduleInstances.uiManager.updateMonitoringStatus('url', 'active', {
        url: 'https://test.com',
        browser: 'Test Browser'
      });
      moduleInstances.uiManager.updateMonitoringStatus('app', 'active', {
        app: 'Test App',
        window: 'Test Window'
      });
      results.monitoring = true;
      console.log('✅ [DIAGNOSTICS] Monitoring status updates forced');
    }
  } catch (error) {
    console.error('❌ [DIAGNOSTICS] Monitoring test failed:', error);
  }
  
  // Test 4: Test main process monitoring system
  try {
    if (moduleInstances.uiManager && moduleInstances.uiManager.ipcRenderer) {
      const mainProcessDiagnostics = await moduleInstances.uiManager.ipcRenderer.invoke('test-monitoring-system');
      console.log('✅ [DIAGNOSTICS] Main process diagnostics:', mainProcessDiagnostics);
      results.mainProcess = mainProcessDiagnostics;
    }
  } catch (error) {
    console.error('❌ [DIAGNOSTICS] Main process test failed:', error);
    results.mainProcess = { error: error.message };
  }
  
  // Test 5: Force start monitoring systems
  try {
    if (moduleInstances.uiManager && moduleInstances.uiManager.ipcRenderer) {
      const forceResults = await moduleInstances.uiManager.ipcRenderer.invoke('force-start-monitoring');
      console.log('✅ [DIAGNOSTICS] Force monitoring results:', forceResults);
      results.forceMonitoring = forceResults;
    }
  } catch (error) {
    console.error('❌ [DIAGNOSTICS] Force monitoring failed:', error);
    results.forceMonitoring = { error: error.message };
  }
  
  console.log('🧪 [DIAGNOSTICS] Results:', results);
  alert(`Diagnostic Results:\nIPC: ${results.ipc ? '✅' : '❌'}\nToday Time: ${results.todayTime ? '✅' : '❌'}\nMonitoring: ${results.monitoring ? '✅' : '❌'}\n\nCheck console for details.`);
}

// === LEGACY FUNCTION COMPATIBILITY ===
// These maintain compatibility with any existing code that might call these functions

function showNotification(message, type) {
  if (moduleInstances.notificationManager) {
    moduleInstances.notificationManager.showNotification(message, type);
  } else {
    console.log(`📢 ${type?.toUpperCase() || 'INFO'}: ${message}`);
  }
}

function showPage(pageId) {
  if (moduleInstances.uiManager) {
    moduleInstances.uiManager.showPage(pageId);
  }
}

function updateUserInfo() {
  if (moduleInstances.authManager) {
    moduleInstances.authManager.updateUserInfo();
  }
}

async function handleLogin(e) {
  if (moduleInstances.authManager) {
    return moduleInstances.authManager.handleLogin(e);
  }
}

async function handleLogout() {
  if (moduleInstances.authManager) {
    return moduleInstances.authManager.handleLogout();
  }
}

// === PROJECT SELECTION HANDLER ===
async function handleProjectSelection() {
  const projectSelect = document.getElementById('projectSelect');
  const trackerStartBtn = document.getElementById('trackerStartBtn');
  const startBtn = document.getElementById('startBtn');
  const trackerStatus = document.getElementById('trackerStatus');
  const selectedProjectInfo = document.getElementById('selectedProjectInfo');
  const selectedProjectName = document.getElementById('selectedProjectName');
  
  if (!projectSelect) return;
  
  const selectedProjectId = projectSelect.value;
  const selectedOption = projectSelect.selectedOptions[0];
  const projectName = selectedOption ? (selectedOption.textContent || '').trim() : '';
  
  console.log('📋 [MODULAR] Project selection changed:', { 
    id: selectedProjectId, 
    name: projectName 
  });

  // Optimistic UI first — never wait on IPC for the dropdown to feel responsive
  const ipcMgrTracking = !!(moduleInstances.ipcManager?.isTracking);
  const isCurrentlyTracking = ipcMgrTracking || !!(window.__isTracking);

  if (!selectedProjectId) {
    if (trackerStartBtn) {
      trackerStartBtn.disabled = true;
      trackerStartBtn.title = 'Select a project first';
    }
    if (startBtn) {
      startBtn.disabled = true;
      startBtn.title = 'Select a project first';
    }
    if (trackerStatus) trackerStatus.textContent = 'Select a project to start tracking';
    if (selectedProjectInfo) selectedProjectInfo.style.display = 'none';
    try { window.refreshProjectDropdown?.(); } catch (_) {}
    void ipcRenderer.invoke('set-project-id', null).catch((error) => {
      console.log('⚠️ [MODULAR] Failed to clear project ID:', error);
    });
    return;
  }

  if (!isCurrentlyTracking) {
    if (trackerStartBtn) {
      trackerStartBtn.disabled = false;
      trackerStartBtn.title = '';
    }
    if (startBtn) {
      startBtn.disabled = false;
      startBtn.title = '';
    }
  }

  if (trackerStatus) trackerStatus.textContent = `Ready to track: ${projectName}`;
  if (selectedProjectName) selectedProjectName.textContent = projectName;
  if (selectedProjectInfo) {
    selectedProjectInfo.style.display = 'block';
  }

  try { window.refreshProjectDropdown?.(); } catch (_) {}

  try {
    await ipcRenderer.invoke('set-project-id', selectedProjectId);
    console.log('✅ [MODULAR] Project ID set in main process:', selectedProjectId);
  } catch (error) {
    console.log('❌ [MODULAR] Failed to handle project selection:', error);
    if (moduleInstances.notificationManager) {
      moduleInstances.notificationManager.showNotification('Failed to set project', 'error');
    }
  }
}

// === MAIN INITIALIZATION ===
if (!window.__rendererInitAttached) {
  window.__rendererInitAttached = true;
  document.addEventListener('DOMContentLoaded', async () => {
    if (window.__rendererInitialized) {
      console.warn('[BOOT] Renderer already initialized — skipping');
      return;
    }
    window.__rendererInitialized = true;
  try {
    console.log('🚀 Modular Renderer initializing...');
    console.log('📱 Work Time Agent Renderer loaded successfully');
    
    // Initialize all modules
    await initializeModules();

    if (moduleInstances.uiManager?.setupUpdateEventListeners) {
      moduleInstances.uiManager.setupUpdateEventListeners();
    }

    const updateGateActive = await moduleInstances.uiManager.enforceMandatoryUpdateGateAtStartup();
    if (updateGateActive) {
      console.log('🛑 [RENDERER] Mandatory update required — login blocked until install');
      moduleInstances.uiManager.enableHardwareAcceleration?.();
      return;
    }

    await moduleInstances.authManager.initialize();
    
    // ALWAYS HIDE Monitoring Tools and Developer Tools sections on startup
    const monitoringSection = document.getElementById('monitoringSection');
    const devToolsSection = document.getElementById('developer-tools-section');
    
    // Force hidden state and reset localStorage
    const enabled = false;
    try {
      localStorage.setItem('tf_monitoring_enabled', '0');
    } catch (e) {
      console.warn('Failed to reset monitoring visibility in localStorage:', e);
    }
    
    // Hide both sections (use 'none' consistently)
    if (monitoringSection) {
      monitoringSection.style.display = 'none';
    }
    if (devToolsSection) {
      devToolsSection.style.display = 'none';
    }
    console.log('🔒 Monitoring & Developer Tools hidden on startup (use tray menu to toggle)');
    
    // Setup communication between modules
    setupModuleCommunication();
    updateTrackerDailyRefreshHint();
    
    // Initialize dashboard displays
    initializeDashboard();
    
    // Setup event listeners for legacy compatibility
    setupLegacyEventListeners();
    
    // AuthManager already loads remembered credentials during its own init
    // Avoid double invocation here to prevent duplicate logs
    
    // Check for existing authentication before showing login screen
    console.log('🔍 [RENDERER] Checking for existing authentication...');
    
    // Try to auto-login with saved session
    try {
      const autoLoginSuccess = await moduleInstances.authManager.tryAutoLogin();
      if (autoLoginSuccess) {
        console.log('✅ [RENDERER] Auto-login successful, user already authenticated');
        // Note: tryAutoLogin already calls showMainApp() internally
      } else {
        console.log('⚠️ [RENDERER] No valid session found, showing login screen');
        moduleInstances.uiManager.showLogin();
      }
    } catch (error) {
      console.log('❌ [RENDERER] Auto-login failed, showing login screen:', error);
      moduleInstances.uiManager.showLogin();
    }
    
    // After successful login, go directly to main app (once only)
    window.addEventListener('userLoggedIn', () => {
        if (window.__updateGateActive) {
          console.log('🛑 [RENDERER] userLoggedIn ignored — update gate active');
          return;
        }
        console.log('🎯 [RENDERER] User logged in event triggered, showing main app...');
        
        // Force immediate transition to main app
        try {
            console.log('🎯 [RENDERER] Calling showMainApp() immediately...');
            console.log('🔍 [RENDERER] Module instances check:', {
                hasModuleInstances: !!moduleInstances,
                hasUIManager: !!(moduleInstances && moduleInstances.uiManager),
                hasShowMainApp: !!(moduleInstances && moduleInstances.uiManager && moduleInstances.uiManager.showMainApp),
                uiManagerType: moduleInstances?.uiManager ? typeof moduleInstances.uiManager : 'undefined',
                showMainAppType: moduleInstances?.uiManager?.showMainApp ? typeof moduleInstances.uiManager.showMainApp : 'undefined'
            });
            
            if (moduleInstances && moduleInstances.uiManager && moduleInstances.uiManager.showMainApp) {
                moduleInstances.uiManager.showMainApp();
                if (moduleInstances.authManager?.updateUserInfo) {
                  moduleInstances.authManager.updateUserInfo();
                }
                try {
                    // Ensure Time Tracker page is shown by default after login
                    if (moduleInstances.uiManager && typeof moduleInstances.uiManager.showPage === 'function') {
                        moduleInstances.uiManager.showPage('timetracker');
                    }
                    if (moduleInstances.uiManager?.loadMainAppProjects) {
                        void moduleInstances.uiManager.loadMainAppProjects();
                    }
                } catch {}
                console.log('✅ [RENDERER] showMainApp() called successfully');
            } else {
                console.error('❌ [RENDERER] moduleInstances.uiManager.showMainApp not available');
                
                // Fallback: manual UI transition
                console.log('🔧 [RENDERER] Using fallback UI transition...');
                const loginContainer = document.getElementById('loginContainer');
                const appContainer = document.getElementById('appContainer');
                
                console.log('🔧 [RENDERER] loginContainer found:', !!loginContainer);
                console.log('🔧 [RENDERER] appContainer found:', !!appContainer);
                
                if (loginContainer) {
                    loginContainer.style.display = 'none';
                    console.log('✅ [RENDERER] Login container hidden');
                }
                
                if (appContainer) {
                    appContainer.style.display = 'block';
                    console.log('✅ [RENDERER] App container shown');
                    try {
                        // Fallback: force Time Tracker page on
                        if (moduleInstances.uiManager && typeof moduleInstances.uiManager.showPage === 'function') {
                            moduleInstances.uiManager.showPage('timetracker');
                        }
                    } catch {}
                } else {
                    console.error('❌ [RENDERER] appContainer element not found');
                }
            }
        } catch (error) {
            console.error('❌ [RENDERER] Error in showMainApp():', error);
        }
    }, { once: true });

    // Listen for onboarding trigger from main process
    if (typeof require !== 'undefined') {
        const { ipcRenderer } = require('electron');
        
        // Listen for skip onboarding event
        ipcRenderer.on('skip-onboarding-complete', () => {
            console.log('✅ [RENDERER] Skip onboarding event received - showing main app');
            
            // Force immediate transition to main app
            try {
                if (moduleInstances && moduleInstances.uiManager && moduleInstances.uiManager.showMainApp) {
                    moduleInstances.uiManager.showMainApp();
                    console.log('✅ [RENDERER] showMainApp() called from skip-onboarding');
                } else {
                    // Fallback: manual UI transition
                    console.log('🔧 [RENDERER] Using fallback from skip-onboarding...');
                    const loginContainer = document.getElementById('loginContainer');
                    const appContainer = document.getElementById('appContainer');
                    
                    console.log('🔧 [RENDERER] skip-onboarding fallback - loginContainer found:', !!loginContainer);
                    console.log('🔧 [RENDERER] skip-onboarding fallback - appContainer found:', !!appContainer);
                    
                    if (loginContainer) {
                        loginContainer.style.display = 'none';
                        console.log('✅ [RENDERER] Login container hidden from skip-onboarding');
                    }
                    if (appContainer) {
                        appContainer.style.display = 'block';
                        console.log('✅ [RENDERER] App container shown from skip-onboarding');
                    }
                }
            } catch (error) {
                console.error('❌ [RENDERER] Error in skip-onboarding handler:', error);
            }
        });
        
        ipcRenderer.on('show-onboarding-guide', () => {
            console.log('🎯 [RENDERER] Received show-onboarding-guide from main process');
            setTimeout(() => {
                console.log('🎯 [RENDERER] Showing onboarding guide...');
                moduleInstances.uiManager.showOnboardingGuide();
            }, 500);
        });
    }
    
    // Optional: Try auto-login (disabled for first-time experience)
    // const autoLoginSuccess = await moduleInstances.authManager.tryAutoLogin();
    // if (!autoLoginSuccess) {
    //   console.log('ℹ️ No saved session found or auto-login failed, showing login form');
    //   moduleInstances.uiManager.showLogin();
    // }
    
    // Start tracking state synchronization
    moduleInstances.ipcManager.startTrackingSync();
    
    // Enable hardware acceleration for better performance
    moduleInstances.uiManager.enableHardwareAcceleration();
    
    // Initialize icons if lucide is available
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
    
    // CRITICAL FIX: Add window focus handler to prevent UI freeze
    // When user switches apps and returns, refresh tracking state
    window.addEventListener('focus', async () => {
      console.log('🔄 [FOCUS] Window focused - refreshing tracking state...');
      try {
        const ipcMgr = moduleInstances.ipcManager;
        // Never demote a live / starting timer on focus flicker
        if (ipcMgr?.startInProgress || ipcMgr?.optimisticMode) {
          console.log('⚡ [FOCUS] Start in progress — skipping focus sync');
          return;
        }

        // Force re-fetch tracking state from main process
        let trackingState = await ipcRenderer.invoke('get-tracking-state');
        console.log('✅ [FOCUS] Tracking state refreshed:', trackingState);

        // PAYROLL CRITICAL: if UI thinks we are tracking but one focus read says stopped,
        // confirm once more before flipping the timer off (matches Adil Windows silent-stop).
        // A confirmed second "not tracking" is treated as a real stop and allowed through.
        if (
          !trackingState?.isTracking &&
          ipcMgr?.isTracking &&
          (ipcMgr.currentTimeLogId || window.__lastTrackingStartTime)
        ) {
          await new Promise((r) => setTimeout(r, 400));
          const confirmState = await ipcRenderer.invoke('get-tracking-state');
          console.warn('⚠️ [FOCUS] Confirming not-tracking after mismatch:', confirmState);
          if (confirmState?.isTracking) {
            trackingState = confirmState;
          } else {
            trackingState = confirmState || trackingState;
          }
        }
        
        // Update UI to reflect current state
        if (ipcMgr) {
          await ipcMgr.updateTrackingState(trackingState);
        }
        
        // CRITICAL FIX: Update button states based on tracking state, not blanket re-enable
        // The previous code was re-enabling ALL buttons which broke the Stop button disabled state
        if (moduleInstances.uiManager) {
          const status = trackingState?.isTracking ? 'active' : 'stopped';
          moduleInstances.uiManager.setTrackingStatus(status);
        }
        
        console.log('✅ [FOCUS] UI refresh complete');
      } catch (error) {
        console.error('❌ [FOCUS] Failed to refresh state:', error);
      }
    });
    
    // CRITICAL: Always hide startup overlay after successful init
    try {
      const overlay = document.getElementById('startupOverlay');
      if (overlay) {
        overlay.style.opacity = '0';
        setTimeout(() => { overlay.style.display = 'none'; }, 300);
      }
    } catch (_) {}
    
    console.log('✅ Modular Renderer initialized successfully');
    
  } catch (error) {
    console.error('❌ Failed to initialize Modular Renderer:', error);
    console.error('❌ Error message:', error.message);
    console.error('❌ Error stack:', error.stack);
    console.error('❌ Current modules state:', {
      AuthManager: typeof AuthManager,
      UIManager: typeof UIManager,
      NotificationManager: typeof NotificationManager,
      IPCManager: typeof IPCManager,
      moduleInstances: Object.keys(moduleInstances)
    });
    // Fallback to basic functionality (non-destructive overlay, never wipes body)
    showBasicErrorInterface(error);
  } finally {
    // SAFETY NET: Always ensure startup overlay is hidden, even on error
    try {
      const overlay = document.getElementById('startupOverlay');
      if (overlay && overlay.style.display !== 'none') {
        overlay.style.opacity = '0';
        setTimeout(() => { try { overlay.style.display = 'none'; } catch(_){} }, 500);
      }
    } catch (_) {}
  }
  });
} else {
  console.warn('[BOOT] DOMContentLoaded init listener already attached — skipping');
}

/** Poll + UI for OS permissions on the login screen (macOS gates sign-in until OK). */
let loginPermPollInterval = null;

function setupLoginOsAccessPanel() {
  const panel = document.getElementById('loginOsAccessPanel');
  if (!panel) return;

  const toggle = document.getElementById('loginOsAccessToggle');
  const summaryEl = document.getElementById('loginOsAccessSummary');
  const screenEl = document.getElementById('loginPermScreen');
  const accessEl = document.getElementById('loginPermAccess');
  const screenLabel = document.getElementById('loginPermScreenLabel');
  const accessLabel = document.getElementById('loginPermAccessLabel');
  const refreshBtn = document.getElementById('loginPermRefresh');
  const requestBtn = document.getElementById('loginPermRequest');
  const shortcuts = document.getElementById('loginPlatformShortcuts');
  const shortcutsLabel = document.getElementById('loginPlatformShortcutsLabel');
  const blockMsg = document.getElementById('loginPermBlockMsg');
  const loginBtn = document.getElementById('loginBtn');

  /** darwin only: last known “both permissions OK” — used to collapse once when user fixes access */
  let lastDarwinPermOk = null;

  toggle?.addEventListener('click', () => {
    panel.classList.toggle('collapsed');
    const collapsed = panel.classList.contains('collapsed');
    toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  });

  if (screenLabel && accessLabel) {
    if (process.platform === 'darwin') {
      screenLabel.textContent = 'Screen Recording';
      accessLabel.textContent = 'Accessibility';
    } else if (process.platform === 'win32') {
      screenLabel.textContent = 'Screen / window capture';
      accessLabel.textContent = 'Privacy & input';
    } else {
      screenLabel.textContent = 'Display session';
      accessLabel.textContent = 'Accessibility (AT-SPI)';
    }
  }

  const setRow = (el, ok) => {
    if (!el) return;
    el.textContent = ok ? 'OK' : 'Not detected';
    el.style.color = ok ? '#15803d' : '#b45309';
  };

  const applyMacGate = (perm) => {
    if (process.platform !== 'darwin') {
      if (blockMsg) blockMsg.classList.add('hidden');
      if (loginBtn) {
        loginBtn.disabled = false;
        loginBtn.removeAttribute('title');
      }
      return;
    }
    const ok = !!(perm && perm.screen && perm.accessibility);
    if (blockMsg) blockMsg.classList.toggle('hidden', ok);
    if (loginBtn) {
      // Never hard-block login on permission probe mismatch.
      // Permission enforcement happens at tracking start and via explicit permission requests.
      loginBtn.disabled = false;
      loginBtn.title = ok ? '' : 'Permissions may be missing. You can still log in, then grant access from the app.';
    }
  };

  const syncLoginOsAccessChrome = (perm, permError) => {
    if (summaryEl) {
      if (permError) {
        summaryEl.textContent =
          process.platform === 'darwin'
            ? 'Could not verify permissions · tap to retry'
            : 'Could not verify · tap to expand';
      } else if (process.platform === 'darwin') {
        const ok = !!(perm && perm.screen && perm.accessibility);
        summaryEl.textContent = ok
          ? 'Screen & Accessibility OK'
          : 'Optional setup — expand to grant access';
      } else {
        const s = perm?.screen;
        const a = perm?.accessibility;
        if (s && a) summaryEl.textContent = 'Permissions look fine · tap for shortcuts';
        else if (s || a) summaryEl.textContent = 'One item may need attention · tap to review';
        else summaryEl.textContent = 'Optional checks · tap for system settings';
      }
    }
    if (process.platform === 'darwin' && toggle && !permError && perm) {
      const ok = !!(perm.screen && perm.accessibility);
      if (ok && lastDarwinPermOk === false) {
        panel.classList.add('collapsed');
        toggle.setAttribute('aria-expanded', 'false');
      }
      lastDarwinPermOk = ok;
    }
  };

  const updateLoginPermUI = async () => {
    try {
      const perm = await ipcRenderer.invoke('check-permissions');
      setRow(screenEl, !!perm.screen);
      setRow(accessEl, !!perm.accessibility);
      applyMacGate(perm);
      syncLoginOsAccessChrome(perm, null);
    } catch (e) {
      console.warn('[LOGIN-PERM] check-permissions failed:', e?.message || e);
      if (screenEl) {
        screenEl.textContent = '?';
        screenEl.style.color = '#64748b';
      }
      if (accessEl) {
        accessEl.textContent = '?';
        accessEl.style.color = '#64748b';
      }
      if (process.platform === 'darwin' && loginBtn) {
        loginBtn.disabled = false;
        loginBtn.title = 'Could not verify permissions right now. You can still log in and retry access checks.';
      }
      syncLoginOsAccessChrome(null, e);
      if (process.platform === 'darwin' && toggle) {
        panel.classList.remove('collapsed');
        toggle.setAttribute('aria-expanded', 'true');
        lastDarwinPermOk = null;
      }
    }
  };

  refreshBtn?.addEventListener('click', () => {
    void (async () => {
      try {
        const perm = await ipcRenderer.invoke('check-permissions', { deepCheck: true });
        setRow(screenEl, !!perm.screen);
        setRow(accessEl, !!perm.accessibility);
        applyMacGate(perm);
        syncLoginOsAccessChrome(perm, null);
      } catch (e) {
        console.warn('[LOGIN-PERM] deep check-permissions failed:', e?.message || e);
        void updateLoginPermUI();
      }
    })();
  });

  requestBtn?.addEventListener('click', async () => {
    try {
      await ipcRenderer.invoke('request-permissions');
    } catch (e) {
      console.warn('[LOGIN-PERM] request-permissions failed:', e?.message || e);
    }
    setTimeout(() => void updateLoginPermUI(), 600);
    setTimeout(() => void updateLoginPermUI(), 2000);
    setTimeout(() => void updateLoginPermUI(), 5000);
  });

  if (shortcuts && ['darwin', 'win32', 'linux'].includes(process.platform)) {
    shortcuts.classList.add('visible');
    if (shortcutsLabel) {
      if (process.platform === 'win32') shortcutsLabel.textContent = 'Open Windows settings';
      else if (process.platform === 'linux') shortcutsLabel.textContent = 'Open Linux settings';
      else shortcutsLabel.textContent = 'Open macOS privacy panes';
    }
    const btnLabels = {
      darwin: { screen: 'Screen Recording', access: 'Accessibility', extra: 'Automation' },
      win32: { screen: 'Graphics capture', access: 'Ease of Access', extra: 'Privacy' },
      linux: { screen: 'Privacy & screen', access: 'Accessibility', extra: 'Applications' },
    };
    const bl = btnLabels[process.platform] || btnLabels.darwin;
    shortcuts.querySelectorAll('[data-role="screen"]').forEach((b) => { b.textContent = bl.screen; });
    shortcuts.querySelectorAll('[data-role="access"]').forEach((b) => { b.textContent = bl.access; });
    shortcuts.querySelectorAll('[data-role="extra"]').forEach((b) => { b.textContent = bl.extra; });
    shortcuts.querySelectorAll('[data-pane]').forEach((btn) => {
      btn.addEventListener('click', () => {
        ipcRenderer.invoke('open-system-settings', { pane: btn.dataset.pane }).catch(() => {});
      });
    });
  }

  void updateLoginPermUI();

  if (loginPermPollInterval) clearInterval(loginPermPollInterval);
  loginPermPollInterval = setInterval(() => {
    const loginContainer = document.getElementById('loginContainer');
    if (!loginContainer || loginContainer.style.display === 'none') return;
    void updateLoginPermUI();
  }, 4000);
}

// === LEGACY EVENT LISTENERS ===
function setupLegacyEventListeners() {
  if (window.__legacyListenersSetup) {
    console.warn('[BOOT] Legacy event listeners already set up — skipping');
    return;
  }
  window.__legacyListenersSetup = true;
  // Login form submission
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.removeEventListener('submit', handleLogin); // Remove any existing listeners
    loginForm.addEventListener('submit', handleLogin);
  }
  
  // Copy Logs button
  const copyLogsBtn = document.getElementById('copyLogsBtn');
  if (copyLogsBtn) {
    copyLogsBtn.addEventListener('click', async () => {
      if (moduleInstances.ipcManager) {
        await moduleInstances.ipcManager.copyLogsToClipboard();
      }
    });
  }

  setupLoginOsAccessPanel();

  const platformPrivacyShortcuts = document.getElementById('platformPrivacyShortcuts');
  if (platformPrivacyShortcuts && ['darwin', 'win32', 'linux'].includes(process.platform)) {
    const label = platformPrivacyShortcuts.querySelector('.platform-privacy-shortcuts-label');
    if (label) {
      if (process.platform === 'win32') label.textContent = 'Windows privacy';
      else if (process.platform === 'linux') label.textContent = 'Linux settings';
      else label.textContent = 'macOS permissions';
    }
    const btnLabels = {
      darwin: { screen: 'Screen Recording', access: 'Accessibility', extra: 'Automation' },
      win32: { screen: 'Graphics capture', access: 'Ease of Access', extra: 'Privacy' },
      linux: { screen: 'Privacy & screen', access: 'Accessibility', extra: 'Applications' },
    };
    const bl = btnLabels[process.platform] || btnLabels.darwin;
    platformPrivacyShortcuts.querySelectorAll('[data-role="screen"]').forEach((b) => {
      b.textContent = bl.screen;
    });
    platformPrivacyShortcuts.querySelectorAll('[data-role="access"]').forEach((b) => {
      b.textContent = bl.access;
    });
    platformPrivacyShortcuts.querySelectorAll('[data-role="extra"]').forEach((b) => {
      b.textContent = bl.extra;
    });

    platformPrivacyShortcuts.removeAttribute('hidden');
    platformPrivacyShortcuts.style.display = 'flex';
    platformPrivacyShortcuts.querySelectorAll('[data-pane]').forEach((btn) => {
      btn.addEventListener('click', () => {
        ipcRenderer.invoke('open-system-settings', { pane: btn.dataset.pane });
      });
    });
  }

  // Logout button
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.removeEventListener('click', handleLogout);
    logoutBtn.addEventListener('click', handleLogout);
  }
  
  // Start tracking button
  const startBtn = document.getElementById('trackerStartBtn'); // Fixed: use correct ID from HTML
  if (startBtn) {
    console.log('✅ [RENDERER] Start button found and event listener attached');
    startBtn.addEventListener('click', async () => {
      // T0: Click handler invocation
      console.time('T0-T2: Total renderer time');
      console.log('🚀 [RENDERER] Start button clicked! T0:', new Date().toISOString());
      const projectSelect = document.getElementById('projectSelect');
      const projectId = projectSelect ? projectSelect.value : null;
      console.log('📋 [RENDERER] Selected project ID:', projectId);

      if (!projectId) {
        console.warn('⚠️ [RENDERER] No project selected');
        moduleInstances.notificationManager?.showNotification?.(
          'Please select a project before starting the timer',
          'warning',
        );
        console.timeEnd('T0-T2: Total renderer time');
        return;
      }
      
      if (moduleInstances.ipcManager) {
        try {
          console.log('🔄 [RENDERER] Calling startTracking via IPC...');
          await moduleInstances.ipcManager.startTracking(projectId);
          console.timeEnd('T0-T2: Total renderer time');
        } catch (error) {
          console.error('❌ [RENDERER] Start tracking failed:', error);
          console.timeEnd('T0-T2: Total renderer time');
          moduleInstances.notificationManager.showNotification('Failed to start tracking', 'error');
        }
      } else {
        console.error('❌ [RENDERER] IPC Manager not available');
        console.timeEnd('T0-T2: Total renderer time');
      }
    });
  } else {
    console.error('❌ [RENDERER] Start button not found - check HTML element ID');
  }
  
  // Stop tracking button
  const stopBtn = document.getElementById('trackerStopBtn'); // Fixed: use correct ID from HTML
  if (stopBtn) {
    console.log('✅ [RENDERER] Stop button found and event listener attached');
    stopBtn.addEventListener('click', async () => {
      console.log('⏹️ [RENDERER] Stop button clicked!');
      if (moduleInstances.ipcManager) {
        try {
          console.log('🔄 [RENDERER] Calling stopTracking via IPC...');
          await moduleInstances.ipcManager.stopTracking();
        } catch (error) {
          console.error('❌ [RENDERER] Stop tracking failed:', error);
          moduleInstances.notificationManager.showNotification('Failed to stop tracking', 'error');
        }
      } else {
        console.error('❌ [RENDERER] IPC Manager not available');
      }
    });
  } else {
    console.error('❌ [RENDERER] Stop button not found - check HTML element ID');
  }

  // Pause tracking button (Time Tracker page)
  const pauseBtn = document.getElementById('trackerPauseBtn');
  if (pauseBtn) {
    console.log('✅ [RENDERER] Pause button found and event listener attached');
    pauseBtn.addEventListener('click', async () => {
      console.log('⏸️ [RENDERER] Pause button clicked!');
      if (moduleInstances.ipcManager) {
        try {
          console.log('🔄 [RENDERER] Calling pauseTracking via IPC...');
          await moduleInstances.ipcManager.pauseTracking();
        } catch (error) {
          console.error('❌ [RENDERER] Pause tracking failed:', error);
          moduleInstances.notificationManager.showNotification('Failed to pause tracking', 'error');
        }
      } else {
        console.error('❌ [RENDERER] IPC Manager not available');
      }
    });
  } else {
    console.error('❌ [RENDERER] Pause button not found - check HTML element ID');
  }

  // Monthly Report refresh button
  const monthlyReportRefreshBtn = document.getElementById('monthlyReportRefreshBtn');
  if (monthlyReportRefreshBtn) {
    monthlyReportRefreshBtn.addEventListener('click', async () => {
      console.log('[RENDERER] Monthly report refresh clicked');
      monthlyReportRefreshBtn.classList.add('spinning');
      try {
        if (moduleInstances.uiManager && moduleInstances.uiManager.loadMonthlyReport) {
          await moduleInstances.uiManager.loadMonthlyReport(true); // forceRefresh
        }
      } catch (err) {
        console.error('[RENDERER] Monthly report refresh failed:', err);
      }
      monthlyReportRefreshBtn.classList.remove('spinning');
    });
  }

  // Dashboard buttons fallback wiring (if present on dashboard page)
  const dashboardStopBtn = document.getElementById('stopBtn');
  if (dashboardStopBtn) {
    dashboardStopBtn.addEventListener('click', async () => {
      console.log('⏹️ [RENDERER] Dashboard Stop clicked');
      if (moduleInstances.ipcManager) {
        try { await moduleInstances.ipcManager.stopTracking(); } catch {}
      }
    });
  }

  const dashboardPauseBtn = document.getElementById('pauseBtn');
  if (dashboardPauseBtn) {
    dashboardPauseBtn.addEventListener('click', async () => {
      console.log('⏸️ [RENDERER] Dashboard Pause clicked');
      if (moduleInstances.ipcManager) {
        try { await moduleInstances.ipcManager.pauseTracking(); } catch {}
      }
    });
  }
  
  // Project selection change handler - enables/disables timer buttons
  const projectSelect = document.getElementById('projectSelect');
  if (projectSelect) {
    projectSelect.addEventListener('change', handleProjectSelection);
    try { window.initProjectDropdown?.(); } catch (_) {}
    console.log('✅ Project selection event listener added');
  }
  
  console.log('✅ Legacy event listeners set up');
}

// === ERROR FALLBACK ===
function showBasicErrorInterface(error) {
  // CRITICAL: Never wipe document.body.innerHTML - it destroys the login form and startup overlay.
  // Instead, hide the startup overlay and show a non-destructive error overlay on top.
  try {
    const overlay = document.getElementById('startupOverlay');
    if (overlay) overlay.style.display = 'none';
  } catch (_) {}
  
  // Remove any previous error overlay
  try {
    const prev = document.getElementById('initErrorOverlay');
    if (prev) prev.remove();
  } catch (_) {}

  const errDiv = document.createElement('div');
  errDiv.id = 'initErrorOverlay';
  errDiv.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(248,250,252,0.97);display:flex;align-items:center;justify-content:center;z-index:20000;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;';
  errDiv.innerHTML = `
    <div style="background:white;padding:40px;border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,0.1);max-width:500px;text-align:center;">
      <div style="font-size:48px;margin-bottom:20px;">⚠️</div>
      <h2 style="color:#dc2626;margin-bottom:16px;">Initialization Error</h2>
      <p style="color:#64748b;margin-bottom:20px;">
        The application failed to initialize properly. Please restart the application.
      </p>
      <details style="text-align:left;margin-top:20px;">
        <summary style="cursor:pointer;color:#3b82f6;">Technical Details</summary>
        <pre style="background:#f1f5f9;padding:12px;border-radius:6px;margin-top:8px;font-size:12px;overflow:auto;max-height:200px;">${(error.stack || error.message || String(error)).replace(/</g, '&lt;')}</pre>
      </details>
      <button onclick="location.reload()" style="background:#3b82f6;color:white;border:none;padding:12px 24px;border-radius:6px;font-size:14px;cursor:pointer;margin-top:20px;">Restart Application</button>
    </div>
  `;
  document.body.appendChild(errDiv);
}

// === ENHANCED SCREENSHOT FUNCTIONALITY ===
function isPageSectionActive(pageEl) {
    return !!(pageEl && pageEl.classList.contains('active'));
}

async function loadRecentScreenshots(options = {}) {
    const notify = options.notify === true;
    const debounceMs = notify ? 300 : 5000;
    console.log('📸 [DEBUG] loadRecentScreenshots() called', { notify });
    // Debounce rapid calls (e.g. screenshot every 1 min should not spam reloads/toasts)
    window.__lastLoadRecentScreenshots = window.__lastLoadRecentScreenshots || 0;
    const now = Date.now();
    if (now - window.__lastLoadRecentScreenshots < debounceMs) {
        console.log('🕒 [DEBUG] loadRecentScreenshots debounced');
        return;
    }
    window.__lastLoadRecentScreenshots = now;
    
    const screenshotDate = document.getElementById('screenshotDate');
    const activityFilter = document.getElementById('activityFilter');
    const limitSelect = document.getElementById('limitSelect');
    
    console.log('🔍 [DEBUG] Form elements found:', {
        screenshotDate: !!screenshotDate,
        activityFilter: !!activityFilter,
        limitSelect: !!limitSelect
    });
    
    const selectedDate = screenshotDate ? screenshotDate.value : localDateIso();
    const selectedActivity = activityFilter ? activityFilter.value : 'all';
    const selectedLimit = limitSelect ? parseInt(limitSelect.value) : 50;
    
    console.log('🔍 [DEBUG] Query parameters:', {
        selectedDate,
        selectedActivity,
        selectedLimit,
        userId: moduleInstances.authManager?.currentUser?.id
    });
    
    try {
        if (notify) {
            moduleInstances.notificationManager?.showNotification('Loading screenshots...', 'info', 2000);
        }

        if (!moduleInstances.authManager?.currentUser) {
            console.error('❌ [DEBUG] No current user found');
            if (notify) {
                moduleInstances.notificationManager?.showNotification('Please log in to view screenshots', 'error');
            }
            return;
        }
        
        console.log('📡 [DEBUG] Making IPC call to fetch-screenshots-enhanced...');

        // Check if we should bypass cache
        const bypassCache = window.screenshotCacheBypass || false;
        if (bypassCache) {
            console.log('🔄 [CACHE_BYPASS] Forcing fresh fetch due to recent screenshot save');
            window.screenshotCacheBypass = false; // Reset flag
        }

        // Fetch screenshots with enhanced options
        const response = await ipcRenderer.invoke('fetch-screenshots-enhanced', {
            user_id: moduleInstances.authManager.currentUser.id,
            date: selectedDate,
            activity_filter: selectedActivity,
            limit: selectedLimit,
            bypass_cache: bypassCache
        });

        console.log('📡 [DEBUG] IPC response received:', {
            success: response?.success,
            screenshotCount: response?.screenshots?.length || 0,
            duplicateCount: response?.duplicates?.length || 0,
            error: response?.error
        });

        // Handle the new response format: { success: true, screenshots: [...], duplicates: [...] }
        const screenshots = response && response.success ? response.screenshots : [];
        const duplicates = response && response.success ? response.duplicates || [] : [];
        
        displayEnhancedScreenshots(screenshots, duplicates);
        
        if (notify) {
            if (screenshots && screenshots.length > 0) {
                let message = `Loaded ${screenshots.length} screenshots`;
                if (duplicates.length > 0) {
                    message += ` (${duplicates.length} duplicates detected)`;
                }
                moduleInstances.notificationManager?.showNotification(message, 'success');
            } else {
                moduleInstances.notificationManager?.showNotification('No screenshots found for selected date and filters', 'info');
            }
        }

    } catch (error) {
        console.error('❌ Error loading screenshots:', error);

        // Handle specific error types
        if (error.message?.includes('permission') || error.message?.includes('screen recording')) {
            if (notify) {
                moduleInstances.notificationManager?.showNotification('Screenshot permission required. Please enable screen recording in System Preferences.', 'warning');
            }
            
            // Show permission help in the grid
            const screenshotsGrid = document.getElementById('screenshotsGrid');
            if (screenshotsGrid) {
                screenshotsGrid.innerHTML = `
                    <div style="grid-column: 1 / -1; text-align: center; padding: 40px;">
                        <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 20px; max-width: 500px; margin: 0 auto;">
                            <i data-lucide="alert-triangle" style="width: 48px; height: 48px; color: #f59e0b; margin-bottom: 16px;"></i>
                            <h3 style="color: #92400e; margin-bottom: 12px;">Screen Recording Permission Required</h3>
                            <p style="color: #78350f; margin-bottom: 16px;">To capture screenshots, please enable screen recording permission:</p>
                            <ol style="text-align: left; color: #78350f; margin: 0 auto; max-width: 400px;">
                                <li>Open System Preferences → Security & Privacy</li>
                                <li>Click the Privacy tab</li>
                                <li>Select Screen Recording from the left sidebar</li>
                                <li>Check the box next to TimeFlow</li>
                                <li>Restart the application</li>
                            </ol>
                        </div>
                    </div>
                `;
                if (typeof lucide !== 'undefined') lucide.createIcons();
            }
        } else if (error.message?.includes('not authenticated')) {
            if (notify) {
                moduleInstances.notificationManager?.showNotification('Please log in to view screenshots', 'error');
            }
            displayEnhancedScreenshots([], []);
        } else {
            // Generic error handling
            if (notify) {
                moduleInstances.notificationManager?.showNotification('Failed to load screenshots. Please try again.', 'error');
            }
            displayEnhancedScreenshots([], []);
        }
    }
}

function displayEnhancedScreenshots(screenshots, duplicates = []) {
    console.log('🔍 [DEBUG] displayEnhancedScreenshots called with:', screenshots?.length || 0, 'screenshots');
    
    // Immediate check for image URLs
    if (screenshots && screenshots.length > 0) {
        console.log('🖼️ [IMAGE-DEBUG] First 5 screenshot URLs:');
        screenshots.slice(0, 5).forEach((s, i) => {
            console.log(`  ${i}: ${s.image_url} (captured: ${s.captured_at})`);
        });
    }
    
    const screenshotsPage = document.getElementById('screenshotsPage');
    console.log('🔍 [DEBUG] screenshotsPage element found:', !!screenshotsPage);
    
    if (!screenshotsPage) {
        console.error('❌ [DEBUG] screenshotsPage element not found!');
        return;
    }

    // Preserve currently selected date or use today - make sure we don't lose user's selection
    const existingDateInput = document.getElementById('screenshotDate');
    let currentDate = localDateIso();
    
    // If user has already selected a date, preserve it
    if (existingDateInput && existingDateInput.value) {
        currentDate = existingDateInput.value;
        console.log('📅 Preserving selected date:', currentDate);
    }

    // Build enhanced filter controls and display
    let screenshotHTML = `
        <div class="control-section">
            <div class="control-header">
                <div class="control-title">Screenshots</div>
                <div class="control-subtitle">View your activity screenshots with advanced filters</div>
            </div>
            
            <!-- Enhanced Filter Controls -->
            <div style="background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 16px;">
                    <div>
                        <label style="display: block; font-size: 14px; font-weight: 500; color: #374151; margin-bottom: 6px;">Date <span style="font-weight: 400; color: #94a3b8;">(Pacific Time)</span></label>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <button id="prevDateBtn" style="background: #f3f4f6; border: 1px solid #d1d5db; border-radius: 6px; padding: 6px; cursor: pointer;">
                                <i data-lucide="chevron-left" style="width: 16px; height: 16px;"></i>
                            </button>
                            <input type="date" id="screenshotDate" value="${currentDate}" 
                                   title="Work day in Pacific Time"
                                   style="flex: 1; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px;">
                            <button id="nextDateBtn" style="background: #f3f4f6; border: 1px solid #d1d5db; border-radius: 6px; padding: 6px; cursor: pointer;">
                                <i data-lucide="chevron-right" style="width: 16px; height: 16px;"></i>
                            </button>
                        </div>
                    </div>
                    
                    <div>
                        <label style="display: block; font-size: 14px; font-weight: 500; color: #374151; margin-bottom: 6px;">Activity Level</label>
                        <select id="activityFilter" style="width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px;" onchange="loadRecentScreenshots()">
                            <option value="all">All Activity Levels</option>
                            <option value="high">High Activity (70%+)</option>
                            <option value="medium">Medium Activity (10-70%)</option>
                            <option value="low">Low Activity (0-10%)</option>
                        </select>
                    </div>
                    
                    <div>
                        <label style="display: block; font-size: 14px; font-weight: 500; color: #374151; margin-bottom: 6px;">Show Count</label>
                        <select id="limitSelect" style="width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px;" onchange="loadRecentScreenshots()">
                            <option value="20">20 screenshots</option>
                            <option value="50" selected>50 screenshots</option>
                            <option value="100">100 screenshots</option>
                            <option value="200">200 screenshots</option>
                        </select>
                    </div>
                    
                    <div>
                        <label style="display: block; font-size: 14px; font-weight: 500; color: #374151; margin-bottom: 6px;">Quick Actions</label>
                        <button onclick="loadRecentScreenshots({ notify: true })" style="width: 100%; background: #3b82f6; color: white; border: none; padding: 8px 12px; border-radius: 6px; font-size: 14px; cursor: pointer;">
                            <i data-lucide="refresh-cw" style="width: 16px; height: 16px; margin-right: 6px;"></i>
                            Refresh
                        </button>
                    </div>
                </div>
                
                ${duplicates.length > 0 ? `
                <div style="background: #f0f9ff; border: 1px solid #0ea5e9; border-radius: 8px; padding: 12px; margin-top: 16px;">
                    <div style="display: flex; align-items: center; gap: 8px; color: #0369a1;">
                        <i data-lucide="copy-check" style="width: 16px; height: 16px;"></i>
                        <span style="font-weight: 500;">Duplicate Detection</span>
                    </div>
                    <p style="color: #0369a1; font-size: 14px; margin-top: 4px; margin-bottom: 0;">
                        Loaded ${screenshots.length} screenshots (${duplicates.length} duplicates detected)
                    </p>
                </div>
                ` : ''}
            </div>
    `;

    if (!screenshots || screenshots.length === 0) {
        screenshotHTML += `
            <div style="text-align: center; padding: 60px 40px; background: white; border: 1px solid #e2e8f0; border-radius: 12px;">
                <i data-lucide="camera" style="width: 64px; height: 64px; color: #94a3b8; margin-bottom: 24px;"></i>
                <h3 style="color: #64748b; margin-bottom: 12px; font-size: 18px;">No screenshots found</h3>
                <p style="color: #94a3b8; font-size: 14px;">Try adjusting your filters or selecting a different date</p>
            </div>
        `;
    } else {
        // Build screenshot grid with enhanced details
        screenshotHTML += `
            <div style="background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px;">
                <div style="display: flex; justify-between; align-items: center; margin-bottom: 20px;">
                    <h3 style="margin: 0; color: #374151; font-size: 16px; font-weight: 600;">
                        Activity Screenshots (${screenshots.length} found)
                    </h3>
                    <div style="font-size: 14px; color: #6b7280;">
                        Average Activity: ${Math.round(screenshots.reduce((sum, s) => sum + (s.activity_percent || 0), 0) / screenshots.length)}%
                    </div>
                </div>
                
                <div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 20px;" id="screenshotGrid">
        `;
        
        console.log('🔍 [SCREENSHOT-DEBUG] All screenshot URLs:', screenshots.map(s => ({ id: s.id, url: s.image_url, time: s.captured_at })));
        screenshots.forEach((screenshot, index) => {
            const capturedAt = new Date(screenshot.captured_at);
            const timeString = capturedAt.toLocaleTimeString('en-US', { 
                hour12: false, 
                hour: '2-digit', 
                minute: '2-digit', 
                second: '2-digit' 
            });
            
            const activityPercent = screenshot.activity_percent || 0;
            const focusPercent = screenshot.focus_percent || 0;
            const isDuplicate = Array.isArray(duplicates) ? duplicates.includes(screenshot.id) : false;
            
            // Activity level color
            let activityColor = '#10b981'; // green
            let activityLevel = 'High';
            if (activityPercent < 10) { activityColor = '#ef4444'; activityLevel = 'Low'; }
            else if (activityPercent < 70) { activityColor = '#f59e0b'; activityLevel = 'Medium'; }
            
                        screenshotHTML += `
                <div class="screenshot-item" style="
                    background: white; 
                    border: 1px solid ${isDuplicate ? '#f59e0b' : '#e2e8f0'}; 
                    border-radius: 16px; 
                    overflow: hidden;
                    transition: all 0.2s; 
                    cursor: pointer;
                    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
                    display: flex;
                    flex-direction: column;
                    height: 100%;
                    ${isDuplicate ? 'box-shadow: 0 0 0 2px #fef3c7;' : ''}
                " 
                     onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 8px 25px rgba(0,0,0,0.15)'" 
                     onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='${isDuplicate ? '0 0 0 2px #fef3c7' : '0 1px 3px rgba(0, 0, 0, 0.1)'}'"
                     onclick="openScreenshot('${screenshot.image_url}')">
                    
                    ${isDuplicate ? `
                    <div style="background: #fef3c7; color: #92400e; padding: 8px; font-size: 12px; font-weight: 500; text-align: center; border-bottom: 1px solid #fcd34d;">
                        <i data-lucide="copy-check" style="width: 12px; height: 12px; margin-right: 4px;"></i>
                        Duplicate Detected
                    </div>
                    ` : ''}
                    
                    <!-- Wide frame so dual-monitor stitched shots are fully visible -->
                    <div style="width: 100%; aspect-ratio: 32/10; background: #f8fafc; position: relative; overflow: hidden;">
                        <img src="${screenshot.image_url}" 
                             alt="Screenshot ${index + 1}" 
                             style="width: 100%; height: 100%; object-fit: contain; display: block; background: #f1f5f9;"
                             onload="console.log('✅ Image loaded successfully:', '${screenshot.image_url}');"
                             onerror="this.onerror=null; this.style.display='none'; this.parentElement.innerHTML='<div style=\'display: flex; align-items: center; justify-content: center; height: 100%; color: #94a3b8; font-size: 32px;\'>📸</div>';">
                    </div>
                    
                    <!-- Info section below image -->
                    <div style="padding: 16px; flex: 1; display: flex; flex-direction: column; justify-content: space-between;">
                        <div>
                            <div style="font-size: 16px; color: #111827; font-weight: 600; margin-bottom: 8px;">${timeString}</div>
                            <div style="font-size: 13px; color: #6b7280; margin-bottom: 12px; line-height: 1.4;">
                                Focus: ${focusPercent}% · Clicks: ${screenshot.mouse_clicks || 0} · Keys: ${screenshot.keystrokes || 0} · Moves: ${screenshot.mouse_movements || 0}
                            </div>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="display: inline-flex; align-items: center; padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: 600; background: ${activityColor}; color: white;">
                                ${activityLevel}
                            </span>
                            <button onclick="event.stopPropagation(); requestDeleteScreenshot('${screenshot.id}')"
                                    title="Delete screenshot (time will be deducted)"
                                    style="background: transparent; border: 1px solid #e2e8f0; border-radius: 8px; padding: 6px; cursor: pointer; color: #94a3b8; transition: all 0.2s;"
                                    onmouseover="this.style.background='#fef2f2'; this.style.borderColor='#fca5a5'; this.style.color='#ef4444';"
                                    onmouseout="this.style.background='transparent'; this.style.borderColor='#e2e8f0'; this.style.color='#94a3b8';">
                                <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        });

        screenshotHTML += `
                </div>
            </div>
        `;
    }
    
    screenshotHTML += `</div>`;

    screenshotsPage.innerHTML = screenshotHTML;
    
    // Remove any existing event listeners to prevent duplicates
    const prevDateBtn = document.getElementById('prevDateBtn');
    const nextDateBtn = document.getElementById('nextDateBtn');
    const screenshotDateInput = document.getElementById('screenshotDate');
    
    // Use removeEventListener first to ensure no duplicates, then add clean listeners
    if (prevDateBtn) {
        // Remove any existing listeners (clone node to clear all listeners)
        const newPrevBtn = prevDateBtn.cloneNode(true);
        prevDateBtn.parentNode.replaceChild(newPrevBtn, prevDateBtn);
        
        newPrevBtn.addEventListener('click', () => {
            console.log('📅 Previous date button clicked');
            navigateDate(-1);
        });
    }
    
    if (nextDateBtn) {
        // Remove any existing listeners (clone node to clear all listeners)
        const newNextBtn = nextDateBtn.cloneNode(true);
        nextDateBtn.parentNode.replaceChild(newNextBtn, nextDateBtn);
        
        newNextBtn.addEventListener('click', () => {
            console.log('📅 Next date button clicked');
            navigateDate(1);
        });
    }
    
    if (screenshotDateInput) {
        // Remove any existing listeners (clone node to clear all listeners)
        const newDateInput = screenshotDateInput.cloneNode(true);
        screenshotDateInput.parentNode.replaceChild(newDateInput, screenshotDateInput);
        
        newDateInput.addEventListener('change', () => {
            console.log('📅 Date input changed:', newDateInput.value);
            loadRecentScreenshots();
        });
    }
    
    // Recreate icons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

function openScreenshot(imageUrl) {
    if (imageUrl) {
        window.open(imageUrl, '_blank');
    }
}

// Date navigation for screenshots
function navigateDate(direction) {
    const screenshotDate = document.getElementById('screenshotDate');
    if (!screenshotDate) {
        console.log('❌ Date navigation failed: screenshotDate element not found');
        return;
    }
    
    const currentDateStr = screenshotDate.value;
    console.log(`📅 Navigating date: ${currentDateStr} (direction: ${direction})`);
    
    // More robust date handling to prevent timezone issues
    const dateParts = currentDateStr.split('-');
    const year = parseInt(dateParts[0]);
    const month = parseInt(dateParts[1]) - 1; // Month is 0-indexed
    const day = parseInt(dateParts[2]);
    
    // Calendar-day arithmetic on the YYYY-MM-DD key (Pacific work calendar)
    const newDate = new Date(Date.UTC(year, month, day + direction));
    const newYear = newDate.getUTCFullYear();
    const newMonth = String(newDate.getUTCMonth() + 1).padStart(2, '0');
    const newDay = String(newDate.getUTCDate()).padStart(2, '0');
    const newDateStr = `${newYear}-${newMonth}-${newDay}`;

    if (newDateStr > localDateIso()) {
        console.log('❌ Cannot navigate past Pacific work-day today');
        return;
    }
    if (newDateStr < '2020-01-01') {
        console.log('❌ Cannot navigate to date before 2020');
        return;
    }
    
    console.log(`📅 Setting new date: ${newDateStr}`);
    
    screenshotDate.value = newDateStr;
    loadRecentScreenshots();
}

// Make loadRecentScreenshots available globally for ui-manager
window.loadRecentScreenshots = loadRecentScreenshots;

// Listen for screenshot save events to bypass cache (debounced — 1 min interval must not toast-spam)
let screenshotSavedRefreshTimer = null;
ipcRenderer.on('screenshot-saved', (event, data) => {
    console.log('📡 [CACHE_BYPASS] Screenshot saved event received:', data);
    window.screenshotCacheBypass = true;

    if (screenshotSavedRefreshTimer) {
        clearTimeout(screenshotSavedRefreshTimer);
    }

    screenshotSavedRefreshTimer = setTimeout(() => {
        screenshotSavedRefreshTimer = null;
        const refreshDelay = 1500;

        const screenshotsPage = document.getElementById('screenshotsPage');
        if (isPageSectionActive(screenshotsPage)) {
            console.log('🔄 [AUTO_REFRESH] Auto-refreshing screenshots page');
            setTimeout(() => loadRecentScreenshots({ notify: false }), refreshDelay);
        }

        const timetrackerPage = document.getElementById('timetrackerPage');
        if (isPageSectionActive(timetrackerPage)) {
            console.log('🔄 [AUTO_REFRESH] Auto-refreshing tracker screenshots');
            setTimeout(() => {
                moduleInstances.uiManager?.loadTrackerScreenshots?.(true);
                // Keep "This Month at a Glance" in sync when new screenshots land
                moduleInstances.uiManager?.loadMonthlyReport?.(true, { silent: true });
            }, refreshDelay);
        }

        const activityPage = document.getElementById('activity-between-screenshotsPage');
        if (isPageSectionActive(activityPage)) {
            console.log('🔄 [AUTO_REFRESH] Auto-refreshing activity monitor screenshots');
            setTimeout(() => {
                moduleInstances.uiManager?.loadScreenshotActivity?.();
                window.moduleInstances?.activityMonitor?.loadRecentScreenshots?.();
            }, refreshDelay);
        }
    }, 2000);
});

// NOTE: Toggle monitoring tools listener moved to ipc-manager.js module (lines 393-473)
// to avoid duplication and ensure proper initialization order

// Make clear functions available globally for HTML onclick
window.clearUrlList = () => {
  if (moduleInstances.ipcManager) {
    moduleInstances.ipcManager.clearUrlDetectionList();
  } else {
    console.error('❌ IPC Manager not available for clearUrlList');
  }
};

window.clearAppList = () => {
  if (moduleInstances.ipcManager) {
    moduleInstances.ipcManager.clearAppDetectionList();
  } else {
    console.error('❌ IPC Manager not available for clearAppList');
  }
};

// === GLOBAL EXPORTS FOR BROWSER CONSOLE ACCESS ===
window.RendererModules = {
  auth: () => moduleInstances.authManager,
  ui: () => moduleInstances.uiManager,
  ipc: () => moduleInstances.ipcManager,
  notifications: () => moduleInstances.notificationManager,
  supabase: () => supabaseClient,
  screenshots: {
    load: loadRecentScreenshots,
    display: displayEnhancedScreenshots,
    navigate: navigateDate,
    open: openScreenshot
  },
  urls: {
    clear: () => moduleInstances.ipcManager?.clearUrlDetectionList(),
    add: (urlData) => moduleInstances.ipcManager?.addUrlToDetectionList(urlData)
  },
  debug: {
    // Seed and summary debug functions removed to prevent fake/test data usage
    getActivityStats: async () => {
      try {
        const result = await ipcRenderer.invoke('get-activity-stats');
        console.log('📊 [DEBUG] Activity stats:', result);
        return result;
      } catch (error) {
        console.error('❌ [DEBUG] Activity stats error:', error);
        return { error: error.message };
      }
    },
    getTrackingSnapshot: async (options = {}) => {
      try {
        const result = await ipcRenderer.invoke('reports:get-tracking-snapshot', options);
        console.log('📊 [DEBUG] Tracking snapshot:', result);
        return result;
      } catch (error) {
        console.error('❌ [DEBUG] Tracking snapshot error:', error);
        return { success: false, error: error.message };
      }
    },
    getSessionSummary: async (options = {}) => {
      try {
        const result = await ipcRenderer.invoke('reports:get-session-summary', options);
        console.log('📊 [DEBUG] Session summary:', result);
        return result;
      } catch (error) {
        console.error('❌ [DEBUG] Session summary error:', error);
        return { success: false, error: error.message };
      }
    },
    refreshReports: () => {
      if (moduleInstances.uiManager) {
        return moduleInstances.uiManager.loadRecentReports();
      } else {
        console.error('❌ UI Manager not available');
      }
    },
    testReportsFlow: async () => {
      console.log('🧪 [DEBUG] Testing complete reports flow...');
      
      try {
        // Step 1: Get tracking snapshot
        const snapshot = await ipcRenderer.invoke('reports:get-tracking-snapshot', {
          limit: 5,
          timeRange: '24h'
        });
        
        console.log('✅ [DEBUG] Snapshot:', {
          success: snapshot.success,
          isTracking: snapshot.data?.session?.isTracking,
          statsCount: Object.keys(snapshot.data?.stats || {}).length,
          logsCount: snapshot.data?.logs?.items?.length || 0
        });
        
        // Step 2: Test session summary if we have a session
        if (snapshot.data?.session?.startedAt) {
          const summary = await ipcRenderer.invoke('reports:get-session-summary', {
            fromLocal: snapshot.data.session.startedAt,
            toLocal: new Date().toISOString()
          });
          
          console.log('✅ [DEBUG] Session summary:', {
            success: summary.success,
            activeSeconds: summary.data?.activeSeconds,
            totalActivity: (summary.data?.mouseMoves || 0) + (summary.data?.keyPresses || 0) + (summary.data?.mouseClicks || 0)
          });
        }
        
        // Step 3: Refresh UI
        if (moduleInstances.uiManager) {
          await moduleInstances.uiManager.loadRecentReports();
          console.log('✅ [DEBUG] UI refreshed');
        }
        
        return { success: true, message: 'Reports flow test completed' };
        
      } catch (error) {
        console.error('❌ [DEBUG] Test flow error:', error);
        return { success: false, error: error.message };
      }
    }
  }
};

// Prevent duplicate banner if script re-executes
if (!window.__rendererBannerPrinted) {
  console.log('📦 Modular Renderer loaded - Access modules via window.RendererModules');
  window.__rendererBannerPrinted = true;
}


// Manual test function for Screenshot Activity
window.testScreenshotActivity = async function() {
  console.log('🧪 Testing Screenshot Activity Monitor...');
  
  // Test 1: Check UI Manager
  console.log('1️⃣ UI Manager available:', !!window.uiManager);
  console.log('   loadScreenshotActivity method:', !!window.uiManager?.loadScreenshotActivity);
  
  // Test 2: Check IPC
  console.log('2️⃣ IPC available:', !!window.api);
  
  // Test 3: Try to load data
  console.log('3️⃣ Attempting to load screenshot activity data...');
  try {
    const result = await window.api.invoke('get-screenshot-activity');
    console.log('   Result:', result);
    console.log('   Success:', result?.success);
    console.log('   Data count:', result?.data?.length || 0);
    
    if (result?.data?.length > 0) {
      console.log('   First screenshot:', result.data[0]);
    }
  } catch (error) {
    console.error('   Error:', error);
  }
  
  // Test 4: Navigate to page
  console.log('4️⃣ Navigating to Screenshot Activity page...');
  const navItem = document.querySelector('[data-page="activity-between-screenshots"]');
  if (navItem) {
    navItem.click();
    console.log('   Clicked nav item');
  } else {
    console.log('   Nav item not found!');
  }
};

console.log('✅ Test function available: window.testScreenshotActivity()');

// Enhanced Safari URL test with comprehensive diagnostics and error handling
window.testSafariUrl = async function() {
  try {
    const ipc = (window.RendererModules?.uiManager?.ipcRenderer) || (window.electronAPI && window.electronAPI.ipcRenderer) || (window.require && window.require('electron').ipcRenderer);
    if (!ipc) {
      alert('IPC not available - ensure app is properly loaded');
      return;
    }

    // Step 1: Check automation permissions
    console.log('🔍 Checking macOS automation permissions...');
    const permissionCheck = await ipc.invoke('permissions:check-automation');
    if (!permissionCheck.automationAllowed) {
      alert(`Safari Test Failed\n\n❌ Automation permissions required:\n${permissionCheck.error || 'Please grant Automation permissions in System Settings → Privacy & Security → Automation'}`);
      return;
    }

    // Step 2: Ensure user session and current user ID are set for RLS
    console.log('🔐 Setting up authentication...');
    const supabase = window.RendererModules?.supabaseClient || window.supabaseClient || window.supabase;

    let accessToken = null, refreshToken = null, userId = null;
    try {
      if (supabase?.auth?.getSession) {
        const { data } = await supabase.auth.getSession();
        accessToken = data?.session?.access_token || null;
        refreshToken = data?.session?.refresh_token || null;
        userId = data?.session?.user?.id || null;
      } else if (supabase?.auth?.session) {
        const s = supabase.auth.session();
        accessToken = s?.access_token || null;
        refreshToken = s?.refresh_token || null;
        userId = s?.user?.id || null;
      }
    } catch (_) {}

    if (userId) {
      try {
        await ipc.invoke('set-current-user-id', userId, 'employee');
        console.log('✅ Current user ID set in main process:', userId);
      } catch (e) {
        console.log('⚠️ Failed to set current user ID:', e.message);
      }
    }

    if (accessToken) {
      try {
        await ipc.invoke('auth:set-session', { access_token: accessToken, refresh_token: refreshToken });
        console.log('✅ User session forwarded to main process');
      } catch (e) {
        console.log('⚠️ Failed to forward session:', e.message);
      }
    }

    // Ensure monitoring systems (including URL manager) are running
    try {
      await ipc.invoke('force-start-monitoring');
      console.log('✅ Monitoring systems started for testing');
    } catch (_) {}

    const testDomain = 'google.com';
    const uniqueId = Date.now();
    const testUrl = `https://www.google.com/?ts=${uniqueId}`;
    let detected = false;
    
    console.log('👂 Setting up URL detection listener...');
    const onDetected = (_e, data) => {
      const u = (data?.url || '').toLowerCase();
      if (u.includes(testDomain)) {
        detected = true;
        console.log('✅ URL detection event received:', data?.url);
        try { ipc.removeListener && ipc.removeListener('url-detected', onDetected); } catch (_) {}
      }
    };
    
    try { ipc.on && ipc.on('url-detected', onDetected); } catch (_) {}
    
    // Step 3: Open Safari
    console.log('🌐 Opening Safari with test URL...');
    const openRes = await ipc.invoke('test:open-safari-url', { url: testUrl });
    if (!openRes || openRes.success === false) {
      alert(`Failed to open Safari:\n${openRes?.error || 'Unknown error - check console'}`);
      return;
    }
    
        // Give Safari more time to load the page
    await new Promise(r => setTimeout(r, 4000));

    // Step 4: Force URL capture
    console.log('🔍 Forcing URL capture...');
    try { 
      await ipc.invoke('debug:force-url-capture'); 
      console.log('✅ URL capture invoked');
    } catch (e) { 
      console.log('⚠️ URL capture failed:', e.message);
    }
    
    await new Promise(r => setTimeout(r, 4000));
    
    // Step 5: Force immediate sync
    console.log('🔄 Forcing immediate sync...');
    const syncResult = await ipc.invoke('sync:now');
    console.log('📊 Sync result:', syncResult);
    
    await new Promise(r => setTimeout(r, 1000));
    
    // Step 6: Check database
    console.log('🗄️ Checking database for saved URL...');
    if (!supabase) {
      alert('Supabase client not available to verify DB save');
      return;
    }
    
    const now = new Date();
    const start = new Date(now); 
    start.setMinutes(start.getMinutes() - 10);
    
    const { data, error } = await supabase
      .from('url_logs')
      .select('id, url, site_url, domain, timestamp')
      .gte('timestamp', start.toISOString())
      .lte('timestamp', now.toISOString())
      .order('timestamp', { ascending: false })
      .limit(50);
    
    if (error) {
      alert(`Database query failed:\n${error.message}\n\nCheck authentication and RLS policies`);
      return;
    }
    
    const saved = (data || []).some(r => {
      const a = (r.url || '').toLowerCase();
      const b = (r.site_url || '').toLowerCase();
      const c = (r.domain || '').toLowerCase();
      return a.includes(testDomain) || b.includes(testDomain) || c.includes(testDomain);
    });
    
    // Step 7: Build comprehensive result message
    let message = `Safari Test Results\n\n✅ Permissions: OK\n🌐 Opened: ${testUrl}\n👂 Detected event: ${detected ? 'Yes' : 'No'}\n💾 Saved to DB: ${saved ? 'Yes' : 'No'}`;
    
    if (syncResult?.stats) {
      message += `\n\n📊 Sync Stats:\n• URL logs synced: ${syncResult.stats.url_logs}\n• Errors: ${syncResult.stats.errors}`;
    }
    
    // Step 8: Get diagnostic info for failures
    if (!detected || !saved) {
      console.log('🔍 Getting diagnostic information...');
      const lastError = await ipc.invoke('debug:get-last-url-error');
      if (lastError?.lastError) {
        message += `\n\n❌ Last Error:\n${lastError.lastError.message}`;
      }
      
      if (!detected && !saved) {
        message += `\n\n🔧 Troubleshooting:\n• Ensure Safari is running\n• Check System Settings → Privacy → Automation\n• Try clicking Start button first\n• Check console for detailed logs`;
      }
    }
    
    alert(message);
    
    // Step 9: Refresh URL history display
    console.log('🔄 Refreshing URL history display...');
    try { 
      window.refreshUrlHistory && window.refreshUrlHistory(); 
      console.log('✅ URL history refreshed');
    } catch (_) {
      console.log('⚠️ Could not refresh URL history display');
    }
    
  } catch (e) {
    console.error('❌ [URL-TEST] Error:', e);
    alert(`Test failed: ${e.message}\n\nCheck browser console for details`);
  }
};

// Trigger a screenshot and verify it saved to DB (uses enhanced fetch)
async function testScreenshotAndVerify() {
  try {
    console.log('🧪 [TEST] Triggering manual screenshot via IPC...');
    // Prefer direct ipcRenderer; fallback to electronAPI.invoke if present
    const invoker = (typeof ipcRenderer !== 'undefined' && ipcRenderer?.invoke)
      ? ipcRenderer.invoke.bind(ipcRenderer)
      : (window.electronAPI && window.electronAPI.invoke ? window.electronAPI.invoke : null);

    if (!invoker) {
      alert('IPC not available');
      return;
    }

    const captureResult = await invoker('capture-screenshot', { source: 'manual' });
    console.log('🧪 [TEST] Capture result:', captureResult);

    // Handle structured response from our enhanced IPC handler
    if (!captureResult) {
      alert('❌ No response from screenshot handler');
      return;
    }

    if (captureResult.skipped) {
      alert(`⚠️ Screenshot skipped: ${captureResult.reason || 'unknown reason'}\n\nNext allowed in: ${Math.ceil((captureResult.nextAllowedInMs || 0)/1000)}s`);
      return;
    }

    if (captureResult.error) {
      alert(`❌ Screenshot error: ${captureResult.error}`);
      return;
    }

    if (!captureResult.ok) {
      alert(`❌ Screenshot failed: ${captureResult.reason || 'unknown reason'}`);
      return;
    }

    console.log('✅ [TEST] Screenshot capture successful, verifying database...');

    // Wait briefly for upload/insert
    await new Promise(r => setTimeout(r, 2500));

    const todayIso = localDateIso();
    const fetchResult = await invoker('fetch-screenshots-enhanced', { date: todayIso, limit: 1 });
    console.log('🧪 [TEST] Fetch latest screenshot:', fetchResult);

    const latest = fetchResult?.screenshots?.[0];
    if (latest && latest.captured_at) {
      const capturedAt = new Date(latest.captured_at).getTime();
      const deltaSec = Math.abs(Date.now() - capturedAt) / 1000;
      if (deltaSec <= 90) {
        alert('✅ Screenshot saved to database. ID: ' + latest.id + '\nTime: ' + latest.captured_at);
      } else {
        alert('⚠️ Screenshot fetched but not recent (' + Math.round(deltaSec) + 's old). Check scheduler.');
      }
    } else {
      alert('❌ No screenshot found in database after capture.');
    }
  } catch (e) {
    console.error('❌ [TEST] Error during testScreenshotAndVerify:', e);
    alert('❌ Test failed: ' + (e.message || e));
  }
}

// Initialize CDP settings toggle listener
window.addEventListener('tf-open-cdp-settings', () => {
  try {
    ipcRenderer.invoke('open-url-capture-settings');
  } catch (error) {
    console.error('Failed to open URL capture settings', error);
  }
});

// ─── Screenshot Deletion with Time Deduction ────────────────────────────────

function formatDeductionTime(seconds) {
  if (seconds < 60) return `${seconds} sec`;
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return sec > 0 ? `${min} min ${sec} sec` : `${min} min`;
}

function getDeleteModalHTML() {
  return `
    <div id="deleteScreenshotModal" style="display:none; position:fixed; inset:0; z-index:9999; background:rgba(0,0,0,0.5); display:none; align-items:center; justify-content:center;">
      <div style="background:white; border-radius:16px; padding:32px; max-width:420px; width:90%; box-shadow:0 20px 60px rgba(0,0,0,0.3); text-align:center;">
        <div style="width:56px; height:56px; background:#fef2f2; border-radius:50%; display:flex; align-items:center; justify-content:center; margin:0 auto 16px;">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
            <line x1="12" y1="9" x2="12" y2="13"></line>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          </svg>
        </div>
        <h3 style="margin:0 0 8px; font-size:20px; font-weight:700; color:#111827;">Delete Screenshot?</h3>
        <p id="deleteModalTime" style="font-size:14px; color:#6b7280; margin:0 0 16px;"></p>
        <div style="background:#fef2f2; border:1px solid #fecaca; border-radius:10px; padding:14px; margin-bottom:20px;">
          <p id="deleteModalDeduction" style="font-size:16px; font-weight:600; color:#dc2626; margin:0 0 6px;"></p>
          <p style="font-size:13px; color:#9ca3af; margin:0;">This action cannot be undone. The time will be permanently removed from your work log.</p>
        </div>
        <div style="display:flex; gap:12px; justify-content:center;">
          <button onclick="closeDeletePopup()" style="flex:1; padding:10px 20px; border:1px solid #d1d5db; background:white; border-radius:10px; font-size:14px; font-weight:500; cursor:pointer; color:#374151;">Cancel</button>
          <button id="confirmDeleteBtn" onclick="confirmDeleteScreenshot()" style="flex:1; padding:10px 20px; border:none; background:#ef4444; color:white; border-radius:10px; font-size:14px; font-weight:600; cursor:pointer;">Delete & Deduct Time</button>
        </div>
      </div>
    </div>
  `;
}

let pendingDeleteScreenshotId = null;

function ensureDeleteModal() {
  if (!document.getElementById('deleteScreenshotModal')) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = getDeleteModalHTML();
    document.body.appendChild(wrapper.firstElementChild);
  }
}

async function requestDeleteScreenshot(screenshotId) {
  ensureDeleteModal();
  const modal = document.getElementById('deleteScreenshotModal');
  const deductionEl = document.getElementById('deleteModalDeduction');
  const timeEl = document.getElementById('deleteModalTime');
  const confirmBtn = document.getElementById('confirmDeleteBtn');

  pendingDeleteScreenshotId = screenshotId;
  deductionEl.textContent = 'Calculating time deduction...';
  timeEl.textContent = '';
  confirmBtn.disabled = true;
  confirmBtn.style.opacity = '0.6';
  modal.style.display = 'flex';

  try {
    const result = await ipcRenderer.invoke('estimate-screenshot-deduction', { screenshotId });

    if (!result.success) {
      deductionEl.textContent = 'Could not estimate deduction.';
      confirmBtn.disabled = false;
      confirmBtn.style.opacity = '1';
      return;
    }

    const formatted = formatDeductionTime(result.deductedSeconds);
    if (result.capturedAt) {
      const dt = new Date(result.capturedAt);
      timeEl.textContent = `Screenshot from ${dt.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
    }
    deductionEl.textContent = `This will deduct ${formatted} from your tracked time today.`;
    confirmBtn.disabled = false;
    confirmBtn.style.opacity = '1';
  } catch (err) {
    console.error('Error estimating deduction:', err);
    deductionEl.textContent = 'Error estimating time. Proceed anyway?';
    confirmBtn.disabled = false;
    confirmBtn.style.opacity = '1';
  }
}

async function confirmDeleteScreenshot() {
  if (!pendingDeleteScreenshotId) return;

  const confirmBtn = document.getElementById('confirmDeleteBtn');
  confirmBtn.disabled = true;
  confirmBtn.textContent = 'Deleting...';
  confirmBtn.style.opacity = '0.6';

  try {
    const result = await ipcRenderer.invoke('delete-screenshot', { screenshotId: pendingDeleteScreenshotId });

    closeDeletePopup();

    if (result.success) {
      const formatted = formatDeductionTime(result.deductedSeconds);
      showToast(`Screenshot deleted. ${formatted} deducted from your time.`, 'success');
      loadRecentScreenshots();
    } else {
      showToast(result.error || 'Failed to delete screenshot', 'error');
    }
  } catch (err) {
    closeDeletePopup();
    console.error('Error deleting screenshot:', err);
    showToast('Failed to delete screenshot: ' + (err.message || err), 'error');
  }
}

function closeDeletePopup() {
  const modal = document.getElementById('deleteScreenshotModal');
  if (modal) modal.style.display = 'none';
  pendingDeleteScreenshotId = null;
  const confirmBtn = document.getElementById('confirmDeleteBtn');
  if (confirmBtn) {
    confirmBtn.disabled = false;
    confirmBtn.textContent = 'Delete & Deduct Time';
    confirmBtn.style.opacity = '1';
  }
}

function showToast(message, type = 'info') {
  const existing = document.getElementById('tf-toast');
  if (existing) existing.remove();

  const bg = type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6';
  const toast = document.createElement('div');
  toast.id = 'tf-toast';
  toast.style.cssText = `position:fixed; bottom:24px; right:24px; z-index:10000; background:${bg}; color:white; padding:12px 20px; border-radius:10px; font-size:14px; font-weight:500; box-shadow:0 8px 25px rgba(0,0,0,0.2); transition:opacity 0.3s; max-width:360px;`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 4000);
}

// === Idle confirmation prompt (in-app overlay, rendered inside this window) ===
(function setupIdlePromptOverlay() {
  if (window.__idlePromptOverlaySetup) return;
  window.__idlePromptOverlaySetup = true;

  const RADIUS = 42;
  const CIRC = 2 * Math.PI * RADIUS;
  let overlay, ringBar, countEl, btnWorking, btnBreak;
  let timer = null;
  let remaining = 0;
  let total = 0;
  let responded = false;

  function ensureOverlay() {
    if (overlay) return;

    const style = document.createElement('style');
    style.textContent = `
      #idle-prompt-overlay {
        position: fixed; inset: 0; z-index: 2147483000;
        display: none; align-items: center; justify-content: center;
        background: rgba(30, 27, 75, 0.45); backdrop-filter: blur(4px);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        -webkit-user-select: none; user-select: none;
      }
      #idle-prompt-overlay .idle-card {
        position: relative; width: 380px; max-width: 88vw; background: #ffffff; color: #1e293b;
        border: 1px solid #e9ecf5; border-radius: 18px; padding: 30px 26px 22px;
        text-align: center; box-shadow: 0 24px 60px rgba(102, 126, 234, 0.28);
        overflow: hidden;
      }
      #idle-prompt-overlay .idle-card::before {
        content: ""; position: absolute; top: 0; left: 0; right: 0; height: 5px;
        background: linear-gradient(90deg, #667eea, #764ba2);
      }
      #idle-prompt-overlay .idle-title { font-size: 19px; font-weight: 700; color: #1e293b; margin-bottom: 6px; }
      #idle-prompt-overlay .idle-sub { font-size: 13px; line-height: 1.45; color: #64748b; margin-bottom: 20px; }
      #idle-prompt-overlay .idle-ring { position: relative; width: 96px; height: 96px; margin: 0 auto 22px; }
      #idle-prompt-overlay .idle-ring svg { transform: rotate(-90deg); }
      #idle-prompt-overlay .idle-track { stroke: #eef1f8; }
      #idle-prompt-overlay .idle-bar { stroke: #667eea; stroke-linecap: round; transition: stroke-dashoffset 1s linear, stroke 0.3s linear; }
      #idle-prompt-overlay .idle-count { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 30px; font-weight: 700; color: #1e293b; font-variant-numeric: tabular-nums; }
      #idle-prompt-overlay .idle-buttons { display: flex; flex-direction: column; gap: 10px; }
      #idle-prompt-overlay button { width: 100%; border: none; border-radius: 12px; padding: 13px 16px; font-size: 15px; font-weight: 600; cursor: pointer; transition: opacity 0.15s ease, transform 0.05s ease, box-shadow 0.15s ease, background 0.15s ease; }
      #idle-prompt-overlay button:active:not(:disabled) { transform: translateY(1px); }
      #idle-prompt-overlay button:disabled { opacity: 0.5; cursor: default; }
      #idle-prompt-overlay .idle-working { background: linear-gradient(135deg, #10b981, #059669); color: #ffffff; box-shadow: 0 6px 16px rgba(16, 185, 129, 0.32); }
      #idle-prompt-overlay .idle-working:hover:not(:disabled) { box-shadow: 0 8px 20px rgba(16, 185, 129, 0.42); }
      #idle-prompt-overlay .idle-break { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
      #idle-prompt-overlay .idle-break:hover:not(:disabled) { background: #fee2e2; border-color: #fca5a5; }
    `;
    document.head.appendChild(style);

    overlay = document.createElement('div');
    overlay.id = 'idle-prompt-overlay';
    overlay.innerHTML = `
      <div class="idle-card">
        <div class="idle-title">Are you still working?</div>
        <div class="idle-sub">No keyboard or mouse activity detected. Time Doctor will stop when the timer runs out.</div>
        <div class="idle-ring">
          <svg width="96" height="96" viewBox="0 0 96 96">
            <circle class="idle-track" cx="48" cy="48" r="42" fill="none" stroke-width="8"></circle>
            <circle class="idle-bar" id="idle-bar" cx="48" cy="48" r="42" fill="none" stroke-width="8"></circle>
          </svg>
          <div class="idle-count" id="idle-count">60</div>
        </div>
        <div class="idle-buttons">
          <button class="idle-working" id="idle-working">I'm working</button>
          <button class="idle-break" id="idle-break">On break — stop Time Doctor</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    ringBar = overlay.querySelector('#idle-bar');
    countEl = overlay.querySelector('#idle-count');
    btnWorking = overlay.querySelector('#idle-working');
    btnBreak = overlay.querySelector('#idle-break');
    ringBar.style.strokeDasharray = String(CIRC);
    ringBar.style.strokeDashoffset = '0';

    btnWorking.addEventListener('click', () => respond('working'));
    btnBreak.addEventListener('click', () => respond('break'));
  }

  function render() {
    countEl.textContent = String(Math.max(0, remaining));
    const frac = total > 0 ? remaining / total : 0;
    ringBar.style.strokeDashoffset = String(CIRC * (1 - frac));
    ringBar.style.stroke = remaining <= 10 ? '#ef4444' : '#667eea';
  }

  function stopTimer() {
    if (timer) { clearInterval(timer); timer = null; }
  }

  function hide() {
    stopTimer();
    if (overlay) overlay.style.display = 'none';
  }

  function respond(action) {
    if (responded) return;
    responded = true;
    stopTimer();
    if (btnWorking) btnWorking.disabled = true;
    if (btnBreak) btnBreak.disabled = true;
    try { ipcRenderer.send('idle-prompt-response', action); } catch (e) {}
    hide();
  }

  function show(countdownSeconds) {
    ensureOverlay();
    total = Math.max(1, parseInt(countdownSeconds, 10) || 60);
    remaining = total;
    responded = false;
    btnWorking.disabled = false;
    btnBreak.disabled = false;
    overlay.style.display = 'flex';
    render();
    stopTimer();
    timer = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        remaining = 0;
        render();
        stopTimer();
        // Main process is authoritative for the actual stop; just reflect it.
        btnWorking.disabled = true;
        btnBreak.disabled = true;
        return;
      }
      render();
    }, 1000);
  }

  ipcRenderer.on('display-idle-prompt', (_e, data) => show(data && data.countdownSeconds));
  ipcRenderer.on('hide-idle-prompt', () => hide());
})();
