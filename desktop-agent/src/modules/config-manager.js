const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

class ConfigManager {
  constructor() {
    this.config = null;
    this.supabase = null;
    this.supabaseService = null;
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
      
      // Initialize Supabase clients
      this.initializeSupabaseClients();
      
      console.log('✅ Configuration loaded successfully');
      return this.config;
      
    } catch (error) {
      console.error('❌ Failed to load configuration:', error);
      throw error;
    }
  }

  initializeSupabaseClients() {
    if (!this.config.supabase_url || !this.config.supabase_key) {
      throw new Error('Missing required Supabase configuration');
    }

    // Validate URL format
    try {
      new URL(this.config.supabase_url);
    } catch (urlError) {
      throw new Error(`Invalid Supabase URL format: ${this.config.supabase_url}`);
    }

    // Initialize Supabase client - use anonymous key for user operations
    this.supabase = createClient(this.config.supabase_url, this.config.supabase_key);

    // Create service client for admin operations if service key is available
    this.supabaseService = this.config.supabase_service_key ? 
      createClient(this.config.supabase_url, this.config.supabase_service_key) :
      this.supabase;

    console.log('✅ Supabase clients initialized successfully');
    
    if (this.config.supabase_service_key) {
      console.log(`🔧 [DEBUG] Using service role key for admin operations`);
      console.log(`🔧 [DEBUG] Service key length: ${this.config.supabase_service_key.length}`);
    } else {
      console.log(`🔧 [DEBUG] Using anonymous key - some operations may be limited`);
      console.log(`🔧 [DEBUG] Desktop agent will queue failed operations for later`);
    }
  }

  getConfig() {
    return this.config;
  }

  getSupabaseClient() {
    return this.supabase;
  }

  getSupabaseServiceClient() {
    return this.supabaseService;
  }

  updateConfig(updates) {
    this.config = { ...this.config, ...updates };
    return this.config;
  }

  validateConfig() {
    const required = ['supabase_url', 'supabase_key'];
    const missing = required.filter(key => !this.config[key]);
    
    if (missing.length > 0) {
      throw new Error(`Missing required configuration: ${missing.join(', ')}`);
    }

    return true;
  }
}

module.exports = ConfigManager; 