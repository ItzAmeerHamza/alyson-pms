/**
 * macOS Screenshot Capture Module
 * Captures all displays and stitches into a single PNG.
 */

const { getPermissionDiagnosticSnapshot } = require('../../system/permissions-check');
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
 * Capture screenshot on macOS (all monitors → one stitched image)
 * Pre-checks screen recording permission via Electron systemPreferences to
 * avoid triggering the macOS permission prompt (especially after sleep/wake).
 * @returns {Promise<{success: boolean, buffer?: Buffer, method: string, error?: string, displayCount?: number}>}
 */
async function captureScreenshot() {
  const attemptId = `mac-ss-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    const preDiag = getPermissionDiagnosticSnapshot();
    console.log(`[MACOS-SCREENSHOT][${attemptId}] Starting multi-display capture`, preDiag);

    // Best-effort pre-check (non-blocking): status APIs can be stale on installed/local builds.
    // Do NOT skip capture solely based on this value.
    try {
      const { systemPreferences } = require('electron');
      if (systemPreferences && typeof systemPreferences.getMediaAccessStatus === 'function') {
        const status = systemPreferences.getMediaAccessStatus('screen');
        if (status !== 'granted') {
          console.warn(`[MACOS-SCREENSHOT][${attemptId}] Pre-check reports screen status=${status}; attempting capture anyway`);
        }
      }
    } catch (permError) {
      console.warn(`[MACOS-SCREENSHOT][${attemptId}] Could not pre-check permission:`, permError.message);
    }

    const electronCount = getElectronDisplayCount();
    let result = await captureAllDisplaysStitched();

    if (
      result.success &&
      result.buffer &&
      (result.displayCount || 1) < 2 &&
      electronCount >= 2
    ) {
      console.warn(
        `[MACOS-SCREENSHOT][${attemptId}] Single-display capture despite multi-monitor; retrying desktopCapturer`
      );
      try {
        const stitched = await captureViaDesktopCapturerStitched(getPreferredThumbnailSize());
        if (stitched.success && (stitched.displayCount || 1) >= 2) {
          result = stitched;
        }
      } catch (retryErr) {
        console.warn(`[MACOS-SCREENSHOT][${attemptId}] desktopCapturer retry failed:`, retryErr.message);
      }
    }

    if (!result.success || !result.buffer || result.buffer.length === 0) {
      console.warn(`[MACOS-SCREENSHOT][${attemptId}] Capture failed:`, result.error || 'Empty buffer');
      return {
        success: false,
        method: result.method || 'screenshot-desktop-stitched',
        error: result.error || 'Empty buffer returned'
      };
    }

    console.log(`[MACOS-SCREENSHOT][${attemptId}] Capture succeeded`, {
      bytes: result.buffer.length,
      method: result.method,
      displayCount: result.displayCount
    });

    return result;
  } catch (error) {
    console.error(`[MACOS-SCREENSHOT][${attemptId}] Error capturing screenshot:`, error.message);
    const msg = String(error.message || '');
    const isPermissionLike =
      /permission|not authorized|not permitted|operation not permitted|denied|screen recording/i.test(msg);
    try {
      const postDiag = getPermissionDiagnosticSnapshot();
      console.error(`[MACOS-SCREENSHOT][${attemptId}] Failure diagnostics`, postDiag);
    } catch (_) {}
    return {
      success: false,
      method: 'screenshot-desktop-stitched',
      error: isPermissionLike ? `Screen recording permission not granted (${msg})` : msg
    };
  }
}

module.exports = {
  captureScreenshot
};
