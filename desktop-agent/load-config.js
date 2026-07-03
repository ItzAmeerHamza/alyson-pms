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
require('dotenv').config({ path: path.join(__dirname, '../web/.env') });

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
          let value = valueParts.join('=').trim();
          if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
          ) {
            value = value.slice(1, -1);
          }
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
  
  const authProvider =
    process.env.VITE_AUTH_PROVIDER ||
    process.env.AUTH_PROVIDER ||
    envConfig.VITE_AUTH_PROVIDER ||
    envConfig.AUTH_PROVIDER ||
    embeddedConfig.VITE_AUTH_PROVIDER ||
    embeddedConfig.AUTH_PROVIDER ||
    jsonConfig.auth_provider ||
    'supabase';

  const cognitoRegion =
    process.env.VITE_COGNITO_REGION ||
    process.env.COGNITO_REGION ||
    envConfig.VITE_COGNITO_REGION ||
    embeddedConfig.VITE_COGNITO_REGION ||
    embeddedConfig.COGNITO_REGION ||
    '';
  const cognitoUserPoolId =
    process.env.VITE_COGNITO_USER_POOL_ID ||
    process.env.COGNITO_USER_POOL_ID ||
    envConfig.VITE_COGNITO_USER_POOL_ID ||
    embeddedConfig.VITE_COGNITO_USER_POOL_ID ||
    embeddedConfig.COGNITO_USER_POOL_ID ||
    '';
  const cognitoClientId =
    process.env.VITE_COGNITO_CLIENT_ID ||
    process.env.COGNITO_CLIENT_ID ||
    envConfig.VITE_COGNITO_CLIENT_ID ||
    embeddedConfig.VITE_COGNITO_CLIENT_ID ||
    embeddedConfig.COGNITO_CLIENT_ID ||
    '';

  const apiBaseUrl =
    process.env.VITE_API_BASE_URL ||
    process.env.API_BASE_URL ||
    envConfig.VITE_API_BASE_URL ||
    envConfig.API_BASE_URL ||
    embeddedConfig.VITE_API_BASE_URL ||
    embeddedConfig.API_BASE_URL ||
    jsonConfig.api_base_url ||
    'http://localhost:3000';

  const backendApiUrl =
    process.env.BACKEND_API_URL ||
    envConfig.BACKEND_API_URL ||
    embeddedConfig.BACKEND_API_URL ||
    jsonConfig.backend_api_url ||
    `${apiBaseUrl.replace(/\/$/, '')}/sync/desktop-action`;

  const internalApiKey =
    process.env.INTERNAL_API_KEY ||
    envConfig.INTERNAL_API_KEY ||
    embeddedConfig.INTERNAL_API_KEY ||
    jsonConfig.backend_api_key ||
    '';

  const useCognito =
    authProvider === 'cognito' && Boolean(cognitoUserPoolId && cognitoClientId);

  const config = {
    ...jsonConfig,
    supabase_url: supabaseUrl,
    supabase_key: supabaseKey,
    VITE_SUPABASE_URL: supabaseUrl,
    VITE_SUPABASE_ANON_KEY: supabaseKey,
    SUPABASE_URL: supabaseUrl,
    SUPABASE_ANON_KEY: supabaseKey,
    supabase_service_key: '',
    SUPABASE_SERVICE_ROLE_KEY: '',
    auth_provider: useCognito ? 'cognito' : 'supabase',
    cognito_region: cognitoRegion,
    cognito_user_pool_id: cognitoUserPoolId,
    cognito_client_id: cognitoClientId,
    api_base_url: apiBaseUrl,
    backend_api_url: backendApiUrl,
    backend_api_key: internalApiKey,
  };

  if (!useCognito && (!config.supabase_url || !config.supabase_key)) {
    console.error('❌ Missing Supabase credentials (or set VITE_AUTH_PROVIDER=cognito with Cognito vars)');
    throw new Error('Missing required Supabase environment variables');
  }

  console.log('✅ Configuration loaded successfully');
  console.log(`   Auth provider: ${config.auth_provider}`);
  if (useCognito) {
    console.log(`   Cognito pool: ${cognitoUserPoolId}`);
    console.log(`   API base: ${apiBaseUrl}`);
    const backendReady = Boolean(backendApiUrl && internalApiKey);
    console.log(`   Backend sync: ${backendReady ? 'configured' : 'MISSING (projects/time logs need BACKEND_API_URL + INTERNAL_API_KEY)'}`);
  } else {
    console.log(`   Using Supabase URL: ${config.supabase_url}`);
  }
  
  return config;
}

module.exports = { loadConfig }; 
