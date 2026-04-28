/**
 * Custom Performance Fix Module
 * User-specified performance optimizations
 */

function applyCustomPerformanceFix() {
  try {
    console.log('🎛️ Loading custom performance optimization...');
    
    // Custom interval optimizations
    const customIntervals = {
      screenshot: process.env.CUSTOM_SCREENSHOT_INTERVAL || 15000,
      app_detection: process.env.CUSTOM_APP_INTERVAL || 10000,
      url_capture: process.env.CUSTOM_URL_INTERVAL || 2500
    };
    
    // Apply custom intervals to global config if available
    if (global.customIntervals) {
      Object.assign(global.customIntervals, customIntervals);
    } else {
      global.customIntervals = customIntervals;
    }
    
    console.log('✅ Custom performance fix applied:', customIntervals);
    return customIntervals;
  } catch (error) {
    console.warn('⚠️ Custom performance fix failed:', error.message);
    return null;
  }
}

module.exports = {
  apply: applyCustomPerformanceFix
};