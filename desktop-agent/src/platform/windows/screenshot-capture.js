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
  // Primary method: screenshot-desktop
  try {
    const buffer = await screenshot({ format: 'png' });
    
    if (!buffer || buffer.length === 0) {
      throw new Error('Empty buffer returned');
    }
    
    return {
      success: true,
      buffer: buffer,
      method: 'screenshot-desktop'
    };
    
  } catch (error) {
    console.warn('[WINDOWS-SCREENSHOT] screenshot-desktop failed, trying desktopCapturer fallback:', error.message);
  }

  // Fallback method: Electron desktopCapturer (helps on environments where screenshot-desktop fails)
  try {
    const { desktopCapturer } = require('electron');
    if (!desktopCapturer || typeof desktopCapturer.getSources !== 'function') {
      throw new Error('desktopCapturer unavailable');
    }

    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1920, height: 1080 }
    });

    if (!Array.isArray(sources) || sources.length === 0) {
      throw new Error('No screen sources available');
    }

    // Pick first source with a non-empty thumbnail
    const sourceWithImage = sources.find((s) => s?.thumbnail && !s.thumbnail.isEmpty()) || sources[0];
    const pngBuffer = sourceWithImage?.thumbnail?.toPNG?.();

    if (!pngBuffer || pngBuffer.length === 0) {
      throw new Error('desktopCapturer returned empty thumbnail');
    }

    return {
      success: true,
      buffer: pngBuffer,
      method: 'desktopCapturer'
    };
  } catch (fallbackError) {
    console.error('[WINDOWS-SCREENSHOT] All capture methods failed:', fallbackError.message);
    return {
      success: false,
      method: 'windows-multi-capture',
      error: fallbackError.message
    };
  }
}

module.exports = {
  captureScreenshot
};
