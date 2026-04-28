/**
 * Windows Desktop Window Detection Module
 * Focuses on detecting desktop windows rather than just application names
 * Enumerates all visible windows and their titles
 */

const { exec } = require('child_process');

const DEBUG = !!(process.env.DEBUG_WINDOW || process.env.DEBUG);
const METHOD_TIMEOUT_MS = 5000;

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
        if (DEBUG && result) console.log('[WINDOWS-DESKTOP] Command output:', result.substring(0, 500));
        resolve(result);
      });
    } catch (err) {
      if (DEBUG) console.warn('[WINDOWS-DESKTOP] Command exception:', err.message);
      resolve(null);
    }
  });
}

function toEncodedCommand(script) {
  try {
    return Buffer.from(script, 'utf16le').toString('base64');
  } catch {
    return null;
  }
}

/**
 * Enumerate all visible desktop windows
 * Returns array of window objects with titles, positions, sizes
 */
async function enumerateDesktopWindows() {
  try {
    if (DEBUG) console.log('[WINDOWS-DESKTOP] Enumerating desktop windows...');

    // PowerShell script to enumerate all visible windows using Win32 API
    const enumWindowsScript = [
      "$sig = @'",
      'using System;',
      'using System.Runtime.InteropServices;',
      'using System.Text;',
      'public static class Win32 {',
      '  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);',
      '  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc enumProc, IntPtr lParam);',
      '  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);',
      '  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder sb, int nMaxCount);',
      '  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);',
      '  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);',
      '  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out int lpdwProcessId);',
      '  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();',
      '  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }',
      '}',
      "'@;",
      'Add-Type -TypeDefinition $sig -PassThru | Out-Null;',
      '$windows = @();',
      '$foregroundHwnd = [Win32]::GetForegroundWindow();',
      '[Win32]::EnumWindows({',
      '  param($hwnd, $lParam)',
      '  if ([Win32]::IsWindowVisible($hwnd)) {',
      '    $length = [Win32]::GetWindowTextLength($hwnd);',
      '    if ($length -gt 0) {',
      '      $sb = New-Object System.Text.StringBuilder($length + 1);',
      '      $textLength = [Win32]::GetWindowText($hwnd, $sb, $sb.Capacity);',
      '      if ($textLength -gt 0) {',
      '        $title = $sb.ToString();',
      '        $rect = New-Object Win32+RECT;',
      '        $hasRect = [Win32]::GetWindowRect($hwnd, [ref]$rect);',
      '        $pid = 0;',
      '        [Win32]::GetWindowThreadProcessId($hwnd, [ref]$pid);',
      '        $isForeground = $hwnd -eq $foregroundHwnd;',
      '        $processName = "Unknown";',
      '        try { ',
      '          # Use WMI to get more accurate process information',
      '          $process = Get-WmiObject -Class Win32_Process -Filter "ProcessId = $pid" -ErrorAction SilentlyContinue;',
      '          if ($process) {',
      '            $processName = $process.Name;',
      '            # Extract just the executable name without extension',
      '            if ($processName) {',
      '              $processName = [System.IO.Path]::GetFileNameWithoutExtension($processName);',
      '            }',
      '          } else {',
      '            # Fallback to Get-Process if WMI fails',
      '            $process = Get-Process -Id $pid -ErrorAction SilentlyContinue;',
      '            if ($process) {',
      '              $processName = $process.ProcessName;',
      '            }',
      '          }',
      '        } catch { }',
      '        $window = [PSCustomObject]@{',
      '          Handle = [int64]$hwnd;',
      '          Title = $title;',
      '          ProcessId = $pid;',
      '          ProcessName = $processName;',
      '          IsForeground = $isForeground;',
      '          Left = $rect.Left;',
      '          Top = $rect.Top;',
      '          Width = $rect.Right - $rect.Left;',
      '          Height = $rect.Bottom - $rect.Top;',
      '        };',
      '        $script:windows += $window;',
      '      }',
      '    }',
      '  }',
      '  return $true;',
      '}, [IntPtr]::Zero) | Out-Null;',
      '$windows | ConvertTo-Json -Depth 3'
    ].join("\n");

    const enumEnc = toEncodedCommand(enumWindowsScript);
    const enumCommand = `powershell.exe -NoProfile -NonInteractive -NoLogo -ExecutionPolicy Bypass -EncodedCommand ${enumEnc}`;

    const enumJson = await execCommand(enumCommand, 3000);

    if (enumJson) {
      try {
        const windows = JSON.parse(enumJson);
        const windowArray = Array.isArray(windows) ? windows : [windows];

        // Filter out system windows and empty titles
        const validWindows = windowArray.filter(w => {
          const title = w.Title || '';
          const processName = (w.ProcessName || '').toLowerCase();

          // Filter out system processes and meaningless titles
          const systemProcesses = ['dwm', 'winlogon', 'csrss', 'smss', 'wininit'];
          const ignoreTitles = ['', 'OleMainThreadWndName', 'Default IME', 'MSCTFIME UI', 'Program Manager'];

          return !systemProcesses.includes(processName) &&
                 !ignoreTitles.includes(title) &&
                 title.length > 0 &&
                 w.Width > 100 && w.Height > 50; // Must be reasonably sized
        });

        if (DEBUG) {
          console.log(`[WINDOWS-DESKTOP] Found ${validWindows.length} valid windows out of ${windowArray.length} total`);
          validWindows.forEach(w => {
            console.log(`  ${w.IsForeground ? '★' : ' '} "${w.Title}" (${w.ProcessName}) [${w.Width}x${w.Height}]`);
          });
        }

        return validWindows;
      } catch (parseError) {
        if (DEBUG) console.warn('[WINDOWS-DESKTOP] JSON parse error:', parseError.message);
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
 */
async function getActiveDesktopWindow() {
  try {
    const windows = await enumerateDesktopWindows();
    
    if (windows.length === 0) {
      if (DEBUG) console.log('[WINDOWS-DESKTOP] No windows found');
      return null;
    }

    // Find the foreground window
    const activeWindow = windows.find(w => w.IsForeground);
    
    if (activeWindow) {
      if (DEBUG) console.log('[WINDOWS-DESKTOP] Active window:', activeWindow.Title);
      return {
        windowTitle: activeWindow.Title,
        processName: activeWindow.ProcessName,
        processId: activeWindow.ProcessId,
        handle: activeWindow.Handle,
        bounds: {
          left: activeWindow.Left,
          top: activeWindow.Top,
          width: activeWindow.Width,
          height: activeWindow.Height
        },
        platform: 'win32',
        method: 'window-enumeration',
        isForeground: true
      };
    }

    // Fallback to first window if no foreground found
    if (windows.length > 0) {
      const firstWindow = windows[0];
      if (DEBUG) console.log('[WINDOWS-DESKTOP] Using first window:', firstWindow.Title);
      return {
        windowTitle: firstWindow.Title,
        processName: firstWindow.ProcessName,
        processId: firstWindow.ProcessId,
        handle: firstWindow.Handle,
        bounds: {
          left: firstWindow.Left,
          top: firstWindow.Top,
          width: firstWindow.Width,
          height: firstWindow.Height
        },
        platform: 'win32',
        method: 'window-enumeration',
        isForeground: false
      };
    }

    return null;
  } catch (error) {
    if (DEBUG) console.warn('[WINDOWS-DESKTOP] Active window detection error:', error.message);
    return null;
  }
}

/**
 * Get all desktop windows
 */
async function getAllDesktopWindows() {
  try {
    const windows = await enumerateDesktopWindows();

    return windows.map(w => ({
      windowTitle: w.Title,
      processName: w.ProcessName,
      processId: w.ProcessId,
      handle: w.Handle,
      isForeground: w.IsForeground,
      bounds: {
        left: w.Left,
        top: w.Top,
        width: w.Width,
        height: w.Height
      }
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
 * Detect active desktop window (main entry point)
 */
async function detectActiveDesktopWindow() {
  try {
    const window = await getActiveDesktopWindow();
    if (!window) return null;

    return {
      windowTitle: window.windowTitle,
      appName: window.processName, // Keep for compatibility, but now it's process name
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
    if (DEBUG) console.warn('[WINDOWS-DESKTOP] Detection error:', error.message);
    return null;
  }
}

module.exports = {
  detectActiveDesktopWindow,
  getAllDesktopWindows,
  enumerateDesktopWindows,
  getActiveDesktopWindow,
  isBrowserWindow
};

