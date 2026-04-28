/**
 * Linux URL Capture Adapter
 * Uses X11 tools and window properties to extract URLs
 */

import { execSync } from 'child_process';
import { IUrlCapture, UrlEvent, StopFn } from '../../modules/url/types';
import { inferBrowserSource } from '../../modules/url/normalize';
import { extractUrlFromTitleWithBrowser } from '../../modules/url/titleExtract';

export class LinuxUrlCapture implements IUrlCapture {
  private intervalId: NodeJS.Timeout | null = null;
  private availableTools: Set<string> = new Set();
  
  constructor() {
    // Check which tools are available
    this.detectAvailableTools();
  }
  
  start(onEvent: (e: UrlEvent) => void): StopFn {
    // Poll for active window and URL changes
    this.intervalId = setInterval(() => {
      this.captureActiveUrl(onEvent).catch(err => {
        console.error('[LinuxUrlCapture] Error:', err.message);
      });
    }, 1000); // Check every second
    
    // Return stop function
    return () => {
      if (this.intervalId) {
        clearInterval(this.intervalId);
        this.intervalId = null;
      }
    };
  }
  
  private detectAvailableTools(): void {
    const tools = ['xprop', 'xdotool', 'wmctrl', 'xwininfo'];
    
    for (const tool of tools) {
      try {
        execSync(`which ${tool}`, { encoding: 'utf8' });
        this.availableTools.add(tool);
      } catch {
        // Tool not available
      }
    }
  }
  
  private async captureActiveUrl(onEvent: (e: UrlEvent) => void): Promise<void> {
    try {
      const activeWindow = this.getActiveWindow();
      if (!activeWindow) return;
      
      const { appClass, windowTitle, windowId, pid } = activeWindow;
      const source = inferBrowserSource(appClass);
      
      // Skip if not a browser
      if (source === 'unknown') return;
      
      // Try to get URL from window properties or title
      let url: string | null = null;
      
      // Some browsers expose URL in window properties
      if (this.availableTools.has('xprop') && windowId) {
        try {
          url = await this.getUrlFromWindowProperty(windowId);
        } catch {
          // Property not available
        }
      }
      
      // Fallback to title extraction (explicit Firefox support)
      if (!url && windowTitle) {
        const inferred = source === 'unknown' && (appClass || '').toLowerCase().includes('firefox') ? 'firefox' : source;
        url = extractUrlFromTitleWithBrowser(windowTitle, inferred);
      }
      
      // Create event
      const event: UrlEvent = {
        ts: Date.now(),
        app: appClass,
        source,
        url,
        title: windowTitle,
        windowId,
        pid
      };
      
      onEvent(event);
      
    } catch (error) {
      // Silently ignore errors
    }
  }
  
  private getActiveWindow(): { appClass: string; windowTitle: string; windowId: string; pid: number } | null {
    // Try xprop first (most reliable)
    if (this.availableTools.has('xprop')) {
      try {
        return this.getActiveWindowViaXprop();
      } catch {
        // Fall through to next method
      }
    }
    
    // Try xdotool
    if (this.availableTools.has('xdotool')) {
      try {
        return this.getActiveWindowViaXdotool();
      } catch {
        // Fall through to next method
      }
    }
    
    // Try wmctrl
    if (this.availableTools.has('wmctrl')) {
      try {
        return this.getActiveWindowViaWmctrl();
      } catch {
        // Fall through
      }
    }
    
    return null;
  }
  
  private getActiveWindowViaXprop(): { appClass: string; windowTitle: string; windowId: string; pid: number } {
    // Get active window ID
    const activeWindowResult = execSync(
      'xprop -root _NET_ACTIVE_WINDOW | cut -d\' \' -f5',
      { encoding: 'utf8', timeout: 1000 }
    ).trim();
    
    if (!activeWindowResult || activeWindowResult === '0x0') {
      throw new Error('No active window');
    }
    
    const windowId = activeWindowResult;
    
    // Get window properties
    const propsResult = execSync(
      `xprop -id ${windowId} WM_CLASS WM_NAME _NET_WM_PID`,
      { encoding: 'utf8', timeout: 1000 }
    );
    
    let appClass = 'Unknown';
    let windowTitle = 'Unknown';
    let pid = 0;
    
    // Parse results
    const lines = propsResult.split('\n');
    for (const line of lines) {
      if (line.includes('WM_CLASS')) {
        // WM_CLASS(STRING) = "browser", "Browser"
        const match = line.match(/WM_CLASS.*=\s*"([^"]+)",\s*"([^"]+)"/);
        if (match) {
          appClass = match[2] || match[1]; // Prefer second value (class name)
        }
      } else if (line.includes('WM_NAME')) {
        // WM_NAME(STRING) = "Title"
        const match = line.match(/WM_NAME.*=\s*"([^"]+)"/);
        if (match) {
          windowTitle = match[1];
        }
      } else if (line.includes('_NET_WM_PID')) {
        // _NET_WM_PID(CARDINAL) = 12345
        const match = line.match(/_NET_WM_PID.*=\s*(\d+)/);
        if (match) {
          pid = parseInt(match[1], 10);
        }
      }
    }
    
    return { appClass, windowTitle, windowId, pid };
  }
  
  private getActiveWindowViaXdotool(): { appClass: string; windowTitle: string; windowId: string; pid: number } {
    // Get active window
    const windowId = execSync('xdotool getactivewindow', {
      encoding: 'utf8',
      timeout: 1000
    }).trim();
    
    if (!windowId) {
      throw new Error('No active window');
    }
    
    // Get window info
    const windowInfo = execSync(`xdotool getwindowpid ${windowId} && xdotool getwindowname ${windowId}`, {
      encoding: 'utf8',
      timeout: 1000
    }).trim();
    
    const lines = windowInfo.split('\n');
    const pid = parseInt(lines[0], 10) || 0;
    const windowTitle = lines[1] || 'Unknown';
    
    // Try to get process name from PID
    let appClass = 'Unknown';
    if (pid > 0) {
      try {
        const processInfo = execSync(`ps -p ${pid} -o comm=`, {
          encoding: 'utf8',
          timeout: 1000
        }).trim();
        appClass = processInfo;
      } catch {
        // Ignore
      }
    }
    
    return { appClass, windowTitle, windowId, pid };
  }
  
  private getActiveWindowViaWmctrl(): { appClass: string; windowTitle: string; windowId: string; pid: number } {
    // Get active window (wmctrl shows active window with *)
    const result = execSync('wmctrl -l -p | grep " \\* "', {
      encoding: 'utf8',
      timeout: 1000
    }).trim();
    
    if (!result) {
      throw new Error('No active window');
    }
    
    // Parse wmctrl output: 0x12345678  0 12345  hostname Window Title
    const parts = result.split(/\s+/);
    const windowId = parts[0];
    const pid = parseInt(parts[2], 10) || 0;
    const windowTitle = parts.slice(4).join(' ');
    
    // Try to get process name from PID
    let appClass = 'Unknown';
    if (pid > 0) {
      try {
        const processInfo = execSync(`ps -p ${pid} -o comm=`, {
          encoding: 'utf8',
          timeout: 1000
        }).trim();
        appClass = processInfo;
      } catch {
        // Ignore
      }
    }
    
    return { appClass, windowTitle, windowId, pid };
  }
  
  private async getUrlFromWindowProperty(windowId: string): Promise<string | null> {
    try {
      // Some browsers (like Chrome) may expose URL in window properties
      // Check for custom properties that might contain URL
      const result = execSync(
        `xprop -id ${windowId} | grep -i "url\\|uri\\|location" | head -1`,
        { encoding: 'utf8', timeout: 1000 }
      ).trim();
      
      if (result) {
        // Extract URL from property value
        const match = result.match(/https?:\/\/[^\s"]+/);
        if (match) {
          return match[0];
        }
      }
      
      return null;
    } catch {
      return null;
    }
  }
}

