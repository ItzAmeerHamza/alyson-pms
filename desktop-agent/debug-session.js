#!/usr/bin/env node

/**
 * Debug script to check and fix saved session
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const SESSION_PATH = path.join(os.homedir(), '.ebdaa_work_time_agent_session.json');

async function checkSession() {
  console.log('🔍 Checking saved session at:', SESSION_PATH);
  
  try {
    const data = await fs.promises.readFile(SESSION_PATH, 'utf8');
    const session = JSON.parse(data);
    
    console.log('\n📋 Session Details:');
    console.log('  Email:', session.email);
    console.log('  User ID:', session.id);
    console.log('  Role:', session.role);
    console.log('  Remember Me:', session.remember_me);
    console.log('  Has Access Token:', !!session.access_token);
    console.log('  Has Refresh Token:', !!session.refresh_token);
    
    // Check expiry
    if (session.expires_at) {
      const expiryDate = new Date(session.expires_at);
      const now = new Date();
      const isExpired = now > expiryDate;
      
      console.log('\n⏰ Expiry Information:');
      console.log('  Raw expires_at:', session.expires_at);
      console.log('  Expiry Date:', expiryDate.toLocaleString());
      console.log('  Current Date:', now.toLocaleString());
      console.log('  Is Expired:', isExpired);
      
      // Check if expires_at is in seconds instead of milliseconds
      if (session.expires_at < 9999999999) {
        console.log('\n⚠️  WARNING: expires_at appears to be in seconds, not milliseconds!');
        console.log('  Converting to milliseconds...');
        
        session.expires_at = session.expires_at * 1000;
        
        // Save the fixed session
        await fs.promises.writeFile(SESSION_PATH, JSON.stringify(session, null, 2));
        console.log('✅ Session fixed and saved!');
        
        const newExpiryDate = new Date(session.expires_at);
        console.log('  New Expiry Date:', newExpiryDate.toLocaleString());
      }
    } else {
      console.log('\n⚠️  No expiry date found in session');
    }
    
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log('❌ No saved session found');
    } else {
      console.error('❌ Error reading session:', error);
    }
  }
}

// Run the check
checkSession();
