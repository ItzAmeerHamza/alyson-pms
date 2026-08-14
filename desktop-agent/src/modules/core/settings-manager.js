/**
 * SettingsManager - Centralized settings and configuration management
 * Extracted from main.js to improve modularity and maintainability
 */

const fs = require('fs');
const path = require('path');

class SettingsManager {
  constructor(configPath = null) {
    this.configPath = configPath || path.join(__dirname, '../../config.json');
    this.appSettings = {};
    this.config = {};
    this.cleanupRegistry = null;
    
    console.log('✅ SettingsManager initialized');
  }

  /**
   * Initialize the settings manager
   */
  async initialize() {
    try {
      await this.loadAppSettings();
      await this.loadConfig();
      
      console.log('✅ [SETTINGS-MANAGER] Settings initialized');
    } catch (error) {
      console.error('❌ [SETTINGS-MANAGER] Error initializing settings:', error);
    }
  }

  /**
   * Load application settings from file or defaults
   */
  async loadAppSettings() {
    try {
      const defaultSettings = {
        enable_anti_cheat: true,
        screenshot_interval: 60000,
        idle_threshold: 300000,
        activity_detection: true,
        url_tracking: true,
        app_monitoring: true,
        notifications: true,
        auto_pause_on_idle: true,
        mandatory_screenshots: false,
        screenshot_quality: 0.8,
        max_screenshot_size: 1920,
        privacy_mode: false,
        debug_mode: false
      };

      // Load from global or use defaults
      this.appSettings = { ...defaultSettings, ...global.appSettings };
      
      // Also make available globally for backward compatibility
      global.appSettings = this.appSettings;
      
      console.log('✅ [SETTINGS-MANAGER] App settings loaded');
    } catch (error) {
      console.error('❌ [SETTINGS-MANAGER] Error loading app settings:', error);
      this.appSettings = {};
    }
  }

  /**
   * Load configuration from file
   */
  async loadConfig() {
    try {
      if (fs.existsSync(this.configPath)) {
        const configData = fs.readFileSync(this.configPath, 'utf8');
        this.config = JSON.parse(configData);
      } else {
        this.config = {};
      }
      
      // Also make available globally for backward compatibility
      global.config = this.config;
      
      console.log('✅ [SETTINGS-MANAGER] Config loaded');
    } catch (error) {
      console.error('❌ [SETTINGS-MANAGER] Error loading config:', error);
      this.config = {};
    }
  }

  /**
   * Update application settings
   * @param {Object} newSettings - New settings to merge
   * @returns {Object} Result object
   */
  updateAppSettings(newSettings) {
    try {
      // Validate settings
      const validatedSettings = this._validateSettings(newSettings);
      
      // Merge with existing settings
      this.appSettings = { ...this.appSettings, ...validatedSettings };
      global.appSettings = this.appSettings;
      
      // Restart anti-cheat detector with new settings if needed
      this._restartAntiCheatIfNeeded(validatedSettings);
      
      // Save to config file
      this._saveConfigFile(validatedSettings);
      
      console.log('✅ [SETTINGS-MANAGER] Settings updated successfully');
      return { success: true, message: 'Settings updated successfully' };
      
    } catch (error) {
      console.error('❌ [SETTINGS-MANAGER] Error updating settings:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Update configuration
   * @param {Object} newConfig - New configuration to merge
   * @returns {Object} Result object
   */
  updateConfig(newConfig) {
    try {
      // Merge with existing config
      this.config = { ...this.config, ...newConfig };
      global.config = this.config;
      
      // Save to file
      this._saveConfigFile(newConfig);
      
      console.log('✅ [SETTINGS-MANAGER] Config updated successfully');
      return { success: true, message: 'Config updated successfully' };
      
    } catch (error) {
      console.error('❌ [SETTINGS-MANAGER] Error updating config:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get current app settings
   * @returns {Object} Current app settings
   */
  getAppSettings() {
    return { ...this.appSettings };
  }

  /**
   * Get current configuration (safe version without sensitive data)
   * @returns {Object} Safe configuration object
   */
  getSafeConfig() {
    // The renderer must never receive credentials it can exfiltrate.
    const { backend_api_key, INTERNAL_API_KEY, ...safeConfig } = this.config;
    return safeConfig;
  }

  /**
   * Get full configuration (for internal use)
   * @returns {Object} Full configuration object
   */
  getConfig() {
    return { ...this.config };
  }

  /**
   * Reset settings to defaults
   * @returns {Object} Result object
   */
  resetToDefaults() {
    try {
      const defaultSettings = {
        enable_anti_cheat: true,
        screenshot_interval: 60000,
        idle_threshold: 300000,
        activity_detection: true,
        url_tracking: true,
        app_monitoring: true,
        notifications: true,
        auto_pause_on_idle: true,
        mandatory_screenshots: false,
        screenshot_quality: 0.8,
        max_screenshot_size: 1920,
        privacy_mode: false,
        debug_mode: false
      };

      this.appSettings = defaultSettings;
      global.appSettings = this.appSettings;
      
      this._saveConfigFile(defaultSettings);
      
      console.log('✅ [SETTINGS-MANAGER] Settings reset to defaults');
      return { success: true, message: 'Settings reset to defaults' };
      
    } catch (error) {
      console.error('❌ [SETTINGS-MANAGER] Error resetting settings:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Export settings to file
   * @param {string} filePath - Export file path
   * @returns {Object} Result object
   */
  exportSettings(filePath) {
    try {
      const exportData = {
        appSettings: this.appSettings,
        config: this.getSafeConfig(),
        exportedAt: new Date().toISOString(),
        version: global.app?.getVersion() || 'unknown'
      };

      fs.writeFileSync(filePath, JSON.stringify(exportData, null, 2));
      
      console.log('✅ [SETTINGS-MANAGER] Settings exported to:', filePath);
      return { success: true, message: 'Settings exported successfully' };
      
    } catch (error) {
      console.error('❌ [SETTINGS-MANAGER] Error exporting settings:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Import settings from file
   * @param {string} filePath - Import file path
   * @returns {Object} Result object
   */
  importSettings(filePath) {
    try {
      if (!fs.existsSync(filePath)) {
        return { success: false, error: 'Import file not found' };
      }

      const importData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      
      if (importData.appSettings) {
        this.updateAppSettings(importData.appSettings);
      }
      
      if (importData.config) {
        this.updateConfig(importData.config);
      }
      
      console.log('✅ [SETTINGS-MANAGER] Settings imported from:', filePath);
      return { success: true, message: 'Settings imported successfully' };
      
    } catch (error) {
      console.error('❌ [SETTINGS-MANAGER] Error importing settings:', error);
      return { success: false, error: error.message };
    }
  }

  // === PRIVATE METHODS ===

  /**
   * Validate settings object
   * @param {Object} settings - Settings to validate
   * @returns {Object} Validated settings
   */
  _validateSettings(settings) {
    const validated = {};
    
    // Define valid setting keys and their types
    const validSettings = {
      enable_anti_cheat: 'boolean',
      screenshot_interval: 'number',
      idle_threshold: 'number',
      activity_detection: 'boolean',
      url_tracking: 'boolean',
      app_monitoring: 'boolean',
      notifications: 'boolean',
      auto_pause_on_idle: 'boolean',
      mandatory_screenshots: 'boolean',
      screenshot_quality: 'number',
      max_screenshot_size: 'number',
      privacy_mode: 'boolean',
      debug_mode: 'boolean'
    };

    for (const [key, value] of Object.entries(settings)) {
      if (key in validSettings) {
        const expectedType = validSettings[key];
        
        if (typeof value === expectedType) {
          // Additional validation for specific settings
          if (key === 'screenshot_quality' && (value < 0.1 || value > 1.0)) {
            validated[key] = 0.8; // Default quality
          } else if (key === 'screenshot_interval' && value < 10000) {
            validated[key] = 10000; // Minimum 10 seconds
          } else if (key === 'idle_threshold' && value < 60000) {
            validated[key] = 60000; // Minimum 1 minute
          } else {
            validated[key] = value;
          }
        } else {
          console.warn(`⚠️ [SETTINGS-MANAGER] Invalid type for ${key}: expected ${expectedType}, got ${typeof value}`);
        }
      } else {
        console.warn(`⚠️ [SETTINGS-MANAGER] Unknown setting: ${key}`);
      }
    }

    return validated;
  }

  /**
   * Restart anti-cheat detector if settings changed
   * @param {Object} newSettings - New settings
   */
  _restartAntiCheatIfNeeded(newSettings) {
    try {
      if ('enable_anti_cheat' in newSettings && global.antiCheatDetector) {
        if (newSettings.enable_anti_cheat) {
          const AntiCheatDetector = require('../activity/anti-cheat-detector');
          global.antiCheatDetector.stopMonitoring();
          global.antiCheatDetector = new AntiCheatDetector(this.appSettings, global.syncManager);
          global.antiCheatDetector.startMonitoring();
          console.log('🔄 [SETTINGS-MANAGER] Anti-cheat detector restarted');
        } else {
          global.antiCheatDetector.stopMonitoring();
          console.log('🛑 [SETTINGS-MANAGER] Anti-cheat detector stopped');
        }
      }
    } catch (error) {
      console.error('❌ [SETTINGS-MANAGER] Error restarting anti-cheat:', error);
    }
  }

  /**
   * Save configuration to file
   * @param {Object} newSettings - New settings to merge into config
   */
  _saveConfigFile(newSettings) {
    try {
      const configToSave = { ...this.config, ...newSettings };
      fs.writeFileSync(this.configPath, JSON.stringify(configToSave, null, 2));
      console.log('💾 [SETTINGS-MANAGER] Config saved to file');
    } catch (error) {
      console.error('❌ [SETTINGS-MANAGER] Error saving config file:', error);
    }
  }

  /**
   * Cleanup function for registry
   */
  shutdown() {
    try {
      console.log('🧹 [SETTINGS-MANAGER] Shutting down...');
      
      // Save current settings before shutdown
      this._saveConfigFile(this.appSettings);
      
      console.log('✅ [SETTINGS-MANAGER] Shutdown complete');
    } catch (error) {
      console.error('❌ [SETTINGS-MANAGER] Error during shutdown:', error);
    }
  }
}

// Register with cleanup registry if available
if (typeof global !== 'undefined' && global.cleanupRegistry) {
  global.cleanupRegistry.register('settings-manager', () => {
    if (global.settingsManager && global.settingsManager.shutdown) {
      global.settingsManager.shutdown();
    }
  });
}

module.exports = SettingsManager;