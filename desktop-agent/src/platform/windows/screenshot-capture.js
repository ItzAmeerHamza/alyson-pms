/**
 * Windows Screenshot Capture Module
 * Captures all displays and stitches into a single PNG.
 */

const {
  captureAllDisplaysStitched,
  captureViaDesktopCapturerStitched,
  getPreferredThumbnailSize
} = require('../../modules/utils/multi-display-screenshot');

function getElectronDisplayCount() {
  try {
    const { screen } = require('electron');
    return screen?.getAllDisplays?.()?.length || 0;
  } catch (_) {
    return 0;
  }
}

/**
 * Capture screenshot on Windows (all monitors → one stitched image)
 * @returns {Promise<{success: boolean, buffer?: Buffer, method: string, error?: string, displayCount?: number}>}
 */
async function captureScreenshot() {
  const electronCount = getElectronDisplayCount();

  try {
    const result = await captureAllDisplaysStitched();

    if (result && result.success && result.buffer && result.buffer.length > 0) {
      // If we only got one pane but Electron sees multiple, force desktopCapturer
      if ((result.displayCount || 1) < 2 && electronCount >= 2) {
        console.warn(
          '[WINDOWS-SCREENSHOT] Single-display capture despite multi-monitor; retrying desktopCapturer'
        );
        try {
          const stitched = await captureViaDesktopCapturerStitched(getPreferredThumbnailSize());
          if (stitched.success && (stitched.displayCount || 1) >= 2) {
            return stitched;
          }
        } catch (retryErr) {
          console.warn('[WINDOWS-SCREENSHOT] desktopCapturer retry failed:', retryErr.message);
        }
      }
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
