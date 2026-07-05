/**
 * Configuration Manager Module
 * Manages application configuration, settings, and environment variables
 * Extracted from main.js for modular architecture
 */

const fs = require('fs');
const path = require('path');
const cleanupRegistry = require('./cleanup-registry');

class ConfigManager {
  constructor() {
    this.config = {};
    this.appSettings = {};
    this.envConfig = {};
    this.userConfig = {};
    
    // Default settings
    this.defaultSettings = {
      screenshot_interval_seconds: 30,
      idle_threshold_seconds: 900, // auto-stop after 15 minutes (legacy key)
      idle_detection_threshold_seconds: 60, // start counting idle after 1 minute
      idle_checkpoint_interval_seconds: 60, // persist idle chunks every 1 minute
      blur_screenshots: false,
      enable_anti_cheat: true,
      notification_frequency_seconds: 300,
      screenshot_quality: 80,
      max_screenshot_size_mb: 5,
      auto_pause_on_idle: true,
      tracking_mode: 'standard' // standard, enhanced, minimal
    };
    
    // Register for cleanup
    cleanupRegistry.registerResource({
      name: 'configManager',
      cleanup: async () => this.cleanup()
    });
  }

  /**
   * Initialize configuration from various sources
   */
  async initialize() {
    console.log('⚙️ [CONFIG] Initializing configuration manager...');
    
    try {
      // Load environment config
      await this.loadEnvironmentConfig();
      
      // Load user settings
      await this.loadUserSettings();
      
      // Merge configurations
      this.mergeConfigurations();
      
      // Validate configuration
      this.validateConfiguration();
      
      console.log('✅ [CONFIG] Configuration initialized successfully');
    } catch (error) {
      console.error('❌ [CONFIG] Configuration initialization failed:', error);
      throw error;
    }
  }

  /**
   * Load environment configuration
   */
  async loadEnvironmentConfig() {
    try {
      // Load from env-config.js at desktop-agent root (not src/)
      const envConfigPath = path.join(__dirname, '../../../env-config.js');
      if (fs.existsSync(envConfigPath)) {
        delete require.cache[require.resolve(envConfigPath)];
        this.envConfig = require(envConfigPath);
        console.log('✅ [CONFIG] Environment config loaded');
      }
      
      // Override with process.env variables
      this.envConfig = {
        ...this.envConfig,
        VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || this.envConfig.VITE_SUPABASE_URL,
        VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY || this.envConfig.VITE_SUPABASE_ANON_KEY,
        BACKEND_API_URL: process.env.BACKEND_API_URL || this.envConfig.BACKEND_API_URL,
        INTERNAL_API_KEY: process.env.INTERNAL_API_KEY || this.envConfig.INTERNAL_API_KEY,
        USER_ID: process.env.USER_ID || this.envConfig.USER_ID,
        NODE_ENV: process.env.NODE_ENV || 'production'
      };
      
    } catch (error) {
      console.log('⚠️ [CONFIG] Failed to load environment config:', error.message);
      this.envConfig = {};
    }
  }

  /**
   * Load user settings from database or local storage
   */
  async loadUserSettings() {
    try {
      // Start with default settings
      this.appSettings = { ...this.defaultSettings };
      
      // TODO: Load from database when user is authenticated
      // For now, use defaults with some environment-based overrides
      
      // Performance mode detection
      const performanceMode = this.detectPerformanceMode();
      if (performanceMode === 'low_power') {
        this.appSettings.screenshot_interval_seconds = 60; // Longer intervals
        this.appSettings.screenshot_quality = 60; // Lower quality
      }
      
      console.log('✅ [CONFIG] User settings loaded');
    } catch (error) {
      console.log('⚠️ [CONFIG] Failed to load user settings:', error.message);
      this.appSettings = { ...this.defaultSettings };
    }
  }

  /**
   * Merge all configuration sources
   */
  mergeConfigurations() {
    const prior = global.config && typeof global.config === 'object' ? global.config : {};
    const backendUrl =
      prior.backend_api_url ||
      this.envConfig.BACKEND_API_URL ||
      process.env.BACKEND_API_URL ||
      '';
    const backendKey =
      prior.backend_api_key ||
      this.envConfig.INTERNAL_API_KEY ||
      process.env.INTERNAL_API_KEY ||
      '';

    this.config = {
      ...prior,
      ...this.envConfig,
      supabase_url:
        prior.supabase_url ||
        this.envConfig.VITE_SUPABASE_URL ||
        this.envConfig.SUPABASE_URL ||
        '',
      supabase_key:
        prior.supabase_key ||
        this.envConfig.VITE_SUPABASE_ANON_KEY ||
        this.envConfig.SUPABASE_ANON_KEY ||
        '',
      auth_provider:
        prior.auth_provider ||
        this.envConfig.VITE_AUTH_PROVIDER ||
        this.envConfig.AUTH_PROVIDER ||
        'supabase',
      cognito_region: prior.cognito_region || this.envConfig.VITE_COGNITO_REGION || '',
      cognito_user_pool_id:
        prior.cognito_user_pool_id || this.envConfig.VITE_COGNITO_USER_POOL_ID || '',
      cognito_client_id: prior.cognito_client_id || this.envConfig.VITE_COGNITO_CLIENT_ID || '',
      api_base_url: (() => {
        const fromPrior = prior.api_base_url || this.envConfig.VITE_API_BASE_URL || this.envConfig.API_BASE_URL || '';
        const fromBackend = (backendUrl || '')
          .replace(/\/sync\/desktop-action\/?$/, '')
          .replace(/\/$/, '');
        const candidate = String(fromPrior || fromBackend).replace(/\/$/, '');
        if (
          (candidate === 'http://localhost:3000' || candidate === '') &&
          fromBackend
        ) {
          return fromBackend;
        }
        return candidate;
      })(),
      backend_api_url: backendUrl,
      backend_api_key: backendKey,
      ...this.userConfig,
      winUrlCapture: {
        enableCdp: process.env.WIN_URL_ENABLE_CDP === 'true',
        cdpPort: Number(process.env.WIN_URL_CDP_PORT || 0),
        enableUia: process.env.WIN_URL_ENABLE_UIA !== 'false',
        resolverTimeoutMs: Number(process.env.WIN_URL_RESOLVER_TIMEOUT_MS || 2000),
      },
      appSettings: this.appSettings
    };
    
    // Make config globally available for backwards compatibility
    global.config = this.config;
    global.appSettings = this.appSettings;
  }

  /**
   * Validate configuration
   */
  validateConfiguration() {
    const requiredFields = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'];
    const missingFields = requiredFields.filter(field => !this.config[field]);
    
    if (missingFields.length > 0) {
      console.warn('⚠️ [CONFIG] Missing required configuration fields:', missingFields);
    }
    
    // Validate app settings ranges
    if (this.appSettings.screenshot_interval_seconds < 10) {
      console.warn('⚠️ [CONFIG] Screenshot interval too low, setting to minimum (10s)');
      this.appSettings.screenshot_interval_seconds = 10;
    }
    
    if (this.appSettings.idle_threshold_seconds < 300) {
      console.warn('⚠️ [CONFIG] Idle threshold too low, setting to minimum (5 minutes)');
      this.appSettings.idle_threshold_seconds = 300;
    }
  }

  /**
   * Get the current configuration
   * @returns {Object} The merged configuration object
   */
  getConfig() {
    return this.config;
  }

  /**
   * Detect performance mode
   */
  detectPerformanceMode() {
    try {
      const totalMemory = require('os').totalmem();
      const memoryGB = totalMemory / (1024 * 1024 * 1024);
      
      if (memoryGB < 4) {
        return 'low_power';
      } else if (memoryGB > 16) {
        return 'high_performance';
      } else {
        return 'standard';
      }
    } catch (error) {
      console.log('⚠️ [CONFIG] Failed to detect performance mode:', error.message);
      return 'standard';
    }
  }

  /**
   * Get configuration value
   */
  get(key, defaultValue = null) {
    const keys = key.split('.');
    let value = this.config;
    
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        return defaultValue;
      }
    }
    
    return value;
  }

  /**
   * Set configuration value
   */
  set(key, value) {
    const keys = key.split('.');
    let target = this.config;
    
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (!(k in target) || typeof target[k] !== 'object') {
        target[k] = {};
      }
      target = target[k];
    }
    
    target[keys[keys.length - 1]] = value;
    
    // Update global references
    global.config = this.config;
  }

  /**
   * Get app setting
   */
  getSetting(key, defaultValue = null) {
    return this.appSettings[key] !== undefined ? this.appSettings[key] : defaultValue;
  }

  /**
   * Set app setting
   */
  setSetting(key, value) {
    this.appSettings[key] = value;
    global.appSettings = this.appSettings;
    
    // Save to persistent storage
    this.saveUserSettings();
  }

  /**
   * Save user settings
   */
  async saveUserSettings() {
    try {
      // TODO: Save to database when user is authenticated
      // For now, just update global reference
      global.appSettings = this.appSettings;
      console.log('✅ [CONFIG] User settings saved');
    } catch (error) {
      console.log('⚠️ [CONFIG] Failed to save user settings:', error.message);
    }
  }

  /**
   * Fetch settings from database
   */
  async fetchSettings() {
    try {
      if (!this.config.user_id || !global.supabaseService) {
        console.log('⚠️ [CONFIG] Cannot fetch settings: no user or database connection');
        return this.appSettings;
      }

      const { data, error } = await global.supabaseService
        .from('settings')
        .select('*')
        .eq('user_id', this.config.user_id)
        .single();

      if (error) {
        console.log('⚠️ [CONFIG] Failed to fetch settings from database:', error.message);
        return this.appSettings;
      }

      if (data) {
        // Merge database settings with defaults
        this.appSettings = {
          ...this.defaultSettings,
          ...data.settings
        };
        
        global.appSettings = this.appSettings;
        console.log('✅ [CONFIG] Settings fetched from database');
      }

      return this.appSettings;
    } catch (error) {
      console.log('⚠️ [CONFIG] Error fetching settings:', error.message);
      return this.appSettings;
    }
  }

  /**
   * Update settings in database
   */
  async updateSettings(newSettings) {
    try {
      // Merge with existing settings
      this.appSettings = {
        ...this.appSettings,
        ...newSettings
      };

      // Validate updated settings
      this.validateConfiguration();

      // Save to database
      if (this.config.user_id && global.supabaseService) {
        const { error } = await global.supabaseService
          .from('settings')
          .upsert({
            user_id: this.config.user_id,
            settings: this.appSettings,
            updated_at: new Date().toISOString()
          });

        if (error) {
          console.log('⚠️ [CONFIG] Failed to update settings in database:', error.message);
        } else {
          console.log('✅ [CONFIG] Settings updated in database');
        }
      }

      // Update global reference
      global.appSettings = this.appSettings;

      return this.appSettings;
    } catch (error) {
      console.error('❌ [CONFIG] Failed to update settings:', error);
      throw error;
    }
  }

  /**
   * Get environment-specific configuration
   */
  getEnvironmentConfig() {
    return {
      isDevelopment: this.config.NODE_ENV === 'development',
      isProduction: this.config.NODE_ENV === 'production',
      isTest: this.config.NODE_ENV === 'test',
      performanceMode: this.detectPerformanceMode()
    };
  }

  /**
   * Get database configuration
   */
  getDatabaseConfig() {
    return {
      supabaseUrl: this.config.VITE_SUPABASE_URL,
      supabaseKey: this.config.VITE_SUPABASE_ANON_KEY,
      // serviceRoleKey removed — edge function handles writes server-side
      userId: this.config.USER_ID
    };
  }

  /**
   * Get all configuration
   */
  getAllConfig() {
    return {
      config: this.config,
      appSettings: this.appSettings,
      environment: this.getEnvironmentConfig(),
      database: this.getDatabaseConfig()
    };
  }

  /**
   * Reset to default settings
   */
  resetToDefaults() {
    console.log('🔄 [CONFIG] Resetting to default settings');
    this.appSettings = { ...this.defaultSettings };
    global.appSettings = this.appSettings;
    this.saveUserSettings();
  }

  /**
   * Export configuration for debugging
   */
  exportConfig() {
    const safeConfig = { ...this.config };
    
    // Remove sensitive data
    delete safeConfig.VITE_SUPABASE_ANON_KEY;
    
    return {
      config: safeConfig,
      appSettings: this.appSettings,
      environment: this.getEnvironmentConfig()
    };
  }

  /**
   * Cleanup on shutdown
   */
  async cleanup() {
    console.log('🧹 [CONFIG] Cleaning up configuration manager...');
    await this.saveUserSettings();
  }
}

module.exports = ConfigManager;