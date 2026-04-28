const fs = require('fs');
const path = require('path');

// Try to load embedded config for packaged apps
let embeddedConfig = {};
try {
  embeddedConfig = require('./env-config');
} catch (error) {
  // Embedded config not available in development
}

require('dotenv').config({ path: path.join(__dirname, '.env') });

function loadConfig() {
  console.log('🔧 Loading desktop agent configuration...');
  
  // Load from .env file if it exists
  const envPath = path.join(__dirname, '.env');
  let envConfig = {};
  
  if (fs.existsSync(envPath)) {
    console.log('📄 Found .env file, loading credentials...');
    const envContent = fs.readFileSync(envPath, 'utf8');
    
    envContent.split('\n').forEach(line => {
      const trimmedLine = line.trim();
      if (trimmedLine && !trimmedLine.startsWith('#')) {
        const [key, ...valueParts] = trimmedLine.split('=');
        if (key && valueParts.length > 0) {
          const value = valueParts.join('=').trim();
          envConfig[key.trim()] = value;
        }
      }
    });
  }
  
  // Load from config.json for other settings
  const configPath = path.join(__dirname, 'config.json');
  let jsonConfig = {};
  
  if (fs.existsSync(configPath)) {
    jsonConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
  
  // Merge configurations with priority: process.env > .env > embedded > config.json
  const supabaseUrl = process.env.VITE_SUPABASE_URL || 
                      process.env.SUPABASE_URL || 
                      envConfig.VITE_SUPABASE_URL ||
                      envConfig.SUPABASE_URL || 
                      embeddedConfig.VITE_SUPABASE_URL ||
                      embeddedConfig.SUPABASE_URL || 
                      jsonConfig.supabase_url || '';
  
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 
                      process.env.SUPABASE_ANON_KEY || 
                      envConfig.VITE_SUPABASE_ANON_KEY ||
                      envConfig.SUPABASE_ANON_KEY || 
                      embeddedConfig.VITE_SUPABASE_ANON_KEY ||
                      embeddedConfig.SUPABASE_ANON_KEY || 
                      jsonConfig.supabase_key || '';
  
  const config = {
    ...jsonConfig,
    supabase_url: supabaseUrl,
    supabase_key: supabaseKey,
    // Also include VITE_ prefixed versions for compatibility with config-manager.js
    VITE_SUPABASE_URL: supabaseUrl,
    VITE_SUPABASE_ANON_KEY: supabaseKey,
    SUPABASE_URL: supabaseUrl,
    SUPABASE_ANON_KEY: supabaseKey,
    // SECURITY: Service role key removed from client.
    // All writes go through the desktop-sync edge function.
    supabase_service_key: '',
    SUPABASE_SERVICE_ROLE_KEY: ''
  };
  
  // Validate required credentials
  if (!config.supabase_url || !config.supabase_key) {
    console.error('❌ Missing Supabase credentials!');
    console.error('   Please ensure either:');
    console.error('   1. .env file contains VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
    console.error('   2. OR environment variables VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set');
    console.error('   3. OR config.json contains supabase_url and supabase_key');
    console.error('   4. OR embedded config is available (for packaged apps)');
    throw new Error('Missing required Supabase environment variables');
  }
  
  console.log('✅ Configuration loaded successfully');
  console.log(`   Using Supabase URL: ${config.supabase_url}`);
  console.log(`   Using credentials from: ${envConfig.SUPABASE_URL ? '.env file' : embeddedConfig.SUPABASE_URL ? 'embedded config' : 'config.json'}`);
  console.log(`   Service role key: NOT EMBEDDED (uses edge function)`);
  
  return config;
}

module.exports = { loadConfig }; 
