/**
 * macOS Screenshot Capture Module
 * Provides cross-platform screenshot capture using screenshot-desktop
 */

const screenshot = require('screenshot-desktop');

/**
 * Capture screenshot on macOS
 * Pre-checks screen recording permission via Electron systemPreferences to
 * avoid triggering the macOS permission prompt (especially after sleep/wake).
 * @returns {Promise<{success: boolean, buffer?: Buffer, method: string, error?: string}>}
 */
async function captureScreenshot() {
  try {
    // Pre-check macOS screen recording permission before calling screenshot-desktop
    // This avoids triggering the OS "bypass system private window picker" prompt
    try {
      const { systemPreferences } = require('electron');
      if (systemPreferences && typeof systemPreferences.getMediaAccessStatus === 'function') {
        const status = systemPreferences.getMediaAccessStatus('screen');
        if (status !== 'granted') {
          console.warn(`[MACOS-SCREENSHOT] Screen recording permission not granted (status: ${status}) - skipping capture`);
          return {
            success: false,
            method: 'screenshot-desktop',
            error: `Screen recording permission not granted (status: ${status})`
          };
        }
      }
    } catch (permError) {
      // If permission check fails, proceed cautiously — don't block capture entirely
      console.warn('[MACOS-SCREENSHOT] Could not pre-check permission:', permError.message);
    }

    // Capture screenshot using screenshot-desktop
    const buffer = await screenshot({ format: 'png' });
    
    if (!buffer || buffer.length === 0) {
      return {
        success: false,
        method: 'screenshot-desktop',
        error: 'Empty buffer returned'
      };
    }
    
    return {
      success: true,
      buffer: buffer,
      method: 'screenshot-desktop'
    };
    
  } catch (error) {
    console.error('[MACOS-SCREENSHOT] Error capturing screenshot:', error.message);
    return {
      success: false,
      method: 'screenshot-desktop',
      error: error.message
    };
  }
}

module.exports = {
  captureScreenshot
};


