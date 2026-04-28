/**
 * Windows URL Capture Implementation
 * Uses UI Automation and title parsing
 */

const { exec } = require('child_process');

class WindowsUrlCapture {
  constructor() {
    this.lastResult = null;
    this.intervalId = null;
    // Always enable debug logging for Windows to diagnose issues
    this.debug = true;
    console.log('[URL-WIN32] Windows URL capture adapter initialized with debug logging enabled');
  }

  start(onEvent) {
    if (this.debug) {
      console.log('[URL-WIN32] Windows URL capture adapter started (manager handles polling)');
    }
    // Store the event handler for manager to use
    this.onEventHandler = onEvent;
    
    // Return stop function (no internal polling - manager handles it)
    return () => {
      this.onEventHandler = null;
      if (this.debug) {
        console.log('[URL-WIN32] Windows URL capture adapter stopped');
      }
    };
  }

  async getCurrentUrl() {
    try {
      if (this.debug) {
        console.log('[URL-WIN32] Starting URL capture check...');
      }
      
      // CRITICAL FIX: ARM64 Windows has broken PowerShell Win32 API
      // Use title-based URL parsing instead
      if (process.arch === 'arm64') {
        if (this.debug) {
          console.log('[URL-WIN32] ARM64 detected - using title-based URL parsing');
        }
        return await this.getCurrentUrlViaTitleParsing();
      }
      
      const frontApp = await this.getFrontmostApp();  // FIX: Added await
      if (!frontApp) {
        if (this.debug) {
          console.log('[URL-WIN32] No frontmost app detected');
        }
        return null;
      }
      
      if (this.debug) {
        console.log('[URL-WIN32] Frontmost app:', frontApp.process, 'Title:', frontApp.title?.substring(0, 80));
      }

      // Check if it's a browser - handle process names with and without .exe
      const processName = frontApp.process.toLowerCase();
      const processBaseName = processName.replace('.exe', '');
      
      const browserName = this.detectBrowserName(processBaseName);
      if (!browserName) {
        if (this.debug) {
          console.log('[URL-WIN32] Not a browser:', processName);
        }
        return null;
      }
      
      if (this.debug) {
        console.log('[URL-WIN32] Browser detected:', browserName);
      }

      let url = null;
      let title = frontApp.title || '';

      // Try to get URL using UI Automation
      try {
        url = await this.getUrlViaUIAutomation(frontApp.process, frontApp.hwnd);
      } catch (e) {
        if (this.debug) {
          console.log(`[URL] UIA failed for ${browserName}, will try other methods`);
        }
      }
      
      // Only try CDP if explicitly enabled and port is already open
      if (!url && process.env.URL_TRACKING_ENABLE_CDP === 'true') {
        try {
          url = await this.getUrlViaCDP(browserName);
        } catch (e) {
          if (this.debug) {
            console.log(`[URL] CDP failed for ${browserName}, falling back to title parse`);
          }
        }
      }

      // If no URL from UIA, try to extract from title
      if (!url && title) {
        url = this.extractUrlFromTitle(title, browserName);
      }

      if (!url) {
        return null;
      }

      // 🔧 FIX: Filter out non-browser web apps (chat, email, etc.) accessed via browser
      const nonBrowserWebAppPatterns = [
        /^cliq\b/i, /^slack\b/i, /^discord\b/i, /^whatsapp\b/i,
        /^telegram\b/i, /^signal\b/i, /^skype\b/i, /^messenger\b/i,
        /^mattermost\b/i, /^rocket\.chat\b/i, /^hangouts\b/i,
        /\bmicrosoft teams\b/i, /\bgoogle chat\b/i, /\bgoogle meet\b/i,
        /\bzoom meeting\b/i,
        /\bzoho mail\b/i, /\byahoo mail\b/i, /\bprotonmail\b/i,
        /\boutlook\b.*\b(inbox|mail|calendar)\b/i,
        /\binbox\b.*\bzoho\b/i, /\binbox\b.*\bgmail\b/i,
      ];
      const titleForFilter = (title || '').trim();
      const isWebAppInBrowser = nonBrowserWebAppPatterns.some(p => p.test(titleForFilter));
      if (isWebAppInBrowser) {
        console.log(`[URL] 🚫 BLOCKED: Non-browser web app: "${title}" (${url})`);
        return null;
      }

      return {
        url: url,
        title: title,
        browser: browserName,
        source: browserName.toLowerCase(),
        windowId: `${frontApp.process}-${frontApp.hwnd}`,
        confidence: url.startsWith('http') ? 'high' : 'low'
      };
    } catch (error) {
      if (this.debug) {
        console.error('[URL] Windows capture error:', error);
      }
      return null;
    }
  }

  async getFrontmostApp() {
    try {
      if (this.debug) {
        console.log('[URL-WIN32] Getting frontmost app via PowerShell...');
      }
      
      // Try native Win32 API approach FIRST (fast path)
      try {
        const { getForegroundWindowInfo, getProcessNameByPid } = require('./native/win32-foreground');
        const { isProcessElevated } = require('./native/elevation');
        const info = getForegroundWindowInfo();
        if (info && info.pid) {
          const procName = getProcessNameByPid(info.pid);
          if (procName) {
            const process = procName.replace(/\.exe$/i, '');
            const title = info.title || '';
            const procLower = process.toLowerCase();
            if (procLower !== 'msedgewebview2' && title !== 'OleMainThreadWndName' && title) {
              // Elevation hint
              let elevated = false;
              try { const el = isProcessElevated(info.pid); elevated = !!el; } catch {}
              if (elevated && this.debug) {
                console.log('[URL-WIN32] Foreground process elevated; UIA/CDP may be limited');
              }
              if (this.debug) console.log('[URL-WIN32] Native win32 foreground result:', { process, title, pid: info.pid, hwnd: info.hwnd });
              return { process, title, hwnd: info.hwnd || 0, pid: info.pid };
            }
          }
        }
      } catch (e) {
        if (this.debug) console.log('[URL-WIN32] Native win32 foreground failed, falling back:', e.message);
      }

      // Try Win32 API via PowerShell (compatibility path)
      try {
        const win32Script = `
          Add-Type @"
            using System;
            using System.Runtime.InteropServices;
            using System.Text;
            public class Win32 {
              [DllImport("user32.dll")]
              public static extern IntPtr GetForegroundWindow();
              [DllImport("user32.dll")]
              public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
              [DllImport("user32.dll")]
              public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
            }
"@
          try {
            $hwnd = [Win32]::GetForegroundWindow()
            if ($hwnd -eq [IntPtr]::Zero) {
              @{ process = "Desktop"; title = "No Active Window"; hwnd = 0; pid = 0 } | ConvertTo-Json -Compress
              return
            }
            $pid = 0
            [Win32]::GetWindowThreadProcessId($hwnd, [ref]$pid) | Out-Null
            $process = Get-Process -Id $pid -ErrorAction SilentlyContinue
            $title = New-Object System.Text.StringBuilder 256
            [Win32]::GetWindowText($hwnd, $title, 256) | Out-Null
            @{
              process = if($process) { $process.ProcessName } else { "Unknown" }
              title = $title.ToString()
              hwnd = $hwnd.ToInt32()
              pid = $pid
            } | ConvertTo-Json -Compress
          } catch {
            @{ process = "Error"; title = $_.Exception.Message; hwnd = 0; pid = 0 } | ConvertTo-Json -Compress
          }
        `;
        
        const result = await new Promise((resolve, reject) => {
          if (this.debug) {
            console.log('[URL-WIN32] Executing Win32 API PowerShell script...');
          }
          const child = exec(`powershell -NoProfile -NonInteractive -NoLogo -ExecutionPolicy Bypass -Command "${win32Script}"`, {
            encoding: 'utf8',
            windowsHide: true,
            shell: true,
            cwd: process.env.TEMP || process.env.SystemRoot || 'C\\\Windows',
            maxBuffer: 1024 * 1024
          }, (error, stdout, stderr) => {
            if (error) {
              if (this.debug) {
                console.error('[URL-WIN32] PowerShell error:', error.message);
                console.error('[URL-WIN32] PowerShell stderr:', stderr);
              }
              // Don't reject on error, try to use stdout if available
              if (stdout && stdout.trim()) {
                if (this.debug) {
                  console.log('[URL-WIN32] Using stdout despite error:', stdout.substring(0, 200));
                }
                resolve(stdout.trim());
                return;
              }
              reject(error);
              return;
            }
            if (this.debug) {
              console.log('[URL-WIN32] Win32 API PowerShell stdout:', stdout.substring(0, 200));
              if (stderr) {
                console.log('[URL-WIN32] Win32 API PowerShell stderr:', stderr.substring(0, 200));
              }
            }
            resolve(stdout.trim());
          });
          
          // Set timeout to prevent hanging (ARM64 and slower systems need more time)
          // CRITICAL: Windows 11 + Antivirus can slow PowerShell significantly
          const timeout = process.arch === 'arm64' ? 8000 : 4000;
          setTimeout(() => {
            if (this.debug) {
              console.log('[URL-WIN32] Win32 API PowerShell timeout, killing process...');
            }
            child.kill();
            reject(new Error('Win32 API PowerShell timeout'));
          }, timeout);  // Increased significantly for compatibility
        });
        
        if (result) {
          try {
            const parsed = JSON.parse(result);
            if (this.debug) {
              console.log('[URL-WIN32] Win32 API PowerShell parsed result:', parsed);
            }
            if (parsed && parsed.process && parsed.process !== 'Error') {
              const proc = String(parsed.process || '').toLowerCase();
              const title = String(parsed.title || '');
              // Filter out WebView2 host and dummy window names
              const isIgnoredProcess = proc === 'msedgewebview2' || proc === 'applicationframehost';
              const isIgnoredTitle = title === 'OleMainThreadWndName' || title === '' || title === 'N/A';
              if (isIgnoredProcess || isIgnoredTitle) {
                if (this.debug) {
                  console.log('[URL-WIN32] Ignoring foreground result:', { proc, title });
                }
              } else {
                if (this.debug) {
                  console.log('[URL-WIN32] Win32 API detected process:', parsed.process, 'Title:', parsed.title?.substring(0, 50));
                }
                // Accept process; browser detection handled later
                return parsed;
              }
            }
          } catch (e) {
            if (this.debug) {
              console.error('[URL-WIN32] Failed to parse Win32 API result:', e.message);
            }
          }
        }
      } catch (e) {
        if (this.debug) {
          console.warn('[URL-WIN32] Simple approach failed:', e.message);
        }
      }
      
      // Fallback to simple process scan if Win32 API fails
      if (this.debug) {
        console.log('[URL-WIN32] Trying simple process scan fallback...');
      }
      const simpleScript = `
        try {
          $activeWindow = Get-Process | Where-Object {$_.MainWindowTitle -ne ""} | Select-Object -First 1
          if ($activeWindow) {
            @{
              process = $activeWindow.ProcessName
              title = $activeWindow.MainWindowTitle
              hwnd = $activeWindow.MainWindowHandle.ToInt32()
              pid = $activeWindow.Id
            } | ConvertTo-Json -Compress
          } else {
            @{ process = "Desktop"; title = "No Active Window"; hwnd = 0; pid = 0 } | ConvertTo-Json -Compress
          }
        } catch {
          @{ process = "Error"; title = $_.Exception.Message; hwnd = 0; pid = 0 } | ConvertTo-Json -Compress
        }
      `;

      const result = await new Promise((resolve, reject) => {
        if (this.debug) {
          console.log('[URL-WIN32] Executing simple process scan PowerShell script...');
        }
        const child = exec(`powershell -NoProfile -NonInteractive -NoLogo -ExecutionPolicy Bypass -Command "${simpleScript}"`, {
          encoding: 'utf8',
          windowsHide: true,
          shell: true,
          cwd: process.env.TEMP || process.env.SystemRoot || 'C\\\Windows'
        }, (error, stdout, stderr) => {
          if (error) {
            if (this.debug) {
              console.error('[URL-WIN32] Simple PowerShell error:', error.message);
              console.error('[URL-WIN32] Simple PowerShell stderr:', stderr);
            }
            // Don't reject on error, try to use stdout if available
            if (stdout && stdout.trim()) {
              if (this.debug) {
                console.log('[URL-WIN32] Using stdout despite error:', stdout.substring(0, 200));
              }
              resolve(stdout.trim());
              return;
            }
            reject(error);
            return;
          }
          if (this.debug) {
            console.log('[URL-WIN32] Simple PowerShell stdout:', stdout.substring(0, 200));
            if (stderr) {
              console.log('[URL-WIN32] Simple PowerShell stderr:', stderr.substring(0, 200));
            }
          }
          resolve(stdout.trim());
        });
        
        // Set timeout to prevent hanging (ARM64 and slower systems need more time)
        const fallbackTimeout = process.arch === 'arm64' ? 6000 : 3000;
        setTimeout(() => {
          if (this.debug) {
            console.log('[URL-WIN32] Simple process scan timeout, killing process...');
          }
          child.kill();
          reject(new Error('Simple process scan timeout'));
        }, fallbackTimeout);  // Increased for compatibility
      });

      if (result) {
        try {
          const parsed = JSON.parse(result);
          if (this.debug) {
            console.log('[URL-WIN32] Win32 PowerShell parsed result:', parsed);
          }
          const proc = String(parsed.process || '').toLowerCase();
          const title = String(parsed.title || '');
          if (proc === 'msedgewebview2' || title === 'OleMainThreadWndName' || !title) {
            if (this.debug) console.log('[URL-WIN32] Ignoring simple scan result:', { proc, title });
          } else {
            return parsed;
          }
        } catch (e) {
          if (this.debug) {
            console.error('[URL-WIN32] Failed to parse Win32 result:', e.message);
          }
        }
      }
      
      // FINAL FALLBACK: tasklist /v scan for known browsers with non-empty titles
      // This is less accurate (not strictly foreground), but helps when API calls are blocked
      try {
        const tasklistResult = await new Promise((resolve) => {
          const cmd = 'tasklist /v /fo csv';
          exec(cmd, {
            encoding: 'utf8',
            windowsHide: true,
            shell: true,
            cwd: process.env.TEMP || process.env.SystemRoot || 'C\\\Windows',
            maxBuffer: 1024 * 1024
          }, (error, stdout) => {
            if (error && !stdout) {
              if (this.debug) console.warn('[URL-WIN32] tasklist fallback error:', error.message);
              resolve(null);
              return;
            }
            resolve(stdout || null);
          });
          setTimeout(() => resolve(null), 1500);
        });

        if (tasklistResult) {
          // Robust CSV parsing to handle embedded commas/quotes
          const parseCsvLine = (line) => {
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
            return parts.map(p => p.replace(/^\"|\"$/g, ''));
          };

          const lines = tasklistResult.split(/\r?\n/).filter(l => l.trim());
          const browserExecutables = [
            'chrome.exe', 'msedge.exe', 'firefox.exe', 'brave.exe', 'opera.exe', 'vivaldi.exe',
            'edge.exe', 'firefox-esr.exe', 'chrome-beta.exe', 'chrome-dev.exe',
            'msedgewebview2.exe', 'brave-browser.exe', 'opera-browser.exe', 'vivaldi-browser.exe',
            'iexplore.exe'
          ];
          for (const rawLine of lines) {
            // Skip header
            const low = rawLine.toLowerCase();
            if (low.includes('imagename') && low.includes('window title')) continue;
            const cols = parseCsvLine(rawLine);
            // Columns: Image Name, PID, Session Name, Session#, Mem Usage, Status, User Name, CPU Time, Window Title
            if (!cols || cols.length < 9) continue;
            const imageName = (cols[0] || '').trim().toLowerCase();
            const windowTitle = (cols[8] || '').trim();
            if (!browserExecutables.includes(imageName)) continue;
            if (!windowTitle || windowTitle === 'N/A' || windowTitle === 'OleMainThreadWndName') continue;
            if (imageName === 'msedgewebview2.exe') continue;
            const processName = imageName.replace(/\.exe$/i, '');
            const parsed = { process: processName, title: windowTitle, hwnd: 0, pid: 0 };
            if (this.debug) console.log('[URL-WIN32] tasklist fallback selected:', parsed);
            return parsed;
          }
        }
      } catch (e) {
        if (this.debug) console.warn('[URL-WIN32] tasklist fallback failed:', e.message);
      }

      return null;
    } catch (error) {
      if (this.debug) {
        console.error('[URL-WIN32] getFrontmostApp error:', error.message || error);
      }
      return null;
    }
  }

  // No export of this helper; kept inline

  async getUrlViaUIAutomation(processName, hwnd) {
    return new Promise((resolve) => {
      try {
        // PowerShell script using UI Automation
        const script = `
          Add-Type -AssemblyName UIAutomationClient
          Add-Type -AssemblyName UIAutomationTypes
          
          $hwnd = ${hwnd}
          $element = [System.Windows.Automation.AutomationElement]::FromHandle($hwnd)
          
          # Try to find the address bar (usually an Edit control with specific automation ID)
          $condition = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Edit)
          $addressBars = $element.FindAll([System.Windows.Automation.TreeScope]::Descendants, $condition)
          
          foreach ($addressBar in $addressBars) {
            try {
              $pattern = $addressBar.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
              $value = $pattern.Current.Value
              if ($value -match '^https?://' -or $value -match '\\.') {
                Write-Output $value
                return
              }
            } catch {}
          }
        `;

        exec(`powershell -NoProfile -NonInteractive -NoLogo -ExecutionPolicy Bypass -Command "${script}"`, {
          encoding: 'utf8',
          windowsHide: true,
          timeout: 2000
        }, (error, stdout) => {
          if (!error && stdout.trim()) {
            resolve(stdout.trim());
          } else {
            resolve(null);
          }
        });
      } catch (error) {
        resolve(null);
      }
    });
  }

  extractUrlFromTitle(title, browserName = '') {
    if (!title) {
      if (this.debug) {
        console.log('[URL-WIN32] No title provided for URL extraction');
      }
      return null;
    }

    if (this.debug) {
      console.log('[URL-WIN32] Extracting URL from title:', title.substring(0, 100));
    }

    // Normalize unusual dash characters and separators
    const normalized = (title || '').replace(/[–—]/g, '-');

    // Direct URL present in title
    const urlMatch = normalized.match(/(https?:\/\/[^\s]+)/i);
    if (urlMatch) {
      if (this.debug) {
        console.log('[URL-WIN32] Found direct URL in title:', urlMatch[1]);
      }
      return urlMatch[1];
    }

    // Common separators used by browsers
    const separators = [' - ', ' — ', ' | ', ' | ', ' – '];
    for (const sep of separators) {
      if (normalized.includes(sep)) {
        const parts = normalized.split(sep).map(p => p.trim()).filter(Boolean);
        if (this.debug) {
          console.log('[URL-WIN32] Split title by separator "' + sep + '":', parts);
        }
        // Heuristic: domain is usually near the end for Chromium-based browsers
        for (let i = parts.length - 1; i >= 0; i--) {
          const candidate = parts[i];
          // Ignore known suffixes like browser name
          const lower = candidate.toLowerCase();
          if (['google chrome', 'microsoft edge', 'brave', 'firefox', 'opera', 'vivaldi', 'chrome', 'edge'].includes(lower)) continue;
          // Extract domain-like tokens
          const domainMatch = candidate.match(/([a-z0-9][a-z0-9\-]*\.)+[a-z]{2,}/i);
          if (domainMatch) {
            const url = `https://${domainMatch[0]}`;
            if (this.debug) {
              console.log('[URL-WIN32] Extracted domain from title:', url);
            }
            return url;
          }
        }
      }
    }

    // Firefox often formats as: "Page Title - SiteName"
    if (browserName === 'Firefox') {
      const ff = normalized.split(' - ');
      if (ff.length >= 2) {
        const candidate = ff[ff.length - 1];
        const domainMatch = candidate.match(/([a-z0-9][a-z0-9\-]*\.)+[a-z]{2,}/i);
        if (domainMatch) {
          const url = `https://${domainMatch[0]}`;
          if (this.debug) {
            console.log('[URL-WIN32] Extracted Firefox domain from title:', url);
          }
          return url;
        }
      }
    }

    // Try to find any domain-like pattern in the title
    const anyDomainMatch = normalized.match(/([a-z0-9][a-z0-9\-]*\.)+[a-z]{2,}/i);
    if (anyDomainMatch) {
      const url = `https://${anyDomainMatch[0]}`;
      if (this.debug) {
        console.log('[URL-WIN32] Extracted any domain from title:', url);
      }
      return url;
    }

    if (this.debug) {
      console.log('[URL-WIN32] No URL found in title');
    }
    return null;
  }

  detectBrowserName(processBaseName) {
    const browserMap = {
      'chrome': 'Chrome',
      'msedge': 'Edge',
      'firefox': 'Firefox',
      'brave': 'Brave',
      'opera': 'Opera',
      'vivaldi': 'Vivaldi',
      'iexplore': 'Internet Explorer',
      'edge': 'Edge',  // Alternative Edge process name
      'firefox-esr': 'Firefox',  // Firefox ESR
      'chrome-beta': 'Chrome',  // Chrome Beta
      'chrome-dev': 'Chrome',   // Chrome Dev
      'msedgewebview2': 'Edge', // Edge WebView2
      'brave-browser': 'Brave', // Alternative Brave name
      'opera-browser': 'Opera', // Alternative Opera name
      'vivaldi-browser': 'Vivaldi' // Alternative Vivaldi name
    };
    
    const detected = browserMap[processBaseName];
    if (this.debug) {
      console.log('[URL-WIN32] Browser detection:', processBaseName, '->', detected);
    }
    return detected || null;
  }

  async getUrlViaCDP(browserName) {
    // Only proceed if CDP is explicitly enabled
    if (process.env.URL_TRACKING_ENABLE_CDP !== 'true') {
      return null;
    }
    
    // Check if debugging port is already open (never auto-enable it)
    const ports = {
      'Chrome': 9222,
      'Edge': 9223,
      'Brave': 9224
    };
    
    const port = ports[browserName];
    if (!port) return null;
    
    try {
      const http = require('http');
      const checkPort = () => new Promise((resolve) => {
        const req = http.get(`http://localhost:${port}/json/version`, (res) => {
          resolve(res.statusCode === 200);
        });
        req.on('error', () => resolve(false));
        req.setTimeout(500, () => {
          req.destroy();
          resolve(false);
        });
      });
      
      const isOpen = await checkPort();
      if (!isOpen) {
        console.log(`[URL] CDP port ${port} not open for ${browserName} - not enabling`);
        return null;
      }
      
      // Port is open, try to get current tab URL
      // Implementation would go here...
      console.log(`[URL] CDP available for ${browserName} but not implemented`);
      return null;
    } catch (error) {
      return null;
    }
  }

  // ARM64-specific method: Title-based URL parsing
  async getCurrentUrlViaTitleParsing() {
    try {
      if (this.debug) {
        console.log('[URL-WIN32-ARM64] Using title-based URL parsing...');
      }
      
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      
      // Get browser processes with titles (this WORKS on ARM64)
      const { stdout } = await execAsync(
        'powershell "Get-Process | Where-Object {$_.MainWindowTitle -and $_.ProcessName -match \'chrome|msedge|firefox|brave\'} | Select-Object ProcessName, MainWindowTitle | ConvertTo-Json"',
        { timeout: 3000 }
      );
      
      if (!stdout.trim()) {
        if (this.debug) {
          console.log('[URL-WIN32-ARM64] No browser windows found');
        }
        return null;
      }
      
      const browsers = JSON.parse(stdout);
      const browserArray = Array.isArray(browsers) ? browsers : [browsers];
      
      if (browserArray.length === 0) return null;
      
      // Get first browser (active one)
      const browser = browserArray[0];
      const title = browser.MainWindowTitle || '';
      const processName = browser.ProcessName || '';
      
      if (this.debug) {
        console.log(`[URL-WIN32-ARM64] Found browser: ${processName} - ${title.substring(0, 60)}`);
      }
      
      // Extract URL from title
      const url = this.extractUrlFromTitle(title, processName);
      
      if (url) {
        if (this.debug) {
          console.log(`[URL-WIN32-ARM64] Extracted URL: ${url}`);
        }
        
        return {
          url: url,
          title: this.cleanBrowserTitle(title),
          browser: this.normalizeBrowserName(processName),
          source: processName.toLowerCase().replace('.exe', ''),
          windowId: `${processName}-arm64`,
          confidence: url.startsWith('http') ? 'medium' : 'low'
        };
      }
      
      if (this.debug) {
        console.log('[URL-WIN32-ARM64] Could not extract URL from title');
      }
      return null;
    } catch (error) {
      if (this.debug) {
        console.error('[URL-WIN32-ARM64] Error:', error.message);
      }
      return null;
    }
  }

  extractUrlFromTitle(title, browser) {
    if (!title) return null;
    
    // Remove browser name suffix
    title = title
      .replace(/ - Google Chrome$/i, '')
      .replace(/ - Microsoft[?]? Edge$/i, '')
      .replace(/ - Mozilla Firefox$/i, '')
      .replace(/ - Brave$/i, '')
      .replace(/ - Profile \d+$/i, '')
      .trim();
    
    // Remove tab count info
    title = title.replace(/ and \d+ more pages?$/i, '').trim();
    
    // Check if title contains full URL
    const urlMatch = title.match(/(https?:\/\/[^\s]+)/);
    if (urlMatch) {
      return urlMatch[1];
    }
    
    // Pattern matching for known sites
    const patterns = {
      'Google': 'https://www.google.com',
      'YouTube': 'https://www.youtube.com',
      'GitHub': 'https://github.com',
      'Stack Overflow': 'https://stackoverflow.com',
      'Twitter': 'https://twitter.com',
      'Facebook': 'https://facebook.com',
      'LinkedIn': 'https://linkedin.com',
      'Reddit': 'https://reddit.com',
      'Wikipedia': 'https://wikipedia.org',
      'Masrawy': 'https://www.masrawy.com',
      'Bitbucket': 'https://bitbucket.org'
    };
    
    // Check for exact matches
    for (const [keyword, url] of Object.entries(patterns)) {
      if (title.toLowerCase().includes(keyword.toLowerCase())) {
        return url;
      }
    }
    
    // Extract first word as domain guess
    const words = title.split(/[\s\-|·]+/);
    if (words.length > 0 && words[0].length > 2) {
      const domain = words[0].toLowerCase().replace(/[^a-z0-9]/g, '');
      if (domain.length > 2) {
        return `https://www.${domain}.com`;
      }
    }
    
    return null;
  }

  cleanBrowserTitle(title) {
    if (!title) return '';
    
    return title
      .replace(/ - Google Chrome$/i, '')
      .replace(/ - Microsoft[?]? Edge$/i, '')
      .replace(/ - Mozilla Firefox$/i, '')
      .replace(/ - Brave$/i, '')
      .replace(/ - Profile \d+$/i, '')
      .replace(/ and \d+ more pages?$/i, '')
      .trim();
  }

  normalizeBrowserName(processName) {
    const normalized = processName.toLowerCase().replace('.exe', '');
    
    const browserMap = {
      'chrome': 'Google Chrome',
      'msedge': 'Microsoft Edge',
      'firefox': 'Mozilla Firefox',
      'brave': 'Brave',
      'opera': 'Opera',
      'vivaldi': 'Vivaldi'
    };
    
    return browserMap[normalized] || processName;
  }
}

module.exports = { WindowsUrlCapture };