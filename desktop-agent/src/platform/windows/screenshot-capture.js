/**
 * Windows Screenshot Capture Module
 * Captures all displays and stitches into a single PNG.
 */

const {
  captureAllDisplaysStitched,
  captureViaDesktopCapturerStitched,
  getPreferredThumbnailSize
} = require('../../modules/utils/multi-display-screenshot');

/**
 * Capture screenshot on Windows (all monitors → one stitched image)
 * @returns {Promise<{success: boolean, buffer?: Buffer, method: string, error?: string, displayCount?: number}>}
 */
async function captureScreenshot() {
  try {
    const result = await captureAllDisplaysStitched();

    if (result && result.success && result.buffer && result.buffer.length > 0) {
      return result;
    }

    console.warn(
      '[WINDOWS-SCREENSHOT] screenshot-desktop stitch failed, trying desktopCapturer fallback:',
      result?.error || 'unknown'
    );
  } catch (error) {
    console.warn('[WINDOWS-SCREENSHOT] screenshot-desktop failed, trying desktopCapturer fallback:', error.message);
  }

  try {
    const thumbnailSize = getPreferredThumbnailSize();
    return await captureViaDesktopCapturerStitched(thumbnailSize);
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
