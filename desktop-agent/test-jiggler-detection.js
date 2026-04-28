#!/usr/bin/env node
/**
 * Test script for Mouse Jiggler Detection
 * This simulates jiggler-like behavior and verifies the detection works
 * 
 * Run with: node test-jiggler-detection.js
 */

const AntiCheatDetector = require('./src/modules/activity/anti-cheat-detector');

// Create detector with default config
const config = {
  user_id: 'test-user-123',
  suspicious_activity_threshold: 10,
  pattern_detection_window_minutes: 15,
  minimum_mouse_distance: 50,
  keyboard_diversity_threshold: 5
};

const detector = new AntiCheatDetector(config);

console.log('\n🧪 ========================================');
console.log('   MOUSE JIGGLER DETECTION TEST');
console.log('========================================\n');

// Start monitoring
detector.startMonitoring();

// Test 1: Normal mouse movement (should NOT trigger)
console.log('📌 TEST 1: Normal mouse movement patterns');
console.log('   Simulating natural user behavior...\n');

let baseX = 500;
let baseY = 400;

// Simulate normal mouse movement (large varied movements)
for (let i = 0; i < 30; i++) {
  // Normal users move mouse across large areas with variation
  baseX += (Math.random() - 0.5) * 200; // Large random movements
  baseY += (Math.random() - 0.5) * 150;
  
  detector.recordActivity('mouse_move', {
    x: Math.round(baseX),
    y: Math.round(baseY)
  });
}

// Analyze after normal movement
let result1 = detector.detectMouseJiggling();
console.log('   Result:', result1.suspicious ? '⚠️ SUSPICIOUS (false positive!)' : '✅ NOT SUSPICIOUS (correct)');
console.log('   Score:', result1.riskScore || 0, '/ 100');
console.log('   Indicators:', result1.indicators?.join(', ') || 'none');
console.log();

// Clear data for next test
detector.recentMouseMoves = [];
detector.mousePositions = [];

// Test 2: Hardware jiggler pattern (tiny single-axis oscillation)
console.log('📌 TEST 2: Hardware jiggler pattern (tiny X-axis oscillation)');
console.log('   Simulating hardware mouse jiggler...\n');

const jigglerBaseX = 960;
const jigglerBaseY = 540;
const timestamp = Date.now();

// Simulate hardware jiggler: tiny movements on single axis with perfect timing
for (let i = 0; i < 60; i++) {
  // Hardware jigglers typically move 1-5 pixels left/right
  const offset = (i % 2 === 0) ? 3 : -3; // Oscillate back and forth
  
  detector.recordActivity('mouse_move', {
    x: jigglerBaseX + offset,
    y: jigglerBaseY, // Y stays constant (single axis)
    timestamp: timestamp + (i * 100) // Perfect 100ms intervals (robotic)
  });
}

// Analyze after jiggler pattern
let result2 = detector.detectMouseJiggling();
console.log('   Result:', result2.suspicious ? '🚨 SUSPICIOUS (correct!)' : '❌ NOT DETECTED (false negative!)');
console.log('   Score:', result2.riskScore || 0, '/ 100');
console.log('   Detection Type:', result2.detectionType || 'none');
console.log('   Indicators:', result2.indicators?.join(', ') || 'none');
console.log('   Metrics:');
if (result2.metrics) {
  console.log('     - Avg Distance:', result2.metrics.avgDistance, 'px');
  console.log('     - Oscillation Ratio:', result2.metrics.oscillationRatio);
  console.log('     - Single Axis:', result2.metrics.isSingleAxis);
  console.log('     - Position Entropy:', result2.metrics.positionEntropy);
}
console.log();

// Clear data for next test
detector.recentMouseMoves = [];
detector.mousePositions = [];

// Test 3: Software jiggler pattern (small circular movements)
console.log('📌 TEST 3: Software jiggler pattern (small circular movements)');
console.log('   Simulating software mouse mover...\n');

const centerX = 800;
const centerY = 600;
const radius = 8; // Small radius

for (let i = 0; i < 50; i++) {
  const angle = (i / 50) * Math.PI * 4; // 2 full circles
  detector.recordActivity('mouse_move', {
    x: Math.round(centerX + Math.cos(angle) * radius),
    y: Math.round(centerY + Math.sin(angle) * radius),
    timestamp: timestamp + (i * 80) // Regular intervals
  });
}

let result3 = detector.detectMouseJiggling();
console.log('   Result:', result3.suspicious ? '🚨 SUSPICIOUS (correct!)' : '❌ NOT DETECTED (false negative!)');
console.log('   Score:', result3.riskScore || 0, '/ 100');
console.log('   Detection Type:', result3.detectionType || 'none');
console.log('   Indicators:', result3.indicators?.join(', ') || 'none');
if (result3.metrics) {
  console.log('   Circular Pattern:', result3.metrics.isCircular);
}
console.log();

// Stop monitoring
detector.stopMonitoring();

// Summary
console.log('========================================');
console.log('📊 TEST SUMMARY');
console.log('========================================');
console.log('Test 1 (Normal): ', !result1.suspicious ? '✅ PASS' : '❌ FAIL (false positive)');
console.log('Test 2 (Hardware Jiggler):', result2.suspicious ? '✅ PASS' : '❌ FAIL (not detected)');
console.log('Test 3 (Software Jiggler):', result3.suspicious ? '✅ PASS' : '❌ FAIL (not detected)');

const passed = (!result1.suspicious ? 1 : 0) + (result2.suspicious ? 1 : 0) + (result3.suspicious ? 1 : 0);
console.log(`\n🎯 Overall: ${passed}/3 tests passed`);

if (passed === 3) {
  console.log('\n✅ All detection tests PASSED! The jiggler detection is working correctly.\n');
  process.exit(0);
} else {
  console.log('\n⚠️ Some tests failed. Review the detection algorithm.\n');
  process.exit(1);
}
