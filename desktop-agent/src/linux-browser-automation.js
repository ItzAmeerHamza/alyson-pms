const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Linux Browser Automation Module
 * Provides comprehensive browser URL detection for Linux systems
 * Supports both X11 and Wayland environments
 */

class LinuxBrowserAutomation {
  constructor() {
    this.environment = this.detectEnvironment();
    this.availableTools = this.detectAvailableTools();
    this.supportedBrowsers = {
      'firefox': {
        processNames: ['firefox', 'firefox-esr'],
        configDir: path.join(os.homedir(), '.mozilla/firefox'),
        sessionRestoreFile: 'sessionstore.jsonlz4'
      },
      'chrome': {
        processNames: ['chrome', 'google-chrome', 'google-chrome-stable'],
        configDir: path.join(os.homedir(), '.config/google-chrome'),
        sessionFile: 'Current Session'
      },
      'chromium': {
        processNames: ['chromium', 'chromium-browser'],
        configDir: path.join(os.homedir(), '.config/chromium'),
        sessionFile: 'Current Session'
      },
      'brave': {
        processNames: ['brave', 'brave-browser'],
        configDir: path.join(os.homedir(), '.config/BraveSoftware/Brave-Browser'),
        sessionFile: 'Current Session'
      },
      'edge': {
        processNames: ['microsoft-edge', 'microsoft-edge-stable'],
        configDir: path.join(os.homedir(), '.config/microsoft-edge'),
        sessionFile: 'Current Session'
      }
    };
    
    this.lastUrlCheck = new Map();
  }

  /**
   * Detect desktop environment (X11, Wayland, etc.)
   */
  detectEnvironment() {
    try {
      const sessionType = process.env.XDG_SESSION_TYPE || '';
      const waylandDisplay = process.env.WAYLAND_DISPLAY || '';
      const x11Display = process.env.DISPLAY || '';
      
      if (sessionType === 'wayland' || waylandDisplay) {
        return { type: 'wayland', compositor: this.detectWaylandCompositor() };
      } else if (sessionType === 'x11' || x11Display) {
        return { type: 'x11', display: x11Display };
      }
      
      return { type: 'unknown' };
    } catch (error) {
      console.log('⚠️ [LINUX-BROWSER] Environment detection failed:', error.message);
      return { type: 'unknown' };
    }
  }

  /**
   * Detect Wayland compositor
   */
  detectWaylandCompositor() {
    const compositors = {
      'gnome-shell': 'GNOME',
      'kwin_wayland': 'KDE',
      'sway': 'Sway',
      'wlroots': 'wlroots-based'
    };

    try {
      const processes = execSync('ps aux', { encoding: 'utf8' });
      for (const [process, name] of Object.entries(compositors)) {
        if (processes.includes(process)) {
          return name;
        }
      }
    } catch (error) {
      // Silent fail
    }

    return 'unknown';
  }

  /**
   * Detect available tools for window management
   */
  detectAvailableTools() {
    const tools = {
      x11: ['xprop', 'xwininfo', 'wmctrl', 'xdotool'],
      wayland: ['swaymsg', 'hyprctl', 'wlr-randr'],
      universal: ['gdbus', 'dbus-send', 'busctl']
    };

    const available = { x11: [], wayland: [], universal: [] };

    for (const [category, toolList] of Object.entries(tools)) {
      for (const tool of toolList) {
        try {
          execSync(`which ${tool}`, { stdio: 'ignore' });
          available[category].push(tool);
        } catch (error) {
          // Tool not available
        }
      }
    }

    return available;
  }

  /**
   * Get active browser URLs using multiple methods
   */
  async getActiveBrowserUrls() {
    const results = [];
    
    try {
      // Method 1: Environment-specific window detection
      const windowUrls = await this.getUrlsFromWindows();
      results.push(...windowUrls);
      
      // Method 2: Browser session file parsing
      if (results.length === 0) {
        const sessionUrls = await this.getUrlsFromSessionFiles();
        results.push(...sessionUrls);
      }
      
      // Method 3: D-Bus integration (GNOME/KDE)
      if (results.length === 0) {
        const dbusUrls = await this.getUrlsFromDBus();
        results.push(...dbusUrls);
      }
      
      // Method 4: Process memory inspection (last resort)
      if (results.length === 0) {
        const memoryUrls = await this.getUrlsFromProcessMemory();
        results.push(...memoryUrls);
      }
      
      return results;
    } catch (error) {
      console.log('❌ [LINUX-BROWSER] Error getting browser URLs:', error.message);
      return [];
    }
  }

  /**
   * Get URLs from window information (X11/Wayland)
   */
  async getUrlsFromWindows() {
    if (this.environment.type === 'x11') {
      return await this.getUrlsFromX11Windows();
    } else if (this.environment.type === 'wayland') {
      return await this.getUrlsFromWaylandWindows();
    }
    
    return [];
  }

  /**
   * X11-specific window URL detection
   */
  async getUrlsFromX11Windows() {
    const urls = [];
    
    try {
      // Method 1: xprop + xwininfo
      if (this.availableTools.x11.includes('xprop') && this.availableTools.x11.includes('xwininfo')) {
        const windowUrls = await this.getX11WindowUrlsWithXprop();
        urls.push(...windowUrls);
      }
      
      // Method 2: wmctrl
      if (urls.length === 0 && this.availableTools.x11.includes('wmctrl')) {
        const wmctrlUrls = await this.getX11WindowUrlsWithWmctrl();
        urls.push(...wmctrlUrls);
      }
      
      // Method 3: xdotool
      if (urls.length === 0 && this.availableTools.x11.includes('xdotool')) {
        const xdotoolUrls = await this.getX11WindowUrlsWithXdotool();
        urls.push(...xdotoolUrls);
      }
      
    } catch (error) {
      console.log('⚠️ [LINUX-BROWSER] X11 window detection failed:', error.message);
    }
    
    return urls;
  }

  /**
   * Wayland-specific window URL detection
   */
  async getUrlsFromWaylandWindows() {
    const urls = [];
    
    try {
      // Method 1: Sway
      if (this.environment.compositor === 'Sway' && this.availableTools.wayland.includes('swaymsg')) {
        const swayUrls = await this.getWaylandUrlsWithSway();
        urls.push(...swayUrls);
      }
      
      // Method 2: Hyprland
      if (this.environment.compositor === 'Hyprland' && this.availableTools.wayland.includes('hyprctl')) {
        const hyprUrls = await this.getWaylandUrlsWithHypr();
        urls.push(...hyprUrls);
      }
      
      // Method 3: GNOME Wayland
      if (this.environment.compositor === 'GNOME') {
        const gnomeUrls = await this.getWaylandUrlsWithGNOME();
        urls.push(...gnomeUrls);
      }
      
    } catch (error) {
      console.log('⚠️ [LINUX-BROWSER] Wayland window detection failed:', error.message);
    }
    
    return urls;
  }

  /**
   * X11 URL detection using xprop
   */
  async getX11WindowUrlsWithXprop() {
    try {
      const activeWindowId = execSync('xprop -root _NET_ACTIVE_WINDOW | cut -d\' \' -f5', { 
        encoding: 'utf8' 
      }).trim();
      
      if (activeWindowId && activeWindowId !== '0x0') {
        const windowInfo = execSync(`xprop -id ${activeWindowId} WM_NAME WM_CLASS`, { 
          encoding: 'utf8' 
        });
        
        const lines = windowInfo.split('\n');
        let windowTitle = '';
        let windowClass = '';
        
        for (const line of lines) {
          if (line.includes('WM_NAME')) {
            windowTitle = line.split('=')[1]?.trim().replace(/"/g, '') || '';
          } else if (line.includes('WM_CLASS')) {
            windowClass = line.split('=')[1]?.trim().replace(/"/g, '') || '';
          }
        }
        
        // Check if it's a browser window
        const browserClasses = ['firefox', 'chrome', 'chromium', 'brave', 'edge'];
        const lowerClass = windowClass.toLowerCase();
        
        if (browserClasses.some(browser => lowerClass.includes(browser))) {
          const urlMatch = windowTitle.match(/(https?:\/\/[^\s]+)/);
          if (urlMatch) {
            return [{
              url: urlMatch[1],
              title: windowTitle,
              browser: this.detectBrowserFromClass(windowClass),
              method: 'xprop',
              windowId: activeWindowId
            }];
          }
        }
      }
    } catch (error) {
      console.log('⚠️ [LINUX-BROWSER] xprop detection failed:', error.message);
    }
    
    return [];
  }

  /**
   * X11 URL detection using wmctrl
   */
  async getX11WindowUrlsWithWmctrl() {
    try {
      const windows = execSync('wmctrl -lG', { encoding: 'utf8' });
      const lines = windows.split('\n').filter(line => line.trim());
      
      const urls = [];
      for (const line of lines) {
        const parts = line.split(/\s+/);
        const windowTitle = parts.slice(7).join(' ');
        
        // Check if title contains a URL
        const urlMatch = windowTitle.match(/(https?:\/\/[^\s]+)/);
        if (urlMatch) {
          const windowId = parts[0];
          
          // Get process info for this window
          try {
            const processInfo = execSync(`xprop -id ${windowId} _NET_WM_PID`, { 
              encoding: 'utf8' 
            });
            const pidMatch = processInfo.match(/_NET_WM_PID\(CARDINAL\) = (\d+)/);
            
            if (pidMatch) {
              const pid = pidMatch[1];
              const processName = execSync(`ps -p ${pid} -o comm=`, { 
                encoding: 'utf8' 
              }).trim();
              
              if (this.isBrowserProcess(processName)) {
                urls.push({
                  url: urlMatch[1],
                  title: windowTitle,
                  browser: this.detectBrowserFromProcess(processName),
                  method: 'wmctrl',
                  windowId: windowId,
                  pid: pid
                });
              }
            }
          } catch (error) {
            // Continue without process info
            urls.push({
              url: urlMatch[1],
              title: windowTitle,
              browser: 'unknown',
              method: 'wmctrl-fallback',
              windowId: windowId
            });
          }
        }
      }
      
      return urls;
    } catch (error) {
      console.log('⚠️ [LINUX-BROWSER] wmctrl detection failed:', error.message);
      return [];
    }
  }

  /**
   * X11 URL detection using xdotool
   */
  async getX11WindowUrlsWithXdotool() {
    try {
      const activeWindow = execSync('xdotool getactivewindow', { encoding: 'utf8' }).trim();
      const windowName = execSync(`xdotool getwindowname ${activeWindow}`, { encoding: 'utf8' }).trim();
      
      const urlMatch = windowName.match(/(https?:\/\/[^\s]+)/);
      if (urlMatch) {
        // Get process name
        const pid = execSync(`xdotool getwindowpid ${activeWindow}`, { encoding: 'utf8' }).trim();
        const processName = execSync(`ps -p ${pid} -o comm=`, { encoding: 'utf8' }).trim();
        
        if (this.isBrowserProcess(processName)) {
          return [{
            url: urlMatch[1],
            title: windowName,
            browser: this.detectBrowserFromProcess(processName),
            method: 'xdotool',
            windowId: activeWindow,
            pid: pid
          }];
        }
      }
    } catch (error) {
      console.log('⚠️ [LINUX-BROWSER] xdotool detection failed:', error.message);
    }
    
    return [];
  }

  /**
   * Wayland URL detection for Sway
   */
  async getWaylandUrlsWithSway() {
    try {
      const tree = execSync('swaymsg -t get_tree', { encoding: 'utf8' });
      const treeData = JSON.parse(tree);
      
      const urls = [];
      this.traverseSwayTree(treeData, urls);
      
      return urls;
    } catch (error) {
      console.log('⚠️ [LINUX-BROWSER] Sway detection failed:', error.message);
      return [];
    }
  }

  /**
   * Traverse Sway tree to find browser windows
   */
  traverseSwayTree(node, urls) {
    if (node.app_id && this.isBrowserProcess(node.app_id) && node.name) {
      const urlMatch = node.name.match(/(https?:\/\/[^\s]+)/);
      if (urlMatch) {
        urls.push({
          url: urlMatch[1],
          title: node.name,
          browser: this.detectBrowserFromProcess(node.app_id),
          method: 'sway',
          focused: node.focused || false
        });
      }
    }
    
    if (node.nodes) {
      node.nodes.forEach(child => this.traverseSwayTree(child, urls));
    }
    
    if (node.floating_nodes) {
      node.floating_nodes.forEach(child => this.traverseSwayTree(child, urls));
    }
  }

  /**
   * Wayland URL detection for Hyprland
   */
  async getWaylandUrlsWithHypr() {
    try {
      const clients = execSync('hyprctl clients -j', { encoding: 'utf8' });
      const clientsData = JSON.parse(clients);
      
      const urls = [];
      for (const client of clientsData) {
        if (this.isBrowserProcess(client.class) && client.title) {
          const urlMatch = client.title.match(/(https?:\/\/[^\s]+)/);
          if (urlMatch) {
            urls.push({
              url: urlMatch[1],
              title: client.title,
              browser: this.detectBrowserFromProcess(client.class),
              method: 'hyprland',
              focused: client.focused || false
            });
          }
        }
      }
      
      return urls;
    } catch (error) {
      console.log('⚠️ [LINUX-BROWSER] Hyprland detection failed:', error.message);
      return [];
    }
  }

  /**
   * Wayland URL detection for GNOME
   */
  async getWaylandUrlsWithGNOME() {
    try {
      // Try GNOME Shell D-Bus interface
      const windows = execSync(`gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell --method org.gnome.Shell.Eval "global.get_window_actors().map(a => ({ title: a.get_meta_window().get_title(), wm_class: a.get_meta_window().get_wm_class() }))"`, { 
        encoding: 'utf8' 
      });
      
      // Parse the result (this is a simplified approach)
      const urls = [];
      // Complex parsing would be needed here for full implementation
      
      return urls;
    } catch (error) {
      console.log('⚠️ [LINUX-BROWSER] GNOME detection failed:', error.message);
      return [];
    }
  }

  /**
   * Get URLs from browser session files
   */
  async getUrlsFromSessionFiles() {
    const urls = [];
    
    for (const [browserName, config] of Object.entries(this.supportedBrowsers)) {
      try {
        if (browserName === 'firefox') {
          const firefoxUrls = await this.getFirefoxSessionUrls(config);
          urls.push(...firefoxUrls);
        } else {
          // Chrome-based browsers
          const chromeUrls = await this.getChromeBasedSessionUrls(browserName, config);
          urls.push(...chromeUrls);
        }
      } catch (error) {
        console.log(`⚠️ [LINUX-BROWSER] Session file parsing failed for ${browserName}:`, error.message);
      }
    }
    
    return urls;
  }

  /**
   * Parse Firefox session restore files
   */
  async getFirefoxSessionUrls(config) {
    // Firefox session parsing would require handling jsonlz4 format
    // This is a placeholder for the complex implementation needed
    return [];
  }

  /**
   * Parse Chrome-based browser session files
   */
  async getChromeBasedSessionUrls(browserName, config) {
    // Chrome session parsing would require handling binary session files
    // This is a placeholder for the complex implementation needed
    return [];
  }

  /**
   * Get URLs using D-Bus integration
   */
  async getUrlsFromDBus() {
    // D-Bus integration would depend on specific desktop environment implementations
    // This is a placeholder for the complex implementation needed
    return [];
  }

  /**
   * Get URLs from process memory (last resort)
   */
  async getUrlsFromProcessMemory() {
    // Memory inspection would require specialized tools and permissions
    // This is a placeholder and not recommended for production use
    return [];
  }

  /**
   * Helper methods
   */
  isBrowserProcess(processName) {
    const browsers = ['firefox', 'chrome', 'chromium', 'brave', 'edge', 'opera'];
    return browsers.some(browser => processName.toLowerCase().includes(browser));
  }

  detectBrowserFromProcess(processName) {
    const lower = processName.toLowerCase();
    if (lower.includes('firefox')) return 'firefox';
    if (lower.includes('chrome')) return 'chrome';
    if (lower.includes('chromium')) return 'chromium';
    if (lower.includes('brave')) return 'brave';
    if (lower.includes('edge')) return 'edge';
    if (lower.includes('opera')) return 'opera';
    return 'unknown';
  }

  detectBrowserFromClass(windowClass) {
    return this.detectBrowserFromProcess(windowClass);
  }

  /**
   * Get focused browser URL
   */
  async getFocusedBrowserUrl() {
    const allUrls = await this.getActiveBrowserUrls();
    return allUrls.find(url => url.focused) || allUrls[0] || null;
  }

  /**
   * Check system dependencies and provide installation guidance
   */
  checkDependencies() {
    const missing = {
      x11: [],
      wayland: [],
      universal: []
    };

    const required = {
      x11: ['xprop'],
      wayland: this.environment.compositor === 'Sway' ? ['swaymsg'] : [],
      universal: []
    };

    for (const [category, tools] of Object.entries(required)) {
      for (const tool of tools) {
        if (!this.availableTools[category].includes(tool)) {
          missing[category].push(tool);
        }
      }
    }

    return {
      environment: this.environment,
      availableTools: this.availableTools,
      missing: missing,
      installationGuidance: this.getInstallationGuidance(missing)
    };
  }

  /**
   * Provide installation guidance for missing tools
   */
  getInstallationGuidance(missing) {
    const guidance = [];
    
    const allMissing = [...missing.x11, ...missing.wayland, ...missing.universal];
    
    if (allMissing.length === 0) {
      return ['✅ All required tools are available'];
    }

    // Detect distribution
    try {
      const osRelease = fs.readFileSync('/etc/os-release', 'utf8');
      
      if (osRelease.includes('Ubuntu') || osRelease.includes('Debian')) {
        guidance.push(`📦 Ubuntu/Debian: sudo apt install ${allMissing.join(' ')}`);
      }
      
      if (osRelease.includes('Fedora') || osRelease.includes('Red Hat')) {
        guidance.push(`📦 Fedora/RHEL: sudo dnf install ${allMissing.join(' ')}`);
      }
      
      if (osRelease.includes('Arch')) {
        guidance.push(`📦 Arch Linux: sudo pacman -S ${allMissing.join(' ')}`);
      }
      
      if (osRelease.includes('openSUSE')) {
        guidance.push(`📦 openSUSE: sudo zypper install ${allMissing.join(' ')}`);
      }
    } catch (error) {
      guidance.push('📦 Please install missing tools using your distribution\'s package manager');
    }

    return guidance;
  }
}

module.exports = LinuxBrowserAutomation; 