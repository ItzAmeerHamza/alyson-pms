/**
 * Windows URL Capture - Fast Edition
 * 
 * PERFORMANCE-OPTIMIZED for Windows using active-win (native API)
 * 
 * Detection Methods (in priority order):
 * 1. CDP (Chrome DevTools Protocol) - Primary for Edge/Chrome
 * 2. active-win + Title Parsing - FAST fallback for all browsers
 * 
 * Key Improvements:
 * - Uses active-win native API (~10ms) instead of PowerShell (~3000ms)
 * - Non-blocking - eliminates concurrent_resolver_skip issues
 * - ARM64 Compatible
 * - Works with all browsers
 * 
 * Version: 3.0.0 - Fast Edition
 */

const http = require('http');
let activeWin = null;

// Lazy-load active-win to avoid initialization errors
function getActiveWin() {
  if (!activeWin) {
    try {
      activeWin = require('active-win');
    } catch (error) {
      console.error('[URL-FAST] Failed to load active-win:', error.message);
      return null;
    }
  }
  return activeWin;
}

class WindowsUrlCaptureFast {
  constructor() {
    this.lastResult = null;
    this.onEventHandler = null;
    // MEMORY FIX: Disable verbose step-by-step URL logging in production
    // URL detection still works — only the per-poll console.log calls are suppressed
    // Set to true for debugging URL capture issues
    this.debug = process.env.URL_DEBUG === '1';
    
    // CDP ports to check (Edge/Chrome usually on 9222)
    this.cdpPorts = [9222, 9223, 9224, 9225];
    
    // Cache for CDP connections
    this.cdpCache = {
      lastCheck: 0,
      lastResult: null,
      ttl: 2000 // 2 seconds
    };
    
    // Cache for window info
    // CRITICAL FIX: PowerShell takes 4-5 seconds, so cache TTL must be longer
    // to prevent multiple concurrent PowerShell processes from spawning
    this.windowCache = {
      lastCheck: 0,
      lastResult: null,
      ttl: 10000 // 10 seconds - PowerShell takes 5-9s, so cache must outlast one round-trip
    };
    
    // Lock to prevent concurrent PowerShell calls
    this._psLock = false;
    
    console.log('[URL-FAST] Windows URL Capture Fast Edition initialized');
    console.log('[URL-FAST] Detection: active-win (10ms) + CDP + Title Parsing');
  }

  /**
   * Start URL capture (called by UrlCaptureManager)
   */
  start(onEvent) {
    if (this.debug) {
      console.log('[URL-FAST] URL capture started');
    }
    this.onEventHandler = onEvent;
    
    // Return stop function
    return () => {
      this.onEventHandler = null;
      if (this.debug) {
        console.log('[URL-FAST] URL capture stopped');
      }
    };
  }

  /**
   * Main entry point - FAST detection using active-win
   */
  async getCurrentUrl() {
    try {
      if (this.debug) console.log('═══════════════════════════════════════════════════════════');
      if (this.debug) console.log('🔍 [URL-ADAPTER-STEP-1] Starting URL detection...');
      const startTime = Date.now();
      
      // Step 1: Get active window FAST using active-win (~10ms)
      if (this.debug) console.log('🔍 [URL-ADAPTER-STEP-2] Calling getActiveWindowFast()...');
      const activeWindow = await this.getActiveWindowFast();
      
      if (this.debug) console.log('🔍 [URL-ADAPTER-STEP-3] getActiveWindowFast() result:', {
        hasResult: !!activeWindow,
        title: activeWindow?.title?.substring(0, 50),
        processName: activeWindow?.owner?.name,
        processPath: activeWindow?.owner?.path?.substring(0, 60)
      });
      
      if (!activeWindow) {
        if (this.debug) console.log('❌ [URL-ADAPTER-STEP-3-FAIL] No active window detected - returning null');
        if (this.debug) console.log('═══════════════════════════════════════════════════════════');
        return null;
      }
      
      const windowTime = Date.now() - startTime;
      if (this.debug) console.log(`✓ [URL-ADAPTER-STEP-4] Got window in ${windowTime}ms: ${activeWindow.owner.name}`);
      if (this.debug) console.log('   Title:', activeWindow.title);
      
      // Check if it's a browser
      if (this.debug) console.log('🔍 [URL-ADAPTER-STEP-5] Checking if window is a browser...');
      const browserInfo = this.identifyBrowser(activeWindow);
      if (this.debug) console.log('🔍 [URL-ADAPTER-STEP-6] Browser check result:', {
        isBrowser: browserInfo.isBrowser,
        browserName: browserInfo.name,
        supportsCDP: browserInfo.supportsCDP
      });
      
      if (!browserInfo.isBrowser) {
        if (this.debug) console.log(`❌ [URL-ADAPTER-STEP-6-FAIL] Not a browser: ${activeWindow.owner.name}`);
        if (this.debug) console.log('═══════════════════════════════════════════════════════════');
        return null;
      }
      
      if (this.debug) {
        console.log(`[URL-FAST] Browser detected: ${browserInfo.name}`);
      }
// Step 2: Parse URL from window title (PRIMARY METHOD - always works)
      // This is now the primary method since CDP requires special browser flags
      const titleResult = this.parseUrlFromTitle(activeWindow, browserInfo);
if (titleResult) {
        const totalTime = Date.now() - startTime;
        if (this.debug) {
          console.log(`[URL-FAST] ✓ Title parsing in ${totalTime}ms: ${titleResult.url?.substring(0, 60)}`);
        }
        return titleResult;
      }
      
      // Step 3: Try CDP for Chrome/Edge (OPTIONAL - only if browser was launched with debug flag)
      // Note: CDP requires browser to be started with --remote-debugging-port=9222
      // We try it as fallback but don't depend on it
if (browserInfo.supportsCDP) {
        const cdpResult = await this.detectViaCDPFast();
if (cdpResult) {
          const totalTime = Date.now() - startTime;
          if (this.debug) {
            console.log(`[URL-FAST] ✓ CDP success in ${totalTime}ms: ${cdpResult.url?.substring(0, 60)}`);
          }
          return cdpResult;
        }
      } else {
}
      
      // Step 4: Try UI Automation to read address bar (FALLBACK for when CDP fails)
const uiaResult = await this.detectViaUIAutomation(activeWindow, browserInfo);
      if (uiaResult) {
const totalTime = Date.now() - startTime;
        if (this.debug) {
          console.log(`[URL-FAST] ✓ UI Automation success in ${totalTime}ms: ${uiaResult.url?.substring(0, 60)}`);
        }
        return uiaResult;
      }
      
      const totalTime = Date.now() - startTime;
      if (this.debug) {
        console.log(`[URL-FAST] No URL extracted in ${totalTime}ms`);
      }
      
      return null;
    } catch (error) {
      if (this.debug) {
        console.error('[URL-FAST] Error in getCurrentUrl:', error.message);
      }
      return null;
    }
  }

  /**
   * Get active window using active-win native API (PRIMARY METHOD - ~10ms)
   * Falls back to PowerShell only if active-win is unavailable
   * 
   * PERF FIX: Previously used PowerShell as primary (~4-5 seconds per call),
   * which caused system hangs when combined with frequent polling.
   * active-win uses native Windows API (GetForegroundWindow) and is ~500x faster.
   */
  async getActiveWindowFast() {
    const now = Date.now();
    if (this.debug) console.log('🔍 [GET-ACTIVE-WINDOW] Starting...');

    // Use cache if recent
    if (this.windowCache.lastResult && (now - this.windowCache.lastCheck) < this.windowCache.ttl) {
      if (this.debug) console.log('✓ [GET-ACTIVE-WINDOW] Using cached result');
      return this.windowCache.lastResult;
    }
    
    // PRIMARY: Try active-win native API (~10ms, non-blocking)
    const activeWinModule = getActiveWin();
    if (activeWinModule) {
      try {
        const winResult = await activeWinModule();
        if (winResult) {
          if (this.debug) console.log('✓ [GET-ACTIVE-WINDOW] active-win succeeded:', winResult.owner?.name);
          this.windowCache.lastCheck = now;
          this.windowCache.lastResult = winResult;
          this._activeWinFailCount = 0;
          return winResult;
        }
      } catch (e) {
        this._activeWinFailCount = (this._activeWinFailCount || 0) + 1;
        if (this._activeWinFailCount <= 3) {
          console.warn('⚠️ [GET-ACTIVE-WINDOW] active-win error (attempt ' + this._activeWinFailCount + '):', e.message);
        }
      }
    }
    
    // On transient active-win failures (1-4), return cache instead of expensive PowerShell.
    // PowerShell takes ~500ms per call and causes CPU budget cycling.
    if (this._activeWinFailCount > 0 && this._activeWinFailCount < 5) {
      if (this.debug) console.log('⚠️ [GET-ACTIVE-WINDOW] active-win miss, using cache');
      return this.windowCache.lastResult || null;
    }
    
    // FALLBACK: PowerShell only when active-win is truly unavailable (not loaded or 5+ failures)
    
    // CRITICAL FIX: Prevent concurrent PowerShell calls with a lock
    if (this._psLock) {
      if (this.debug) console.log('⚠️ [GET-ACTIVE-WINDOW] PowerShell already running, returning cached or null');
      return this.windowCache.lastResult || null;
    }
    
    this._psLock = true;
    let result;
    try {
      result = await this.getActiveWindowPowerShell();
    } finally {
      this._psLock = false;
    }

    if (result) {
      // Update cache
      this.windowCache.lastCheck = now;
      this.windowCache.lastResult = result;
    }
    
    return result;
  }

  /**
   * PowerShell method for getting active window
   * CRITICAL: Uses spawn instead of execSync to avoid shell blocking
   */
  async getActiveWindowPowerShell() {
    const { spawn } = require('child_process');
    const psStartTime = Date.now();
    if (this.debug) console.log('🔧 [POWERSHELL] Starting PowerShell window detection (spawn)...');
// CRITICAL FIXES:
    // 1. UTF-8 encoding for Arabic/Unicode titles
    // 2. GetForegroundWindow API for accurate active window
    // 3. Fixed PowerShell Add-Type syntax (no here-strings)
    const csharpCode = 'using System; using System.Runtime.InteropServices; using System.Text; public class Win32 { [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow(); [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count); [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId); }';
    
    // Use the same command logic but passed as args to spawn
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
      let stdout = '';
      let stderr = '';
      
      try {
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
            console.warn('⚠️ [POWERSHELL] Process timed out, killing...');
child.kill();
            resolve(null);
          }
        }, 15000);

        child.stdout.on('data', (data) => {
          stdout += data.toString();
        });

        child.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        child.on('error', (err) => {
          clearTimeout(timeoutId);
          console.error('❌ [POWERSHELL] Spawn error:', err.message);
          resolve(null);
        });

        child.on('close', (code) => {
          clearTimeout(timeoutId);
          const psElapsed = Date.now() - psStartTime;
          
          if (code !== 0) {
            if (this.debug) console.log('⚠️ [POWERSHELL] Exited with code:', code);
            if (stderr && this.debug) console.log('   Stderr:', stderr.substring(0, 200));
          }

          const result = stdout.trim();
          if (this.debug) console.log('🔧 [POWERSHELL] Stdout:', result ? result.substring(0, 100) : 'Empty');
if (result) {
            try {
              const data = JSON.parse(result);
              if (this.debug) console.log('✓ [POWERSHELL] Successfully parsed:', {
                title: data.title?.substring(0, 50),
                processName: data.processName,
                path: data.path?.substring(0, 60)
              });
              resolve({
                title: data.title,
                owner: {
                  name: data.processName,
                  path: data.path
                }
              });
            } catch (e) {
              console.warn('❌ [POWERSHELL] JSON parse error:', e.message);
              resolve(null);
            }
          } else {
            resolve(null);
          }
        });
      } catch (e) {
        console.error('❌ [POWERSHELL] Unexpected error:', e.message);
        resolve(null);
      }
    });
  }

  /**
   * Identify browser from window info (HYBRID DETECTION)
   * Detects browsers dynamically without hardcoding specific names
   */
  identifyBrowser(window) {
    if (!window || !window.owner) {
      return { isBrowser: false, name: 'unknown', supportsCDP: false };
    }
    
    const processName = window.owner.name.toLowerCase();
    const title = (window.title || '').toLowerCase();
    
    // CRITICAL FIX: Exclude code editors and non-browser apps
    const nonBrowserApps = [
      'cursor', 'vscode', 'code', 'atom', 'sublime', 'vim', 'emacs', 
      'intellij', 'pycharm', 'webstorm', 'phpstorm', 'goland', 'rider',
      'cmd', 'powershell', 'terminal', 'explorer', 'notepad', 'electron'
    ];
    
    for (const nonBrowser of nonBrowserApps) {
      if (processName.includes(nonBrowser)) {
        if (this.debug) console.log('[URL] Non-browser:', window.owner.name);
        return { isBrowser: false, name: 'unknown', supportsCDP: false };
      }
    }
    
    // Method 1: Check for browser keywords in process name
    const browserKeywords = [
      'msedge', 'chrome', 'firefox', 'brave', 'opera', 'vivaldi', 'arc',
      'browser', 'chatgpt', 'atlas', 'comet', 'chromium', 'safari'
    ];
    
    const cdpBrowsers = ['msedge', 'chrome', 'brave', 'opera', 'vivaldi', 'arc', 'chromium'];
    
    for (const keyword of browserKeywords) {
      if (processName.includes(keyword)) {
        const supportsCDP = cdpBrowsers.some(cdp => processName.includes(cdp));
        return {
          isBrowser: true,
          name: window.owner.name,
          processName: window.owner.name,
          supportsCDP: supportsCDP
        };
      }
    }
    
    // CRITICAL FIX: Block file extensions in title before checking URL patterns
    const fileExtensions = /\.(md|txt|pdf|doc|docx|js|ts|json|xml|yaml|yml|html|css|jsx|tsx|py|java|cpp|c|h|hpp|rs|go|rb|php|swift|kt|sql|sh|bat|ps1|exe|dmg|zip|tar|gz|rar|7z|png|jpg|jpeg|gif|svg|ico|mp4|mp3|wav|avi|mov|csv|xls|xlsx|ppt|pptx)$/i;
    if (fileExtensions.test(title)) {
      if (this.debug) console.log('[URL] File extension in title:', title.substring(0, 40));
      return { isBrowser: false, name: 'unknown', supportsCDP: false };
    }
    
    // Method 2: Check if title contains URL patterns (indicates browser)
    const urlPatterns = [
      /https?:\/\//i,                    // Has http:// or https://
      /\b[a-z0-9-]+\.[a-z]{2,}\b/i      // Has domain pattern (e.g., example.com)
    ];
    
    for (const pattern of urlPatterns) {
      if (pattern.test(title)) {
        // Has URL in title, likely a browser
        return {
          isBrowser: true,
          name: window.owner.name,
          processName: window.owner.name,
          supportsCDP: false // Unknown browser, assume no CDP
        };
      }
    }
    
    return { isBrowser: false, name: 'unknown', supportsCDP: false };
  }

  /**
   * Method 1: Chrome DevTools Protocol (CDP) - FAST with caching
   */
  async detectViaCDPFast() {
    const now = Date.now();
// Use cache if recent
    if (this.cdpCache.lastResult && (now - this.cdpCache.lastCheck) < this.cdpCache.ttl) {
      return this.cdpCache.lastResult;
    }
    
    if (this.debug) console.log('[CDP] Trying ports:', this.cdpPorts);
    
    // Try ports with timeout (fast fail)
    for (const port of this.cdpPorts) {
      try {
        const tabs = await this.fetchCDPTabsFast(port);
        if (this.debug) console.log(`[CDP] Port ${port}: ${tabs?.length || 0} tabs`);
        if (!tabs || tabs.length === 0) {
          continue;
        }

        // Find the most recently active tab
        const activeTab = tabs.find(t => 
          t.type === 'page' && 
          t.url && 
          !t.url.startsWith('chrome://') && 
          !t.url.startsWith('edge://') &&
          !t.url.startsWith('about:')
        );
        
        if (activeTab && activeTab.url) {
          if (this.debug) console.log(`[CDP] Active tab: ${activeTab.url.substring(0, 60)}`);
          const result = {
            url: activeTab.url,
            title: activeTab.title || '',
            browser: this.detectBrowserByPort(port),
            method: 'cdp',
            timestamp: Date.now()
          };
          
          // Update cache
          this.cdpCache.lastCheck = now;
          this.cdpCache.lastResult = result;
          
          return result;
        }
      } catch (error) {
        // CDP connection failures are expected when browser doesn't have debug port open
        if (this.debug) console.log(`[CDP] Port ${port}: ${error.code || error.message}`);
      }
    }
    
    // Clear cache on failure
    this.cdpCache.lastResult = null;
    return null;
  }

  /**
   * Method 3: UI Automation - Read address bar directly from browser
   * Uses Windows Accessibility API via PowerShell (non-blocking spawn)
   * 
   * PERF WARNING: UIA FindAll('Subtree') traverses the ENTIRE accessibility tree.
   * Chrome creates hundreds of nodes per tab. With 5+ tabs the tree becomes massive,
   * causing 3-10+ second traversals that block the system.
   * 
   * This method is now DISABLED BY DEFAULT and only used when explicitly enabled
   * via URL_ENABLE_UIA=1 env var, because title parsing is sufficient for most cases.
   */
  async detectViaUIAutomation(activeWindow, browserInfo) {
    // PERF FIX: UIA is disabled by default - it causes system hangs with many Chrome tabs.
    // Title parsing (method 2) provides sufficient URL detection for most scenarios.
    // Enable with URL_ENABLE_UIA=1 environment variable if title parsing is insufficient.
    if (process.env.URL_ENABLE_UIA !== '1') {
      return null;
    }
    
    const { spawn } = require('child_process');
    
    // Use cache to avoid calling UIA too frequently (it's slow)
    const now = Date.now();
    // PERF FIX: Increase cache TTL from 5s to 30s to reduce UIA calls
    const uiaCacheTtl = Number(process.env.URL_UIA_CACHE_TTL || 30000);
    if (this._uiaCache && (now - this._uiaCache.time) < uiaCacheTtl) {
      return this._uiaCache.result;
    }
    
    // Skip if already running to prevent process buildup
    if (this._uiaRunning) {
      return this._uiaCache?.result || null;
    }

    // PERF FIX: Track consecutive UIA failures/timeouts and back off
    this._uiaConsecutiveFailures = this._uiaConsecutiveFailures || 0;
    if (this._uiaConsecutiveFailures >= 3) {
      // UIA has failed 3+ times in a row — skip it for 60s
      if (!this._uiaBackoffUntil || now < this._uiaBackoffUntil) {
        return this._uiaCache?.result || null;
      }
      // Reset after backoff period
      this._uiaConsecutiveFailures = 0;
    }

    this._uiaRunning = true;
    
    return new Promise((resolve) => {
      const psCommand = `[Console]::OutputEncoding=[Text.Encoding]::UTF8;Add-Type -AssemblyName UIAutomationClient,UIAutomationTypes 2>$null;$r=[Windows.Automation.AutomationElement]::RootElement;$c=New-Object Windows.Automation.PropertyCondition([Windows.Automation.AutomationElement]::ControlTypeProperty,[Windows.Automation.ControlType]::Edit);$e=$r.FindAll('Subtree',$c)|?{$_.Current.Name -match 'address|url|search'}|Select -First 1;if($e){try{$p=$e.GetCurrentPattern([Windows.Automation.ValuePattern]::Pattern);$v=$p.Current.Value;if($v -match '^https?://'){$v}}catch{}}`;

      let stdout = '';
      let resolved = false;
      
      try {
        const child = spawn('powershell.exe', [
          '-NoProfile', '-NoLogo', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
          '-Command', psCommand
        ], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });

        // PERF FIX: Reduce timeout from 10s to 3s - if UIA takes longer, 
        // it's causing system lag and we should bail out
        const uiaTimeoutMs = Number(process.env.URL_UIA_TIMEOUT_MS || 3000);
        const timeoutId = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            this._uiaRunning = false;
            this._uiaConsecutiveFailures++;
            this._uiaBackoffUntil = Date.now() + 60000; // Back off for 60s after timeout
            try { child.kill(); } catch {}
            if (this.debug) console.log('⚠️ [UIA] Timed out after ' + uiaTimeoutMs + 'ms (failures: ' + this._uiaConsecutiveFailures + ')');
            resolve(this._uiaCache?.result || null);
          }
        }, uiaTimeoutMs);

        child.stdout.on('data', (d) => { stdout += d.toString(); });
        
        child.on('close', (code) => {
          if (resolved) return;
          resolved = true;
          this._uiaRunning = false;
          clearTimeout(timeoutId);
          
          const url = stdout.trim();
          if (url && url.startsWith('http')) {
            this._uiaConsecutiveFailures = 0; // Reset on success
            const result = {
              url: url,
              title: activeWindow?.title || '',
              browser: browserInfo?.name || 'unknown',
              method: 'uia',
              timestamp: Date.now()
            };
            this._uiaCache = { time: now, result };
            resolve(result);
          } else {
            this._uiaConsecutiveFailures++;
            this._uiaCache = { time: now, result: null };
            resolve(null);
          }
        });

        child.on('error', () => {
          if (resolved) return;
          resolved = true;
          this._uiaRunning = false;
          this._uiaConsecutiveFailures++;
          clearTimeout(timeoutId);
          resolve(this._uiaCache?.result || null);
        });
      } catch (e) {
        this._uiaRunning = false;
        this._uiaConsecutiveFailures++;
        resolve(this._uiaCache?.result || null);
      }
    });
  }

  /**
   * Fetch tabs from Chrome DevTools Protocol (FAST - 500ms timeout)
   */
  fetchCDPTabsFast(port) {
    return new Promise((resolve, reject) => {
      const req = http.get(`http://localhost:${port}/json`, { timeout: 500 }, (res) => {
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
    // Most browsers use 9222 as default
    return 'chromium';
  }

  /**
   * Method 2: Parse URL from window title (IMMEDIATE - 0ms)
   * PERF FIX: Reduced logging — previously 15+ log lines per call were causing
   * GC pressure and I/O blocking on every 2.5s poll cycle.
   */
  parseUrlFromTitle(window, browserInfo) {
    if (!window || !window.title) {
      return null;
    }
    
    const title = window.title;
    
    // Special handling for empty or generic titles
    if (!title || title.length < 3) {
      return null;
    }
    
    if (this.debug) {
      console.log('🔍 [TITLE-PARSE] Browser:', browserInfo.name, '| Title:', title.substring(0, 80));
    }
    
    const cleanTitle = this.cleanBrowserTitle(title, browserInfo.name);
    
    // Extract URL from title
    const url = this.extractUrlFromTitle(cleanTitle, title);
    
    if (url) {
      if (this.debug) {
        console.log('✅ [TITLE-PARSE] Extracted:', url);
      }
      
      // Determine confidence based on how we found the URL
      let confidence = 'low';
      if (url.match(/^https?:\/\//)) {
        confidence = 'high';  // Full URL with protocol
      } else if (url.includes('.com') || url.includes('.org') || url.includes('.net')) {
        confidence = 'medium';  // Domain pattern
      }
      
      return {
        url: url,
        title: cleanTitle || title,
        browser: browserInfo.name,
        method: 'window-title',
        confidence: confidence,
        timestamp: Date.now()
      };
    }
    
    return null;
  }

  /**
   * Extract URL from window title
   * Enhanced to handle various title formats with file path blocking
   */
  extractUrlFromTitle(cleanTitle, originalTitle) {
// CRITICAL: Block file paths before any URL extraction
    const fileExtensions = /\.(md|txt|pdf|doc|docx|js|ts|json|xml|yaml|yml|html|css|jsx|tsx|py|java|cpp|c|h|hpp|rs|go|rb|php|swift|kt|sql|sh|bat|ps1|exe|dmg|zip|tar|gz|rar|7z|png|jpg|jpeg|gif|svg|ico|mp4|mp3|wav|avi|mov|csv|xls|xlsx|ppt|pptx)$/i;
    
    if (fileExtensions.test(cleanTitle) || fileExtensions.test(originalTitle)) {
      if (this.debug) console.log('[URL-EXTRACT] Blocked - file path detected');
      return null;
    }
    
    // Pattern 1: Full URL in title (e.g., "https://example.com - Browser")
    const urlMatch = originalTitle.match(/(https?:\/\/[^\s<>"{}|\\^`\[\]]+)/i);
    if (urlMatch) {
      const url = urlMatch[1];
      // Double-check extracted URL doesn't end with file extension
      if (fileExtensions.test(url)) {
        if (this.debug) console.log('[URL-EXTRACT] Blocked - URL ends with file extension:', url);
        return null;
      }
      if (this.debug) console.log('[URL-EXTRACT] Found full URL:', url.substring(0, 60));
      return url;
    }
    
    // Pattern 2: Domain in title (e.g., "google.com", "www.example.com")
    // Check both cleaned and original title for domain patterns
    const domainMatch = cleanTitle.match(/\b([a-z0-9-]+\.)+[a-z]{2,}\b/i) || 
                       originalTitle.match(/\b([a-z0-9-]+\.)+[a-z]{2,}\b/i);
    if (domainMatch) {
      let domain = domainMatch[0];
      if (this.debug) console.log('[URL-EXTRACT] Found domain pattern:', domain);
      
      // Block if domain is part of an email address (e.g., "user@domain.com" or "first.last@company.com")
      // The regex may match the local part ("first.last") or the domain part of an email.
      // Check both cleaned and original title for email patterns containing this domain.
      const emailCheckPattern = new RegExp(`\\w+@${domain.replace(/\./g, '\\.')}`, 'i');
      const localPartEmailPattern = new RegExp(`${domain.replace(/\./g, '\\.')}@`, 'i');
      if (emailCheckPattern.test(originalTitle) || emailCheckPattern.test(cleanTitle) ||
          localPartEmailPattern.test(originalTitle) || localPartEmailPattern.test(cleanTitle)) {
        if (this.debug) console.log('[URL-EXTRACT] Blocked - email address domain:', domain);
        return null;
      }
      
      // Block if domain ends with file extension
      if (fileExtensions.test(domain)) {
        if (this.debug) console.log('[URL-EXTRACT] Blocked - domain is file:', domain);
        return null;
      }
      
      // Clean up common false positives
      const invalidDomains = [
        'localhost', 
        'file.txt', 
        'image.png', 
        'document.pdf',
        'studio.code',
        'visual.studio'
      ];
      
      if (!invalidDomains.some(invalid => domain.toLowerCase().includes(invalid))) {
        if (!domain.startsWith('http')) {
          domain = 'https://' + domain;
        }
        return domain;
      }
    }
    
    // Pattern 3: Extract from common title patterns
    // "Site Name | Page Title - Browser" -> try to construct URL
    const titleParts = cleanTitle.split(/[\|\-]/);
if (titleParts.length > 0) {
      const firstPart = titleParts[0].trim().toLowerCase();
      
      const knownSites = {
        'google': 'https://www.google.com',
        'youtube': 'https://www.youtube.com',
        'github': 'https://github.com',
        'gitlab': 'https://gitlab.com',
        'bitbucket': 'https://bitbucket.org',
        'stackoverflow': 'https://stackoverflow.com',
        'stack overflow': 'https://stackoverflow.com',
        'twitter': 'https://twitter.com',
        'x': 'https://x.com',
        'facebook': 'https://facebook.com',
        'linkedin': 'https://linkedin.com',
        'reddit': 'https://reddit.com',
        'wikipedia': 'https://wikipedia.org',
        'amazon': 'https://amazon.com',
        'netflix': 'https://netflix.com',
        'alyson': 'https://alyson-pms.vercel.app',
        'gmail': 'https://mail.google.com',
        'outlook': 'https://outlook.office.com',
        'teams': 'https://teams.microsoft.com',
        'slack': 'https://slack.com',
        'notion': 'https://notion.so',
        'figma': 'https://figma.com',
        'canva': 'https://canva.com'
      };

      // Try exact match first
      if (knownSites[firstPart]) {
        if (this.debug) console.log('[URL-EXTRACT] Known site:', firstPart);
        return knownSites[firstPart];
      }
      
      // Try partial match
      for (const [keyword, url] of Object.entries(knownSites)) {
        if (firstPart.includes(keyword)) {
          if (this.debug) console.log('[URL-EXTRACT] Known site (partial):', keyword);
          return url;
        }
      }
      
      // GENERIC SOLUTION: Try to construct URL from brand name
      // CRITICAL FIX: Check ALL parts of the title for domain-like patterns
      // The site name is often NOT the first part (e.g., "Egypt - Grokipedia" -> site is "Grokipedia")
// FIX: Search ALL title parts for the most likely domain name (not just first part)
      // Priority: Look for parts that match known domain patterns or tech company naming conventions
      const allParts = titleParts.map(p => p.trim().toLowerCase().replace(/[^a-z0-9]/g, ''));
      const validDomainParts = allParts.filter(p => p.length >= 3 && p.length <= 30 && /^[a-z]/.test(p));
      
      // Skip generic words that are unlikely to be domain names
      const genericWords = new Set([
        'the', 'and', 'for', 'not', 'you', 'all', 'can', 'had', 'her', 'was', 'one', 'our', 'out',
        'page', 'home', 'about', 'contact', 'help', 'login', 'signup', 'register', 'search',
        'new', 'old', 'top', 'best', 'free', 'how', 'why', 'what', 'when', 'where', 'who',
        'egypt', 'usa', 'india', 'china', 'japan', 'korea', 'france', 'germany', 'italy', 'spain',
        'russia', 'brazil', 'mexico', 'canada', 'australia', 'england', 'africa', 'europe', 'asia',
        'news', 'blog', 'post', 'article', 'story', 'video', 'image', 'photo', 'picture',
        'classic', 'modern', 'ancient', 'medieval', 'history', 'culture', 'travel', 'food',
        'v02', 'v01', 'v10', 'v20', 'beta', 'alpha' // version strings
      ]);
      
      // Find the best candidate - prefer later parts (site name usually at end) and longer names
      let bestCandidate = null;
      let bestScore = 0;
      
      for (let i = 0; i < validDomainParts.length; i++) {
        const part = validDomainParts[i];
        if (genericWords.has(part)) {
continue; // Skip generic words
        }
        
        // Score based on: position (later = better), length (longer = better for brand names)
        const positionScore = i + 1; // Later parts score higher
        const lengthScore = Math.min(part.length / 10, 1); // Longer names score higher
        const score = positionScore + lengthScore;
        
        if (score > bestScore) {
          bestScore = score;
          bestCandidate = part;
        }
      }
      if (bestCandidate) {
        const constructedUrl = `https://${bestCandidate}.com`;
        if (this.debug) console.log('[URL-EXTRACT] Best candidate:', constructedUrl);
        return constructedUrl;
      }
    }
    
    const lowerTitle = cleanTitle.toLowerCase();
    const lowerOriginal = originalTitle.toLowerCase();
    const sitePatterns = {
      'google': 'https://www.google.com',
      'youtube': 'https://www.youtube.com',
      'github': 'https://github.com',
      'gitlab': 'https://gitlab.com',
      'bitbucket': 'https://bitbucket.org',
      'stackoverflow': 'https://stackoverflow.com',
      'twitter': 'https://twitter.com',
      'facebook': 'https://facebook.com',
      'linkedin': 'https://linkedin.com',
      'reddit': 'https://reddit.com',
      'wikipedia': 'https://wikipedia.org',
      'alyson': 'https://alyson-pms.vercel.app',
    };

    // Check both cleaned and original title
    for (const [keyword, url] of Object.entries(sitePatterns)) {
      if (lowerTitle.includes(keyword) || lowerOriginal.includes(keyword)) {
        if (this.debug) console.log('[URL-EXTRACT] Keyword match:', keyword);
        return url;
      }
    }
    
    return null;
  }

  /**
   * Clean browser title (remove browser name suffix and tab counts)
   * Enhanced to handle various browser title formats
   */
  cleanBrowserTitle(title, browserName) {
    if (!title) return '';
    
    // Remove common browser suffixes
    const suffixes = [
      / - Google Chrome$/i,
      / - Microsoft[®?]? Edge$/i,
      / - Mozilla Firefox$/i,
      / - Brave$/i,
      / - Opera$/i,
      / - Vivaldi$/i,
      / - Profile \d+$/i,
      / and \d+ more pages?$/i,
      / and \d+ more page$/i,
      / \(\d+\)$/i,  // Tab count in parentheses
      / \[\d+\]$/i,   // Tab count in brackets
      / - \d+ tab[s]?$/i
    ];
    
    let cleaned = title;
    for (const suffix of suffixes) {
      cleaned = cleaned.replace(suffix, '');
    }
    
    // Remove " - Profile X - Browser" pattern (common in Edge/Chrome)
    cleaned = cleaned.replace(/ - Profile \d+ - [^-]+$/i, '');
    
    // Trim whitespace
    cleaned = cleaned.trim();
    
    return cleaned;
  }
}

// Export for UrlCaptureManager
module.exports = { WindowsUrlCaptureFast };
