/**
 * Windows App Detection Module
 * Updated to use direct detection methods to avoid PowerShell encoding issues
 * Falls back to desktop window detection if needed
 * Version: 95.2.4 - Fixed PowerShell timeout issues with direct commands
 */

console.log('🔧 [WINDOWS-APP] Windows App Detection Module v95.2.5 loaded (PERFORMANCE FIX)');

const { spawn } = require('child_process');
const { detectActiveDesktopWindow, getAllDesktopWindows } = require('./desktop-window-detection');
const simpleDetection = require('./simple-app-detection');

// Try to load active-win for native Windows API access
let activeWin = null;
let activeWinBroken = false; // Track if active-win consistently fails
let activeWinFailCount = 0;
try {
  activeWin = require('active-win');
  console.log('✅ [WINDOWS-APP] active-win loaded successfully (native Windows API)');
} catch (error) {
  console.log('⚠️ [WINDOWS-APP] active-win not available:', error.message);
  activeWinBroken = true;
}

const DEBUG = !!(process.env.DEBUG_APP || process.env.DEBUG);
const USE_WINDOW_DETECTION = process.env.USE_LEGACY_APP_DETECTION !== 'true'; // Default to new method
// FREEZE FIX: Reduced from 15s to 5s. 15s was far too long and caused cascading
// hangs on low-memory machines. PowerShell spawn should complete in <3s normally.
const METHOD_TIMEOUT_MS = 5000;

// ============================================
// PERFORMANCE FIX: Aggressive caching to prevent overlapping PowerShell calls
// ============================================
const detectionCache = {
  result: null,
  timestamp: 0,
  pending: null, // Track in-flight detection to prevent overlapping calls
  TTL_MS: Number(process.env.APP_DETECT_CACHE_MS) || (() => {
    try {
      return require('../../modules/utils/power-profile').getAppDetectCacheMs();
    } catch (_) {
      return 60000;
    }
  })(),
  // BUG1 FIX: Track last valid external app (non-Electron) to use when self-detected
  lastExternalApp: null,
  lastExternalAppTimestamp: 0,
  EXTERNAL_APP_TTL_MS: 60000, // Keep external app for 60 seconds
};

function getCachedResult() {
  const now = Date.now();
  if (detectionCache.result && (now - detectionCache.timestamp) < detectionCache.TTL_MS) {
    return { ...detectionCache.result, method: detectionCache.result.method + '-cached' };
  }
  return null;
}

// System processes that should NOT be saved as lastExternalApp
const SYSTEM_PROCESS_EXCLUSIONS = [
  'electron', 'alyson work time', 'timeflow',
  'applicationframehost', 'dwm', 'dwm.exe', 'desktop window manager',
  'shellexperiencehost', 'searchhost', 'searchapp', 'startmenuexperiencehost',
  'explorer', 'explorer.exe', 'taskhostw', 'sihost', 'ctfmon',
  'windows system', 'system', 'idle', 'unknown'
];

function isSystemProcess(appName) {
  if (!appName) return true;
  const lower = appName.toLowerCase().trim();
  return SYSTEM_PROCESS_EXCLUSIONS.some(exc => lower === exc || lower.includes(exc));
}

function setCachedResult(result) {
  detectionCache.result = result;
  detectionCache.timestamp = Date.now();
  // BUG1 FIX: Track last valid external app (non-Electron/non-system-process)
  const appName = result?.appName || '';
  if (appName && !isSystemProcess(appName)) {
    detectionCache.lastExternalApp = result;
    detectionCache.lastExternalAppTimestamp = Date.now();
    if (DEBUG) console.log('[WINDOWS-APP] Saved external app:', result.appName);
} else if (appName) {
    if (DEBUG) console.log('[WINDOWS-APP] Skipped system process for lastExternalApp:', appName);
}
}

// BUG1 FIX: Get last external app if still valid (double-check it's not a system process)
function getLastExternalApp() {
  const now = Date.now();
  if (detectionCache.lastExternalApp && (now - detectionCache.lastExternalAppTimestamp) < detectionCache.EXTERNAL_APP_TTL_MS) {
    // Double-check the cached app is not a system process (safety check)
    if (isSystemProcess(detectionCache.lastExternalApp.appName)) {
      if (DEBUG) console.log('[WINDOWS-APP] Clearing invalid lastExternalApp:', detectionCache.lastExternalApp.appName);
      detectionCache.lastExternalApp = null;
      return null;
    }
    return { ...detectionCache.lastExternalApp, method: detectionCache.lastExternalApp.method + '-last-external' };
  }
  return null;
}

/**
 * Execute command using spawn to avoid shell blocking
 */
function execCommand(command, timeoutMs = METHOD_TIMEOUT_MS) {
  return new Promise((resolve) => {
    try {
      // Parse command string into cmd and args for spawn
      // Simple parsing: split by space, but respect quotes
      // Note: This is a simplified parser for specific commands used in this file
      let cmd, args;
      
      if (command.startsWith('powershell')) {
        cmd = 'powershell.exe';
        // Extract the rest of the command
        const rest = command.substring(10).trim();
        // Construct args for PowerShell
        args = ['-NoProfile', '-NonInteractive', '-NoLogo', '-ExecutionPolicy', 'Bypass'];
        
        if (rest.includes('-EncodedCommand')) {
          const parts = rest.split('-EncodedCommand');
          args.push('-EncodedCommand', parts[1].trim());
        } else if (rest.includes('-Command')) {
          const parts = rest.split(/-Command\s+"/);
          if (parts.length > 1) {
             args.push('-Command', parts[1].replace(/"$/, ''));
          } else {
             args.push('-Command', rest.replace(/^-Command\s+/, ''));
          }
        } else {
           args.push('-Command', rest);
        }
      } else if (command.startsWith('wmic')) {
        cmd = 'wmic';
        // e.g. wmic process where "name='msedge.exe'" get ProcessId /format:list
        args = command.substring(4).trim().match(/("[^"]+"|[^"\s]+)/g).map(s => s.replace(/^"|"$/g, ''));
      } else {
        // Fallback for other commands
        cmd = 'cmd.exe';
        args = ['/d', '/s', '/c', command];
      }

      const child = spawn(cmd, args, {
        windowsHide: true,
        timeout: timeoutMs,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('error', (err) => {
        if (DEBUG) console.warn('[WINDOWS-APP] Spawn error:', err.message);
        resolve(null);
      });

      child.on('close', (code) => {
        if (code !== 0 && DEBUG) {
           console.warn('[WINDOWS-APP] Spawn exited with code:', code, 'Stderr:', stderr.substring(0, 200));
        }
        const result = (stdout || '').trim();
        if (DEBUG && result) console.log('[WINDOWS-APP] Command output:', result.substring(0, 200));
        resolve(result);
      });
    } catch (err) {
      if (DEBUG) console.warn('[WINDOWS-APP] Command exception:', err.message);
      resolve(null);
    }
  });
}

/**
 * Fallback detection using Electron APIs when all else fails
 * REMOVED: Previous implementation had unreachable code due to incorrect context checks
 * This fallback is now simplified to avoid false positives
 */
async function getElectronFallbackApp() {
  try {
    // This function runs in Node.js main process context
    // We cannot reliably access Electron BrowserWindow APIs here because:
    // 1. This is called from app detection subprocess/worker context
    // 2. BrowserWindow is not available in renderer or worker threads
    // 3. The 'window' object doesn't exist in Node.js
    
    // Instead, just return null to allow the system fallback to handle it
    // The system fallback at the end of detectActiveApp() will provide a meaningful result
    if (DEBUG) console.log('[WINDOWS-APP] Electron fallback skipped (not applicable in this context)');
    return null;
  } catch (error) {
    if (DEBUG) console.warn('[WINDOWS-APP] Electron fallback error:', error.message);
    return null;
  }
}

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
    vivaldi: 'Vivaldi',
    whatsapp: 'WhatsApp',
    telegram: 'Telegram',
    notion: 'Notion',
    cursor: 'Cursor'
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

function isBrowserApp(appName = '') {
  const lower = (appName || '').toLowerCase();
  return ['chrome', 'msedge', 'edge', 'firefox', 'brave', 'opera', 'vivaldi', 'iexplore', 'chromium']
    .some(token => lower.includes(token));
}

/**
 * Get the currently active application on Windows
 */
function toEncodedCommand(script) {
  try { return Buffer.from(script, 'utf16le').toString('base64'); } catch { return null; }
}

/**
 * CRITICAL FIX: Unwrap ApplicationFrameHost to find the real app
 * ApplicationFrameHost is a UWP container - we need to find the actual browser inside
 * FIXED: Use -Command instead of -EncodedCommand for ARM64 compatibility
 */
async function unwrapApplicationFrameHost(windowTitle) {
  try {
    if (DEBUG) console.log('[WINDOWS-APP] Unwrapping ApplicationFrameHost, window title:', windowTitle);

    // Strategy 1: Check window title for browser indicators (MOST RELIABLE)
    const title = (windowTitle || '').toLowerCase();

    if (title.includes('microsoft') && title.includes('edge')) {
      if (DEBUG) console.log('[WINDOWS-APP] Title indicates Microsoft Edge');
      return 'msedge';
    }
    if (title.includes('edge')) {
      if (DEBUG) console.log('[WINDOWS-APP] Title indicates Edge');
      return 'msedge';
    }
    if (title.includes('chrome') || title.includes('google')) {
      if (DEBUG) console.log('[WINDOWS-APP] Title indicates Chrome');
      return 'chrome';
    }
    if (title.includes('firefox') || title.includes('mozilla')) {
      if (DEBUG) console.log('[WINDOWS-APP] Title indicates Firefox');
      return 'firefox';
    }
    if (title.includes('brave')) {
      if (DEBUG) console.log('[WINDOWS-APP] Title indicates Brave');
      return 'brave';
    }
    if (title.includes('opera')) {
      if (DEBUG) console.log('[WINDOWS-APP] Title indicates Opera');
      return 'opera';
    }

    // Strategy 2: Check for running browser processes (simple check - ARM64 safe)
    // Try each browser individually to avoid complex PowerShell commands that fail on ARM64
    const browsers = ['msedge', 'chrome', 'firefox', 'brave', 'opera'];

    if (DEBUG) console.log('[WINDOWS-APP] Checking for running browsers (Strategy 2)...');
    for (const browser of browsers) {
      const cmd = `powershell.exe -NoProfile -NonInteractive -NoLogo -ExecutionPolicy Bypass -Command "Get-Process ${browser} -ErrorAction SilentlyContinue | Select-Object -First 1 ProcessName"`;
      const result = await execCommand(cmd, 800);
      if (result && result.includes(browser)) {
        if (DEBUG) console.log('[WINDOWS-APP] Found running browser:', browser);
        return browser;
      }
    }

    // Strategy 3: Try using wmic (Windows Management Instrumentation) - more reliable on ARM64
    if (DEBUG) console.log('[WINDOWS-APP] Trying wmic method (Strategy 3)...');
    for (const browser of browsers) {
      const cmd = `wmic process where "name='${browser}.exe'" get ProcessId /format:list`;
      const result = await execCommand(cmd, 800);
      if (result && result.includes('ProcessId=')) {
        if (DEBUG) console.log('[WINDOWS-APP] Found browser via wmic:', browser);
        return browser;
      }
    }

    if (DEBUG) console.log('[WINDOWS-APP] No browser found to unwrap (tried all 3 strategies)');
  } catch (e) {
    if (DEBUG) console.warn('[WINDOWS-APP] Unwrap exception:', e.message);
  }
  return null;
}

async function getWindowsActiveApplication() {
  try {
    if (DEBUG) console.log('[WINDOWS-APP] Detecting active app using PowerShell...');

    // Method 1: Win32 via PowerShell (User32 GetForegroundWindow) with -EncodedCommand
    // CRITICAL: Suppress progress bars that break JSON parsing
    const psFgScript = [
      '$ProgressPreference="SilentlyContinue";',
      "$sig = @'",
      'using System;',
      'using System.Runtime.InteropServices;',
      'public static class User32 {',
      '  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();',
      '  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out int lpdwProcessId);',
      '}',
      "'@;",
      'Add-Type -TypeDefinition $sig -PassThru | Out-Null;',
      '$h = [User32]::GetForegroundWindow();',
      'if ($h -eq [IntPtr]::Zero) { return }',
      '$pid = 0; [User32]::GetWindowThreadProcessId($h, [ref]$pid) | Out-Null;',
      '$p = Get-Process -Id $pid -ErrorAction SilentlyContinue;',
      'if ($p) {',
      '  $o = [PSCustomObject]@{ ProcessName = $p.ProcessName; MainWindowTitle = $p.MainWindowTitle; Id = $pid };',
      '  $o | ConvertTo-Json -Compress',
      '} else {',
      '  Write-Output ""',
      '}'
    ].join("\n");
    const fgEnc = toEncodedCommand(psFgScript);
    const psForeground = `powershell.exe -NoProfile -NonInteractive -NoLogo -ExecutionPolicy Bypass -EncodedCommand ${fgEnc}`;
    const fgJson = await execCommand(psForeground);
    if (fgJson) {
      try {
        const obj = JSON.parse(fgJson);
        if (obj && obj.ProcessName) {
          let rawProc = String(obj.ProcessName || '').toLowerCase();
          const rawTitle = String(obj.MainWindowTitle || '');
          const pid = obj.Id;

          // CRITICAL FIX: Unwrap ApplicationFrameHost to get real app
          if (rawProc === 'applicationframehost') {
            if (DEBUG) console.log('[WINDOWS-APP] Detected ApplicationFrameHost, unwrapping...');
            const realApp = await unwrapApplicationFrameHost(rawTitle);
            if (realApp) {
              rawProc = realApp;
              if (DEBUG) console.log('[WINDOWS-APP] Unwrapped to:', realApp);
            }
          }

          // Filter WebView2 host and dummy window title
          if (rawProc === 'msedgewebview2' || rawTitle === 'OleMainThreadWndName' || rawTitle === '') {
            if (DEBUG) console.log('[WINDOWS-APP] Foreground filter ignored:', { rawProc, rawTitle });
          } else {
            const name = normalizeAppName(rawProc);
            const title = obj.MainWindowTitle || 'No Title';
            if (DEBUG) console.log('[WINDOWS-APP] Foreground API success:', { name, title });
            return { name, title, platform: 'win32', method: 'foreground-api', elevated: false };
          }
        }
      } catch {
        // ignore parse error
      }
    }

    // Method 2: Simple process enumeration (first with a window title) with -EncodedCommand
    // CRITICAL: Suppress progress bars that break JSON parsing
    const psEnumScript = '$ProgressPreference="SilentlyContinue"; Get-Process | Where-Object {$_.MainWindowTitle -and $_.MainWindowTitle.Trim() -ne ""} | Select-Object -First 1 ProcessName,MainWindowTitle,Id | ConvertTo-Json -Compress';
    const psEnumEncoded = toEncodedCommand(psEnumScript);
    if (psEnumEncoded) {
      const psEnum = `powershell.exe -NoProfile -NonInteractive -NoLogo -ExecutionPolicy Bypass -EncodedCommand ${psEnumEncoded}`;
      const enumJson = await execCommand(psEnum);
      if (enumJson) {
        try {
          const obj = JSON.parse(enumJson);
          if (obj && obj.ProcessName) {
            let rawProc = String(obj.ProcessName || '').toLowerCase();
            const rawTitle = String(obj.MainWindowTitle || '');
            const pid = obj.Id;

            // CRITICAL FIX: Unwrap ApplicationFrameHost to get real app
            if (rawProc === 'applicationframehost') {
              if (DEBUG) console.log('[WINDOWS-APP] Enum detected ApplicationFrameHost, unwrapping...');
              const realApp = await unwrapApplicationFrameHost(rawTitle);
              if (realApp) {
                rawProc = realApp;
                if (DEBUG) console.log('[WINDOWS-APP] Enum unwrapped to:', realApp);
              }
            }

            if (rawProc === 'msedgewebview2' || rawTitle === 'OleMainThreadWndName' || rawTitle === '') {
              if (DEBUG) console.log('[WINDOWS-APP] PS enumeration ignored WebView2/no title');
            } else {
              const name = normalizeAppName(rawProc);
              const title = obj.MainWindowTitle || 'Active Window';
              if (DEBUG) console.log('[WINDOWS-APP] PS enumeration success:', { name, title });
              return { name, title, platform: 'win32', method: 'powershell-fallback', elevated: false };
            }
          }
        } catch (parseError) {
          if (DEBUG) console.warn('[WINDOWS-APP] PS enumeration parse error:', parseError.message);
        }
      }
    }

    if (DEBUG) console.warn('[WINDOWS-APP] Falling back to default (no reliable foreground app found)');
    return {
      name: 'Windows Desktop',
      title: 'No Active Application Detected',
      platform: 'win32',
      method: 'default-fallback',
      elevated: false
    };
  } catch (error) {
    if (DEBUG) console.warn('❌ [WINDOWS-APP] Detection error:', error.message);
    return { name: 'Windows Desktop', title: 'No Active Application Detected', platform: 'win32', method: 'error-fallback', elevated: false };
  }
}

/**
 * Native Windows API detection using C# P/Invoke via PowerShell
 * Same method used in URL capture - proven to work on restricted systems
 */
async function getActiveWindowNative() {
  const csharpCode = 'using System; using System.Runtime.InteropServices; using System.Text; public class Win32 { [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow(); [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count); [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId); }';
  
  const psCommand = '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ' +
    'Add-Type -TypeDefinition \'' + csharpCode + '\' -ErrorAction SilentlyContinue; ' +
    '$hwnd = [Win32]::GetForegroundWindow(); ' +
    'if ($hwnd -eq 0) { exit 1 }; ' +
    '$title = New-Object System.Text.StringBuilder 512; ' +
    '[Win32]::GetWindowText($hwnd, $title, 512) | Out-Null; ' +
    '$procId = 0; ' +
    '[Win32]::GetWindowThreadProcessId($hwnd, [ref]$procId) | Out-Null; ' +
    '$proc = Get-Process -Id $procId -ErrorAction SilentlyContinue; ' +
    'if ($proc) { $procPath = if ($proc.Path) { $proc.Path } else { "" }; @{ title = $title.ToString(); processName = $proc.ProcessName; path = $procPath } | ConvertTo-Json -Compress }';

  return new Promise((resolve) => {
    try {
      if (DEBUG) console.log('🔧 [WINDOWS-APP] Starting Native API detection (spawn)...');
      
      const child = spawn('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-NoLogo',
        '-ExecutionPolicy', 'Bypass',
        '-Command', psCommand
      ], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      // Set timeout to kill process if it hangs
      const timeoutId = setTimeout(() => {
        if (!child.killed) {
          if (DEBUG) console.warn('⚠️ [WINDOWS-APP] Native detection timed out, killing...');
          child.kill();
          resolve(null);
        }
      }, METHOD_TIMEOUT_MS);

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => { stdout += data.toString(); });
      child.stderr.on('data', (data) => { stderr += data.toString(); });

      child.on('error', (err) => {
        clearTimeout(timeoutId);
        if (DEBUG) console.error('❌ [WINDOWS-APP] Native spawn error:', err.message);
        resolve(null);
      });

      child.on('close', (code) => {
        clearTimeout(timeoutId);
        
        if (code !== 0) {
          if (DEBUG && stderr) console.log('⚠️ [WINDOWS-APP] Native stderr:', stderr.substring(0, 200));
        }

        const result = stdout.trim();
        if (result) {
          try {
            const data = JSON.parse(result);
            if (DEBUG) console.log('✓ [WINDOWS-APP] Native success:', data.processName);
            resolve({
              appName: normalizeAppName(data.processName),
              windowTitle: data.title,
              processName: data.processName,
              path: data.path,
              method: 'native-api'
            });
          } catch (e) {
            if (DEBUG) console.warn('❌ [WINDOWS-APP] Native parse error:', e.message);
            resolve(null);
          }
        } else {
          resolve(null);
        }
      });
    } catch (e) {
      if (DEBUG) console.error('❌ [WINDOWS-APP] Native unexpected error:', e.message);
      resolve(null);
    }
  });
}

/**
 * Unified interface for platform managers
 * Uses new desktop window detection by default, with legacy fallback
 */
async function detectActiveApp() {
  // FREEZE FIX: Skip detection entirely when tracking is stopped or shutting down.
  // Prevents expensive PowerShell/tasklist spawns during shutdown and after tracking stops.
  if (global.isShuttingDown || global.isStopping) {
    const cached = getCachedResult();
    if (cached) return cached;
    return { name: 'Windows Desktop', title: 'Detection Skipped (Shutting Down)', platform: 'win32', method: 'shutdown-skip', elevated: false };
  }
  if (!global.isTracking) {
    const cached = getCachedResult();
    if (cached) return cached;
    return { name: 'Windows Desktop', title: 'Detection Skipped (Not Tracking)', platform: 'win32', method: 'not-tracking-skip', elevated: false };
  }

  // PERFORMANCE FIX 1: Check cache first
  const cached = getCachedResult();
  if (cached) {
    if (DEBUG) console.log('[WINDOWS-APP] ⚡ CACHE HIT:', cached.appName);
    return cached;
  }

  // PERFORMANCE FIX 2: Prevent overlapping calls with pending promise
  if (detectionCache.pending) {
    if (DEBUG) console.log('[WINDOWS-APP] ⏳ Detection already in progress, waiting...');
    try {
      const result = await detectionCache.pending;
      return result;
    } catch (e) {
      // Fall through to new detection
    }
  }

  // Start new detection - set pending promise BEFORE async work
  const detectionPromise = doActualDetection();
  detectionCache.pending = detectionPromise;
  
  try {
    const result = await detectionPromise;
    return result;
  } finally {
    detectionCache.pending = null;
  }
}

/**
 * Internal function that does the actual detection work
 */
async function doActualDetection() {
// PERFORMANCE FIX 3: Skip broken active-win after 3 failures
  // PRIORITY 1: Try active-win (native Windows API - works in VMs)
  if (activeWin && !activeWinBroken) {
    try {
      if (DEBUG) console.log('[WINDOWS-APP] Using active-win (native Windows API) as PRIMARY method');

      // PERF FIX: Wrap in 1s timeout to prevent hangs when antivirus (e.g. 360 Total Security)
      // hooks Win32 APIs like OpenProcess/GetWindowThreadProcessId. Without this, active-win
      // can stall for 3+ seconds on affected machines, causing dwell duplication and UI freezes.
      const ACTIVE_WIN_TIMEOUT_MS = 1000;
      const result = await Promise.race([
        activeWin(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('active-win timeout (1s)')), ACTIVE_WIN_TIMEOUT_MS))
      ]);
if (result && result.owner && result.owner.name) {
        // Reset fail count on success
        activeWinFailCount = 0;
        let processName = result.owner.name;
        const windowTitle = result.title || 'Untitled Window';
        
        // CRITICAL FIX: Unwrap ApplicationFrameHost to get real browser
        if (processName.toLowerCase() === 'applicationframehost') {
          if (DEBUG) console.log('[WINDOWS-APP] Detected ApplicationFrameHost in active-win, unwrapping...');
          const realApp = await unwrapApplicationFrameHost(windowTitle);
          if (realApp) {
            processName = realApp;
            if (DEBUG) console.log('[WINDOWS-APP] Unwrapped to:', realApp);
          }
        }
        
        const appName = normalizeAppName(processName);
        
        if (DEBUG) console.log('[WINDOWS-APP] active-win detected:', appName, 'title:', windowTitle);
        
        const finalResult = {
          appName: appName,
          windowTitle: windowTitle,
          bundleId: result.owner.bundleId || null,
          pid: result.owner.processId || result.owner.pid || null,
          platform: 'win32',
          method: 'active-win-native',
          isBrowser: isBrowserApp(appName),
          elevated: false,
          isDesktopWindow: false,
          // Additional metadata from active-win
          bounds: result.bounds || null,
          memoryUsage: result.memoryUsage || null
        };
        setCachedResult(finalResult);
        return finalResult;
      }
      
      // Track failures to disable broken active-win
      activeWinFailCount++;
      if (activeWinFailCount >= 3) {
        console.log('⚠️ [WINDOWS-APP] active-win failed 3 times, disabling to improve performance');
        activeWinBroken = true;
      }
      if (DEBUG) console.log('[WINDOWS-APP] active-win returned null or incomplete data, failCount:', activeWinFailCount);
    } catch (error) {
      // Bug fix: Also increment fail count on exceptions, not just null results
      activeWinFailCount++;
      if (activeWinFailCount >= 3) {
        console.log('⚠️ [WINDOWS-APP] active-win failed 3 times (exception), disabling to improve performance');
        activeWinBroken = true;
      }
      if (DEBUG) console.warn('[WINDOWS-APP] active-win failed:', error.message, 'failCount:', activeWinFailCount);
    }
  }

  // PRIORITY 2: Native Windows API (C# P/Invoke via PowerShell - GetForegroundWindow)
try {
    if (DEBUG) console.log('[WINDOWS-APP] Trying Native API (GetForegroundWindow) as SECONDARY method...');
    const nativeApp = await getActiveWindowNative();
if (nativeApp && nativeApp.appName && nativeApp.appName !== 'Windows Desktop') {
      // BUG1 FIX: If we detected "Electron" (self), try to use last external app instead
      const appNameLower = (nativeApp.appName || '').toLowerCase();
      const isSelfDetected = appNameLower.includes('electron') || appNameLower === 'alyson work time' || appNameLower === 'timeflow';
      if (isSelfDetected) {
        const lastExternal = getLastExternalApp();
        if (lastExternal) {
          if (DEBUG) console.log('[WINDOWS-APP] Detected self (Electron), using last external app:', lastExternal.appName);
return lastExternal;
        }
        // BUG1 FIX: Skip self-detection entirely, fall through to try other methods
        if (DEBUG) console.log('[WINDOWS-APP] Detected self (Electron), skipping - trying other methods...');
// DO NOT return here - fall through to try other detection methods
      } else {
        // Only return for non-self apps
        if (DEBUG) console.log('[WINDOWS-APP] Native API succeeded:', nativeApp.appName);
        const result = {
          appName: nativeApp.appName,
          windowTitle: nativeApp.windowTitle || 'Untitled',
          bundleId: null,
          pid: null,
          platform: 'win32',
          method: 'native-api-foreground',
          isBrowser: isBrowserApp(nativeApp.processName),
          elevated: false,
          isDesktopWindow: false
        };
        setCachedResult(result);
        return result;
      }
    }
    if (DEBUG) console.log('[WINDOWS-APP] Native API returned null or generic result');
  } catch (error) {
    if (DEBUG) console.warn('[WINDOWS-APP] Native API failed:', error.message);
  }

  // PRIORITY 3: Simple Detection (Tasklist) - Fallback when Native API fails
  // Fast and reliable, but guesses from process list (not always accurate)
try {
    if (DEBUG) console.log('[WINDOWS-APP] Trying simple detection (tasklist) as TERTIARY method...');
    const simpleApp = await simpleDetection.detectActiveApp();
if (simpleApp && simpleApp.appName && simpleApp.appName !== 'Unknown Application') {
      // BUG1 FIX: Skip self-detection in simple detection too
      const simpleAppLower = (simpleApp.appName || '').toLowerCase();
      const isSelfSimple = simpleAppLower.includes('electron') || simpleAppLower === 'alyson work time' || simpleAppLower === 'timeflow';
      if (!isSelfSimple) {
        if (DEBUG) console.log('[WINDOWS-APP] Simple detection succeeded:', simpleApp.appName);
        setCachedResult(simpleApp);
        return simpleApp;
      }
      if (DEBUG) console.log('[WINDOWS-APP] Simple detection returned self (Electron), skipping...');
    }
    if (DEBUG) console.log('[WINDOWS-APP] Simple detection returned generic app');
  } catch (error) {
    if (DEBUG) console.warn('[WINDOWS-APP] Simple detection failed:', error.message);
  }
  
  // PRIORITY 4: Use new desktop window detection as fallback
if (USE_WINDOW_DETECTION) {
    try {
      if (DEBUG) console.log('[WINDOWS-APP] Using desktop window detection');

      const desktopWindow = await detectActiveDesktopWindow();
if (desktopWindow) {
        // Normalize process name to friendly app name (Chrome -> Google Chrome, etc.)
        const friendly = normalizeAppName(desktopWindow.appName || desktopWindow.processName || '');
        // BUG1 FIX: Skip self-detection in desktop window detection too
        const desktopAppLower = friendly.toLowerCase();
        const isSelfDesktop = desktopAppLower.includes('electron') || desktopAppLower === 'alyson work time' || desktopAppLower === 'timeflow';
        if (!isSelfDesktop) {
          const result = {
            appName: friendly,
            windowTitle: desktopWindow.windowTitle,
            bundleId: null,
            pid: desktopWindow.processId,
            platform: 'win32',
            method: `window-${desktopWindow.method}`,
            isBrowser: desktopWindow.isBrowser,
            elevated: false,
            // Additional desktop window data
            windowHandle: desktopWindow.windowHandle,
            bounds: desktopWindow.bounds,
            isDesktopWindow: true
          };
          setCachedResult(result);
          return result;
        }
        if (DEBUG) console.log('[WINDOWS-APP] Desktop window detection returned self (Electron), skipping...');
      }

      if (DEBUG) console.log('[WINDOWS-APP] Desktop window detection returned null, trying legacy');
    } catch (error) {
      if (DEBUG) console.warn('[WINDOWS-APP] Desktop window detection failed:', error.message);
    }
  }

  // PRIORITY 5: Fallback to legacy app detection
  if (DEBUG) console.log('[WINDOWS-APP] Using legacy app detection');
  const app = await getWindowsActiveApplication();
  
  // CRITICAL FIX: Check if we got a fallback result (Windows Desktop) and try simple detection
  if (!app || app.name === 'Windows Desktop' || app.title === 'No Active Application Detected' || app.method === 'default-fallback' || app.method === 'error-fallback') {
    // Try simple detection (tasklist-based) when PowerShell fails
    if (DEBUG) console.log('[WINDOWS-APP] Legacy detection failed or returned fallback, trying simple detection');
    const simpleApp = await simpleDetection.detectActiveApp();
    if (simpleApp && simpleApp.appName && simpleApp.appName !== 'Unknown Application') {
      if (DEBUG) console.log('[WINDOWS-APP] Simple detection succeeded:', simpleApp.appName);
      setCachedResult(simpleApp);
      return simpleApp;
    }
    
    // If we had a legacy result, return it (even if fallback)
    if (app) {
      if (DEBUG) console.log('[WINDOWS-APP] Returning legacy fallback result');
      const normalizedName = normalizeAppName(app.name);
      const legacyResult = {
        appName: normalizedName,
        windowTitle: app.title || 'No Window',
        bundleId: null,
        pid: null,
        platform: 'win32',
        method: `legacy-${app.method}`,
        isBrowser: isBrowserApp(normalizedName),
        elevated: app.elevated,
        isDesktopWindow: false
      };
      setCachedResult(legacyResult);
      return legacyResult;
    }
    
    // PRIORITY 6: Try Electron APIs fallback (works in restricted VMs)
    const electronApp = await getElectronFallbackApp();
    if (electronApp) {
      if (DEBUG) console.log('[WINDOWS-APP] Electron fallback succeeded');
      setCachedResult(electronApp);
      return electronApp;
    }
    
    // BUG1 FIX: Before system fallback, try to use last known external app
    const finalLastExternal = getLastExternalApp();
    if (finalLastExternal) {
      if (DEBUG) console.log('[WINDOWS-APP] All methods failed/returned self, using last external app:', finalLastExternal.appName);
return { ...finalLastExternal, method: finalLastExternal.method + '-final-fallback' };
    }

    // FINAL FALLBACK: Don't return null, return a meaningful fallback
    console.log('[WINDOWS-APP] All detection methods failed, using system fallback');
    console.log('⚠️ [WINDOWS-APP] Running in restricted environment (possibly Parallels VM)');
    console.log('💡 [WINDOWS-APP] Recommendation: Use native Windows installation for better detection');
    const systemFallback = {
      appName: 'Windows System',
      windowTitle: 'System Active (Restricted)',
      bundleId: null,
      pid: null,
      platform: 'win32',
      method: 'system-fallback-restricted',
      isBrowser: false,
      elevated: false,
      isDesktopWindow: false
    };
    setCachedResult(systemFallback);
    return systemFallback;
  }

  const normalizedName = normalizeAppName(app.name);
  const finalResult = {
    appName: normalizedName,
    windowTitle: app.title || 'No Window',
    bundleId: null,
    pid: null,
    platform: 'win32',
    method: `legacy-${app.method}`,
    isBrowser: isBrowserApp(normalizedName),
    elevated: app.elevated,
    isDesktopWindow: false
  };
  setCachedResult(finalResult);
  return finalResult;
}

/**
 * Get all desktop windows (new feature from window detection)
 * Returns array of window information, useful for activity tracking
 */
async function getAllDesktopApplications() {
  if (USE_WINDOW_DETECTION) {
    try {
      const allWindows = await getAllDesktopWindows();
      if (allWindows && allWindows.length > 0) {
        return allWindows.map(window => {
          // Determine best app name - prefer ProcessDescription over processName
          let appName = window.processName;
          if (window.ProcessDescription && window.ProcessDescription !== 'Unknown' && window.ProcessDescription.trim() !== '') {
            appName = window.ProcessDescription;
          }

          // Map "Electron" to "Work Time"
          if (appName.toLowerCase() === 'electron' || window.processName.toLowerCase() === 'electron') {
            appName = 'Work Time';
          }

          // Normalize the determined app name
          const normalizedAppName = normalizeAppName(appName);

          return {
            appName: normalizedAppName,
            windowTitle: window.windowTitle,
            bundleId: null,
            pid: window.processId,
            platform: 'win32',
            method: 'window-enumeration',
            isBrowser: isBrowserApp(normalizedAppName), // Compute isBrowser from app name
            elevated: false,
            isForeground: window.isForeground,
            windowHandle: window.handle,
            bounds: window.bounds,
            isDesktopWindow: true
          };
        });
      }
    } catch (error) {
      if (DEBUG) console.warn('[WINDOWS-APP] Get all windows failed:', error.message);
    }
  }

  // Try simple detection as fallback
  try {
    const simpleApps = await simpleDetection.getAllDesktopApplications();
    if (simpleApps && simpleApps.length > 0) {
      if (DEBUG) console.log(`[WINDOWS-APP] Simple detection found ${simpleApps.length} apps`);
      return simpleApps;
    }
  } catch (error) {
    if (DEBUG) console.warn('[WINDOWS-APP] Simple detection failed:', error.message);
  }

  // Legacy fallback - can't enumerate all windows, just return active
  const activeApp = await detectActiveApp();
  return activeApp ? [activeApp] : [];
}

module.exports = {
  getWindowsActiveApplication,
  detectActiveApp,
  getAllDesktopApplications // New function for getting all windows
};