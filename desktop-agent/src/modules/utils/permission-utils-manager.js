/**
 * PERMISSION UTILITIES MANAGER MODULE
 * 
 * Manages permission-related utility functions and helpers for the TimeFlow desktop agent.
 * This includes accessibility permission handling, permission dialogs, and setup guides.
 * 
 * Part of TimeFlow Desktop Agent modular refactoring
 */

class PermissionUtilsManager {
  constructor(dependencies = {}) {
    this.global = dependencies.global || global;
    this.console = dependencies.console || console;
    this.require = dependencies.require || require;
    this.mainWindow = dependencies.mainWindow;
    this.showTrayNotification = dependencies.showTrayNotification;
    
    console.log('✅ PermissionUtilsManager initialized');
  }

  /**
   * Handle accessibility permission setup for normal users
   */
  async handleAccessibilityPermissionForUsers() {
    this.console.log('🔐 [USER-ONBOARDING] Starting DIRECT permission granting for normal users...');

    try {
      const DirectPermissionGranter = this.require('./direct-permission-granter');
      const permissionGranter = new DirectPermissionGranter(this.mainWindow);

      const result = await permissionGranter.grantPermissionsDirectly();

      if (result.success && result.granted) {
        this.console.log(`✅ [USER-ONBOARDING] Permission successfully granted via ${result.method}`);
        this.showTrayNotification && this.showTrayNotification('✅ Accessibility permission granted! TimeFlow can now track activity properly.', 'success');
        return true;
      } else {
        this.console.log('⚠️ [USER-ONBOARDING] Permission not granted:', result.reason);

        // Show appropriate warning based on reason
        if (result.reason === 'user_declined') {
          this.showTrayNotification && this.showTrayNotification('⚠️ Permission setup declined - activity will show zero values', 'warning');
        } else if (result.reason === 'user_skipped') {
          this.showTrayNotification && this.showTrayNotification('⚠️ Permission setup skipped - activity tracking limited', 'warning');
        } else {
          this.showTrayNotification && this.showTrayNotification('⚠️ Activity tracking will show zero values without accessibility permission', 'warning');
        }
        return false;
      }
    } catch (error) {
      this.console.log('❌ [USER-ONBOARDING] Direct permission granter failed:', error.message);
      this.showTrayNotification && this.showTrayNotification('⚠️ Permission setup failed - please try manual setup', 'error');
      return false;
    }
  }

  /**
   * Show manual permission setup guide dialog
   */
  showPermissionGuide() {
    const { dialog, shell } = this.require('electron');
    
    dialog.showMessageBox(this.mainWindow, {
      type: 'info',
      title: 'Screen Recording Permission Setup',
      message: 'Manual Permission Setup Required',
      detail: 'To enable App and URL capture features:\n\n1. Open System Settings/Preferences\n2. Go to Privacy & Security → Screen Recording\n3. Click the "+" button\n4. Add "Electron" app\n5. Enable the checkbox\n6. Restart Alyson PM\n\nWould you like to open System Settings now?',
      buttons: ['Open System Settings', 'I\'ll Do It Later'],
      defaultId: 0
    }).then(result => {
      if (result.response === 0) {
        // Open System Settings to Screen Recording section
        shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
      }
    });
  }

  /**
   * Check if accessibility permissions are granted
   */
  checkAccessibilityPermissions() {
    try {
      const { systemPreferences } = this.require('electron');
      
      if (process.platform === 'darwin') {
        // Check if the method exists before calling it
        if (!systemPreferences || typeof systemPreferences.isTrustedAccessibilityClient !== 'function') {
          this.console.warn('⚠️ systemPreferences.isTrustedAccessibilityClient not available');
          return true; // Assume granted if API not available
        }
        return systemPreferences.isTrustedAccessibilityClient(false);
      } else {
        // Non-macOS platforms don't need accessibility permissions
        return true;
      }
    } catch (error) {
      this.console.error('❌ Error checking accessibility permissions:', error);
      return false;
    }
  }

  /**
   * Check screen recording permissions
   */
  checkScreenRecordingPermissions() {
    try {
      const { systemPreferences } = this.require('electron');
      
      if (process.platform === 'darwin') {
        const status = systemPreferences.getMediaAccessStatus('screen');
        return status === 'granted';
      } else {
        // Non-macOS platforms don't need screen recording permissions
        return true;
      }
    } catch (error) {
      this.console.error('❌ Error checking screen recording permissions:', error);
      return false;
    }
  }

  /**
   * Get comprehensive permission status
   */
  getPermissionStatus() {
    return {
      accessibility: this.checkAccessibilityPermissions(),
      screenRecording: this.checkScreenRecordingPermissions(),
      platform: process.platform,
      needsPermissions: process.platform === 'darwin'
    };
  }

  /**
   * Request accessibility permissions
   */
  async requestAccessibilityPermissions() {
    try {
      const { systemPreferences } = this.require('electron');
      
      if (process.platform === 'darwin') {
        // This will show the system permission dialog
        const granted = systemPreferences.isTrustedAccessibilityClient(true);
        this.console.log('🔒 Accessibility permission request result:', granted);
        return granted;
      } else {
        return true; // Non-macOS platforms don't need this
      }
    } catch (error) {
      this.console.error('❌ Error requesting accessibility permissions:', error);
      return false;
    }
  }

  /**
   * Open system preferences for permission setup
   */
  openSystemPreferences(permissionType = 'accessibility') {
    try {
      const { shell } = this.require('electron');
      
      if (process.platform === 'darwin') {
        let url;
        switch (permissionType) {
          case 'accessibility':
            url = 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility';
            break;
          case 'screen':
          case 'screenRecording':
            url = 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture';
            break;
          default:
            url = 'x-apple.systempreferences:com.apple.preference.security';
        }
        
        shell.openExternal(url);
        this.console.log(`🔧 Opened system preferences for ${permissionType} permissions`);
      } else {
        this.console.log('⚠️ System preferences only available on macOS');
      }
    } catch (error) {
      this.console.error('❌ Error opening system preferences:', error);
    }
  }

  /**
   * Initialize the permission utils manager
   */
  async initialize() {
    try {
      // Log initial permission status
      const status = this.getPermissionStatus();
      this.console.log('🔒 Initial permission status:', status);
      
      console.log('🔒 PermissionUtilsManager initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ PermissionUtilsManager initialization failed:', error);
      throw error;
    }
  }

  /**
   * Shutdown the permission utils manager
   */
  async shutdown() {
    try {
      console.log('🔒 PermissionUtilsManager shutdown complete');
    } catch (error) {
      console.error('❌ PermissionUtilsManager shutdown failed:', error);
    }
  }
}

module.exports = PermissionUtilsManager;