// UNC path fix for Parallels Desktop
if (process.cwd().startsWith('\\\\\\\\')) {
  console.log('  UNC path detected, using alternative approach...');
  process.chdir(process.env.TEMP || 'C:\\\\Windows\\\\Temp');
}

const fs = require('fs');
const path = require('path');

// Load environment variables from .env file if it exists
require('dotenv').config({ path: path.join(process.cwd(), '.env') });
require('dotenv').config({ path: path.join(process.cwd(), '../web/.env') });

console.log('ðŸ”§ Generating embedded environment configuration...');

// Check if this is a build process (electron-builder sets this)
const isBuildProcess = process.env.npm_lifecycle_event === 'build' || 
                      process.env.npm_lifecycle_script?.includes('electron-builder') ||
                      process.argv.includes('--build');

console.log(`ðŸ“¦ Build process: ${isBuildProcess ? 'YES' : 'NO'}`);

// Get credentials from environment variables
const backendApiUrlRaw = process.env.BACKEND_API_URL || '';
const apiBaseFromBackend = backendApiUrlRaw
  ? backendApiUrlRaw.replace(/\/sync\/desktop-action\/?$/, '').replace(/\/$/, '')
  : '';

const credentials = {
  VITE_AUTH_PROVIDER: 'cognito',
  VITE_COGNITO_REGION: process.env.VITE_COGNITO_REGION || process.env.COGNITO_REGION || '',
  VITE_COGNITO_USER_POOL_ID: process.env.VITE_COGNITO_USER_POOL_ID || process.env.COGNITO_USER_POOL_ID || '',
  VITE_COGNITO_CLIENT_ID: process.env.VITE_COGNITO_CLIENT_ID || process.env.COGNITO_CLIENT_ID || '',
  VITE_API_BASE_URL:
    process.env.VITE_API_BASE_URL ||
    process.env.API_BASE_URL ||
    apiBaseFromBackend ||
    'http://localhost:3000',
  BACKEND_API_URL: backendApiUrlRaw,
  INTERNAL_API_KEY: process.env.INTERNAL_API_KEY || '',
  NODE_ENV: isBuildProcess ? 'production' : (process.env.NODE_ENV || 'development'),
};

// During build process, credentials must be available
if (isBuildProcess) {
  console.log('ðŸ—ï¸ Build process detected - validating credentials...');
  
  const apiBase = credentials.VITE_API_BASE_URL.replace(/\/$/, '');
  const missing = [];
  if (!credentials.VITE_COGNITO_USER_POOL_ID) missing.push('VITE_COGNITO_USER_POOL_ID');
  if (!credentials.VITE_COGNITO_CLIENT_ID) missing.push('VITE_COGNITO_CLIENT_ID');
  if (!credentials.VITE_COGNITO_REGION) missing.push('VITE_COGNITO_REGION');
  if (!credentials.BACKEND_API_URL) missing.push('BACKEND_API_URL');
  if (!credentials.INTERNAL_API_KEY) missing.push('INTERNAL_API_KEY');
  if (apiBase.includes('localhost') || apiBase.includes('127.0.0.1')) {
    missing.push('VITE_API_BASE_URL (or BACKEND_API_URL to derive it)');
  }
  if (missing.length) {
    console.error('Missing required release variables:');
    missing.forEach((key) => console.error(`   ${key}`));
    process.exit(1);
  }

  console.log('âœ… Build credentials validated');
} else {
  console.log('ðŸ”§ Development mode - will use fallback loading');
}

// Generate the embedded config (JSON.stringify keeps API keys with / + safe)
const configContent = `// Auto-generated embedded configuration
// Generated: ${new Date().toISOString()}
// Build process: ${isBuildProcess}

module.exports = ${JSON.stringify({
  ...credentials,
  _generated: true,
  _build_process: isBuildProcess,
}, null, 2)};
`;

// Write the generated config
const outputPath = path.join(process.cwd(), 'env-config.js');
fs.writeFileSync(outputPath, configContent);

console.log('âœ… Environment configuration generated successfully');
console.log(`   Cognito pool: ${credentials.VITE_COGNITO_USER_POOL_ID || 'MISSING'}`);
console.log(`   API base: ${credentials.VITE_API_BASE_URL}`);
console.log(`   Service key: NOT EMBEDDED (uses edge function)`);
console.log(`   NODE_ENV: ${credentials.NODE_ENV}`);
console.log(`   Output file: ${outputPath}`); 

