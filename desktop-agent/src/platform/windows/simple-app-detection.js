/**
 * Windows Simple App Detection - No PowerShell Required
 * Uses tasklist and basic Windows commands for maximum compatibility
 * Fallback for when PowerShell is blocked or unavailable
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const DEBUG = !!(process.env.DEBUG_APP || process.env.DEBUG);
// FREEZE FIX: Reduced from 30s to 8s. 30s caused cascading hangs on low-memory
// machines where tasklist would take forever. If it can't finish in 8s, fail fast.
const COMMAND_TIMEOUT_MS = 8000;

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
    cursor: 'Cursor',
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
    notion: 'Notion'
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
 * Execute tasklist command using spawn (bypasses cmd.exe blocking)
 */
function spawnTasklist(args, timeoutMs = COMMAND_TIMEOUT_MS) {
  return new Promise((resolve) => {
    try {
      if (DEBUG) console.log('[WINDOWS-SIMPLE] Spawning tasklist with args:', args);
      
      const child = spawn('tasklist.exe', args, {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';
      let timeoutId;
      let resolved = false; // Track if already resolved

      timeoutId = setTimeout(() => {
        if (!child.killed && !resolved) {
          if (DEBUG) console.warn('[WINDOWS-SIMPLE] tasklist timed out after', timeoutMs, 'ms, killing...');
          child.kill('SIGKILL'); // Force kill immediately
          // Don't resolve here - let the close event do it with whatever data we have
        }
      }, timeoutMs);

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('error', (err) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeoutId);
          if (DEBUG) console.warn('[WINDOWS-SIMPLE] Spawn error:', err.message);
          resolve(null);
        }
      });

      child.on('close', (code) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeoutId);
          
          if (DEBUG) console.log('[WINDOWS-SIMPLE] tasklist exited with code:', code, 'stdout length:', stdout.length, 'stderr length:', stderr.length);
          if (DEBUG && stdout.length > 0 && stdout.length < 200) console.log('[WINDOWS-SIMPLE] STDOUT CONTENT:', stdout);
          if (DEBUG && stderr.length > 0) console.log('[WINDOWS-SIMPLE] STDERR CONTENT:', stderr.substring(0, 200));
          
          // Return whatever data we have, even if killed (code=null)
          if (stdout.length > 0) {
            if (DEBUG) {
              console.log('[WINDOWS-SIMPLE] tasklist SUCCESS, returning', stdout.length, 'bytes');
              try {
                fs.writeFileSync('tasklist-output.txt', stdout);
                console.log('[WINDOWS-SIMPLE] Wrote raw output to tasklist-output.txt');
              } catch (e) {
                console.warn('[WINDOWS-SIMPLE] Failed to write raw output:', e.message);
              }
            }
            resolve(stdout.trim());
          } else if (code !== 0 && code !== null) {
            if (DEBUG) console.warn('[WINDOWS-SIMPLE] tasklist failed with code:', code, 'Stderr:', stderr.substring(0, 200));
            resolve(null);
          } else {
            resolve(null);
          }
        }
      });
    } catch (err) {
      if (DEBUG) console.warn('[WINDOWS-SIMPLE] Spawn exception:', err.message);
      resolve(null);
    }
  });
}

/**
 * Execute wmic command using spawn
 */
function spawnWmic(args, timeoutMs = COMMAND_TIMEOUT_MS, cmd = 'wmic') {
  return new Promise((resolve) => {
    try {
      if (DEBUG) console.log('[WINDOWS-SIMPLE] Spawning wmic with args:', args, 'cmd:', cmd);
      
      const child = spawn(cmd, args, {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';
      let timeoutId;

      timeoutId = setTimeout(() => {
        if (!child.killed) {
          if (DEBUG) console.warn('[WINDOWS-SIMPLE] wmic timed out after', timeoutMs, 'ms, killing...');
          child.kill();
          resolve(null);
        }
      }, timeoutMs);

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('error', (err) => {
        clearTimeout(timeoutId);
        if (DEBUG) console.warn('[WINDOWS-SIMPLE] Spawn error:', err.message);
        resolve(null);
      });

      child.on('close', (code) => {
        clearTimeout(timeoutId);
        
        if (DEBUG) console.log('[WINDOWS-SIMPLE] wmic exited with code:', code, 'stdout length:', stdout.length);
        
        if (code !== 0) {
          if (DEBUG) console.warn('[WINDOWS-SIMPLE] wmic exited with code:', code, 'Stderr:', stderr.substring(0, 200));
          resolve(null);
        } else {
          resolve(stdout.trim());
        }
      });
    } catch (err) {
      if (DEBUG) console.warn('[WINDOWS-SIMPLE] Spawn exception:', err.message);
      resolve(null);
    }
  });
}

/**
 * Get list of running applications using tasklist, with wmic fallback
 */
async function getRunningProcesses() {
  try {
    // PRIMARY: Try FAST tasklist (no titles) first - reliability over detail
    if (DEBUG) console.log('[WINDOWS-SIMPLE] Detecting apps using FAST tasklist (spawn)...');
    
    let output = await spawnTasklist(['/FO', 'CSV', '/NH'], 10000);
    let method = 'tasklist-fast';
    
    // FALLBACK 1: If that fails, try verbose (might contain titles but slower)
    if (!output) {
      if (DEBUG) console.log('[WINDOWS-SIMPLE] Fast tasklist failed, trying verbose...');
      output = await spawnTasklist(['/V', '/FO', 'CSV', '/NH']);
      method = 'tasklist';
    }

    // FALLBACK 2: Try wmic with full path
    if (!output) {
      if (DEBUG) console.log('[WINDOWS-SIMPLE] tasklist failed, trying wmic fallback...');
      // Try both global wmic and full path
      output = await spawnWmic(['process', 'get', 'ProcessId,Description,Name', '/format:csv']);
      
      if (!output) {
         // Try full path for Windows 11
         if (DEBUG) console.log('[WINDOWS-SIMPLE] Global wmic failed, trying full path...');
         const wmicPath = 'C:\\Windows\\System32\\wbem\\WMIC.exe';
         if (fs.existsSync(wmicPath)) {
            output = await spawnWmic(['process', 'get', 'ProcessId,Description,Name', '/format:csv'], COMMAND_TIMEOUT_MS, wmicPath);
         }
      }
      method = 'wmic';
    }
    
    if (!output) {
      if (DEBUG) console.log('[WINDOWS-SIMPLE] All detection methods failed');
      return [];
    }
    
    const lines = output.split(/\r?\n/).filter(line => line.trim());
    const processes = [];
    
    for (const line of lines) {
      try {
        let processName, pid, windowTitle;
        
        if (method === 'tasklist' || method === 'tasklist-fast') {
          // Parse CSV line (handle quoted fields)
          const parts = line.match(/(".*?"|[^,]+)(?=\s*,|\s*$)/g);
          
          // Standard tasklist /V has ~9 columns. Fast tasklist has 5.
          if (!parts || parts.length < 5) {
            if (DEBUG) console.log('[WINDOWS-SIMPLE] Skipping line with < 5 columns:', parts ? parts.length : 0);
            continue;
          }
          
          processName = parts[0].replace(/"/g, '').trim();
          pid = parseInt(parts[1].replace(/"/g, '').trim(), 10);
          
          // Window title is last column in /V, but doesn't exist in fast mode
          if (parts.length >= 8) {
             windowTitle = parts[parts.length - 1].replace(/"/g, '').trim();
          } else {
             // Fast mode - no window title available
             windowTitle = 'N/A';
          }
          
          // DEBUG: Log all parsed processes
          if (DEBUG && processes.length < 5) {
            console.log('[WINDOWS-SIMPLE] Parsed process:', { processName, pid, windowTitle, partsLength: parts.length });
          }
        } else {
          // Parse wmic CSV: Node,Description,Name,ProcessId
          // Skip empty lines or headers
          if (!line.includes(',')) continue;
          const parts = line.split(',');
          if (parts.length < 4) continue;
          
          // Skip header row
          if (parts[1] === 'Description' && parts[2] === 'Name') continue;
          
          // wmic output: Node,Description,Name,ProcessId
          // We map Description to windowTitle (it's not exactly the same but best available)
          processName = parts[2].trim(); // Name
          pid = parseInt(parts[3].trim(), 10); // ProcessId
          windowTitle = parts[1].trim(); // Description
        }
        
        // Skip processes without window titles (but allow "N/A" for fast mode)
        // In fast mode, we don't have window titles, so we keep processes with "N/A"
        // We'll filter for important apps later
        if (!windowTitle || windowTitle === '' || windowTitle.length === 0) {
          if (DEBUG && processName && ['chrome', 'msedge', 'cursor', 'code', 'firefox'].some(app => processName.toLowerCase().includes(app))) {
            console.log('[WINDOWS-SIMPLE] Filtered out (empty title):', processName, 'title:', windowTitle);
          }
          continue;
        }
        
        // Skip system processes
        const systemProcesses = ['dwm.exe', 'csrss.exe', 'winlogon.exe', 'services.exe', 'svchost.exe', 'wmic.exe', 'tasklist.exe'];
        if (systemProcesses.includes(processName.toLowerCase())) {
          continue;
        }
        
        if (DEBUG) console.log('[WINDOWS-SIMPLE] VALID process found:', { processName, windowTitle });
        
        processes.push({
          processName: processName.replace(/\.exe$/i, ''),
          windowTitle: windowTitle,
          imageName: processName
        });
      } catch (parseError) {
        if (DEBUG) console.warn('[WINDOWS-SIMPLE] Failed to parse line:', parseError.message);
      }
    }
    
    if (DEBUG) console.log(`[WINDOWS-SIMPLE] Found ${processes.length} processes using ${method}`);
    return processes;
  } catch (error) {
    if (DEBUG) console.warn('[WINDOWS-SIMPLE] getRunningProcesses error:', error.message);
    return [];
  }
}

/**
 * Simple app detection - returns the first non-system process with a window title
 * This is not perfect (doesn't identify foreground window) but works when PowerShell fails
 */
async function detectActiveApp() {
  try {
    if (DEBUG) console.log('[WINDOWS-SIMPLE] Detecting apps using tasklist...');
    
    const processes = await getRunningProcesses();
    
    if (processes.length === 0) {
      if (DEBUG) console.log('[WINDOWS-SIMPLE] No processes found');
      return null;
    }
    
    // Filter out common background processes
    const foregroundCandidates = processes.filter(p => {
      const title = p.windowTitle.toLowerCase();
      const proc = p.processName.toLowerCase();
      
      // Allow known important apps even with "N/A" title (heuristic)
      // If tasklist fails to get title, we still want to report the app running
      const isImportantApp = ['msedge', 'chrome', 'firefox', 'cursor', 'code', 'brave'].some(imp => proc.includes(imp));
      
      if (isImportantApp) {
        // If it's an important app, we are more lenient
        // But still filter clearly background processes of these apps if possible
        // (Edge has many processes, usually only one has a title)
        if (title === 'n/a' || title === '') {
           // Keep it, but maybe mark it as low priority?
           // For now, let's keep it.
           return true;
        }
      }

      // Skip system/background windows
      const ignoreTitles = ['default ime', 'msctfime ui', 'program manager', 'ole', 'n/a'];
      if (ignoreTitles.some(ignored => title.includes(ignored))) {
        return false;
      }
      
      // Skip background system processes
      const ignoreProcs = ['sihost', 'taskhostw', 'dllhost', 'runtimebroker', 'searchhost', 'svchost', 'lsass', 'csrss', 'smss', 'winlogon', 'services'];
      if (ignoreProcs.some(ignored => proc.includes(ignored))) {
        return false;
      }
      
      return true;
    });
    
    if (foregroundCandidates.length === 0) {
      if (DEBUG) console.log('[WINDOWS-SIMPLE] No foreground candidates found');
      return null;
    }
    
    // Heuristic: The active app is likely one of the most recently created (highest PID)
    // or simply one of the non-system apps.
    // tasklist usually returns ordered by PID.
    // Let's prefer the LAST candidate (most recent) over the first (system apps like Explorer)
    const app = foregroundCandidates[foregroundCandidates.length - 1];
    
    // Better: Prefer browsers/editors over Explorer
    const importantApp = foregroundCandidates.reverse().find(p => {
       const proc = p.processName.toLowerCase();
       return ['cursor', 'code', 'visual studio', 'chrome', 'msedge', 'firefox', 'brave'].some(i => proc.includes(i));
    });
    
    const finalApp = importantApp || app; // Use important app if found, otherwise last candidate
    const appName = normalizeAppName(finalApp.processName);
    
    if (DEBUG) console.log('[WINDOWS-SIMPLE] Detected app:', appName, 'window:', finalApp.windowTitle);
    
    return {
      appName: appName,
      windowTitle: finalApp.windowTitle === 'N/A' ? appName : finalApp.windowTitle,
      bundleId: null,
      pid: null,
      platform: 'win32',
      method: 'tasklist-simple',
      isBrowser: isBrowserApp(finalApp.processName),
      elevated: false,
      isDesktopWindow: false
    };
  } catch (error) {
    if (DEBUG) console.warn('[WINDOWS-SIMPLE] detectActiveApp error:', error.message);
    return null;
  }
}

/**
 * Get all desktop applications
 */
async function getAllDesktopApplications() {
  try {
    const processes = await getRunningProcesses();
    
    return processes.map(p => ({
      appName: normalizeAppName(p.processName),
      windowTitle: p.windowTitle,
      bundleId: null,
      pid: null,
      platform: 'win32',
      method: 'tasklist-enumeration',
      isBrowser: isBrowserApp(p.processName),
      elevated: false,
      isDesktopWindow: false
    }));
  } catch (error) {
    if (DEBUG) console.warn('[WINDOWS-SIMPLE] getAllDesktopApplications error:', error.message);
    return [];
  }
}

module.exports = {
  detectActiveApp,
  getAllDesktopApplications,
  normalizeAppName
};
