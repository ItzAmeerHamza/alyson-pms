/**
 * Linux App Detection Module
 * Platform-specific code for detecting active applications on Linux
 * Extracted from main.js for modular architecture
 */

const { execSync } = require('child_process');

/**
 * Check if running on Wayland
 */
function isWayland() {
  try {
    const sessionType = process.env.XDG_SESSION_TYPE;
    const waylandDisplay = process.env.WAYLAND_DISPLAY;
    return sessionType === 'wayland' || !!waylandDisplay;
  } catch {
    return false;
  }
}

/**
 * Get the currently active application on Linux
 */
async function getLinuxActiveApplication() {
  try {
    // Debug logging for Linux app detection
    if (process.env.DEBUG_APP || process.env.DEBUG) {
      console.log('[LINUX-APP] Starting Linux app detection...');
    }
    
    // Try xprop first
    try {
      // First get the active window ID
      const windowId = execSync('xprop -root _NET_ACTIVE_WINDOW | cut -d\' \' -f5', {
        encoding: 'utf8',
        timeout: 2000
      }).trim();
      
      if (!windowId || windowId === '0x0' || windowId === '(none)') {
        throw new Error('No active window');
      }
      
      // Then get window properties
      const result = execSync(`xprop -id ${windowId} WM_NAME WM_CLASS`, { 
        encoding: 'utf8',
        timeout: 3000
      });
      
      const lines = result.split('\n');
      let appName = 'Unknown';
      let windowTitle = 'Unknown';
      
      for (const line of lines) {
        if (line.includes('WM_NAME')) {
          const match = line.match(/WM_NAME\(.*?\) = "(.*?)"/);
          if (match) {
            windowTitle = match[1];
          }
        } else if (line.includes('WM_CLASS')) {
          const match = line.match(/WM_CLASS\(.*?\) = "(.*?)", "(.*?)"/);
          if (match) {
            // Use the second value which is usually the application name
            appName = match[2] || match[1];
          }
        }
      }
      
      // Clean up common Linux app names
      const appNameMappings = {
        'firefox': 'Firefox',
        'google-chrome': 'Google Chrome',
        'chromium-browser': 'Chromium',
        'code': 'Visual Studio Code',
        'gnome-terminal': 'Terminal',
        'konsole': 'Konsole',
        'nautilus': 'Files',
        'dolphin': 'Dolphin',
        'thunderbird': 'Thunderbird',
        'libreoffice-writer': 'LibreOffice Writer',
        'libreoffice-calc': 'LibreOffice Calc',
        'evince': 'Document Viewer',
        'slack': 'Slack',
        'teams': 'Microsoft Teams'
      };
      
      const lowerAppName = appName.toLowerCase();
      for (const [key, value] of Object.entries(appNameMappings)) {
        if (lowerAppName.includes(key)) {
          appName = value;
          break;
        }
      }
      
      if (process.env.DEBUG_APP || process.env.DEBUG) {
        console.log('[LINUX-APP] xprop detection successful:', { appName, windowTitle });
      }
      
      return {
        name: appName,
        title: windowTitle,
        platform: 'linux',
        method: 'xprop',
        waylandLimited: false
      };
    } catch (xpropError) {
      // Check if on Wayland (xprop doesn't work on Wayland)
      const onWayland = isWayland();
      
      if (onWayland && !process.env.WAYLAND_WARNING_SHOWN) {
        console.warn('⚠️ [LINUX] Running on Wayland - app detection will be limited');
        process.env.WAYLAND_WARNING_SHOWN = 'true';
      }
      
      // Fallback to wmctrl
      try {
        if (process.env.DEBUG_APP || process.env.DEBUG) {
          console.log('[LINUX-APP] xprop failed, trying wmctrl...');
        }
        
        // Get active window using wmctrl
        const activeWindow = execSync('wmctrl -lp | grep -E "0x[0-9a-f]+ +[0-9]+ +[0-9]+" | head -1', { 
          encoding: 'utf8',
          timeout: 3000
        }).trim();
        
        if (!activeWindow) {
          throw new Error('No active window found');
        }
        
        const parts = activeWindow.split(/\s+/);
        const pid = parts[2];
        const windowTitle = parts.slice(4).join(' ');
        
        // Try to get app name from process
        let appName = 'Unknown';
        try {
          const processInfo = execSync(`ps -p ${pid} -o comm=`, {
            encoding: 'utf8',
            timeout: 1000
          }).trim();
          
          if (processInfo) {
            appName = processInfo.split('/').pop(); // Get just the executable name
          }
        } catch {
          // Couldn't get process name
        }
        
        if (process.env.DEBUG_APP || process.env.DEBUG) {
          console.log('[LINUX-APP] wmctrl detection:', { appName, windowTitle });
        }
        
        return {
          name: appName,
          title: windowTitle,
          platform: 'linux',
          method: 'wmctrl',
          waylandLimited: onWayland
        };
      } catch (wmctrlError) {
        // Final fallback - xdotool (not recommended but sometimes works)
        if (process.env.ALLOW_XDOTOOL === 'true') {
          try {
            if (process.env.DEBUG_APP || process.env.DEBUG) {
              console.log('[LINUX-APP] wmctrl failed, trying xdotool...');
            }
            
            const windowId = execSync('xdotool getwindowfocus', { encoding: 'utf8', timeout: 1000 }).trim();
            const windowTitle = execSync(`xdotool getwindowname ${windowId}`, { encoding: 'utf8', timeout: 1000 }).trim();
            
            // Try to get app name from window class
            let appName = 'Unknown';
            try {
              const windowClass = execSync(`xdotool getwindowclassname ${windowId}`, { encoding: 'utf8', timeout: 1000 }).trim();
              if (windowClass) {
                appName = windowClass;
              }
            } catch {
              // Couldn't get window class
            }
            
            if (process.env.DEBUG_APP || process.env.DEBUG) {
              console.log('[LINUX-APP] xdotool detection:', { appName, windowTitle });
            }
            
            return {
              name: appName,
              title: windowTitle,
              platform: 'linux',
              method: 'xdotool',
              waylandLimited: onWayland
            };
          } catch (xdotoolError) {
            if (process.env.DEBUG_APP || process.env.DEBUG) {
              console.log('[LINUX-APP] xdotool also failed:', xdotoolError.message);
            }
          }
        }
        
        // Try qdbus for KDE
        try {
          const kdeResult = execSync('qdbus org.kde.KWin /KWin org.kde.KWin.activeClient', {
            encoding: 'utf8',
            timeout: 1000
          }).trim();
          
          if (kdeResult) {
            if (process.env.DEBUG_APP || process.env.DEBUG) {
              console.log('[LINUX-APP] KDE detection successful');
            }
            
            return {
              name: 'KDE Application',
              title: 'Active Window',
              platform: 'linux',
              method: 'kde-qdbus',
              waylandLimited: onWayland
            };
          }
        } catch {
          // Not KDE or qdbus failed
        }
        
        // All methods failed - return desktop activity
        if (process.env.DEBUG_APP || process.env.DEBUG) {
          console.log('[LINUX-APP] All detection methods failed, using fallback');
        }
        
        return {
          name: 'Desktop Activity',
          title: 'User Activity Detected',
          platform: 'linux',
          method: 'default-fallback',
          waylandLimited: onWayland
        };
      }
    }
  } catch (error) {
    throw new Error(`Linux app detection failed: ${error.message}`);
  }
}

/**
 * Unified interface for platform managers
 * Returns strict ActiveApp type
 */
async function detectActiveApp() {
  const app = await getLinuxActiveApplication();
  if (!app) return null;
  
  return {
    appName: app.name,
    windowTitle: app.title || 'No Window',
    bundleId: null, // Linux doesn't have bundle IDs
    pid: null, // Could be extracted from wmctrl but not currently implemented
    platform: 'linux',
    method: app.method,
    isBrowser: ['Firefox', 'Chrome', 'Chromium', 'Opera', 'Brave', 'Vivaldi', 'vivaldi-stable'].some(browser => 
      app.name.toLowerCase().includes(browser.toLowerCase())
    ),
    waylandLimited: app.waylandLimited
  };
}

module.exports = {
  getLinuxActiveApplication,
  detectActiveApp
};