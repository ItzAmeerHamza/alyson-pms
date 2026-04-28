/**
 * Windows ARM64-Optimized URL Capture Implementation
 * Fast URL detection using tasklist + active-win - no PowerShell, no UI Automation
 * Version: 1.0.0 - Optimized for ARM64 Windows
 */

const { exec } = require('child_process');

class WindowsUrlCaptureARM64 {
  constructor() {
    this.lastResult = null;
    this.intervalId = null;
    this.debug = process.env.LOG_URL_VERBOSE === 'true' || process.env.URL_DEBUG_LOGGING === 'true';
    console.log('[URL-ARM64] ARM64-optimized URL capture adapter initialized');
  }

  start(onEvent) {
    if (this.debug) {
      console.log('[URL-ARM64] URL capture adapter started (manager handles polling)');
    }
    this.onEventHandler = onEvent;
    
    return () => {
      this.onEventHandler = null;
      if (this.debug) {
        console.log('[URL-ARM64] URL capture adapter stopped');
      }
    };
  }

  async getCurrentUrl() {
    try {
      if (this.debug) {
        console.log('[URL-ARM64] Starting URL capture check...');
      }
      
      // Try active-win first (fast and has ARM64 support)
      let result = await this.getUrlViaActiveWin();
      
      if (result) {
        if (this.debug) {
          console.log('[URL-ARM64] Got URL via active-win:', result.url?.substring(0, 60));
        }
        return result;
      }
      
      // Fallback to tasklist method
      result = await this.getUrlViaTasklist();
      
      if (result) {
        if (this.debug) {
          console.log('[URL-ARM64] Got URL via tasklist:', result.url?.substring(0, 60));
        }
        return result;
      }
      
      if (this.debug) {
        console.log('[URL-ARM64] No URL detected');
      }
      
      return null;
    } catch (error) {
      if (this.debug) {
        console.error('[URL-ARM64] Capture error:', error.message);
      }
      return null;
    }
  }

  /**
   * Get URL using active-win package (has ARM64 support)
   */
  async getUrlViaActiveWin() {
    try {
      const activeWin = require('active-win');
      const window = await activeWin();
      
      if (!window || !window.owner) {
        return null;
      }
      
      const processName = (window.owner.name || '').replace(/\.exe$/i, '').toLowerCase();
      const title = window.title || '';
      
      // Check if it's a browser
      const browserName = this.detectBrowserName(processName);
      if (!browserName) {
        return null;
      }
      
      if (this.debug) {
        console.log('[URL-ARM64] Browser detected via active-win:', browserName, 'Title:', title.substring(0, 60));
      }
      
      // Extract URL from title
      const url = this.extractUrlFromTitle(title, browserName);
      
      if (!url) {
        return null;
      }
      
      return {
        url,
        title,
        browser: browserName,
        source: browserName.toLowerCase(),
        windowId: `${processName}-${window.owner.processId || 0}`,
        confidence: url.startsWith('http') ? 'high' : 'medium'
      };
    } catch (error) {
      if (this.debug) {
        console.log('[URL-ARM64] active-win method failed:', error.message);
      }
      return null;
    }
  }

  /**
   * Get URL using tasklist /v (extract from window titles)
   */
  async getUrlViaTasklist() {
    return new Promise((resolve) => {
      try {
        const cmd = 'tasklist /v /fo csv';
        
        exec(cmd, {
          encoding: 'utf8',
          windowsHide: true,
          shell: true,
          cwd: process.env.TEMP || process.env.SystemRoot || 'C:\\Windows',
          timeout: 800,
          maxBuffer: 1024 * 1024
        }, (error, stdout, stderr) => {
          if (error && !stdout) {
            resolve(null);
            return;
          }
          
          if (!stdout) {
            resolve(null);
            return;
          }
          
          try {
            const lines = stdout.split(/\r?\n/).filter(l => l.trim());
            
            // Browser executables to look for
            const browserExes = [
              'chrome.exe', 'msedge.exe', 'firefox.exe', 'brave.exe', 
              'opera.exe', 'vivaldi.exe', 'edge.exe', 'brave-browser.exe'
            ];
            
            // Parse CSV
            for (const rawLine of lines.slice(1)) {
              const cols = this.parseCsvLine(rawLine);
              
              if (cols.length < 9) continue;
              
              const imageName = (cols[0] || '').trim().toLowerCase();
              const windowTitle = (cols[8] || '').trim();
              
              // Check if it's a browser
              if (!browserExes.includes(imageName)) continue;
              
              // Skip empty or system window titles
              if (!windowTitle || windowTitle === 'N/A' || windowTitle === 'OleMainThreadWndName') {
                continue;
              }
              
              const processName = imageName.replace(/\.exe$/i, '');
              const browserName = this.detectBrowserName(processName);
              
              if (!browserName) continue;
              
              if (this.debug) {
                console.log('[URL-ARM64] Browser found via tasklist:', browserName, 'Title:', windowTitle.substring(0, 60));
              }
              
              // Extract URL from title
              const url = this.extractUrlFromTitle(windowTitle, browserName);
              
              if (url) {
                resolve({
                  url,
                  title: windowTitle,
                  browser: browserName,
                  source: browserName.toLowerCase(),
                  windowId: `${processName}-tasklist`,
                  confidence: url.startsWith('http') ? 'high' : 'medium'
                });
                return;
              }
            }
            
            resolve(null);
          } catch (parseError) {
            if (this.debug) {
              console.warn('[URL-ARM64] tasklist parse error:', parseError.message);
            }
            resolve(null);
          }
        });
      } catch (err) {
        resolve(null);
      }
    });
  }

  /**
   * Parse CSV line handling embedded commas and quotes
   */
  parseCsvLine(line) {
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
   * Detect browser name from process name
   */
  detectBrowserName(processBaseName) {
    const browserMap = {
      'chrome': 'Chrome',
      'msedge': 'Edge',
      'firefox': 'Firefox',
      'brave': 'Brave',
      'opera': 'Opera',
      'vivaldi': 'Vivaldi',
      'iexplore': 'Internet Explorer',
      'edge': 'Edge',
      'firefox-esr': 'Firefox',
      'chrome-beta': 'Chrome',
      'chrome-dev': 'Chrome',
      'brave-browser': 'Brave',
      'opera-browser': 'Opera',
      'vivaldi-browser': 'Vivaldi'
    };
    
    return browserMap[processBaseName] || null;
  }

  /**
   * Extract URL from window title
   * Browsers typically show the URL or domain in the title
   */
  extractUrlFromTitle(title, browserName = '') {
    if (!title) {
      return null;
    }

    if (this.debug) {
      console.log('[URL-ARM64] Extracting URL from title:', title.substring(0, 100));
    }

    // Normalize dashes
    const normalized = (title || '').replace(/[–—]/g, '-');

    // Direct URL in title
    const urlMatch = normalized.match(/(https?:\/\/[^\s]+)/i);
    if (urlMatch) {
      if (this.debug) {
        console.log('[URL-ARM64] Found direct URL:', urlMatch[1]);
      }
      return urlMatch[1];
    }

    // Common browser separators
    const separators = [' - ', ' — ', ' | ', ' – '];
    for (const sep of separators) {
      if (normalized.includes(sep)) {
        const parts = normalized.split(sep).map(p => p.trim()).filter(Boolean);
        
        if (this.debug) {
          console.log('[URL-ARM64] Split title by "' + sep + '":', parts);
        }
        
        // Domain usually at the end
        for (let i = parts.length - 1; i >= 0; i--) {
          const candidate = parts[i];
          const lower = candidate.toLowerCase();
          
          // Skip browser names
          if (['google chrome', 'microsoft edge', 'brave', 'firefox', 'opera', 'vivaldi', 'chrome', 'edge'].includes(lower)) {
            continue;
          }
          
          // Extract domain
          const domainMatch = candidate.match(/([a-z0-9][a-z0-9\-]*\.)+[a-z]{2,}/i);
          if (domainMatch) {
            const url = `https://${domainMatch[0]}`;
            if (this.debug) {
              console.log('[URL-ARM64] Extracted domain:', url);
            }
            return url;
          }
        }
      }
    }

    // Firefox format: "Page Title - SiteName"
    if (browserName === 'Firefox') {
      const ff = normalized.split(' - ');
      if (ff.length >= 2) {
        const candidate = ff[ff.length - 1];
        const domainMatch = candidate.match(/([a-z0-9][a-z0-9\-]*\.)+[a-z]{2,}/i);
        if (domainMatch) {
          const url = `https://${domainMatch[0]}`;
          if (this.debug) {
            console.log('[URL-ARM64] Extracted Firefox domain:', url);
          }
          return url;
        }
      }
    }

    // Try to find any domain pattern
    const anyDomainMatch = normalized.match(/([a-z0-9][a-z0-9\-]*\.)+[a-z]{2,}/i);
    if (anyDomainMatch) {
      const url = `https://${anyDomainMatch[0]}`;
      if (this.debug) {
        console.log('[URL-ARM64] Extracted any domain:', url);
      }
      return url;
    }

    if (this.debug) {
      console.log('[URL-ARM64] No URL found in title');
    }
    
    return null;
  }
}

module.exports = { WindowsUrlCaptureARM64 };




