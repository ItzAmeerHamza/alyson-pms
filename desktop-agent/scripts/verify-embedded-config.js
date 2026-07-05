#!/usr/bin/env node
'use strict';

const path = require('path');

const configPath = path.join(__dirname, '..', 'env-config.js');
let config;
try {
  config = require(configPath);
} catch (error) {
  console.error('❌ env-config.js not found — run generate-env-config.js --build first');
  process.exit(1);
}

const isCognito = config.VITE_AUTH_PROVIDER === 'cognito';

const required = isCognito
  ? [
      'VITE_AUTH_PROVIDER',
      'VITE_COGNITO_REGION',
      'VITE_COGNITO_USER_POOL_ID',
      'VITE_COGNITO_CLIENT_ID',
      'VITE_API_BASE_URL',
      'BACKEND_API_URL',
      'INTERNAL_API_KEY',
    ]
  : ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'];

const missing = required.filter((key) => !config[key] || String(config[key]).trim() === '');

if (missing.length) {
  console.error('❌ Embedded config missing required keys:', missing.join(', '));
  process.exit(1);
}

const apiBase = String(config.VITE_API_BASE_URL).replace(/\/$/, '');
if (apiBase.includes('localhost') || apiBase.includes('127.0.0.1')) {
  console.error('❌ VITE_API_BASE_URL must not point to localhost in release builds');
  process.exit(1);
}

if (isCognito && !String(config.BACKEND_API_URL).includes('/sync/desktop-action')) {
  console.error('❌ BACKEND_API_URL must include /sync/desktop-action path');
  process.exit(1);
}

console.log('✅ Embedded config verified for', isCognito ? 'Cognito' : 'Supabase');
console.log(`   API base: ${apiBase}`);
console.log(`   Cognito pool: ${config.VITE_COGNITO_USER_POOL_ID || 'n/a'}`);
console.log(`   Backend sync: ${config.BACKEND_API_URL ? 'yes' : 'no'}`);
