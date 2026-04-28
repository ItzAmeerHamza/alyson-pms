#!/usr/bin/env node

/**
 * Debug Windows Idle Detection
 * Investigates why idle detection wasn't working on Windows
 */

const { app, powerMonitor } = require('electron');

console.log('🔍 Debugging Windows Idle Detection');
console.log('===================================');

if (process.platform !== 'win32') {
  console.log('⚠️ This debug script is designed for Windows. Current platform:', process.platform);
  console.log('   Run this on Windows to debug idle detection issues.');
  process.exit(0);
}

console.log('✅ Running on Windows - starting idle detection debug');
console.log('');

// Test 1: Check if powerMonitor is available and working
console.log('🧪 TEST 1: PowerMonitor Availability');
console.log('------------------------------------');
if (powerMonitor) {
  console.log('✅ PowerMonitor is available');
  
  // Test getSystemIdleTime function
  try {
    const idleTime = powerMonitor.getSystemIdleTime();
    console.log(`✅ getSystemIdleTime() works: ${idleTime} seconds`);
  } catch (error) {
    console.log(`❌ getSystemIdleTime() failed: ${error.message}`);
  }
  
  // Test if it's a function
  if (typeof powerMonitor.getSystemIdleTime === 'function') {
    console.log('✅ getSystemIdleTime is a function');
  } else {
    console.log('❌ getSystemIdleTime is not a function');
  }
} else {
  console.log('❌ PowerMonitor is not available');
}

console.log('');

// Test 2: Monitor idle time changes
console.log('🧪 TEST 2: Idle Time Monitoring');
console.log('-------------------------------');
let lastIdleTime = 0;
let idleTimeChanges = 0;

const idleMonitor = setInterval(() => {
  try {
    const currentIdleTime = powerMonitor.getSystemIdleTime();
    
    if (currentIdleTime !== lastIdleTime) {
      idleTimeChanges++;
      console.log(`📊 Idle time changed: ${lastIdleTime}s → ${currentIdleTime}s (change #${idleTimeChanges})`);
      lastIdleTime = currentIdleTime;
    }
    
    // Log every 30 seconds
    if (idleTimeChanges % 10 === 0) {
      console.log(`⏱️ Current idle time: ${currentIdleTime}s`);
    }
    
    // Test threshold detection
    if (currentIdleTime >= 120) { // 2 minutes
      console.log(`🚨 IDLE THRESHOLD REACHED: ${currentIdleTime}s (${Math.floor(currentIdleTime/60)} minutes)`);
    }
    
  } catch (error) {
    console.log(`❌ Error monitoring idle time: ${error.message}`);
  }
}, 5000); // Check every 5 seconds

console.log('✅ Idle monitoring started - check every 5 seconds');
console.log('   Move your mouse or type to see idle time reset to 0');
console.log('   Wait 2+ minutes to see if threshold detection works');
console.log('');

// Test 3: Check power events
console.log('🧪 TEST 3: Power Events');
console.log('----------------------');
const powerEvents = [
  'suspend', 'resume', 'shutdown',
  'display-sleep', 'display-wake',
  'lock-screen', 'unlock-screen',
  'user-did-become-active', 'user-did-resign-active',
  'on-ac', 'on-battery'
];

powerEvents.forEach(eventName => {
  try {
    powerMonitor.on(eventName, () => {
      console.log(`📡 [${eventName.toUpperCase()}] Event detected!`);
    });
    console.log(`✅ Registered listener for ${eventName}`);
  } catch (error) {
    console.log(`❌ Failed to register ${eventName}: ${error.message}`);
  }
});

console.log('');

// Test 4: Check system information
console.log('🧪 TEST 4: System Information');
console.log('-----------------------------');
console.log(`Platform: ${process.platform}`);
console.log(`Architecture: ${process.arch}`);
console.log(`Node version: ${process.version}`);
console.log(`Electron version: ${process.versions.electron || 'Not available'}`);

// Test 5: Simulate the actual idle detection logic
console.log('');
console.log('🧪 TEST 5: Simulating Actual Idle Detection Logic');
console.log('--------------------------------------------------');

let simulationCount = 0;
const simulationInterval = setInterval(() => {
  simulationCount++;
  
  try {
    // This is the exact logic from main.js
    const osIdle = powerMonitor.getSystemIdleTime() || 0;
    const inputIdle = 0; // Simulate no input manager
    const monitorIdle = 0; // Simulate no enhanced monitor
    
    const idleSeconds = Math.max(osIdle, inputIdle, monitorIdle);
    const thresholdSeconds = 1200; // 20 minutes
    
    console.log(`[SIMULATION ${simulationCount}] osIdle=${osIdle}s, inputIdle=${inputIdle}s, monitorIdle=${monitorIdle}s`);
    console.log(`[SIMULATION ${simulationCount}] idleSeconds=${idleSeconds}s, threshold=${thresholdSeconds}s`);
    
    if (idleSeconds >= thresholdSeconds) {
      const idleMinutes = Math.floor(idleSeconds / 60);
      console.log(`🚨 [SIMULATION] WOULD STOP TRACKING: ${idleMinutes} minutes idle`);
    } else {
      const remainingMinutes = Math.ceil((thresholdSeconds - idleSeconds) / 60);
      console.log(`⏳ [SIMULATION] Continue tracking, ${remainingMinutes} minutes until stop`);
    }
    
  } catch (error) {
    console.log(`❌ [SIMULATION] Error: ${error.message}`);
  }
  
  // Stop after 10 iterations (50 seconds)
  if (simulationCount >= 10) {
    clearInterval(simulationInterval);
    console.log('✅ Simulation completed');
  }
}, 5000);

console.log('✅ Simulation started - will run for 50 seconds');
console.log('');

// Instructions
console.log('📋 DEBUGGING INSTRUCTIONS:');
console.log('==========================');
console.log('');
console.log('1. 🖱️ MOVEMENT TEST:');
console.log('   - Move your mouse or type on keyboard');
console.log('   - Watch idle time reset to 0 seconds');
console.log('   - If it doesn\'t reset, idle detection is broken');
console.log('');
console.log('2. ⏰ IDLE TEST:');
console.log('   - Stop moving mouse/typing for 2+ minutes');
console.log('   - Watch idle time increase');
console.log('   - Check if threshold detection works');
console.log('');
console.log('3. 🔒 POWER EVENTS TEST:');
console.log('   - Lock screen (Win+L)');
console.log('   - Unlock screen');
console.log('   - Close laptop lid (if applicable)');
console.log('   - Check if events are detected');
console.log('');
console.log('4. 📊 MONITORING:');
console.log('   - Watch the simulation output');
console.log('   - Check if idle time values are reasonable');
console.log('   - Look for any error messages');
console.log('');
console.log('Press Ctrl+C to stop debugging');
console.log('');

// Cleanup on exit
process.on('SIGINT', () => {
  console.log('\n🛑 Stopping idle detection debug...');
  clearInterval(idleMonitor);
  clearInterval(simulationInterval);
  console.log('✅ Debug session completed');
  process.exit(0);
});

