/**
 * PERMISSION MANAGER FIX
 * 
 * Fixes macOS permission handling issues including:
 * - "Cannot create Notification before app is ready" error
 * - Consolidates multiple permission checking systems
 * - Provides proper timing for permission requests
 * 
 * Part of priority issue fixes
 */

class PermissionManagerFix {
  constructor(dependencies = {}) {
    this.app = dependencies.app;
    this.systemPreferences = dependencies.systemPreferences;
    this.Notification = dependencies.Notification;
    this.BrowserWindow = dependencies.BrowserWindow;
    this.console = dependencies.console || console;
    
    // State tracking
    this.appReady = false;
    this.permissionDialogShown = false;
    this.permissionCheckInProgress = false;
    this.notificationQueue = [];
    
    this.console.log('✅ PermissionManagerFix initialized');
  }

  /**
   * Initialize the permission manager after app is ready
   */
  initialize() {
    if (!this.app) {
      this.console.warn('⚠️ App not available, permission manager limited');
      return;
    }

    this.app.whenReady().then(() => {
      this.appReady = true;
      this.console.log('✅ App ready - permission manager fully initialized');
      
      // Process any queued notifications
      this.processNotificationQueue();
      
      // Register permission shortcuts
      this.registerPermissionShortcuts();
    });
  }

  /**
   * Safe notification display that waits for app readiness
   */
  safeNotification(title, body, options = {}) {
    if (!this.appReady) {
      // Queue the notification for later
      this.notificationQueue.push({ title, body, options });
      this.console.log(`📬 Queued notification: ${title}`);
      return null;
    }

    try {
      if (!this.Notification) {
        this.console.warn('⚠️ Notification not available');
        return null;
      }

      const notification = new this.Notification({
        title,
        body,
        ...options
      });

      this.console.log(`📢 Notification shown: ${title}`);
      return notification;
    } catch (error) {
      this.console.error('❌ Failed to create notification:', error.message);
      return null;
    }
  }

  /**
   * Process queued notifications when app becomes ready
   */
  processNotificationQueue() {
    if (this.notificationQueue.length === 0) return;

    this.console.log(`📬 Processing ${this.notificationQueue.length} queued notifications`);
    
    this.notificationQueue.forEach(({ title, body, options }) => {
      this.safeNotification(title, body, options);
    });
    
    this.notificationQueue = [];
  }

  /**
   * Check macOS screen recording permission
   */
  async checkScreenRecordingPermission() {
    if (process.platform !== 'darwin') {
      return { granted: true, status: 'not_required' };
    }

    if (!this.systemPreferences) {
      return { granted: false, status: 'system_prefs_unavailable' };
    }

    try {
      const status = this.systemPreferences.getMediaAccessStatus('screen');
      const granted = status === 'granted';
      
      this.console.log(`🔍 Screen recording permission: ${status}`);
      
      return { granted, status };
    } catch (error) {
      this.console.error('❌ Error checking screen recording permission:', error);
      return { granted: false, status: 'error', error: error.message };
    }
  }

  /**
   * Check macOS accessibility permission
   */
  async checkAccessibilityPermission() {
    if (process.platform !== 'darwin') {
      return { granted: true, status: 'not_required' };
    }

    if (!this.systemPreferences) {
      return { granted: false, status: 'system_prefs_unavailable' };
    }

    try {
      // Check if the method exists before calling it
      if (typeof this.systemPreferences.isTrustedAccessibilityClient !== 'function') {
        this.console.warn('⚠️ systemPreferences.isTrustedAccessibilityClient not available');
        return { granted: true, status: 'api_unavailable' };
      }
      
      const granted = this.systemPreferences.isTrustedAccessibilityClient(false);
      const status = granted ? 'granted' : 'denied';
      
      this.console.log(`♿ Accessibility permission: ${status}`);
      
      return { granted, status };
    } catch (error) {
      this.console.error('❌ Error checking accessibility permission:', error);
      return { granted: false, status: 'error', error: error.message };
    }
  }

  /**
   * Comprehensive permission check
   */
  async checkAllPermissions() {
    if (this.permissionCheckInProgress) {
      this.console.log('⏳ Permission check already in progress, skipping');
      return { inProgress: true };
    }

    this.permissionCheckInProgress = true;
    
    try {
      const [screenRecording, accessibility] = await Promise.all([
        this.checkScreenRecordingPermission(),
        this.checkAccessibilityPermission()
      ]);

      const result = {
        screenRecording,
        accessibility,
        allGranted: screenRecording.granted && accessibility.granted,
        platform: process.platform,
        timestamp: new Date().toISOString()
      };

      this.console.log('📋 Permission check complete:', {
        screen: screenRecording.granted ? '✅' : '❌',
        accessibility: accessibility.granted ? '✅' : '❌',
        allGranted: result.allGranted ? '✅' : '❌'
      });

      return result;
    } catch (error) {
      this.console.error('❌ Error during comprehensive permission check:', error);
      return { error: error.message };
    } finally {
      this.permissionCheckInProgress = false;
    }
  }

  /**
   * Request screen recording permission with safe timing
   */
  async requestScreenRecordingPermission() {
    if (!this.appReady) {
      this.console.warn('⚠️ App not ready, cannot request screen recording permission');
      return { success: false, reason: 'app_not_ready' };
    }

    if (process.platform !== 'darwin') {
      return { success: true, reason: 'not_required' };
    }

    try {
      // Check current status first
      const currentCheck = await this.checkScreenRecordingPermission();
      if (currentCheck.granted) {
        return { success: true, reason: 'already_granted' };
      }

      // Use system preferences to request permission
      const status = this.systemPreferences.getMediaAccessStatus('screen');
      
      if (status === 'not-determined') {
        // This will trigger the system permission dialog
        this.systemPreferences.askForMediaAccess('screen');
        return { success: true, reason: 'permission_requested' };
      }

      return { success: false, reason: 'permission_denied', status };
    } catch (error) {
      this.console.error('❌ Error requesting screen recording permission:', error);
      return { success: false, reason: 'error', error: error.message };
    }
  }

  /**
   * Show user-friendly permission guide
   */
  async showPermissionGuide() {
    if (!this.appReady) {
      this.console.warn('⚠️ App not ready, cannot show permission guide');
      return false;
    }

    if (this.permissionDialogShown) {
      this.console.log('📋 Permission dialog already shown recently');
      return false;
    }

    try {
      const permissions = await this.checkAllPermissions();
      
      if (permissions.allGranted) {
        this.safeNotification(
          'All Permissions Granted',
          'TimeFlow has all necessary permissions for full functionality.',
          { type: 'success' }
        );
        return true;
      }

      // Show notification about missing permissions
      const missing = [];
      if (!permissions.screenRecording?.granted) missing.push('Screen Recording');
      if (!permissions.accessibility?.granted) missing.push('Accessibility');

      this.safeNotification(
        'Permissions Required',
        `TimeFlow needs ${missing.join(' and ')} permissions for full functionality. Click to configure.`,
        { 
          type: 'warning',
          actions: [
            { type: 'button', text: 'Open Settings' }
          ]
        }
      );

      this.permissionDialogShown = true;
      
      // Reset the flag after 5 minutes
      setTimeout(() => {
        this.permissionDialogShown = false;
      }, 5 * 60 * 1000);

      return true;
    } catch (error) {
      this.console.error('❌ Error showing permission guide:', error);
      return false;
    }
  }

  /**
   * Register global shortcuts for permission management
   */
  registerPermissionShortcuts() {
    if (!this.app || !this.app.whenReady) {
      return;
    }

    // Register after app is ready
    this.app.whenReady().then(() => {
      try {
        const { globalShortcut } = require('electron');
        
        // Register permission check shortcut (Cmd/Ctrl+Shift+P)
        globalShortcut.register('CommandOrControl+Shift+P', async () => {
          this.console.log('🔐 Permission check triggered by keyboard shortcut');
          const result = await this.checkAllPermissions();
          
          if (result.allGranted) {
            this.safeNotification('Permissions OK', 'All permissions are granted!');
          } else {
            await this.showPermissionGuide();
          }
        });
        
        this.console.log('⌨️ Permission shortcuts registered');
      } catch (error) {
        this.console.error('❌ Failed to register permission shortcuts:', error);
      }
    });
  }

  /**
   * Open system preferences to permission settings
   */
  openPermissionSettings() {
    try {
      const { shell } = require('electron');
      const { openSystemPrivacySettings } = require('../utils/system-settings-opener');

      if (['darwin', 'win32', 'linux'].includes(process.platform)) {
        openSystemPrivacySettings(shell, { pane: 'screenRecording' }).catch((err) =>
          this.console.error('❌ Failed to open permission settings:', err)
        );
        this.console.log(`🔧 Opened ${process.platform} privacy / capture settings`);
        return true;
      }
      this.console.log('ℹ️ Permission settings opener not configured for this platform');
      return false;
    } catch (error) {
      this.console.error('❌ Failed to open permission settings:', error);
      return false;
    }
  }

  /**
   * Get permission status for debugging
   */
  async getPermissionStatus() {
    const permissions = await this.checkAllPermissions();
    
    return {
      ...permissions,
      appReady: this.appReady,
      dialogShown: this.permissionDialogShown,
      queuedNotifications: this.notificationQueue.length,
      platform: process.platform
    };
  }

  /**
   * Fix notification timing issues by ensuring app readiness
   */
  fixNotificationTiming() {
    // Override any existing notification creation with safe version
    if (typeof global !== 'undefined') {
      const originalNotification = global.Notification;
      
      global.safeNotification = (title, body, options) => {
        return this.safeNotification(title, body, options);
      };
      
      this.console.log('🔧 Notification timing fix applied');
    }
  }
}

module.exports = PermissionManagerFix;
