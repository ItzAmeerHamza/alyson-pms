/**
 * macOS URL Capture Implementation
 * JavaScript version for runtime compatibility
 * OPTIMIZED: Async AppleScript + Smart Detection
 */

const { exec } = require('child_process');
const { UrlResultCache, stableUrlCacheTitle } = require('../../lib/url-result-cache');

class DarwinUrlCapture {
  constructor() {
    this.lastResult = null;
    this.elementCache = new Map(); // Cache AX elements by app name + window ID
    this.resolverBackoff = new Map(); // Track failed resolvers

    // Smart detection improvements
    this.browserCache = new Map(); // Cache browser status and URLs
    this.lastAppCheck = 0; // Last app detection timestamp
    this.cacheTTL = 3000; // Cache TTL in milliseconds
    this.lastBrowserChange = 0; // Last browser change timestamp
    this.currentBrowser = null; // Current active browser
    
    // Same tab → reuse last URL on Mac and Windows (shared UrlResultCache).
    this.urlCache = new UrlResultCache();
    this.urlCacheTTL = this.urlCache.ttlMs;
  }

  stableUrlCacheTitle(title) {
    return stableUrlCacheTitle(title);
  }

  /**
   * Get browser name from app name and title (HYBRID DETECTION)
   * Detects browsers dynamically without hardcoding specific names
   * 🔧 MAC FIX: Detect ANY browser unless explicitly blocked
   */
  getBrowserName(appName, title = '') {
    if (!appName) return null;

    const name = appName.toLowerCase();
    const titleLower = (title || '').toLowerCase();

    // CRITICAL FIX: Exclude code editors and non-browser apps
    const nonBrowserApps = [
      'cursor', 'vscode', 'code', 'atom', 'sublime', 'vim', 'emacs',
      'intellij', 'pycharm', 'webstorm', 'phpstorm', 'goland', 'rider',
      'terminal', 'iterm', 'finder', 'electron',
      // Email Clients
      'zoho mail', 'mail', 'outlook', 'thunderbird', 'spark', 'superhuman',
      // Office Suite
      'word', 'excel', 'powerpoint', 'pages', 'numbers', 'keynote',
      // Chat & Collaboration
      'slack', 'discord', 'whatsapp', 'telegram', 'signal', 'teams', 'skype', 'zoom', 'cliq',
      // Utilities
      'notes', 'textedit', 'preview', 'calculator', 'calendar', 'reminders', 'notion', 'obsidian'
    ];

    for (const nonBrowser of nonBrowserApps) {
      if (name.includes(nonBrowser)) {
        if (process.env.DEBUG_URL) {
          console.log('[URL] BLOCKED: Non-browser app detected:', appName);
        }
        return null; // Explicitly not a browser
      }
    }

    // CRITICAL FIX: Map browser keywords to STANDARDIZED names for AX API compatibility
    // The AX API checks use exact matches like 'Safari', 'Chrome', 'Firefox'
    const browserMappings = [
      { keywords: ['safari'], standardName: 'Safari' },
      { keywords: ['chrome'], standardName: 'Chrome' },
      { keywords: ['firefox'], standardName: 'Firefox' },
      { keywords: ['edge'], standardName: 'Edge' },
      { keywords: ['brave'], standardName: 'Brave' },
      { keywords: ['opera'], standardName: 'Opera' },
      { keywords: ['vivaldi'], standardName: 'Vivaldi' },
      { keywords: ['arc'], standardName: 'Arc' },
      { keywords: ['chromium'], standardName: 'Chromium' }
    ];

    for (const mapping of browserMappings) {
      for (const keyword of mapping.keywords) {
        if (name.includes(keyword)) {
          // Return STANDARDIZED name for AX API compatibility
          return mapping.standardName;
        }
      }
    }

    // AI browsers - return raw name since no AX API support (will use title parsing)
    // 🔧 MAC FIX: Improved AI browser detection for ChatGPT Atlas
    const aiBrowsers = [
      { keywords: ['chatgpt', 'atlas'], name: 'ChatGPT Atlas' },
      { keywords: ['comet'], name: 'Comet' }
    ];
    for (const aiBrowser of aiBrowsers) {
      for (const keyword of aiBrowser.keywords) {
        if (name.includes(keyword)) {
          console.log(`[URL] 🤖 Detected AI browser on macOS: ${aiBrowser.name}`);
          return aiBrowser.name; // Return standardized name for AI browsers
        }
      }
    }

    // 🔧 MAC FIX: Block file extensions in title before accepting as browser
    const fileExtensions = /\.(md|txt|pdf|doc|docx|js|ts|json|xml|yaml|yml|html|css|jsx|tsx|py|java|cpp|c|h|hpp|rs|go|rb|php|swift|kt|sql|sh|bat|ps1|exe|dmg|zip|tar|gz|rar|7z|png|jpg|jpeg|gif|svg|ico|mp4|mp3|wav|avi|mov|csv|xls|xlsx|ppt|pptx)$/i;
    if (fileExtensions.test(titleLower)) {
      if (process.env.DEBUG_URL) {
        console.log('[URL] BLOCKED: File extension in title:', title);
      }
      return null; // Not a browser URL
    }

    // 🔧 MAC FIX: Accept ANY app with URL-like title as a browser
    // This allows ChatGPT Atlas and other unknown browsers to work
    const urlPatterns = [
      /https?:\/\//i,                    // Has http:// or https://
      /\b[a-z0-9-]+\.[a-z]{2,}\b/i      // Has domain pattern (e.g., example.com)
    ];

    for (const pattern of urlPatterns) {
      if (pattern.test(titleLower) || pattern.test(title)) {
        // Has URL in title, it's a browser - return app name
        console.log(`[URL] 🌐 Detected unknown browser on macOS (by title): ${appName}`);
        return appName;
      }
    }

    // 🔧 MAC FIX: Final fallback - if app name contains "browser" or "web", treat as browser
    if (name.includes('browser') || name.includes('web')) {
      console.log(`[URL] 🌐 Detected browser on macOS (by name): ${appName}`);
      return appName;
    }

    return null; // Not a browser
  }

  // Clear platform-specific caches for cold-start
  clearCaches() {
    const elementsCleared = this.elementCache.size;
    const backoffsCleared = this.resolverBackoff.size;
    const browserCacheCleared = this.browserCache.size;

    this.elementCache.clear();
    this.resolverBackoff.clear();
    this.browserCache.clear();

    console.log(`[URL-DARWIN] Cleared caches: ${elementsCleared} elements, ${backoffsCleared} backoffs, ${browserCacheCleared} browser cache`);
  }

  /**
   * Smart detection: Only check if browser actually changed
   */
  shouldCheckBrowser(frontApp) {
    const now = Date.now();

    // If same app, use cached result if recent
    if (this.currentBrowser === frontApp?.name) {
      const cached = this.browserCache.get(frontApp.name);
      if (cached && (now - cached.timestamp) < this.cacheTTL) {
        return false; // Use cached result
      }
    }

    // Check if it's actually a browser
    const browserName = this.getBrowserName(frontApp?.name);
    if (!browserName) {
      this.currentBrowser = null;
      return false; // Not a browser, no need to check
    }

    // Browser changed or cache expired
    this.currentBrowser = frontApp.name;
    this.lastBrowserChange = now;
    return true;
  }

  /**
   * Async AppleScript execution with timeout
   * CRITICAL FIX: Reduced timeout from 2000ms to 500ms to prevent UI blocking
   */
  async executeAppleScript(script, timeout = 500) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('AppleScript timeout'));
      }, timeout);

      exec(`/usr/bin/osascript -e '${script}'`, (error, stdout, stderr) => {
        clearTimeout(timer);
        if (error) {
          reject(error);
        } else {
          resolve(stdout.trim());
        }
      });
    });
  }

  async getCurrentUrl() {
    try {
      const frontApp = await this.getFrontmostAppAsync();

      // 🔧 FIX: Gate debug logging behind DEBUG_URL environment variable
      if (process.env.DEBUG_URL) {
        console.log('[URL] DEBUG: Front app:', frontApp?.name);
      }

      if (!frontApp?.name) {
        return null;
      }
      
      const cachedUrl = this.urlCache.get(frontApp.name, frontApp.title);
      if (cachedUrl.hit) {
        return cachedUrl.result;
      }

      // Check if it's a browser (pass title for hybrid detection)
      // CRITICAL: Always get fresh browser name, never from cache to prevent misattribution
      const browserName = this.getBrowserName(frontApp.name, frontApp.title);
      
      if (process.env.DEBUG_URL) {
        console.log('[URL] 🔍 BROWSER DETECTION:', {
          appName: frontApp.name,
          windowTitle: frontApp.title,
          detectedBrowser: browserName
        });
        console.log('[URL] DEBUG: Browser detected:', browserName);
        console.log('[URL] DEBUG: App details:', { name: frontApp.name, title: frontApp.title, bundleId: frontApp.bundleId });
      }

      // If not a browser, return null immediately - don't try to extract URLs from non-browser apps
      if (!browserName) {
        if (process.env.DEBUG_URL) {
          console.log('[URL] DEBUG: Not a browser, skipping:', frontApp.name);
        }
        this.urlCache.set(frontApp.name, frontApp.title, null);
        return null;
      }

      // Detect incognito/private mode
      const isIncognito = this.detectIncognitoMode(frontApp.title || '', browserName);

      // Try to get URL using Accessibility API (now async)
      let url = null;
      let title = frontApp.title || '';

      try {
        // 🔧 MAC FIX: Try multiple URL extraction methods for ANY browser
        // Try AX-based address bar reading (async)
        if (browserName === 'Safari') {
          url = await this.getSafariUrlViaAXAsync();
          if (process.env.DEBUG_URL) console.log('[URL] DEBUG: Safari AX URL:', url);
        } else if (['Chrome', 'Edge', 'Brave', 'Arc', 'Chromium', 'Opera', 'Vivaldi'].includes(browserName)) {
          url = await this.getChromiumUrlViaAXAsync(frontApp.name, browserName);
          if (process.env.DEBUG_URL) console.log('[URL] DEBUG: Chromium-based AX URL:', url);
        } else if (browserName === 'Firefox') {
          url = await this.getFirefoxUrlViaAXAsync();
          if (process.env.DEBUG_URL) console.log('[URL] DEBUG: Firefox AX URL:', url);
        } else if (browserName === 'ChatGPT Atlas') {
          // CRITICAL FIX: ChatGPT Atlas needs Electron method first, then Chromium fallback
          console.log(`[URL] 🌐 ChatGPT Atlas detected: trying Electron + Chromium methods...`);
          
          // Method 1: Try Electron-based extraction (works for ChatGPT Atlas)
          url = await this.getElectronBrowserUrlAsync(frontApp.name);
          if (url) {
            console.log('[URL] ✅ Electron method SUCCESS:', url);
          } else {
            console.log(`[URL] ❌ Electron method FAILED for ${frontApp.name}`);
          }
          
          // Method 2: Try simple Chromium method if Electron failed
          if (!url) {
            url = await this.getChromiumUrlViaAXAsync(frontApp.name, browserName);
            if (url) {
              console.log('[URL] ✅ Chromium method SUCCESS:', url);
            } else {
              console.log(`[URL] ❌ Chromium method FAILED for ${frontApp.name}`);
            }
          }
        } else {
          // 🔧 MAC FIX: For ANY unknown browser, try ALL methods
          console.log(`[URL] 🌐 Unknown browser detected: ${browserName}, trying all extraction methods...`);
          
          // Method 1: Try Electron-based extraction (works for ChatGPT Atlas, Comet, etc.)
          url = await this.getElectronBrowserUrlAsync(frontApp.name);
          if (url) {
            console.log('[URL] ✅ Electron method SUCCESS:', url);
          } else {
            console.log(`[URL] ❌ Electron method FAILED for ${frontApp.name}`);
          }
          
          // Method 2: Try Chromium method (many browsers are Chromium-based)
          // This is safe because it queries the frontmost app's process name
          if (!url) {
            url = await this.getChromiumUrlViaAXAsync(frontApp.name);
            if (url) {
              console.log('[URL] ✅ Chromium method SUCCESS:', url);
            } else {
              console.log(`[URL] ❌ Chromium method FAILED for ${frontApp.name}`);
            }
          }
          
          // Note: Firefox and Safari methods are NOT tried here to prevent capturing
          // URLs from background browsers. Firefox/Safari URLs are only captured when
          // those browsers are actually frontmost (see lines 244-252).
        }
      } catch (e) {
        // Fallback to title parsing
        console.log(`[URL] AX failed for ${browserName}, falling back to title parse:`, e.message);
      }

      // If no URL from AX, try to extract from title
      if (!url && title) {
        url = this.extractUrlFromTitle(title, browserName);
        console.log('[URL] DEBUG: Extracted from title:', url);
      }

      // 🔧 SPECIAL FIX: For AI browsers (ChatGPT Atlas, etc.) that don't expose URLs
      // Create a synthetic URL from the page title so we can still track what they're viewing
      if (!url && title && browserName && (browserName.includes('ChatGPT') || browserName.includes('Comet'))) {
        // Clean up the title (remove trailing spaces and special chars)
        const cleanTitle = title.trim().replace(/[^a-zA-Z0-9-_.]/g, '-').toLowerCase();
        
        // FILTER: Skip meaningless/generic titles that don't provide useful tracking info
        const meaninglessTitles = [
          'new-tab',
          'new-window',
          'no-window',
          'untitled',
          'blank',
          'empty',
          'loading',
          'chatgpt-atlas',
          'comet'
        ];
        
        const isMeaningless = meaninglessTitles.some(pattern => 
          cleanTitle === pattern || cleanTitle.startsWith(pattern + '-') || cleanTitle.endsWith('-' + pattern)
        );
        
        if (cleanTitle && cleanTitle !== '-' && cleanTitle.length > 2 && !isMeaningless) {
          // Create a synthetic URL format: chatgpt-atlas://page-name
          url = `${browserName.toLowerCase().replace(/\s+/g, '-')}://${cleanTitle}`;
          console.log(`[URL] 🤖 AI browser fallback: Created synthetic URL for ${browserName}:`, url);
          console.log(`[URL] ⚠️  WARNING: ${browserName} does not expose real URLs via macOS Accessibility API`);
          console.log(`[URL] 💡 TIP: Window title may not update - this browser is not suitable for accurate URL tracking`);
        } else if (isMeaningless) {
          console.log(`[URL] 🚫 Skipping meaningless AI browser title: "${cleanTitle}"`);
        }
      }

      if (!url) {
        if (process.env.DEBUG_URL) {
          console.log('[URL] DEBUG: No URL found for', browserName);
        }
        this.urlCache.set(frontApp.name, frontApp.title, null);
        return null;
      }

      // 🔧 MAC FIX: Filter out invalid/internal URLs
      const invalidUrlPatterns = [
        /^favorites:\/\//i,      // Safari favorites
        /^chrome:\/\//i,         // Chrome internal pages
        /^about:/i,              // About pages
        /^file:\/\//i,           // Local files
        /^javascript:/i,         // JavaScript URLs
        /^data:/i,               // Data URLs
        /^blob:/i,               // Blob URLs
        /^chrome-extension:/i,   // Chrome extensions
        /^safari-extension:/i,   // Safari extensions
        /^edge:\/\//i,           // Edge internal pages
        /^brave:\/\//i           // Brave internal pages
      ];

      for (const pattern of invalidUrlPatterns) {
        if (pattern.test(url)) {
          if (process.env.DEBUG_URL) {
            console.log('[URL] 🚫 BLOCKED: Invalid/internal URL on macOS:', url);
          }
          this.urlCache.set(frontApp.name, frontApp.title, null);
          return null;
        }
      }

      // 🔧 FIX: Filter out non-browser web apps (chat, email, etc.) accessed via browser
      // Only actual web browsing should be tracked as URLs
      // Uses specific app names to avoid false positives (e.g. "mail" is too broad)
      const nonBrowserWebAppPatterns = [
        // Chat & Collaboration - title starts with app name
        /^cliq\b/i,
        /^slack\b/i,
        /^discord\b/i,
        /^whatsapp\b/i,
        /^telegram\b/i,
        /^signal\b/i,
        /^skype\b/i,
        /^messenger\b/i,
        /^mattermost\b/i,
        /^rocket\.chat\b/i,
        /^hangouts\b/i,
        // Chat apps that can appear anywhere in title
        /\bmicrosoft teams\b/i,
        /\bgoogle chat\b/i,
        /\bgoogle meet\b/i,
        /\bzoom meeting\b/i,
        // Email clients - specific patterns to avoid false positives
        /\bzoho mail\b/i,
        /\byahoo mail\b/i,
        /\bprotonmail\b/i,
        /\boutlook\b.*\b(inbox|mail|calendar)\b/i,
        /\binbox\b.*\bzoho\b/i,
        /\binbox\b.*\bgmail\b/i,
      ];
      
      const titleForFilter = (title || '').trim();
      const isWebAppInBrowser = nonBrowserWebAppPatterns.some(pattern => 
        pattern.test(titleForFilter)
      );
      
      if (isWebAppInBrowser && !(url && /^https?:\/\//i.test(url))) {
        if (process.env.DEBUG_URL) {
          console.log(`[URL] 🚫 BLOCKED: Non-browser web app in title: "${title}"`);
        }
        this.urlCache.set(frontApp.name, frontApp.title, null);
        return null;
      }

      const result = {
        url: url,
        title: title,
        browser: browserName,
        source: browserName.toLowerCase(),
        windowId: `${frontApp.name}-${frontApp.pid}`,
        confidence: url.startsWith('http') ? 'high' : 'low',
        bundleId: frontApp.bundleId,
        privacyFlags: isIncognito ? { incognito: true } : undefined
      };
      
      // CRITICAL FIX: Don't cache synthetic URLs for AI browsers that don't expose real URLs
      // This ensures we keep checking for URL changes even if the window title doesn't update
      const isSyntheticUrl = url.startsWith('chatgpt-atlas://') || url.startsWith('comet://');
      if (!isSyntheticUrl) {
        // Cache the full URL result with app name + title to prevent redundant queries
        // This ensures each browser window/tab is cached separately
        this.urlCache.set(frontApp.name, frontApp.title, result);
      } else {
        console.log(`[URL] 🚫 NOT caching synthetic URL for AI browser: ${url}`);
      }

      return result;
    } catch (error) {
      console.error('[URL] Darwin capture error:', error);
      return null;
    }
  }

  async getFrontmostAppAsync() {
    // CRITICAL FIX: Use the shared platformManager instead of running separate AppleScript
    // This ensures URL capture sees the same apps as the app monitoring system
    try {
      // Check if platformManager is available (used by MonitoringManager)
      if (global.platformManager && typeof global.platformManager.detectActiveApplication === 'function') {
        const appInfo = await global.platformManager.detectActiveApplication();
        
        if (appInfo && (appInfo.appName || appInfo.name)) {
          const resultObj = {
            name: appInfo.appName || appInfo.name,
            title: appInfo.windowTitle || appInfo.title || 'Unknown Window',
            bundleId: appInfo.bundleId || '',
            pid: appInfo.pid || process.pid
          };
          
          if (process.env.DEBUG_URL) {
            console.log('[URL] ✅ Using platformManager app detector:', resultObj.name);
          }
          this.lastResult = resultObj;
          this.lastAppCheck = Date.now();
          return resultObj;
        }
      } else {
        console.warn('[URL] ⚠️ platformManager not available, falling back to AppleScript');
      }
    } catch (e) {
      console.warn('[URL] ⚠️ Error using platformManager:', e.message);
    }

    // FALLBACK: Original AppleScript method (only if enhancedAppDetector fails)
    const now = Date.now();
    if ((now - this.lastAppCheck) < 500) { // Cache app detection for 500ms
      return this.lastResult;
    }

    // Method 1: Combined AppleScript to get app name, title, and bundle id in a single call
    try {
      const combinedScript = `
        tell application "System Events"
          set frontApp to first application process whose frontmost is true
          set appName to name of frontApp
        end tell
        set windowTitle to ""
        set bundleId to ""
        try
          set bundleId to id of application appName
        end try
        try
          if appName is "Safari" then
            tell application "Safari"
              if (count windows) > 0 then
                try
                  set windowTitle to name of current tab of front window
                on error
                  try
                    set windowTitle to name of document 1
                  end try
                end try
              end if
            end tell
          else
            tell application "System Events"
              set frontApp to first application process whose frontmost is true
              try
                if (count of windows of frontApp) > 0 then
                  set windowTitle to title of window 1 of frontApp
                end if
              end try
            end tell
          end if
        end try
        return appName & "|||" & windowTitle & "|||" & bundleId
      `;

      const combinedResult = await this.executeAppleScript(combinedScript, 800);

      if (combinedResult && !combinedResult.includes('error') && combinedResult.includes('|||')) {
        const [name, title, bundleId] = combinedResult.split('|||');
        const resultObj = {
          name: name || 'Unknown',
          title: title && title.length > 0 ? title : 'Unknown Window',
          bundleId: bundleId || '',
          pid: process.pid
        };

        this.lastResult = resultObj;
        this.lastAppCheck = now;
        return resultObj;
      }
    } catch (e) {
      // 🔧 IMPROVED: Better error classification for AppleScript failures
      const errorMessage = e.message || String(e);
      const isTimeout = errorMessage.includes('ETIMEDOUT') || errorMessage.includes('timeout');
      const isPermission = errorMessage.includes('not authorized') || errorMessage.includes('denied');
      if (isTimeout) {
        console.warn('⚠️ [URL] AppleScript timeout (combined query):', errorMessage);
      } else if (isPermission) {
        console.warn('⚠️ [URL] AppleScript permission denied (Accessibility required):', errorMessage);
      } else if (process.env.DEBUG_URL) {
        console.log(`[URL] AppleScript combined method failed: ${errorMessage}`);
      }
    }

    // Method 2: Use lsappinfo (no Accessibility needed)
    try {
      const { exec } = require('child_process');
      const result = await new Promise((resolve, reject) => {
        exec('lsappinfo info -only name `lsappinfo front`', { timeout: 1000 }, (err, stdout) => {
          if (err) return reject(err);
          resolve(stdout);
        });
      });

      const match = result.match(/name="([^"]+)"/);
      if (match && match[1]) {
        const resultObj = {
          name: match[1],
          title: 'Unknown Window',
          bundleId: '',
          pid: process.pid
        };

        this.lastResult = resultObj;
        this.lastAppCheck = now;
        return resultObj;
      }
    } catch (e) {
      console.log(`[URL] lsappinfo method failed: ${e.message}`);
    }

    // Method 3: ps command fallback
    try {
      const { exec } = require('child_process');
      const result = await new Promise((resolve, reject) => {
        exec("ps axo pid,comm | grep -v grep | tail -1 | awk '{print $2}' | xargs basename", { timeout: 1000 }, (err, stdout) => {
          if (err) return reject(err);
          resolve((stdout || '').trim());
        });
      });

      if (result && result !== 'ps') {
        const resultObj = {
          name: result,
          title: 'Unknown Window',
          bundleId: '',
          pid: process.pid
        };

        this.lastResult = resultObj;
        this.lastAppCheck = now;
        return resultObj;
      }
    } catch (e) {
      console.log(`[URL] ps method failed: ${e.message}`);
    }

    console.error('[URL] All frontmost app detection methods failed');
    return null;
  }

  async getSafariUrlViaAXAsync() {
    const now = Date.now();

    // Check if this resolver is backed off
    if (this.resolverBackoff.has('safari-ax') && this.resolverBackoff.get('safari-ax') > now) {
      return null;
    }

    try {
      // First try: Direct Safari API approach - most reliable
      const directScript = `
        tell application "Safari"
          if (count windows) > 0 then
            try
              return URL of current tab of front window
            on error
              return ""
            end try
          else
            return ""
          end if
        end tell
      `;

      const directResult = await this.executeAppleScript(directScript, 500);

      if (directResult && directResult.length > 0 && directResult !== '""' && directResult !== '') {
        // Clear backoff on success
        this.resolverBackoff.delete('safari-ax');
        console.log('[URL] Safari direct API success');
        return directResult;
      }
    } catch (directError) {
      console.log('[URL] Safari direct API failed, trying System Events:', directError.message);
    }

    // Fallback: Try System Events approach if direct API fails
    try {
      const fallbackScript = `
        tell application "System Events"
          tell process "Safari"
            -- Default to window 1
            set targetWindow to window 1
            
            -- Try to find the main window (AXMain=true)
            try
              set targetWindow to (first window whose value of attribute "AXMain" is true)
            end try
            
            if exists targetWindow then
              tell targetWindow
                try
                  -- Get the first toolbar
                  set frontToolbar to toolbar 1
                  -- Get all text fields from this toolbar
                  set urlFields to text fields of frontToolbar
                  -- Check each field for a URL
                  repeat with urlField in urlFields
                    try
                      set fieldValue to value of urlField
                      if fieldValue starts with "http" then
                        return fieldValue
                      else if fieldValue contains "." and fieldValue does not contain " " then
                        -- Likely a domain without protocol
                        return "https://" & fieldValue
                      end if
                    end try
                  end repeat
                on error
                  -- Silent fail
                end try
              end tell
            end if
          end tell
        end tell
        return ""
      `;

      const fallbackResult = await this.executeAppleScript(fallbackScript, 1500);

      if (fallbackResult && fallbackResult.length > 0 && fallbackResult !== '') {
        console.log('[URL] Safari System Events fallback success');
        this.resolverBackoff.delete('safari-ax');
        return fallbackResult;
      }
    } catch (error) {
      // Set backoff for 3 seconds on failure
      this.resolverBackoff.set('safari-ax', now + 3000);
      return null;
    }

    return null;
  }

  /**
   * 🔧 MAC FIX: Get URL from Electron-based browsers (ChatGPT Atlas, etc.) via AppleScript
   * Electron apps expose UI elements through the accessibility API
   */
  async getElectronBrowserUrlAsync(appName) {
    try {
      console.log(`[URL] 🔍 Trying Electron method for: ${appName}`);
      
      // Try to get URL from text fields in the app window
      const script = `
        tell application "System Events"
          tell process "${appName}"
            try
              set targetWindow to window 1
              tell targetWindow
                -- Try to find text field with URL (Electron apps usually have one)
                set allTextFields to text fields
                repeat with urlField in allTextFields
                  try
                    set fieldValue to value of urlField
                    if fieldValue starts with "http" then
                      return fieldValue
                    end if
                  end try
                end repeat
                
                -- Try to get from toolbar groups
                try
                  set allGroups to groups
                  repeat with grp in allGroups
                    set groupFields to text fields of grp
                    repeat with urlField in groupFields
                      try
                        set fieldValue to value of urlField
                        if fieldValue starts with "http" then
                          return fieldValue
                        end if
                      end try
                    end repeat
                  end repeat
                end try
              end tell
            end try
          end tell
        end tell
        return ""
      `;

      const result = await this.executeAppleScript(script, 1500);
      
      if (result && result.length > 0 && result !== '' && result.startsWith('http')) {
        console.log('[URL] 🤖 Electron browser URL extracted via AppleScript:', result);
        return result;
      }
      
      console.log(`[URL] 🔍 Electron method returned empty result for ${appName}`);
      return null;
    } catch (error) {
      console.log(`[URL] ❌ Electron browser AppleScript ERROR for ${appName}:`, error.message);
      return null;
    }
  }

  async getChromiumUrlViaAXAsync(appName, browserName = '') {
    try {
      if (process.env.DEBUG_URL) {
        console.log(`[URL] 🔍 Trying Chromium method for: ${appName} (browser: ${browserName})`);
      }
      
      // Check if this is ONLY the Arc browser (made by The Browser Company)
      // ChatGPT Atlas is NOT Arc-based - it's Electron-based and has different UI structure
      // Use browserName if available since appName might be "Electron" for some browsers
      const checkName = (browserName || appName).toLowerCase();
      // CRITICAL FIX: Only detect actual Arc browser, NOT ChatGPT Atlas which has 'atlas' in name
      const isArcBased = checkName === 'arc' || 
                         (checkName.includes('arc') && !checkName.includes('atlas') && !checkName.includes('chatgpt'));
      
      if (isArcBased) {
        // Arc-based browsers have a unique UI structure with Spaces
        // Try multiple extraction methods specific to Arc
        console.log(`[URL] 🌐 Detected Arc-based browser: ${browserName || appName}, using Arc-specific extraction`);
        
        const arcScript = `
          tell application "System Events"
            tell process "${appName}"
              set targetWindow to window 1
              
              try
                set targetWindow to (first window whose value of attribute "AXMain" is true)
              end try
              
              -- Method 1: Try standard toolbar (some Arc versions)
              try
                set addressBar to text field 1 of toolbar 1 of targetWindow
                set urlValue to value of addressBar
                if urlValue starts with "http" or urlValue contains "." then
                  return urlValue
                end if
              end try
              
              -- Method 2: Search all toolbars for URL-like text fields
              try
                set allToolbars to every toolbar of targetWindow
                repeat with tb in allToolbars
                  try
                    set allTextFields to every text field of tb
                    repeat with tf in allTextFields
                      try
                        set tfValue to value of tf
                        if tfValue starts with "http" then
                          return tfValue
                        end if
                        if tfValue contains "." and tfValue does not contain " " then
                          return tfValue
                        end if
                      end try
                    end repeat
                  end try
                  
                  -- Also check groups within toolbars
                  try
                    set allGroups to every group of tb
                    repeat with grp in allGroups
                      try
                        set groupFields to every text field of grp
                        repeat with gf in groupFields
                          try
                            set gfValue to value of gf
                            if gfValue starts with "http" then
                              return gfValue
                            end if
                            if gfValue contains "." and gfValue does not contain " " then
                              return gfValue
                            end if
                          end try
                        end repeat
                      end try
                    end repeat
                  end try
                end repeat
              end try
              
              -- Method 3: Search all UI elements for URL text field
              try
                set allElements to every UI element of targetWindow
                repeat with elem in allElements
                  try
                    if class of elem is text field then
                      set elemValue to value of elem
                      if elemValue starts with "http" then
                        return elemValue
                      end if
                    end if
                  end try
                end repeat
              end try
              
              return ""
            end tell
          end tell
        `;
        
        const arcUrl = await this.executeAppleScript(arcScript, 3000);
        if (arcUrl && arcUrl.length > 0) {
          // Validate it looks like a URL
          if (arcUrl.startsWith('http') || (arcUrl.includes('.') && !arcUrl.includes(' '))) {
            const finalUrl = arcUrl.startsWith('http') ? arcUrl : `https://${arcUrl}`;
            console.log(`[URL] ✅ Arc method SUCCESS for ${appName}:`, finalUrl);
            return finalUrl;
          }
        }
        console.log(`[URL] 🔍 Arc method returned empty/invalid for ${appName}:`, arcUrl);
      }
      
      // Standard Chromium extraction for non-Arc browsers
      
      // IMPROVED: Try multiple methods to get Chrome URL
      // Method 1: Use Chrome's native AppleScript API (most reliable if Chrome allows it)
      const chromeNativeScript = `
        tell application "${appName}"
          try
            set currentTabUrl to URL of active tab of front window
            return currentTabUrl
          on error
            return ""
          end try
        end tell
      `;
      
      let url = await this.executeAppleScript(chromeNativeScript, 800);

      // Skip System Events AX walk on the same tick — that second osascript
      // is what turns a quiet poll into a 100+ Energy Impact spike.
      if (!url && process.env.URL_CHROMIUM_AX_FALLBACK === '1') {
        const script = `
          tell application "System Events"
            tell process "${appName}"
              set targetWindow to window 1
              try
                set targetWindow to (first window whose value of attribute "AXMain" is true)
              end try
              try
                set addressBar to text field 1 of toolbar 1 of targetWindow
                return value of addressBar
              on error
                return ""
              end try
            end tell
          end tell
        `;
        url = await this.executeAppleScript(script, 800);
      }

      if (process.env.DEBUG_URL) {
        console.log(url
          ? `[URL] ✅ Chromium method SUCCESS for ${appName}: ${url}`
          : `[URL] 🔍 Chromium method returned empty for ${appName}`);
      }
      return url || null;
    } catch (error) {
      console.log(`[URL] ❌ Chromium method ERROR for ${appName}:`, error.message);
      return null;
    }
  }

  async getFirefoxUrlViaAXAsync() {
    try {
      // Firefox has a different UI structure - the URL bar is in a group
      const script = `
        tell application "System Events"
          tell process "Firefox"
            -- Default to window 1
            set targetWindow to window 1
            
            -- Try to find the main window (AXMain=true)
            try
              set targetWindow to (first window whose value of attribute "AXMain" is true)
            end try
            
            set toolbars to every toolbar of targetWindow
            repeat with toolbar in toolbars
              set groups to every group of toolbar
              repeat with grp in groups
                set textFields to every text field of grp
                repeat with textField in textFields
                  set fieldValue to value of textField
                  if fieldValue starts with "http" or fieldValue contains "." then
                    return fieldValue
                  end if
                end repeat
              end repeat
            end repeat
          end tell
        end tell
        return ""
      `;

      const url = await this.executeAppleScript(script, 2000);
      return url || null;
    } catch (error) {
      return null;
    }
  }

  detectIncognitoMode(title, browserName) {
    const incognitoPatterns = {
      'Safari': /Private Browsing/i,
      'Chrome': /\(Incognito\)$/,
      'Edge': /\(InPrivate\)$/,
      'Firefox': /\(Private Browsing\)$/,
      'Brave': /\(Private\)$/,
      'Opera': /\(Private\)$/
    };

    const pattern = incognitoPatterns[browserName];
    return pattern ? pattern.test(title) : false;
  }

  extractUrlFromTitle(title, browserName = '') {
    if (!title || title.length === 0) return null;

    // CRITICAL FIX: Strip browser name suffix from title FIRST to prevent false matches
    // Title format: "Page Title - Google Chrome" or "Page Title - Safari" etc.
    const browserSuffixes = [
      ' - Google Chrome',
      ' - Chrome',
      ' - Safari',
      ' - Firefox',
      ' - Microsoft Edge',
      ' - Edge',
      ' - Brave',
      ' - Opera',
      ' - Vivaldi',
      ' - Arc',
      ' — Google Chrome',  // Em-dash variant
      ' — Safari',
      ' — Firefox',
    ];
    
    let cleanTitle = title;
    for (const suffix of browserSuffixes) {
      if (cleanTitle.endsWith(suffix)) {
        cleanTitle = cleanTitle.slice(0, -suffix.length).trim();
        break;
      }
    }

    // CRITICAL: File extensions that indicate this is a file path, not a URL
    const fileExtensions = /\.(md|txt|pdf|doc|docx|js|ts|json|xml|yaml|yml|html|css|jsx|tsx|py|java|cpp|c|h|hpp|rs|go|rb|php|swift|kt|sql|sh|bat|ps1|exe|dmg|zip|tar|gz|rar|7z|png|jpg|jpeg|gif|svg|ico|mp4|mp3|wav|avi|mov|csv|xls|xlsx|ppt|pptx)$/i;

    // Pattern 1: Full URL with protocol in title
    const fullUrlMatch = cleanTitle.match(/(https?:\/\/[^\s]+)/i);
    if (fullUrlMatch) {
      console.log('[URL] Found full URL in title:', fullUrlMatch[1]);
      return fullUrlMatch[1];
    }

    // Pattern 2: Domain-like pattern in title (e.g., "Page Title - google.com")
    const domainPatterns = [
      /[-–—|]\s*([a-z0-9-]+\.[a-z]{2,}(?:\.[a-z]{2,})?)\s*$/i,  // At end after separator
      /^([a-z0-9-]+\.[a-z]{2,}(?:\.[a-z]{2,})?)\s*[-–—|]/i,     // At start before separator
      /\(([a-z0-9-]+\.[a-z]{2,}(?:\.[a-z]{2,})?)\)/i            // In parentheses
    ];

    for (const pattern of domainPatterns) {
      const match = cleanTitle.match(pattern);
      if (match) {
        const domain = match[1];
        if (!fileExtensions.test(domain)) {
          const url = `https://${domain}`;
          console.log('[URL] Extracted domain from title:', url);
          return url;
        }
      }
    }

    // Pattern 3: For AI browsers - Try to infer URL from known page titles
    // CRITICAL FIX: Use cleanTitle (with browser suffix removed) to prevent matching "google" in "Google Chrome"
    const lowerTitle = cleanTitle.toLowerCase().trim();
    
    // CRITICAL FIX: Skip keyword matching if cleanTitle is just a browser name (e.g., "Google Chrome", "Safari")
    // This handles edge case where window title is exactly a browser name without page content
    const bareBrowserNames = [
      'google chrome', 'chrome', 'safari', 'firefox', 'microsoft edge', 'edge',
      'brave', 'opera', 'vivaldi', 'arc', 'chromium'
    ];
    if (bareBrowserNames.includes(lowerTitle)) {
      console.log('[URL] Skipping keyword match - title is bare browser name:', cleanTitle);
      return null;
    }
    
    const { KNOWN_SITES_LOWER } = require('../../lib/known-work-sites');
    const knownPageTitles = { ...KNOWN_SITES_LOWER, 'new tab': null };

    // Check for exact matches or title STARTS WITH keyword (not just includes)
    // This prevents matching "Google" when it's just part of the site name
    for (const [keyword, url] of Object.entries(knownPageTitles)) {
      // Only match if: exact match, OR title starts with keyword, OR keyword is a standalone word
      const keywordRegex = new RegExp(`^${keyword}$|^${keyword}\\s|\\s${keyword}$|\\s${keyword}\\s`, 'i');
      if (lowerTitle === keyword || keywordRegex.test(lowerTitle)) {
        if (url) {
          console.log(`[URL] Inferred from page title "${cleanTitle}":`, url);
          return url;
        }
      }
    }

    // Pattern 4: Look for URL-like strings anywhere in title
    // CRITICAL FIX: Use cleanTitle to prevent matching browser suffixes like "Google Chrome" → "google.com"
    const anyDomainMatch = cleanTitle.match(/\b([a-z0-9-]+\.[a-z]{2,}(?:\.[a-z]{2,})?)\b/i);
    if (anyDomainMatch && !fileExtensions.test(anyDomainMatch[1])) {
      const url = `https://${anyDomainMatch[1]}`;
      console.log('[URL] Found domain-like string in title:', url);
      return url;
    }

    console.log('[URL] No URL pattern found in title:', cleanTitle);
    return null;
  }
}

module.exports = { DarwinUrlCapture };
