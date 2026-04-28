/**
 * macOS Accessibility Permission Check
 * Provides non-blocking permission status checking
 */

const { systemPreferences } = require('electron');

class MacOSAccessibilityCheck {
  constructor() {
    this.hasShownToast = false;
    this.lastCheckTime = 0;
    this.checkInterval = 60000; // Check every minute
  }

  /**
   * Check if Accessibility permission is granted
   * @returns {boolean} True if permission granted
   */
  isAccessibilityGranted() {
    if (process.platform !== 'darwin') {
      return true; // Not macOS, no check needed
    }
    
    try {
      // Check if systemPreferences is available and has the method
      if (!systemPreferences || typeof systemPreferences.isTrustedAccessibilityClient !== 'function') {
        console.warn('[PERMISSIONS] systemPreferences.isTrustedAccessibilityClient not available');
        return true; // Assume granted if API not available
      }
      return systemPreferences.isTrustedAccessibilityClient(false);
    } catch (error) {
      console.error('[PERMISSIONS] Error checking accessibility:', error);
      return false;
    }
  }

  /**
   * Perform preflight check and show toast if needed
   * @param {Object} options - Check options
   * @param {Function} options.showToast - Function to show toast notification
   * @returns {Object} Check result
   */
  async preflightCheck(options = {}) {
    const now = Date.now();
    
    // Throttle checks
    if (now - this.lastCheckTime < this.checkInterval) {
      return { 
        granted: this.lastGranted ?? false,
        throttled: true 
      };
    }
    
    this.lastCheckTime = now;
    const granted = this.isAccessibilityGranted();
    this.lastGranted = granted;
    
    // Show toast once if not granted and toast function provided
    if (!granted && !this.hasShownToast && options.showToast) {
      this.hasShownToast = true;
      
      try {
        await options.showToast({
          title: 'TimeFlow URL Detection',
          message: 'Grant Accessibility permission for better URL tracking',
          type: 'warning',
          action: {
            label: 'Open Settings',
            callback: () => this.openAccessibilitySettings()
          }
        });
      } catch (error) {
        console.error('[PERMISSIONS] Error showing toast:', error);
      }
    }
    
    return {
      granted,
      platform: 'darwin',
      permission: 'accessibility',
      fallbackActive: !granted,
      confidence: granted ? 'high' : 'low'
    };
  }

  /**
   * Open macOS Accessibility settings
   */
  openAccessibilitySettings() {
    try {
      const { shell } = require('electron');
      shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
    } catch (error) {
      console.error('[PERMISSIONS] Error opening settings:', error);
    }
  }

  /**
   * Reset the toast shown flag (e.g., on app restart)
   */
  resetToastFlag() {
    this.hasShownToast = false;
  }

  /**
   * Get current permission status for health reporting
   */
  getHealthStatus() {
    const granted = this.isAccessibilityGranted();
    
    return {
      permission: 'macOS Accessibility',
      status: granted ? 'granted' : 'denied',
      impact: granted ? 'none' : 'degraded',
      description: granted ? 
        'Full URL detection available' : 
        'Using title-based fallback for URL detection',
      lastChecked: this.lastCheckTime,
      showSettings: !granted
    };
  }
}

module.exports = { MacOSAccessibilityCheck };
