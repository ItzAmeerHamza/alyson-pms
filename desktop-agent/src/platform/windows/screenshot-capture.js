/**
 * Windows Screenshot Capture Module
 * Captures all displays and stitches into a single PNG.
 */

const {
  captureAllDisplaysStitched,
  captureViaDesktopCapturerStitched,
  captureViaWindowsPowerShellAllScreens,
  stitchCaptures,
  getPreferredThumbnailSize,
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
  console.log(`[WINDOWS-SCREENSHOT] Electron display count=${electronCount}`);

  try {
    let result = await captureAllDisplaysStitched();

    if (result && result.success && result.buffer && result.buffer.length > 0) {
      // If we only got one pane but Electron sees multiple, force native + capturer retries
      if ((result.displayCount || 1) < 2 && electronCount >= 2) {
        console.warn(
          '[WINDOWS-SCREENSHOT] Single-display capture despite multi-monitor; forcing PowerShell + desktopCapturer'
        );

        try {
          const panes = await captureViaWindowsPowerShellAllScreens();
          if (panes.length >= 2) {
            const buffer = await stitchCaptures(panes);
            return {
              success: true,
              buffer,
              method: 'windows-powershell-stitched-retry',
              displayCount: panes.length,
            };
          }
        } catch (psErr) {
          console.warn('[WINDOWS-SCREENSHOT] PowerShell retry failed:', psErr.message);
        }

        try {
          const stitched = await captureViaDesktopCapturerStitched(getPreferredThumbnailSize());
          if (stitched.success && (stitched.displayCount || 1) >= 2) {
            return stitched;
          }
        } catch (retryErr) {
          console.warn('[WINDOWS-SCREENSHOT] desktopCapturer retry failed:', retryErr.message);
        }
      }

      if (result.incompleteMultiDisplay) {
        console.error('[WINDOWS-SCREENSHOT] INCOMPLETE MULTI-DISPLAY', {
          expected: result.expectedDisplayCount,
          got: result.displayCount,
          method: result.method,
        });
      } else {
        console.log('[WINDOWS-SCREENSHOT] Capture succeeded', {
          bytes: result.buffer.length,
          method: result.method,
          displayCount: result.displayCount,
        });
      }
      return result;
    }

    console.warn(
      '[WINDOWS-SCREENSHOT] Primary stitch failed, trying fallbacks:',
      result?.error || 'unknown'
    );
  } catch (error) {
    console.warn('[WINDOWS-SCREENSHOT] Primary capture failed, trying fallbacks:', error.message);
  }

  try {
    const panes = await captureViaWindowsPowerShellAllScreens();
    if (panes.length >= 2) {
      const buffer = await stitchCaptures(panes);
      return {
        success: true,
        buffer,
        method: 'windows-powershell-stitched-fallback',
        displayCount: panes.length,
      };
    }
    if (panes.length === 1) {
      return {
        success: true,
        buffer: panes[0].buffer,
        method: 'windows-powershell-primary',
        displayCount: 1,
      };
    }
  } catch (psErr) {
    console.warn('[WINDOWS-SCREENSHOT] PowerShell fallback failed:', psErr.message);
  }

  try {
    return await captureViaDesktopCapturerStitched(getPreferredThumbnailSize());
  } catch (fallbackError) {
    console.error('[WINDOWS-SCREENSHOT] All capture methods failed:', fallbackError.message);
    return {
      success: false,
      method: 'windows-multi-capture',
      error: fallbackError.message,
    };
  }
}

module.exports = {
  captureScreenshot,
};
