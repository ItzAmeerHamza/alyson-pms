// =============================================================================
// IMMEDIATE APP DETECTION FIX
// =============================================================================
// This script fixes the missing app detection by ensuring EnhancedAppDetector
// is properly initialized and started when tracking begins.

console.log('🔧 APPLYING IMMEDIATE APP DETECTION FIX...');

// Import required modules
const EnhancedAppDetector = require('./src/modules/capture/enhanced-app-detector');
const PlatformManager = require('./src/platform/platform-manager');

// 🔧 FIX: Initialize PlatformManager first (required by EnhancedAppDetector)
console.log('🖥️ Initializing PlatformManager...');
global.platformManager = new PlatformManager();
console.log('✅ PlatformManager initialized and available globally');

// Initialize configuration (using basic defaults)
const appDetectorConfig = {
  user_id: global.userId || global.currentUserId || 'default-user',
  app_capture_interval_seconds: 10,
  real_time_app_detection_interval: 2000
};

// Create and initialize the detector
console.log('📱 Initializing EnhancedAppDetector...');
global.enhancedAppDetector = new EnhancedAppDetector(appDetectorConfig);
global.enhancedAppDetector.initialize({ isTracking: false });

console.log('✅ EnhancedAppDetector initialized and available globally');

// Hook into global tracking events instead of IPC handlers to avoid conflicts
console.log('🔧 [FIX] Setting up global tracking event hooks...');

// Set up global hooks instead of duplicate IPC handlers
global.appDetectionHooks = {
  onTrackingStart: (projectId) => {
    console.log('🎯 [FIX] Tracking start detected, ensuring app detection starts...');
    
    try {
      if (global.enhancedAppDetector) {
        console.log('📱 [FIX] Starting app detection systems...');
        
        // 🔧 FIX: Update user_id from global configuration if available
        const currentUserId = global.currentUserId || global.config?.user_id;
        if (currentUserId && currentUserId !== 'default-user') {
          global.enhancedAppDetector.config.user_id = currentUserId;
          console.log('✅ [FIX] Updated app detector user_id:', currentUserId);
        }
        
        // Set tracking state
        global.enhancedAppDetector.setTrackingState(true);
        
        // Start both app capture and real-time detection
        global.enhancedAppDetector.startAppCapture();
        global.enhancedAppDetector.startRealTimeAppDetection();
        
        console.log('✅ [FIX] App detection started successfully');
      } else {
        console.error('❌ [FIX] enhancedAppDetector not available');
      }
    } catch (error) {
      console.error('❌ [FIX] Failed to start app detection:', error.message);
    }
  },
  
  onTrackingStop: () => {
    console.log('🛑 [FIX] Tracking stop detected, stopping app detection...');
    
    try {
      if (global.enhancedAppDetector) {
        global.enhancedAppDetector.setTrackingState(false);
        global.enhancedAppDetector.stopAppCapture();
        global.enhancedAppDetector.stopRealTimeAppDetection();
        console.log('✅ [FIX] App detection stopped');
      }
    } catch (error) {
      console.error('❌ [FIX] Failed to stop app detection:', error.message);
    }
  }
};

console.log('✅ [FIX] Global tracking hooks installed (avoiding IPC conflicts)');

// Export the fix for potential use
module.exports = {
  enhancedAppDetector: global.enhancedAppDetector,
  
  // Manual start function for testing
  forceStartAppDetection: () => {
    console.log('🔧 [FIX] Force starting app detection...');
    if (global.enhancedAppDetector) {
      global.enhancedAppDetector.setTrackingState(true);
      global.enhancedAppDetector.startAppCapture();
      global.enhancedAppDetector.startRealTimeAppDetection();
      return true;
    }
    return false;
  },
  
  // Manual stop function
  forceStopAppDetection: () => {
    console.log('🛑 [FIX] Force stopping app detection...');
    if (global.enhancedAppDetector) {
      global.enhancedAppDetector.setTrackingState(false);
      global.enhancedAppDetector.stopAppCapture();
      global.enhancedAppDetector.stopRealTimeAppDetection();
      return true;
    }
    return false;
  }
};

console.log('🎉 APP DETECTION FIX APPLIED SUCCESSFULLY!');
