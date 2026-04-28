/**
 * Windows ARM64-Optimized App Detection Module
 * Fast detection using tasklist only - no PowerShell, no native modules
 * Version: 1.0.0 - Optimized for ARM64 Windows
 */

console.log('🔧 [WINDOWS-ARM64-APP] ARM64-optimized app detection loaded');

const { exec } = require('child_process');

const DEBUG = !!(process.env.DEBUG_APP || process.env.DEBUG);
const TASKLIST_TIMEOUT_MS = 800; // Fast timeout for tasklist

/**
 * Normalize app names to friendly display names
 */
function normalizeAppName(rawName = '') {
  const name = (rawName || '').replace(/\.exe$/i, '');
  const lower = name.toLowerCase();
  
  // CRITICAL FIX: Handle ApplicationFrameHost (UWP container) BEFORE other mappings
  // to prevent false match with "explorer" substring
  if (lower === 'applicationframehost') {
    return 'ApplicationFrameHost'; // Will be unwrapped by caller
  }
  
  const mappings = {
    chrome: 'Google Chrome',
    msedge: 'Microsoft Edge',
    edge: 'Microsoft Edge',
    firefox: 'Firefox',
    code: 'Visual Studio Code',
    explorer: 'File Explorer',
    notepad: 'Notepad',
    cmd: 'Command Prompt',
    powershell: 'PowerShell',
    windowsterminal: 'Windows Terminal',
    teams: 'Microsoft Teams',
    outlook: 'Microsoft Outlook',
    excel: 'Microsoft Excel',
    winword: 'Microsoft Word',
    powerpnt: 'Microsoft PowerPoint',
    slack: 'Slack',
    discord: 'Discord',
    spotify: 'Spotify',
    zoom: 'Zoom',
    brave: 'Brave Browser',
    opera: 'Opera',
    vivaldi: 'Vivaldi'
  };
  
  for (const key of Object.keys(mappings)) {
    if (lower.includes(key)) return mappings[key];
  }
  
  // Capitalize first letter if no mapping found
  if (name.length > 0) {
    return name.charAt(0).toUpperCase() + name.slice(1);
  }
  
  return 'Unknown Application';
}

/**
 * Check if app is a browser
 */
function isBrowserApp(appName = '') {
  const lower = (appName || '').toLowerCase();
  return ['chrome', 'msedge', 'edge', 'firefox', 'brave', 'opera', 'vivaldi', 'iexplore', 'chromium']
    .some(token => lower.includes(token));
}

/**
 * Parse CSV line handling embedded commas and quotes
 */
function parseCsvLine(line) {
  const parts = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current);
  
  return parts.map(p => p.replace(/^\"|\"$/g, '').trim());
}

/**
 * Get active application using tasklist /v (verbose mode)
 * This is the fastest method on ARM64 - no PowerShell overhead
 */
async function getActiveApplicationViaTasklist() {
  return new Promise((resolve) => {
    try {
      if (DEBUG) console.log('[WINDOWS-ARM64-APP] Getting active app via tasklist...');
      
      const cmd = 'tasklist /v /fo csv';
      
      exec(cmd, {
        encoding: 'utf8',
        windowsHide: true,
        shell: true,
        cwd: process.env.TEMP || process.env.SystemRoot || 'C:\\Windows',
        timeout: TASKLIST_TIMEOUT_MS,
        maxBuffer: 1024 * 1024
      }, (error, stdout, stderr) => {
        if (error && !stdout) {
          if (DEBUG) console.warn('[WINDOWS-ARM64-APP] tasklist error:', error.message);
          resolve(null);
          return;
        }
        
        if (!stdout) {
          resolve(null);
          return;
        }
        
        try {
          const lines = stdout.split(/\r?\n/).filter(l => l.trim());
          
          // Skip header line
          const dataLines = lines.slice(1);
          
          // CSV Columns: Image Name, PID, Session Name, Session#, Mem Usage, Status, User Name, CPU Time, Window Title
          // We want apps with non-empty window titles
          
          const candidates = [];
          
          for (const rawLine of dataLines) {
            const cols = parseCsvLine(rawLine);
            
            if (cols.length < 9) continue;
            
            const imageName = cols[0] || '';
            const pid = cols[1] || '';
            const windowTitle = cols[8] || '';
            
            // Filter out apps with no window title or system placeholders
            if (!windowTitle || windowTitle === 'N/A' || windowTitle === 'OleMainThreadWndName' || windowTitle === '') {
              continue;
            }
            
            // Filter out system processes
            const imageNameLower = imageName.toLowerCase();
            const systemProcesses = [
              'dwm.exe', 'winlogon.exe', 'csrss.exe', 'smss.exe', 
              'wininit.exe', 'services.exe', 'lsass.exe', 'conhost.exe',
              'taskhostw.exe', 'dllhost.exe', 'rundll32.exe', 'svchost.exe',
              'msedgewebview2.exe' // WebView2 is not a user app
            ];
            
            if (systemProcesses.includes(imageNameLower)) {
              continue;
            }
            
            // Valid candidate
            candidates.push({
              imageName,
              pid,
              windowTitle
            });
          }
          
          if (DEBUG) {
            console.log(`[WINDOWS-ARM64-APP] Found ${candidates.length} candidate apps with window titles`);
          }
          
          // Return the first valid candidate (tasklist usually shows active apps first)
          if (candidates.length > 0) {
            const active = candidates[0];
            const processName = active.imageName.replace(/\.exe$/i, '');
            const friendlyName = normalizeAppName(processName);
            
            if (DEBUG) {
              console.log('[WINDOWS-ARM64-APP] Active app:', friendlyName, '- Title:', active.windowTitle.substring(0, 60));
            }
            
            resolve({
              name: friendlyName,
              title: active.windowTitle,
              pid: parseInt(active.pid) || 0,
              processName,
              platform: 'win32',
              method: 'tasklist-arm64',
              elevated: false
            });
            return;
          }
          
          if (DEBUG) console.log('[WINDOWS-ARM64-APP] No active apps found with window titles');
          resolve(null);
          
        } catch (parseError) {
          if (DEBUG) console.warn('[WINDOWS-ARM64-APP] Parse error:', parseError.message);
          resolve(null);
        }
      });
    } catch (err) {
      if (DEBUG) console.warn('[WINDOWS-ARM64-APP] Exception:', err.message);
      resolve(null);
    }
  });
}

/**
 * Fallback: Try active-win package (has ARM64 support)
 */
async function getActiveApplicationViaActiveWin() {
  try {
    if (DEBUG) console.log('[WINDOWS-ARM64-APP] Trying active-win fallback...');
    
    const activeWin = require('active-win');
    const result = await activeWin();
    
    if (result && result.owner && result.owner.name) {
      const processName = result.owner.name.replace(/\.exe$/i, '');
      const friendlyName = normalizeAppName(processName);
      const title = result.title || 'No Title';
      
      if (DEBUG) {
        console.log('[WINDOWS-ARM64-APP] active-win result:', friendlyName, '- Title:', title.substring(0, 60));
      }
      
      return {
        name: friendlyName,
        title,
        pid: result.owner.processId || 0,
        processName,
        platform: 'win32',
        method: 'active-win-arm64',
        elevated: false
      };
    }
  } catch (err) {
    if (DEBUG) console.warn('[WINDOWS-ARM64-APP] active-win failed:', err.message);
  }
  
  return null;
}

/**
 * Main detection function - unified interface
 */
async function detectActiveApp() {
  try {
    // PRIORITY 1: Try active-win (native Windows API - MOST RELIABLE)
    // This uses GetForegroundWindow() to correctly identify the active window
    let app = await getActiveApplicationViaActiveWin();
    
    if (app) {
      return {
        appName: app.name,
        windowTitle: app.title || 'No Window',
        bundleId: null,
        pid: app.pid,
        platform: 'win32',
        method: app.method,
        isBrowser: isBrowserApp(app.processName || app.name),
        elevated: false,
        isDesktopWindow: false
      };
    }
    
    // PRIORITY 2: Fallback to tasklist (for cases where active-win fails)
    // Note: tasklist cannot determine which window is active, just lists all windows
    app = await getActiveApplicationViaTasklist();
    
    if (app) {
      return {
        appName: app.name,
        windowTitle: app.title || 'No Window',
        bundleId: null,
        pid: app.pid,
        platform: 'win32',
        method: app.method,
        isBrowser: isBrowserApp(app.processName || app.name),
        elevated: false,
        isDesktopWindow: false
      };
    }
    
    // Ultimate fallback
    if (DEBUG) console.log('[WINDOWS-ARM64-APP] All methods failed, using system fallback');
    
    return {
      appName: 'Windows System',
      windowTitle: 'Active',
      bundleId: null,
      pid: null,
      platform: 'win32',
      method: 'arm64-fallback',
      isBrowser: false,
      elevated: false,
      isDesktopWindow: false
    };
    
  } catch (error) {
    if (DEBUG) console.warn('❌ [WINDOWS-ARM64-APP] Detection error:', error.message);
    
    return {
      appName: 'Windows System',
      windowTitle: 'Error',
      bundleId: null,
      pid: null,
      platform: 'win32',
      method: 'error-fallback',
      isBrowser: false,
      elevated: false,
      isDesktopWindow: false
    };
  }
}

/**
 * Get all desktop applications (simplified for ARM64)
 */
async function getAllDesktopApplications() {
  const activeApp = await detectActiveApp();
  return activeApp ? [activeApp] : [];
}

module.exports = {
  detectActiveApp,
  getAllDesktopApplications
};




