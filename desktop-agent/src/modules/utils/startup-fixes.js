/**
 * Startup Fixes Module (Internal Version)
 * Located inside app bundle to avoid ASAR lookup issues
 */


function applyStartupFixes() {
  try {
    console.log('🛠️ [STARTUP-FIXES] Applying immediate startup fixes (internal)');

    // Set environment optimizations
    process.env.UV_THREADPOOL_SIZE = process.env.UV_THREADPOOL_SIZE || '8';

    // Pre-require critical modules
    ['path', 'fs', 'os', 'events', 'util'].forEach(mod => {
      try { require(mod); } catch (e) {}
    });

    return true;
  } catch (error) {
    console.warn('⚠️ [STARTUP-FIXES] Startup fixes failed:', error.message);
    return false;
  }
}

module.exports = {
  apply: applyStartupFixes
};
