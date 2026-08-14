const fs = require('fs');
const path = require('path');

class ConfigManager {
  constructor() {
    this.config = null;
    this.appSettings = {};
  }

  async initialize() {
    console.log('🔧 [CONFIG-MANAGER] Initializing...');
    try {
      this.config = this.loadConfig();
      // Load app settings from config.json
      this.appSettings = this.config || {};
      console.log('✅ [CONFIG-MANAGER] Initialization completed successfully');
      return this.config;
    } catch (error) {
      console.error('❌ [CONFIG-MANAGER] Initialization failed:', error);
      throw error;
    }
  }

  loadConfig() {
    const configPath = path.join(__dirname, '..', 'load-config.js');
    
    try {
      // Delete require cache to get fresh config
      delete require.cache[require.resolve(configPath)];
      const { loadConfig } = require(configPath);
      
      this.config = loadConfig();

      console.log('✅ Configuration loaded successfully');
      return this.config;
      
    } catch (error) {
      console.error('❌ Failed to load configuration:', error);
      throw error;
    }
  }

  getConfig() {
    return this.config;
  }

  updateConfig(updates) {
    this.config = { ...this.config, ...updates };
    return this.config;
  }

  validateConfig() {
    const required = ['backend_api_url', 'backend_api_key'];
    const missing = required.filter(key => !this.config[key]);
    
    if (missing.length > 0) {
      throw new Error(`Missing required configuration: ${missing.join(', ')}`);
    }

    return true;
  }
}

module.exports = ConfigManager; 