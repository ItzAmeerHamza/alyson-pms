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
const credentials = {
  VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
  VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '',
  SUPABASE_URL: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '',
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '',
  VITE_AUTH_PROVIDER: process.env.VITE_AUTH_PROVIDER || process.env.AUTH_PROVIDER || 'supabase',
  VITE_COGNITO_REGION: process.env.VITE_COGNITO_REGION || process.env.COGNITO_REGION || '',
  VITE_COGNITO_USER_POOL_ID: process.env.VITE_COGNITO_USER_POOL_ID || process.env.COGNITO_USER_POOL_ID || '',
  VITE_COGNITO_CLIENT_ID: process.env.VITE_COGNITO_CLIENT_ID || process.env.COGNITO_CLIENT_ID || '',
  VITE_API_BASE_URL: process.env.VITE_API_BASE_URL || process.env.API_BASE_URL || 'http://localhost:3000',
  NODE_ENV: isBuildProcess ? 'production' : (process.env.NODE_ENV || 'development'),
};

// During build process, credentials must be available
if (isBuildProcess) {
  console.log('ðŸ—ï¸ Build process detected - validating credentials...');
  
  const cognitoBuild =
    credentials.VITE_AUTH_PROVIDER === 'cognito' &&
    credentials.VITE_COGNITO_USER_POOL_ID &&
    credentials.VITE_COGNITO_CLIENT_ID;

  if (!cognitoBuild && (!credentials.VITE_SUPABASE_URL || !credentials.VITE_SUPABASE_ANON_KEY)) {
    console.error('âŒ Missing required environment variables for build:');
    console.error('   VITE_SUPABASE_URL or SUPABASE_URL');
    console.error('   VITE_SUPABASE_ANON_KEY or SUPABASE_ANON_KEY');
    console.error('   OR VITE_AUTH_PROVIDER=cognito with VITE_COGNITO_*');
    console.error('');
    console.error('ðŸ’¡ For builds, set these environment variables:');
    console.error('   export VITE_SUPABASE_URL="your_url"');
    console.error('   export VITE_SUPABASE_ANON_KEY="your_key"');
    console.error('   OR create a .env file in desktop-agent/');
    process.exit(1);
  }
  
  console.log('âœ… Build credentials validated');
} else {
  console.log('ðŸ”§ Development mode - will use fallback loading');
}

// Generate the embedded config
const configContent = `// Auto-generated embedded configuration
// Generated: ${new Date().toISOString()}
// Build process: ${isBuildProcess}

module.exports = {
  VITE_SUPABASE_URL: '${credentials.VITE_SUPABASE_URL}',
  VITE_SUPABASE_ANON_KEY: '${credentials.VITE_SUPABASE_ANON_KEY}',
  SUPABASE_URL: '${credentials.SUPABASE_URL}',
  SUPABASE_ANON_KEY: '${credentials.SUPABASE_ANON_KEY}',
  VITE_AUTH_PROVIDER: '${credentials.VITE_AUTH_PROVIDER}',
  VITE_COGNITO_REGION: '${credentials.VITE_COGNITO_REGION}',
  VITE_COGNITO_USER_POOL_ID: '${credentials.VITE_COGNITO_USER_POOL_ID}',
  VITE_COGNITO_CLIENT_ID: '${credentials.VITE_COGNITO_CLIENT_ID}',
  VITE_API_BASE_URL: '${credentials.VITE_API_BASE_URL}',
  NODE_ENV: '${credentials.NODE_ENV}',
  _generated: true,
  _build_process: ${isBuildProcess}
};
`;

// Write the generated config
const outputPath = path.join(process.cwd(), 'env-config.js');
fs.writeFileSync(outputPath, configContent);

console.log('âœ… Environment configuration generated successfully');
console.log(`   Using Supabase URL: ${credentials.VITE_SUPABASE_URL}`);
console.log(`   Anon key length: ${credentials.VITE_SUPABASE_ANON_KEY.length} characters`);
console.log(`   Service key: NOT EMBEDDED (uses edge function)`);
console.log(`   NODE_ENV: ${credentials.NODE_ENV}`);
console.log(`   Output file: ${outputPath}`); 

