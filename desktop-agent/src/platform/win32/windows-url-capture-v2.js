/**
 * Windows URL Capture V2 - Complete Rewrite
 * 
 * Detection Methods (in priority order):
 * 1. CDP (Chrome DevTools Protocol) - Primary for Edge/Chrome
 * 2. Accessibility API - Fallback for Firefox
 * 3. Window Title Parsing - Last Resort
 * 
 * ARM64 Compatible | Simple | Reliable
 * Version: 2.0.0
 */

const { exec } = require('child_process');
const http = require('http');

class WindowsUrlCaptureV2 {
  constructor() {
    this.lastResult = null;
    this.onEventHandler = null;
    this.debug = process.env.URL_DEBUG_LOGGING === 'true' || process.env.LOG_URL_VERBOSE === 'true';

    // CDP ports to check (Edge/Chrome usually on 9222)
    this.cdpPorts = [9222, 9223, 9224, 9225];

    // Cache for active browser detection
    this.activeBrowserCache = null;
    this.activeBrowserCacheTime = 0;
    this.activeBrowserCacheTTL = 2000; // 2 seconds

    console.log('[URL-V2] Windows URL Capture V2 initialized');
    console.log('[URL-V2] Detection methods: CDP → Accessibility → Window Title');
  }

  /**
   * Start URL capture (called by UrlCaptureManager)
   */
  start(onEvent) {
    if (this.debug) {
      console.log('[URL-V2] URL capture started (manager handles polling)');
    }
    this.onEventHandler = onEvent;

    // Return stop function
    return () => {
      this.onEventHandler = null;
      if (this.debug) {
        console.log('[URL-V2] URL capture stopped');
      }
    };
  }

  /**
   * Main entry point - tries all detection methods in order
   */
  async getCurrentUrl() {
    try {
      // CRITICAL FIX: ARM64 Windows has broken PowerShell Win32 API
      // Use title-based URL parsing instead
      if (process.arch === 'arm64') {
        if (this.debug) {
          console.log('[URL-V2] ARM64 detected - using title-based URL parsing');
        }
        return await this.getCurrentUrlViaTitleParsing();
      }

      if (this.debug) {
        console.log('[URL-V2] Starting URL detection...');
      }

      // Method 1: Try CDP (Chrome DevTools Protocol) - Most Reliable
      const cdpResult = await this.detectViaCDP();
      if (cdpResult) {
        if (this.debug) {
          console.log(`[URL-V2] ✓ Detected via CDP: ${cdpResult.url?.substring(0, 60)}`);
        }
        return cdpResult;
      }

      // Method 2: Try Accessibility API (Firefox fallback)
      const axResult = await this.detectViaAccessibility();
      if (axResult) {
        if (this.debug) {
          console.log(`[URL-V2] ✓ Detected via Accessibility: ${axResult.url?.substring(0, 60)}`);
        }
        return axResult;
      }

      // Method 3: Try Window Title Parsing (Last Resort)
      const titleResult = await this.detectViaWindowTitle();
      if (titleResult) {
        if (this.debug) {
          console.log(`[URL-V2] ✓ Detected via Window Title: ${titleResult.url?.substring(0, 60)}`);
        }
        return titleResult;
      }

      if (this.debug) {
        console.log('[URL-V2] No URL detected by any method');
      }

      return null;
    } catch (error) {
      if (this.debug) {
        console.error('[URL-V2] Error in getCurrentUrl:', error.message);
      }
      return null;
    }
  }

  /**
   * Method 1: Chrome DevTools Protocol (CDP)
   * Most reliable for Edge/Chrome - requires --remote-debugging-port flag
   */
  async detectViaCDP() {
    for (const port of this.cdpPorts) {
      try {
        const tabs = await this.fetchCDPTabs(port);
        if (!tabs || tabs.length === 0) continue;

        // Find the most recently active tab
        const activeTab = tabs.find(t => t.type === 'page' && t.url && !t.url.startsWith('chrome://') && !t.url.startsWith('edge://'));

        if (activeTab && activeTab.url) {
          const browserName = this.detectBrowserByPort(port);

          return {
            url: activeTab.url,
            title: activeTab.title || '',
            browser: browserName,
            method: 'cdp',
            timestamp: Date.now()
          };
        }
      } catch (error) {
        // Port not available or connection failed - silent fail and try next port
        if (this.debug && error.code !== 'ECONNREFUSED') {
          console.log(`[URL-V2] CDP port ${port} error:`, error.code || error.message);
        }
      }
    }

    return null;
  }

  /**
   * Fetch tabs from Chrome DevTools Protocol
   */
  fetchCDPTabs(port) {
    return new Promise((resolve, reject) => {
      // CRITICAL FIX: Increased timeout for Windows 11 compatibility
      const req = http.get(`http://localhost:${port}/json`, { timeout: 2000 }, (res) => {
        let data = '';

        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const tabs = JSON.parse(data);
            resolve(tabs);
          } catch (e) {
            reject(e);
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Timeout'));
      });
    });
  }

  /**
   * Detect browser name by CDP port
   */
  detectBrowserByPort(port) {
    // Check which browser process is using this port
    if (port === 9222) {
      // Most common - could be Edge or Chrome
      return 'chromium'; // Generic for now
    }
    return 'chromium';
  }

  /**
   * Method 2: Accessibility API (for Firefox and non-CDP browsers)
   * Uses PowerShell UI Automation to read address bar
   */
  async detectViaAccessibility() {
    try {
      // Get active browser window
      const activeBrowser = await this.getActiveBrowser();
      if (!activeBrowser) {
        return null;
      }

      // Firefox-specific: Try to read address bar via UI Automation
      if (activeBrowser.name.toLowerCase().includes('firefox')) {
        const url = await this.getFirefoxUrlViaUIAutomation();
        if (url) {
          return {
            url: url,
            title: activeBrowser.title || '',
            browser: 'firefox',
            method: 'accessibility',
            timestamp: Date.now()
          };
        }
      }

      // For other browsers, fall through to window title parsing
      return null;
    } catch (error) {
      if (this.debug) {
        console.log('[URL-V2] Accessibility detection error:', error.message);
      }
      return null;
    }
  }

  /**
   * Get Firefox URL via UI Automation (PowerShell)
   */
  getFirefoxUrlViaUIAutomation() {
    return new Promise((resolve) => {
      const script = `
        $ProgressPreference = "SilentlyContinue";
        try {
          Add-Type -AssemblyName UIAutomationClient
          $firefox = Get-Process firefox -ErrorAction SilentlyContinue | Where-Object {$_.MainWindowHandle -ne 0} | Select-Object -First 1
          if ($firefox) {
            $automation = [System.Windows.Automation.AutomationElement]::FromHandle($firefox.MainWindowHandle)
            $condition = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Edit)
            $addressBar = $automation.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $condition)
            if ($addressBar) {
              $pattern = $addressBar.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
              $url = $pattern.Current.Value
              Write-Output $url
            }
          }
        } catch {
          # Silent fail
        }
      `;

      // CRITICAL FIX: Increased timeout for Windows 11 + Antivirus
      const timeout = process.arch === 'arm64' ? 6000 : 4000;
      exec(`powershell.exe -NoProfile -NonInteractive -Command "${script.replace(/"/g, '\\"')}"`,
        { timeout },
        (error, stdout) => {
          if (error || !stdout) {
            resolve(null);
            return;
          }

          const url = stdout.trim();
          if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
            resolve(url);
          } else {
            resolve(null);
          }
        }
      );
    });
  }

  /**
   * Method 3: Window Title Parsing (Last Resort)
   * Extracts URLs from browser window titles
   */
  async detectViaWindowTitle() {
    try {
      const activeBrowser = await this.getActiveBrowser();
      if (!activeBrowser) {
        return null;
      }

      const title = activeBrowser.title || '';

      // Many browsers show URL in window title
      // Pattern: "Page Title - URL - Browser Name"
      // Or: "URL - Browser Name"

      // Try to extract URL from title
      const urlPatterns = [
        /https?:\/\/[^\s<>"{}|\\^`\[\]]+/i,  // Standard URL pattern
        /([a-z0-9-]+\.)+[a-z]{2,}(\/[^\s]*)?/i  // Domain pattern
      ];

      for (const pattern of urlPatterns) {
        const match = title.match(pattern);
        if (match) {
          let url = match[0];

          // If it's just a domain, add https://
          if (!url.startsWith('http')) {
            url = 'https://' + url;
          }

          return {
            url: url,
            title: title,
            browser: activeBrowser.name,
            method: 'window-title',
            timestamp: Date.now()
          };
        }
      }

      return null;
    } catch (error) {
      if (this.debug) {
        console.log('[URL-V2] Window title detection error:', error.message);
      }
      return null;
    }
  }

  /**
   * Get the active browser window
   * Returns { name: 'msedge', title: 'Window Title' } or null
   */
  async getActiveBrowser() {
    // Use cache if recent
    const now = Date.now();
    if (this.activeBrowserCache && (now - this.activeBrowserCacheTime) < this.activeBrowserCacheTTL) {
      return this.activeBrowserCache;
    }

    try {
      const result = await this.getActiveWindow();
      if (!result) {
        this.activeBrowserCache = null;
        return null;
      }

      // Check if it's a browser
      const browserNames = ['msedge', 'chrome', 'firefox', 'brave', 'opera', 'vivaldi', 'arc'];
      const isBrowser = browserNames.some(name => result.name.toLowerCase().includes(name));

      if (!isBrowser) {
        this.activeBrowserCache = null;
        return null;
      }

      // Map to friendly names
      let browserName = 'unknown';
      if (result.name.includes('msedge')) browserName = 'edge';
      else if (result.name.includes('chrome')) browserName = 'chrome';
      else if (result.name.includes('firefox')) browserName = 'firefox';
      else if (result.name.includes('brave')) browserName = 'brave';
      else if (result.name.includes('opera')) browserName = 'opera';

      const browser = {
        name: browserName,
        title: result.title || '',
        processName: result.name
      };

      this.activeBrowserCache = browser;
      this.activeBrowserCacheTime = now;

      return browser;
    } catch (error) {
      if (this.debug) {
        console.log('[URL-V2] Error getting active browser:', error.message);
      }
      this.activeBrowserCache = null;
      return null;
    }
  }

  /**
   * Get active window using PowerShell
   */
  getActiveWindow() {
    return new Promise((resolve) => {
      const script = `
        $ProgressPreference="SilentlyContinue";
        Add-Type @'
        using System;
        using System.Runtime.InteropServices;
        public class User32 {
          [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
          [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out int lpdwProcessId);
        }
'@ -PassThru | Out-Null;
        $h = [User32]::GetForegroundWindow();
        if ($h -eq [IntPtr]::Zero) { return }
        $pid = 0; [User32]::GetWindowThreadProcessId($h, [ref]$pid) | Out-Null;
        $p = Get-Process -Id $pid -ErrorAction SilentlyContinue;
        if ($p) {
          $o = [PSCustomObject]@{ ProcessName = $p.ProcessName; MainWindowTitle = $p.MainWindowTitle; Id = $pid };
          $o | ConvertTo-Json -Compress
        } else {
          Write-Output ""
        }
      `;

      // CRITICAL FIX: Increased timeout for Windows 11 + Antivirus
      const timeout = process.arch === 'arm64' ? 5000 : 3000;
      exec(`powershell.exe -NoProfile -NonInteractive -Command "${script.replace(/"/g, '\\"')}"`,
        { timeout },
        (error, stdout) => {
          if (error || !stdout || !stdout.trim()) {
            resolve(null);
            return;
          }

          try {
            const result = JSON.parse(stdout.trim());
            resolve({
              name: result.ProcessName || '',
              title: result.MainWindowTitle || '',
              pid: result.Id
            });
          } catch (e) {
            resolve(null);
          }
        }
      );
    });
  }

  // ARM64-specific method: Title-based URL parsing
  async getCurrentUrlViaTitleParsing() {
    try {
      if (this.debug) {
        console.log('[URL-V2-ARM64] Using title-based URL parsing...');
      }

      const { promisify } = require('util');
      const execAsync = promisify(exec);

      // Get browser processes with titles (this WORKS on ARM64)
      const { stdout } = await execAsync(
        'powershell "Get-Process | Where-Object {$_.MainWindowTitle -and $_.ProcessName -match \'chrome|msedge|firefox|brave\'} | Select-Object ProcessName, MainWindowTitle | ConvertTo-Json"',
        { timeout: 3000 }
      );

      if (!stdout.trim()) {
        if (this.debug) {
          console.log('[URL-V2-ARM64] No browser windows found');
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
        console.log(`[URL-V2-ARM64] Found browser: ${processName} - ${title.substring(0, 60)}`);
      }

      // Extract URL from title
      const url = this.extractUrlFromTitle(title, processName);

      if (url) {
        if (this.debug) {
          console.log(`[URL-V2-ARM64] Extracted URL: ${url}`);
        }

        return {
          url: url,
          title: this.cleanBrowserTitle(title),
          browser: this.normalizeBrowserName(processName),
          confidence: url.startsWith('http') ? 'medium' : 'low'
        };
      }

      if (this.debug) {
        console.log('[URL-V2-ARM64] Could not extract URL from title');
      }
      return null;
    } catch (error) {
      if (this.debug) {
        console.error('[URL-V2-ARM64] Error:', error.message);
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
      'Bitbucket': 'https://bitbucket.org',
      'Ebdaa Work Time': 'https://worktime.ebdaadt.com',
      'Work Time': 'https://worktime.ebdaadt.com'
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

  /**
   * Special handling for known internal apps or redirects
   */
  fixKnownUrlIssues(url) {
    if (!url) return url;

    // Fix: worktime.ebdaadt.com/login showing as app.ebdaatech.com
    // This happens because of redirects or title matching issues
    if (url.includes('app.ebdaatech.com')) {
      // If we can't be sure, we might want to check the title again
      // But for now, let's trust the capture unless we have a specific reason not to
    }

    return url;
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

// Export for UrlCaptureManager
module.exports = { WindowsUrlCaptureV2 };




