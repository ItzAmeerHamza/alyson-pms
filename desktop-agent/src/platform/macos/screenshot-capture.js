/**
 * macOS Screenshot Capture Module
 * Provides cross-platform screenshot capture using screenshot-desktop
 */

const screenshot = require('screenshot-desktop');
const { getPermissionDiagnosticSnapshot } = require('../../system/permissions-check');

/**
 * Capture screenshot on macOS
 * Pre-checks screen recording permission via Electron systemPreferences to
 * avoid triggering the macOS permission prompt (especially after sleep/wake).
 * @returns {Promise<{success: boolean, buffer?: Buffer, method: string, error?: string}>}
 */
async function captureScreenshot() {
  const attemptId = `mac-ss-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    const preDiag = getPermissionDiagnosticSnapshot();
    console.log(`[MACOS-SCREENSHOT][${attemptId}] Starting capture`, preDiag);

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
      // If permission check fails, proceed cautiously — don't block capture entirely
      console.warn(`[MACOS-SCREENSHOT][${attemptId}] Could not pre-check permission:`, permError.message);
    }

    // Capture screenshot using screenshot-desktop
    const buffer = await screenshot({ format: 'png' });
    
    if (!buffer || buffer.length === 0) {
      console.warn(`[MACOS-SCREENSHOT][${attemptId}] Capture returned empty buffer`);
      return {
        success: false,
        method: 'screenshot-desktop',
        error: 'Empty buffer returned'
      };
    }

    console.log(`[MACOS-SCREENSHOT][${attemptId}] Capture succeeded`, { bytes: buffer.length });
    
    return {
      success: true,
      buffer: buffer,
      method: 'screenshot-desktop'
    };
    
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
      method: 'screenshot-desktop',
      error: isPermissionLike ? `Screen recording permission not granted (${msg})` : msg
    };
  }
}

module.exports = {
  captureScreenshot
};


