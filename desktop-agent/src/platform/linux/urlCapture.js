/**
 * Linux URL Capture Implementation
 * Uses X11 window properties and title parsing
 */

const { execSync } = require('child_process');

class LinuxUrlCapture {
  constructor() {
    this.isWayland = this.detectWayland();
    this.lastResult = null;
    this.resolverBackoff = new Map(); // Track failed resolvers
    this.propCache = new Map(); // Cache window properties
    this.portalAvailable = false;
    this.detectPortalAvailability();
  }
  
  // Clear platform-specific caches for cold-start
  clearCaches() {
    const propsCleared = this.propCache.size;
    const backoffsCleared = this.resolverBackoff.size;
    
    this.propCache.clear();
    this.resolverBackoff.clear();
    
    console.log(`[URL-LINUX] Cleared caches: ${propsCleared} properties, ${backoffsCleared} backoffs`);
  }

  detectWayland() {
    try {
      const display = process.env.WAYLAND_DISPLAY;
      const sessionType = process.env.XDG_SESSION_TYPE;
      return !!(display || sessionType === 'wayland');
    } catch {
      return false;
    }
  }

  // New: Check for xdg-desktop-portal availability
  detectPortalAvailability() {
    if (!this.isWayland) return;
    try {
      const portalCheck = execSync('systemctl --user --quiet is-active xdg-desktop-portal', { 
        encoding: 'utf8', 
        timeout: 2000, 
        stdio: 'ignore' 
      });
      this.portalAvailable = true;
      console.log('[URL-LINUX] xdg-desktop-portal available on Wayland');
    } catch {
      this.portalAvailable = false;
      console.log('[URL-LINUX] xdg-desktop-portal not available on Wayland - limited to title parsing');
    }
  }

  async getCurrentUrl() {
    try {
      // Get active window info
      const windowInfo = this.getActiveWindowInfo();
      if (!windowInfo) {
        console.log('[URL-LINUX] No active window detected');
        return null;
      }
      
      console.log('[URL-LINUX] Active window:', windowInfo.class, 'Title:', windowInfo.title?.substring(0, 50));

      // Expanded browser map with more variants
      const browserMap = {
        'google-chrome': 'Chrome',
        'chromium': 'Chromium',
        'chromium-browser': 'Chromium',
        'firefox': 'Firefox',
        'brave-browser': 'Brave',
        'microsoft-edge': 'Edge',
        'opera': 'Opera',
        'vivaldi-stable': 'Vivaldi',
        'vivaldi': 'Vivaldi',
        'google-chrome-beta': 'Chrome',
        'google-chrome-dev': 'Chrome',
        'firefox-esr': 'Firefox',
        'tor-browser': 'Tor'
      };

      const browserName = browserMap[windowInfo.class.toLowerCase()];
      if (!browserName) {
        console.log('[URL-LINUX] Not a browser:', windowInfo.class);
        return null;
      }
      
      console.log('[URL-LINUX] Browser detected:', browserName, 'Platform:', this.isWayland ? 'Wayland' : 'X11');
      
      let url = null;
      let title = windowInfo.title || '';
      let confidence = 'low';
      
      // X11: Try window properties first (high confidence)
      if (!this.isWayland) {
        try {
          url = this.getUrlFromWindowProps(windowInfo.id);
          if (url) confidence = 'high';
        } catch (e) {
          console.log(`[URL-LINUX] X11 props failed for ${browserName}, falling back to title parse`);
        }
      }
      
      // Wayland or X11 fallback: Enhanced title extraction
      if (!url && title) {
        url = this.extractUrlFromTitle(title, browserName);
        if (url) confidence = 'medium'; // Better than basic due to patterns
      }
      
      // NEW: Wayland portal introspection if available
      if (this.isWayland && this.portalAvailable && !url) {
        try {
          console.log('[URL-LINUX] Trying Wayland portal introspection...');
          url = await this.getUrlViaPortal(browserName, windowInfo);
          if (url) {
            confidence = 'high';
            console.log('[URL-LINUX] Portal URL success:', url.substring(0, 50) + '...');
          }
        } catch (portalError) {
          console.log('[URL-LINUX] Portal introspection failed:', portalError.message);
        }
      }
      
      if (!url) {
        console.log('[URL-LINUX] No URL found for', browserName);
        return null;
      }
      
      return {
        url: url,
        title: title,
        browser: browserName,
        source: browserName.toLowerCase(),
        windowId: windowInfo.id,
        confidence: confidence,
        platform: this.isWayland ? 'wayland' : 'x11'
      };
    } catch (error) {
      console.error('[URL-LINUX] Capture error:', error);
      return null;
    }
  }

  getActiveWindowInfo() {
    try {
      // Try xdotool first (works on most X11 systems)
      if (!this.isWayland) {
        try {
          const activeId = execSync('xdotool getactivewindow', { encoding: 'utf8', timeout: 1000 }).trim();
          const windowClass = execSync(`xdotool getwindowclassname ${activeId}`, { encoding: 'utf8', timeout: 1000 }).trim();
          const windowTitle = execSync(`xdotool getwindowname ${activeId}`, { encoding: 'utf8', timeout: 1000 }).trim();
          
          return {
            id: activeId,
            class: windowClass,
            title: windowTitle
          };
        } catch {}
      }

      // Fallback to wmctrl - use xprop to find active window
      try {
        // Get the active window ID from X11 properties
        const activeIdHex = execSync('xprop -root _NET_ACTIVE_WINDOW | cut -d" " -f5', { 
          encoding: 'utf8', 
          timeout: 1000 
        }).trim();
        
        if (activeIdHex && activeIdHex !== '0x0') {
          // Get window list from wmctrl
          const wmctrlOutput = execSync('wmctrl -lx', { encoding: 'utf8', timeout: 1000 });
          const lines = wmctrlOutput.split('\n');
          
          // Find the line with matching window ID
          for (const line of lines) {
            if (line.includes(activeIdHex)) {
              const parts = line.split(/\s+/);
              const windowId = parts[0];
              const windowClass = parts[2].split('.')[0];
              const windowTitle = parts.slice(4).join(' ');
              
              return {
                id: windowId,
                class: windowClass,
                title: windowTitle
              };
            }
          }
        }
      } catch {}

      // Last resort: use xwininfo
      try {
        const xwininfoOutput = execSync('xwininfo -root -tree | grep -E "has focus|Focused"', { 
          encoding: 'utf8',
          timeout: 1500
        });
        if (xwininfoOutput) {
          const match = xwininfoOutput.match(/0x[0-9a-f]+/i);
          if (match) {
            const windowId = match[0];
            const windowInfo = execSync(`xprop -id ${windowId} WM_CLASS WM_NAME`, { 
              encoding: 'utf8',
              timeout: 1000
            });
            const classMatch = windowInfo.match(/WM_CLASS.*=.*"([^"]+)"/);
            const titleMatch = windowInfo.match(/WM_NAME.*=.*"([^"]+)"/);
            
            return {
              id: windowId,
              class: classMatch ? classMatch[1] : '',
              title: titleMatch ? titleMatch[1] : ''
            };
          }
        }
      } catch {}

      return null;
    } catch (error) {
      console.error('[URL-LINUX] getActiveWindowInfo error:', error);
      return null;
    }
  }

  getUrlFromWindowProps(windowId) {
    const now = Date.now();
    const cacheKey = `props:${windowId}`;
    
    // Check if this resolver is backed off
    if (this.resolverBackoff.has('x11-props') && this.resolverBackoff.get('x11-props') > now) {
      return null;
    }
    
    // Check cache first (60 second TTL)
    const cached = this.propCache.get(cacheKey);
    if (cached && (now - cached.timestamp) < 60000) {
      return cached.url;
    }
    
    try {
      // Single xprop call for all needed properties
      const props = execSync(`xprop -id ${windowId} _MOZILLA_URL _NET_WM_NAME WM_NAME WM_CLASS`, {
        encoding: 'utf8',
        timeout: 1000
      });
      
      let foundUrl = null;
      
      // Check for Firefox Mozilla URL property first
      const mozillaMatch = props.match(/_MOZILLA_URL.*?"([^"]+)"/);
      if (mozillaMatch && mozillaMatch[1].startsWith('http')) {
        foundUrl = mozillaMatch[1];
      }
      
      // Check window titles for URLs if Mozilla URL not found
      if (!foundUrl) {
        const nameMatch = props.match(/(?:_NET_WM_NAME|WM_NAME).*?"([^"]+)"/);
        if (nameMatch) {
          const titleUrl = this.extractUrlFromTitle(nameMatch[1], 'unknown');
          if (titleUrl && titleUrl.startsWith('http')) {
            foundUrl = titleUrl;
          }
        }
      }
      
      // Cache the result
      this.propCache.set(cacheKey, {
        url: foundUrl,
        timestamp: now
      });
      
      // Clean cache if it gets too large
      if (this.propCache.size > 100) {
        const oldestKey = this.propCache.keys().next().value;
        this.propCache.delete(oldestKey);
      }
      
      // Clear backoff on success
      if (this.resolverBackoff.has('x11-props')) {
        this.resolverBackoff.delete('x11-props');
      }
      
      return foundUrl;
    } catch (error) {
      // Set backoff for 5 seconds on failure
      this.resolverBackoff.set('x11-props', now + 5000);
      return null;
    }
  }

  // Enhanced title extraction with browser-specific patterns
  extractUrlFromTitle(title, browserName) {
    if (!title) return null;
    
    // Remove browser suffix first (expanded)
    const suffixes = [
      ' - Mozilla Firefox', ' — Mozilla Firefox',
      ' - Google Chrome', ' - Chromium',
      ' - Microsoft Edge', ' - Brave',
      ' - Opera', ' - Vivaldi',
      ' - Tor Browser'
    ];
    
    let cleanTitle = title;
    for (const suffix of suffixes) {
      if (cleanTitle.endsWith(suffix)) {
        cleanTitle = cleanTitle.slice(0, -suffix.length);
        break;
      }
    }
    
    // Browser-specific patterns
    if (browserName === 'Firefox') {
      // Firefox: Domain often after " - "
      const parts = cleanTitle.split(' - ');
      if (parts.length > 1) {
        const domainPart = parts[parts.length - 1].trim();
        const domainMatch = domainPart.match(/^([a-z0-9][a-z0-9\-]*\.)+[a-z]{2,}$/i);
        if (domainMatch) {
          return 'https://' + domainMatch[0];
        }
      }
    } else if (['Chrome', 'Chromium', 'Edge', 'Brave', 'Opera', 'Vivaldi'].includes(browserName)) {
      // Chromium: URL often at start or after " - "
      const urlMatch = cleanTitle.match(/^(https?:\/\/[^\s]+)|(?: - )?(https?:\/\/[^\s]+)/i);
      if (urlMatch) {
        return urlMatch[1] || urlMatch[2];
      }
      // Fallback: Extract domain from title
      const domainMatch = cleanTitle.match(/([a-z0-9][a-z0-9\-]*\.)+[a-z]{2,}/i);
      if (domainMatch) {
        return 'https://' + domainMatch[0];
      }
    }
    
    // Generic patterns (fallback)
    const patterns = [
      /^(https?:\/\/[^\s]+)/,
      /\s(https?:\/\/[^\s]+)/,
      /^([^\s]+\.[^\s]+)$/
    ];
    
    for (const pattern of patterns) {
      const match = cleanTitle.match(pattern);
      if (match) {
        let url = match[1];
        if (!url.startsWith('http')) {
          url = 'https://' + url;
        }
        return url;
      }
    }
    
    return null;
  }
  
  // NEW: Wayland portal URL via gdbus (GNOME example)
  async getUrlViaPortal(browserName, windowInfo) {
    if (!this.portalAvailable) return null;
    
    try {
      // For GNOME Wayland, query Shell for focused window URL (if browser exposes it)
      const portalScript = `gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell --method org.gnome.Shell.Eval \\
"let focused = global.get_window_actors().find(w => w.has_focus()); \\
focused ? (focused.meta_window ? focused.meta_window.title : '') : ''"`;
      
      const portalResult = execSync(portalScript, { encoding: 'utf8', timeout: 3000 }).trim();
      
      // Parse response and extract URL if present
      const titleMatch = portalResult.match(/'([^']+)'/);
      if (titleMatch) {
        const portalTitle = titleMatch[1];
        return this.extractUrlFromTitle(portalTitle, browserName);
      }
    } catch (error) {
      console.log('[URL-LINUX] Portal gdbus failed:', error.message);
    }
    
    return null;
  }
}

module.exports = { LinuxUrlCapture };