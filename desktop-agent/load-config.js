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
    '';

  const backendApiUrl =
    process.env.BACKEND_API_URL ||
    envConfig.BACKEND_API_URL ||
    embeddedConfig.BACKEND_API_URL ||
    jsonConfig.backend_api_url ||
    `${String(apiBaseUrl || '').replace(/\/$/, '')}/sync/desktop-action`;

  const apiBaseFromBackend = backendApiUrl
    ? backendApiUrl.replace(/\/sync\/desktop-action\/?$/, '').replace(/\/$/, '')
    : '';

  const resolvedApiBaseUrl = (() => {
    const candidate = (apiBaseUrl || apiBaseFromBackend || 'http://localhost:3000').replace(/\/$/, '');
    if (candidate === 'http://localhost:3000' && apiBaseFromBackend) {
      return apiBaseFromBackend;
    }
    return candidate;
  })();

  const internalApiKey =
    process.env.INTERNAL_API_KEY ||
    envConfig.INTERNAL_API_KEY ||
    embeddedConfig.INTERNAL_API_KEY ||
    jsonConfig.backend_api_key ||
    '';

  const cognitoReady = Boolean(cognitoUserPoolId && cognitoClientId);

  const config = {
    ...jsonConfig,
    auth_provider: 'cognito',
    cognito_region: cognitoRegion,
    cognito_user_pool_id: cognitoUserPoolId,
    cognito_client_id: cognitoClientId,
    api_base_url: resolvedApiBaseUrl,
    backend_api_url: backendApiUrl,
    backend_api_key: internalApiKey,
  };

  // Warn, never throw. A missing credential must not stop the agent from
  // starting — the offline queue still records hours and syncs them later.
  // Throwing here meant a config problem silently cost employees their day.
  if (!cognitoReady) {
    console.warn('⚠️ Cognito not fully configured — sign-in will fail until COGNITO_USER_POOL_ID and COGNITO_CLIENT_ID are set');
  }

  console.log('✅ Configuration loaded successfully');
  console.log(`   Auth provider: ${config.auth_provider}`);
  console.log(`   Cognito pool: ${cognitoUserPoolId || 'MISSING'}`);
  console.log(`   API base: ${resolvedApiBaseUrl}`);
  const backendReady = Boolean(backendApiUrl && internalApiKey);
  console.log(`   Backend sync: ${backendReady ? 'configured' : 'MISSING (projects/time logs need BACKEND_API_URL + INTERNAL_API_KEY)'}`);

  return config;
}

module.exports = { loadConfig }; 
