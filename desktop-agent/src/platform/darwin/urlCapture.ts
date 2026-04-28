/**
 * macOS URL Capture Adapter
 * Uses Accessibility/title parsing to infer URLs from browsers (no Automation)
 */

import { execSync } from 'child_process';
import { IUrlCapture, UrlEvent, StopFn } from '../../modules/url/types';
import { inferBrowserSource } from '../../modules/url/normalize';
import { extractUrlFromTitle } from '../../modules/url/titleExtract';

export class MacOSUrlCapture implements IUrlCapture {
  private intervalId: NodeJS.Timeout | null = null;
  private lastActiveWindow: { app: string; windowId: number } | null = null;
  
  start(onEvent: (e: UrlEvent) => void): StopFn {
    // Poll for active window and URL changes
    this.intervalId = setInterval(() => {
      this.captureActiveUrl(onEvent).catch(err => {
        console.error('[MacOSUrlCapture] Error:', err.message);
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
  
  private async captureActiveUrl(onEvent: (e: UrlEvent) => void): Promise<void> {
    try {
      // Get active application
      const activeApp = this.getActiveApplication();
      if (!activeApp) return;
      
      const { app, bundleId, windowTitle, pid } = activeApp;
      const source = inferBrowserSource(app);
      
      // Skip if not a browser
      if (source === 'unknown') return;
      
      // Try to read URL via Accessibility (AX) address bar without Automation
      let url: string | null = null;
      try {
        url = await this.getUrlViaAX(app);
      } catch {}
      // Fallback to title parsing
      if (!url && windowTitle) {
        url = extractUrlFromTitle(windowTitle);
      }
      
      // Create event
      const event: UrlEvent = {
        ts: Date.now(),
        app: bundleId || app,
        source: source === 'unknown' && (app.toLowerCase().includes('firefox') || bundleId.toLowerCase().includes('mozilla')) ? 'firefox' : source,
        url,
        title: windowTitle,
        windowId: null, // macOS doesn't provide window IDs easily
        pid
      };
      
      onEvent(event);
      
    } catch (error) {
      // Silently ignore errors to avoid spamming logs
    }
  }

  /**
   * Attempt to get URL via Accessibility UI scripting (no Automation prompt).
   * Uses System Events to read address bar value for common browsers.
   */
  private async getUrlViaAX(appName: string): Promise<string | null> {
    const app = appName.toLowerCase();
    let script = '';
    if (app.includes('safari')) {
      // Safari: scan toolbar text fields for a plausible URL (no Automation).
      script = `
        tell application "System Events"
          tell application process "Safari"
            try
              tell front window
                tell toolbar 1
                  set tfList to (text fields of UI elements)
                  repeat with tf in tfList
                    try
                      set v to value of tf
                      if v is not missing value and v is not "" then
                        if v starts with "http" or v contains "." then return v
                      end if
                    end try
                  end repeat
                  try
                    return value of text field 1
                  on error
                    return ""
                  end try
                end tell
              end tell
            on error
              return ""
            end try
          end tell
        end tell`;
    } else if (app.includes('chrome')) {
      script = `
        tell application "System Events"
          tell application process "Google Chrome"
            try
              tell front window
                tell toolbar 1
                  try
                    return value of text field 1 of group 4
                  on error
                    try
                      return value of text field 1 of group 3
                    on error
                      try
                        return value of text field 1 of group 2
                      on error
                        return ""
                      end try
                    end try
                  end try
                end tell
              end tell
            on error
              return ""
            end try
          end tell
        end tell`;
    } else if (app.includes('edge')) {
      script = `
        tell application "System Events"
          tell application process "Microsoft Edge"
            try
              tell front window
                tell toolbar 1
                  try
                    return value of text field 1 of group 4
                  on error
                    try
                      return value of text field 1 of group 3
                    on error
                      return ""
                    end try
                  end try
                end tell
              end tell
            on error
              return ""
            end try
          end tell
        end tell`;
    } else if (app.includes('brave')) {
      script = `
        tell application "System Events"
          tell application process "Brave Browser"
            try
              tell front window
                tell toolbar 1
                  try
                    return value of text field 1 of group 4
                  on error
                    try
                      return value of text field 1 of group 3
                    on error
                      return ""
                    end try
                  end try
                end tell
              end tell
            on error
              return ""
            end try
          end tell
        end tell`;
    } else {
      // Unknown browser - let caller fall back
      return null;
    }

    try {
      const result = execSync(`/usr/bin/osascript -e '${script}'`, { encoding: 'utf8', timeout: 1200 }).trim();
      if (!result) return null;
      // Basic sanity: must look like a URL or domain
      if (/^https?:\/\//i.test(result)) return result;
      if (/^[a-z0-9.-]+\.[a-z]{2,}/i.test(result)) return `https://${result}`;
      return null;
    } catch {
      return null;
    }
  }
  
  private getActiveApplication(): { app: string; bundleId: string; windowTitle: string; pid: number } | null {
    try {
      // Get active app info
      const appScript = `
        tell application "System Events"
          set frontApp to first application process whose frontmost is true
          set appName to name of frontApp
          set appBundleId to bundle identifier of frontApp
          set appPid to unix id of frontApp
          return appName & "|" & appBundleId & "|" & appPid
        end tell
      `;
      
      const appResult = execSync(`/usr/bin/osascript -e '${appScript}'`, { 
        encoding: 'utf8', 
        timeout: 1000 
      }).trim();
      
      const [app, bundleId, pidStr] = appResult.split('|');
      const pid = parseInt(pidStr, 10) || 0;
      
      // Get window title
      let windowTitle = '';
      try {
        const titleScript = `
          tell application "System Events"
            set frontApp to first application process whose frontmost is true
            try
              set windowTitle to name of front window of frontApp
              return windowTitle
            on error
              return ""
            end try
          end tell
        `;
        
        windowTitle = execSync(`/usr/bin/osascript -e '${titleScript}'`, { 
          encoding: 'utf8', 
          timeout: 1000 
        }).trim();
      } catch {
        // Ignore title errors
      }
      
      return { app, bundleId, windowTitle, pid };
      
    } catch (error) {
      return null;
    }
  }
  
  // No direct browser control; URL extraction is via title parsing only.
}

