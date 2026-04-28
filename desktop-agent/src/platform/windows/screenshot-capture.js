/**
 * Windows Screenshot Capture Module
 * Provides cross-platform screenshot capture using screenshot-desktop
 */

const screenshot = require('screenshot-desktop');

/**
 * Capture screenshot on Windows
 * @returns {Promise<{success: boolean, buffer?: Buffer, method: string, error?: string}>}
 */
async function captureScreenshot() {
  try {
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
    console.error('[WINDOWS-SCREENSHOT] Error capturing screenshot:', error.message);
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
