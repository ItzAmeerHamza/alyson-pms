/**
 * Windows Desktop Window Detection Module
 * Focuses on detecting desktop windows rather than just application names
 * Enumerates all visible windows and their titles
 */

const { exec, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const DEBUG = !!(process.env.DEBUG_WINDOW || process.env.DEBUG);
// FREEZE FIX: Reduced from 30s to 8s. 30s caused cascading hangs on low-memory machines.
const METHOD_TIMEOUT_MS = 8000;

/**
 * Execute command using spawn (more robust against shell blocking)
 */
function spawnCommand(cmd, args, timeoutMs = METHOD_TIMEOUT_MS) {
  return new Promise((resolve) => {
    try {
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
        if (DEBUG) console.warn(`[WINDOWS-DESKTOP] Spawn error (${cmd}):`, err.message);
        resolve(null);
      });

      child.on('close', (code) => {
        if (code !== 0) {
          if (DEBUG) console.warn(`[WINDOWS-DESKTOP] Spawn exited with code ${code}:`, stderr.trim());
          resolve(null);
        } else {
          resolve(stdout.trim());
        }
      });
    } catch (err) {
      if (DEBUG) console.warn(`[WINDOWS-DESKTOP] Spawn exception (${cmd}):`, err.message);
      resolve(null);
    }
  });
}

function execCommand(command, timeoutMs = METHOD_TIMEOUT_MS) {
  return new Promise((resolve) => {
    try {
      const opts = { encoding: 'utf8', windowsHide: true, timeout: timeoutMs };
      if (process.platform === 'win32') {
        opts.cwd = process.env.TEMP || process.env.SystemRoot || 'C:\\Windows';
      }
      exec(command, opts, (error, stdout, stderr) => {
        if (error) {
          if (DEBUG) console.warn('[WINDOWS-DESKTOP] Command failed:', { error: error.message, stderr: stderr?.substring(0, 200) });
          return resolve(null);
        }
        const result = (stdout || '').trim();
        if (DEBUG && result) console.log('[WINDOWS-DESKTOP] Command output length:', result.length);
        resolve(result);
      });
    } catch (err) {
      if (DEBUG) console.warn('[WINDOWS-DESKTOP] Command exception:', err.message);
      resolve(null);
    }
  });
}

async function executePowerShellScript(scriptContent) {
  const tempDir = os.tmpdir();
  const tempFile = path.join(tempDir, `ps-window-detect-${Date.now()}-${Math.random().toString(36).substring(2, 15)}.ps1`);
  
  try {
    fs.writeFileSync(tempFile, scriptContent, { encoding: 'utf8' });
    
    // Use -File to execute the script
    // Quote the path to handle spaces
    const command = `powershell.exe -NoProfile -NonInteractive -NoLogo -ExecutionPolicy Bypass -File "${tempFile}"`;
    
    if (DEBUG) console.log(`[WINDOWS-DESKTOP] Executing PowerShell script from file: ${tempFile}`);
    return await execCommand(command);
  } catch (error) {
    if (DEBUG) console.warn('[WINDOWS-DESKTOP] Script execution setup error:', error.message);
    return null;
  } finally {
    // Cleanup temp file
    try {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    } catch (e) {
      // Ignore cleanup errors
    }
  }
}

/**
 * Enumerate all visible desktop windows
 * Returns array of window objects with titles, positions, sizes
 */
async function enumerateDesktopWindows() {
  try {
    if (DEBUG) console.log('[WINDOWS-DESKTOP] Enumerating desktop windows...');

    // PRIMARY METHOD: Use tasklist (spawn) - FAST and reliable
    if (DEBUG) console.log('[WINDOWS-DESKTOP] Trying tasklist (spawn) as primary method...');
    
    const tasklistOutput = await spawnCommand('tasklist', ['/v', '/fo', 'csv']);
    
    if (tasklistOutput) {
      const lines = tasklistOutput.split(/\r?\n/);
      const windows = [];
      // Skip header row
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        // Simple CSV parse (handling quotes)
        const parts = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g);
        if (parts && parts.length >= 9) {
          // Remove quotes
          const clean = (s) => s ? s.replace(/^"|"$/g, '') : '';
          const processName = clean(parts[0]);
          const pid = parseInt(clean(parts[1]), 10);
          const title = clean(parts[8]); // Last column is window title
          
          if (title && title !== 'N/A') {
            windows.push({
              MainWindowTitle: title,
              ProcessName: processName,
              Id: pid,
              Description: processName
            });
          }
        }
      }
      if (windows.length > 0) {
        const enumJson = JSON.stringify(windows);
        if (DEBUG) console.log(`[WINDOWS-DESKTOP] tasklist found ${windows.length} windows`);
        
        // Process the windows (same logic as before)
        try {
          const windowArray = Array.isArray(windows) ? windows : [windows];

          // Filter out system windows and empty titles
          const validWindows = windowArray.filter(w => {
            // FIX: Map MainWindowTitle to Title for consistency
            const title = w.MainWindowTitle || w.Title || '';
            const processName = (w.ProcessName || '').toLowerCase();

            // CRITICAL FIX: Enhanced filtering for system processes and meaningless titles
            const systemProcesses = [
              'dwm', 'winlogon', 'csrss', 'smss', 'wininit', 'services', 'lsass',
              'cmd', 'conhost', 'taskhostw', 'dllhost',
              'rundll32', 'regsvr32', 'svchost', 'system'
            ];
            const ignoreTitles = [
              '', 'OleMainThreadWndName', 'Default IME', 'MSCTFIME UI', 'Program Manager',
              'No Active Application Detected', 'Desktop', 'Taskbar', 'Start Menu',
              'Windows Desktop', 'Search', 'Cortana'
            ];

            // Additional checks
            const hasValidTitle = title.length > 0 && title.length < 200;
            const isNotSystemProcess = !systemProcesses.includes(processName);
            const isNotIgnoredTitle = !ignoreTitles.includes(title);
            const isNotEmptyTitle = title.trim().length > 0;

            return isNotSystemProcess &&
              isNotIgnoredTitle &&
              isNotEmptyTitle &&
              hasValidTitle;
          });

          // Map back to standard format
          const mappedWindows = validWindows.map(w => ({
              Title: w.MainWindowTitle || w.Title,
              ProcessName: w.ProcessName,
              ProcessId: w.Id || w.ProcessId,
              ProcessDescription: w.Description || w.ProcessDescription,
              IsForeground: false,
              Width: 0, Height: 0, Left: 0, Top: 0
          }));

          if (DEBUG) {
            console.log(`[WINDOWS-DESKTOP] Found ${mappedWindows.length} valid windows out of ${windowArray.length} total`);
            mappedWindows.forEach(w => {
              console.log(`  "${w.Title}" (${w.ProcessName})`);
            });
          }

          return mappedWindows;
        } catch (parseError) {
          if (DEBUG) console.warn('[WINDOWS-DESKTOP] Parse error:', parseError.message);
        }
      }
    }

    // FALLBACK: Try PowerShell only if tasklist fails
    if (DEBUG) console.log('[WINDOWS-DESKTOP] tasklist failed, trying PowerShell fallback...');
    
    const enumWindowsScript = `
      $ProgressPreference = 'SilentlyContinue';
      Get-Process | Where-Object {$_.MainWindowTitle -ne "" -and $_.MainWindowTitle -ne $null} | Select-Object ProcessName, MainWindowTitle, Id, Description | ConvertTo-Json -Compress
    `;

    // Use inline execution to avoid temp files
    const command = `powershell.exe -NoProfile -NonInteractive -NoLogo -ExecutionPolicy Bypass -Command "${enumWindowsScript.replace(/"/g, '\\"')}"`;
    
    if (DEBUG) console.log('[WINDOWS-DESKTOP] Executing simplified PowerShell command...');
    let enumJson = await execCommand(command);

    if (enumJson) {
      try {
        const windows = JSON.parse(enumJson);
        const windowArray = Array.isArray(windows) ? windows : [windows];

        // Filter out system windows and empty titles
        const validWindows = windowArray.filter(w => {
          const title = w.MainWindowTitle || w.Title || '';
          const processName = (w.ProcessName || '').toLowerCase();

          const systemProcesses = [
            'dwm', 'winlogon', 'csrss', 'smss', 'wininit', 'services', 'lsass',
            'cmd', 'conhost', 'taskhostw', 'dllhost',
            'rundll32', 'regsvr32', 'svchost', 'system'
          ];
          const ignoreTitles = [
            '', 'OleMainThreadWndName', 'Default IME', 'MSCTFIME UI', 'Program Manager',
            'No Active Application Detected', 'Desktop', 'Taskbar', 'Start Menu',
            'Windows Desktop', 'Search', 'Cortana'
          ];

          const hasValidTitle = title.length > 0 && title.length < 200;
          const isNotSystemProcess = !systemProcesses.includes(processName);
          const isNotIgnoredTitle = !ignoreTitles.includes(title);
          const isNotEmptyTitle = title.trim().length > 0;

          return isNotSystemProcess &&
            isNotIgnoredTitle &&
            isNotEmptyTitle &&
            hasValidTitle;
        });

        // Map back to standard format
        const mappedWindows = validWindows.map(w => ({
            Title: w.MainWindowTitle || w.Title,
            ProcessName: w.ProcessName,
            ProcessId: w.Id || w.ProcessId,
            ProcessDescription: w.Description || w.ProcessDescription,
            IsForeground: false,
            Width: 0, Height: 0, Left: 0, Top: 0
        }));

        if (DEBUG) {
          console.log(`[WINDOWS-DESKTOP] Found ${mappedWindows.length} valid windows out of ${windowArray.length} total`);
          mappedWindows.forEach(w => {
            console.log(`  "${w.Title}" (${w.ProcessName})`);
          });
        }

        return mappedWindows;
      } catch (parseError) {
        if (DEBUG) console.warn('[WINDOWS-DESKTOP] Parse error:', parseError.message);
        return [];
      }
    }

    return [];
  } catch (error) {
    if (DEBUG) console.warn('[WINDOWS-DESKTOP] Enumeration error:', error.message);
    return [];
  }
}

/**
 * Get the currently active desktop window
 * Returns the foreground window from the enumerated list
 */
async function getActiveDesktopWindow() {
  try {
    const windows = await enumerateDesktopWindows();

    // Find the foreground window
    const activeWindow = windows.find(w => w.IsForeground);

    if (activeWindow) {
      if (DEBUG) console.log('[WINDOWS-DESKTOP] Active window:', activeWindow.Title);
      return {
        windowTitle: activeWindow.Title,
        processName: activeWindow.ProcessName,
        ProcessDescription: activeWindow.ProcessDescription,
        processId: activeWindow.ProcessId,
        handle: activeWindow.Handle,
        bounds: {
          left: activeWindow.Left,
          top: activeWindow.Top,
          width: activeWindow.Width,
          height: activeWindow.Height
        },
        platform: 'win32',
        method: 'window-enumeration'
      };
    }

    // If no foreground window found, return the first visible window
    if (windows.length > 0) {
      const firstWindow = windows[0];
      if (DEBUG) console.log('[WINDOWS-DESKTOP] Using first window:', firstWindow.Title);
      return {
        windowTitle: firstWindow.Title,
        processName: firstWindow.ProcessName,
        ProcessDescription: firstWindow.ProcessDescription,
        processId: firstWindow.ProcessId,
        handle: firstWindow.Handle,
        bounds: {
          left: firstWindow.Left,
          top: firstWindow.Top,
          width: firstWindow.Width,
          height: firstWindow.Height
        },
        platform: 'win32',
        method: 'window-enumeration-fallback'
      };
    }

    if (DEBUG) console.warn('[WINDOWS-DESKTOP] No windows found');
    return null;
  } catch (error) {
    if (DEBUG) console.warn('[WINDOWS-DESKTOP] Active window detection error:', error.message);
    return null;
  }
}

/**
 * Get all visible desktop windows
 * Returns array of window information
 */
async function getAllDesktopWindows() {
  try {
    const windows = await enumerateDesktopWindows();

    return windows.map(w => ({
      windowTitle: w.Title,
      processName: w.ProcessName,
      ProcessDescription: w.ProcessDescription, // Include for smart app name detection
      processId: w.ProcessId,
      handle: w.Handle,
      isForeground: w.IsForeground,
      bounds: {
        left: w.Left,
        top: w.Top,
        width: w.Width,
        height: w.Height
      },
      platform: 'win32',
      method: 'window-enumeration'
    }));
  } catch (error) {
    if (DEBUG) console.warn('[WINDOWS-DESKTOP] Get all windows error:', error.message);
    return [];
  }
}

/**
 * Check if a window title indicates a browser tab/window
 */
function isBrowserWindow(windowTitle, processName) {
  const browserProcesses = ['chrome', 'msedge', 'firefox', 'brave', 'opera', 'vivaldi', 'iexplore'];
  const processLower = (processName || '').toLowerCase();

  return browserProcesses.some(browser => processLower.includes(browser));
}

/**
 * Unified interface for desktop window detection
 * Returns information about the active desktop window
 */
async function detectActiveDesktopWindow() {
  try {
    const window = await getActiveDesktopWindow();
    if (!window) {
      if (DEBUG) console.log('[WINDOWS-DESKTOP] No active window found');
      return null;
    }

    // CRITICAL FIX: Validate window data before returning
    if (!window.processName || window.processName.trim() === '') {
      if (DEBUG) console.log('[WINDOWS-DESKTOP] Invalid process name, skipping window');
      return null;
    }

    // Determine best app name - prefer ProcessDescription over processName
    let appName = window.processName;
    if (window.ProcessDescription && window.ProcessDescription !== 'Unknown' && window.ProcessDescription.trim() !== '') {
      appName = window.ProcessDescription;
    }

    // CRITICAL FIX: Map "Electron" to "Work Time"
    if (appName.toLowerCase() === 'electron' || window.processName.toLowerCase() === 'electron') {
      appName = 'Work Time';
    }

    return {
      windowTitle: window.windowTitle || 'Untitled Window',
      appName: appName,
      processName: window.processName,
      processId: window.processId,
      windowHandle: window.handle,
      bounds: window.bounds,
      platform: 'win32',
      method: window.method,
      isBrowser: isBrowserWindow(window.windowTitle, window.processName),
      isDesktopWindow: true // Flag to indicate this is window-based detection
    };
  } catch (error) {
    if (DEBUG) console.warn('[WINDOWS-DESKTOP] detectActiveDesktopWindow error:', error.message);
    return null;
  }
}

module.exports = {
  enumerateDesktopWindows,
  getActiveDesktopWindow,
  getAllDesktopWindows,
  detectActiveDesktopWindow,
  isBrowserWindow
};
