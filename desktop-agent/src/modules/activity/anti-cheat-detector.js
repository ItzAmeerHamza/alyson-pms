// Enhanced Anti-Cheat Detection System v2.0
// Comprehensive fraud detection for mouse jigglers, auto-clickers, fake typing, and more
const { powerMonitor } = require('electron');
const { execSync, exec } = require('child_process');
const os = require('os');

class AntiCheatDetector {
  constructor(config, syncManager = null) {
    this.config = config;
    this.syncManager = syncManager;
    this.activityHistory = [];
    this.mousePositions = [];
    this.keystrokes = [];
    this.suspiciousPatterns = [];
    this.lastScreenshotActivity = null;
    this.repetitivePatternCount = 0;
    this.isMonitoring = false;
    
    // Detection thresholds (configurable)
    this.REPETITIVE_THRESHOLD = config.suspicious_activity_threshold || 10;
    this.PATTERN_WINDOW = (config.pattern_detection_window_minutes || 15) * 60 * 1000; // 15 minutes
    this.MIN_MOUSE_DISTANCE = config.minimum_mouse_distance || 50; // pixels
    this.KEYBOARD_DIVERSITY_THRESHOLD = config.keyboard_diversity_threshold || 5;
    
    // Pattern detection arrays
    this.recentMouseMoves = [];
    this.recentKeyPresses = [];
    this.mouseClickTimestamps = [];
    this.mouseClickPositions = []; // Track click positions for clustering detection
    this.keyboardTimestamps = [];
    
    // Processing flags to prevent overlap
    this.isAnalyzing = false;
    this.isDeepAnalyzing = false;
    this.isProcessScanning = false;
    this.isUSBScanning = false;
    
    // Screenshot timing analysis
    this.screenshotTimestamps = [];
    this.activityNearScreenshots = []; // Track activity bursts around screenshot times
    
    // Behavioral biometrics baseline
    this.userBaseline = {
      typingProfile: null,
      mouseProfile: null,
      samplesCollected: 0,
      lastUpdated: null
    };
    
    // Known jiggler software (case-insensitive matching)
    this.JIGGLER_PROCESSES = {
      windows: [
        'mousejiggler', 'movemouse', 'caffeine', 'wigglemouse', 'jiggle',
        'stayawake', 'mouse mover', 'auto mouse', 'keepawake', 'nosleep',
        'mouse shaker', 'prevent sleep', 'wiggle mouse', 'anti idle',
        'move mouse', 'mouse jiggle', 'don\'t sleep', 'keep alive'
      ],
      darwin: [
        'caffeine', 'amphetamine', 'keepingyouawake', 'jiggler', 'mouse mover',
        'stay awake', 'nosleep', 'anti sleep', 'wake me', 'owly', 'lungo'
      ]
    };
    
    // Known hardware jiggler USB signatures
    this.JIGGLER_USB_SIGNATURES = [
      'mouse jiggler', 'undetectable mouse', 'hid simulator',
      'mouse mover', 'usb mouse emulator', 'phantom mouse'
    ];
    
    // Detection results cache
    this.lastProcessScanResult = null;
    this.lastUSBScanResult = null;
    this.lastProcessScanTime = 0;
    this.lastUSBScanTime = 0;
    
    console.log('🛡️ Enhanced Anti-Cheat Detector v2.0 initialized');
  }

  startMonitoring() {
    if (this.isMonitoring) return;
    
    console.log('🕵️ Starting enhanced anti-cheat detection v2.0...');
    this.isMonitoring = true;

    let patternMs = 60000;
    let deepMs = 180000;
    let processMs = 10 * 60 * 1000;
    let usbMs = 15 * 60 * 1000;
    try {
      const { ANTI_CHEAT } = require('../utils/power-profile');
      patternMs = ANTI_CHEAT.patternMs;
      deepMs = ANTI_CHEAT.deepMs;
      processMs = ANTI_CHEAT.processMs;
      usbMs = ANTI_CHEAT.usbMs;
    } catch (_) { /* defaults above */ }
    
    // Pattern scan — softened for battery (was 15s)
    this.monitoringInterval = setInterval(() => {
      if (this.isAnalyzing) return;
      this.analyzeActivity();
    }, patternMs);
    
    // Deep analysis — softened (was 30s)
    this.deepAnalysisInterval = setInterval(() => {
      if (this.isDeepAnalyzing) return;
      this.performDeepAnalysis();
    }, deepMs);
    
    // Process scan (lightweight)
    this.processScanInterval = setInterval(() => {
      if (this.isProcessScanning) return;
      this.scanForJigglerProcesses();
    }, processMs);
    
    // USB scan (very lightweight)
    this.usbScanInterval = setInterval(() => {
      if (this.isUSBScanning) return;
      this.scanForJigglerUSBDevices();
    }, usbMs);
    
    // Clean old data every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldData();
    }, 5 * 60 * 1000);
    
    // Initial scans on startup (delayed to not block startup)
    setTimeout(() => this.scanForJigglerProcesses(), 30000);
    setTimeout(() => this.scanForJigglerUSBDevices(), 60000);
    
    // Register intervals with cleanup registry
    if (typeof cleanupRegistry !== 'undefined' && cleanupRegistry?.registerInterval) {
      cleanupRegistry.registerInterval(this.monitoringInterval, 'Anti-cheat monitoring');
      cleanupRegistry.registerInterval(this.deepAnalysisInterval, 'Anti-cheat deep analysis');
      cleanupRegistry.registerInterval(this.processScanInterval, 'Anti-cheat process scan');
      cleanupRegistry.registerInterval(this.usbScanInterval, 'Anti-cheat USB scan');
      cleanupRegistry.registerInterval(this.cleanupInterval, 'Anti-cheat cleanup');
    }
  }

  stopMonitoring() {
    if (!this.isMonitoring) return;
    
    console.log('🛑 Stopping enhanced anti-cheat detection...');
    this.isMonitoring = false;
    
    if (this.monitoringInterval) clearInterval(this.monitoringInterval);
    if (this.deepAnalysisInterval) clearInterval(this.deepAnalysisInterval);
    if (this.processScanInterval) clearInterval(this.processScanInterval);
    if (this.usbScanInterval) clearInterval(this.usbScanInterval);
    if (this.cleanupInterval) clearInterval(this.cleanupInterval);
  }
  
  resetActivityCounters() {
    // Reset all internal counters
    this.mousePositions = [];
    this.clickPositions = [];
    this.keyboardActivity = [];
    this.activityHistory = [];
    this.suspiciousActivityDetected = false;
    this.lastScreenshotActivity = null;
    console.log('✅ [ANTI-CHEAT] Activity counters reset');
  }

  recordActivity(type, data) {
    const timestamp = Date.now();
    const activity = { type, data, timestamp };
    
    this.activityHistory.push(activity);
    
    switch (type) {
      case 'mouse_move':
        this.recordMouseMove(data, timestamp);
        break;
      case 'mouse_click':
        this.recordMouseClick(data, timestamp);
        break;
      case 'keyboard':
        this.recordKeyboard(data, timestamp);
        break;
      case 'screenshot':
        this.lastScreenshotActivity = timestamp;
        break;
    }
  }

  recordMouseMove(position, timestamp) {
    this.mousePositions.push({ ...position, timestamp });
    this.recentMouseMoves.push({ ...position, timestamp });
    
    // Keep only recent moves (last 2 minutes)
    const cutoff = timestamp - 2 * 60 * 1000;
    this.recentMouseMoves = this.recentMouseMoves.filter(move => move.timestamp > cutoff);
  }

  recordMouseClick(data, timestamp) {
    this.mouseClickTimestamps.push(timestamp);
    
    // Track click positions for clustering detection
    if (data && (data.x !== undefined || data.position)) {
      const pos = data.position || { x: data.x, y: data.y };
      this.mouseClickPositions.push({ ...pos, timestamp });
    }
    
    // Keep only recent clicks (last 10 minutes)
    const cutoff = timestamp - 10 * 60 * 1000;
    this.mouseClickTimestamps = this.mouseClickTimestamps.filter(click => click > cutoff);
    this.mouseClickPositions = this.mouseClickPositions.filter(click => click.timestamp > cutoff);
  }

  recordKeyboard(data, timestamp) {
    this.keystrokes.push({ ...data, timestamp });
    this.recentKeyPresses.push({ ...data, timestamp });
    this.keyboardTimestamps.push(timestamp);
    
    // Keep only recent keystrokes (last 5 minutes)
    const cutoff = timestamp - 5 * 60 * 1000;
    this.recentKeyPresses = this.recentKeyPresses.filter(key => key.timestamp > cutoff);
    this.keyboardTimestamps = this.keyboardTimestamps.filter(time => time > cutoff);
  }

  analyzeActivity() {
    if (!this.isMonitoring) return;
    
    this.isAnalyzing = true;
    const suspiciousActivities = [];
    const now = Date.now();
    
    try {
      // 1. Enhanced mouse jiggler detection
    const mouseJiggleDetection = this.detectMouseJiggling();
    if (mouseJiggleDetection.suspicious) {
        const severity = mouseJiggleDetection.confidence > 0.7 ? 'CRITICAL' : 'HIGH';
      suspiciousActivities.push({
          type: mouseJiggleDetection.detectionType || 'mouse_jiggling',
          severity,
        details: mouseJiggleDetection,
          timestamp: now
      });
    }
    
      // 2. Enhanced keyboard pattern detection (fake typing)
    const keyboardPatternDetection = this.detectKeyboardPatterns();
    if (keyboardPatternDetection.suspicious) {
        const severity = keyboardPatternDetection.confidence > 0.7 ? 'CRITICAL' : 'HIGH';
      suspiciousActivities.push({
          type: keyboardPatternDetection.detectionType || 'fake_typing',
          severity,
        details: keyboardPatternDetection,
          timestamp: now
      });
    }
    
      // 3. Enhanced auto-clicker detection
    const clickPatternDetection = this.detectClickPatterns();
    if (clickPatternDetection.suspicious) {
        const severity = clickPatternDetection.confidence > 0.7 ? 'HIGH' : 'MEDIUM';
      suspiciousActivities.push({
          type: clickPatternDetection.detectionType || 'auto_clicker',
          severity,
        details: clickPatternDetection,
          timestamp: now
      });
    }
    
      // 4. Screenshot evasion detection
    const screenshotEvasion = this.detectScreenshotEvasion();
    if (screenshotEvasion.suspicious) {
      suspiciousActivities.push({
        type: 'screenshot_evasion',
        severity: 'HIGH',
        details: screenshotEvasion,
          timestamp: now
        });
      }
      
      // 5. Timing anomaly detection (gaming screenshot windows)
      const timingAnomaly = this.detectTimingAnomalies();
      if (timingAnomaly.suspicious) {
        suspiciousActivities.push({
          type: 'timing_anomaly',
          severity: 'HIGH',
          details: timingAnomaly,
          timestamp: now
        });
      }
      
      // 6. Cross-reference analysis (mismatched metrics)
      const crossRefAnalysis = this.detectCrossReferenceAnomalies();
      if (crossRefAnalysis.suspicious) {
        suspiciousActivities.push({
          type: 'cross_reference_anomaly',
          severity: 'MEDIUM',
          details: crossRefAnalysis,
          timestamp: now
      });
    }
    
    // Log suspicious activities
    if (suspiciousActivities.length > 0) {
      this.logSuspiciousActivities(suspiciousActivities);
    }
    
    return suspiciousActivities;
      
    } finally {
      this.isAnalyzing = false;
    }
  }
  
  // Cross-reference analysis - detect mismatches between metrics
  detectCrossReferenceAnomalies() {
    const now = Date.now();
    const lastMinute = now - 60000;
    
    // Get recent activity counts
    const recentMoves = this.recentMouseMoves.filter(m => m.timestamp > lastMinute).length;
    const recentClicks = this.mouseClickTimestamps.filter(t => t > lastMinute).length;
    const recentKeys = this.recentKeyPresses.filter(k => k.timestamp > lastMinute).length;
    
    let suspicionScore = 0;
    const indicators = [];
    
    // High mouse movements but no clicks (jiggler signature)
    // Threshold increased from 50 to 200 to reduce false positives during
    // normal reading/scrolling where mouse moves without clicks are common.
    // Real mouse jigglers generate thousands of moves per minute.
    if (recentMoves > 200 && recentClicks === 0 && recentKeys === 0) {
      suspicionScore += 0.3;
      indicators.push('movement_without_interaction');
    }
    
    // High clicks but almost no movement (auto-clicker)
    if (recentClicks > 20 && recentMoves < 5) {
      suspicionScore += 0.3;
      indicators.push('clicks_without_movement');
    }
    
    // High keystrokes but no mouse activity at all (keyboard macro)
    if (recentKeys > 100 && recentMoves === 0 && recentClicks === 0) {
      suspicionScore += 0.25;
      indicators.push('typing_without_mouse');
    }
    
    // Extremely high activity across all metrics (automation)
    if (recentMoves > 200 && recentClicks > 50 && recentKeys > 200) {
      suspicionScore += 0.25;
      indicators.push('inhuman_activity_volume');
    }
    
    const suspicious = suspicionScore >= 0.3;
    
    return {
      suspicious,
      confidence: Math.min(suspicionScore, 1.0),
      riskScore: Math.round(suspicionScore * 100),
      detectionType: 'cross_reference_anomaly',
      indicators,
      metrics: {
        recentMoves,
        recentClicks,
        recentKeys,
        timeWindow: '1 minute'
      }
    };
  }

  detectMouseJiggling() {
    if (this.recentMouseMoves.length < 15) return { suspicious: false };
    
    const moves = this.recentMouseMoves.slice(-50); // Analyze more data
    const distances = [];
    const directions = [];
    const xDeltas = [];
    const yDeltas = [];
    
    for (let i = 1; i < moves.length; i++) {
      const prev = moves[i - 1];
      const curr = moves[i];
      
      const dx = curr.x - prev.x;
      const dy = curr.y - prev.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      distances.push(distance);
      xDeltas.push(dx);
      yDeltas.push(dy);
      
      const direction = Math.atan2(dy, dx);
      directions.push(direction);
    }
    
    // Calculate time intervals
    const timeIntervals = moves.map((move, i) => i > 0 ? move.timestamp - moves[i-1].timestamp : 0).slice(1);
    
    // === DETECTION METRICS ===
    
    // 1. Average and total distance
    const avgDistance = distances.reduce((a, b) => a + b, 0) / distances.length;
    const totalDistance = distances.reduce((a, b) => a + b, 0);
    const smallMovements = distances.filter(d => d < 15).length;
    
    // 2. Direction variance (low = repetitive pattern)
    const directionVariance = this.calculateVariance(directions);
    
    // 3. Timing consistency (low variance = robotic)
    const avgInterval = timeIntervals.reduce((a, b) => a + b, 0) / timeIntervals.length;
    const intervalVariance = this.calculateVariance(timeIntervals);
    const intervalCoeffVar = avgInterval > 0 ? Math.sqrt(intervalVariance) / avgInterval : 0;
    
    // 4. Oscillation detection (back-and-forth pattern)
    let directionReversals = 0;
    for (let i = 1; i < directions.length; i++) {
      const angleDiff = Math.abs(directions[i] - directions[i-1]);
      // Check for ~180 degree reversals (back-and-forth)
      if (angleDiff > 2.5 && angleDiff < 3.8) { // ~143-218 degrees
        directionReversals++;
      }
    }
    const oscillationRatio = directionReversals / Math.max(directions.length - 1, 1);
    
    // 5. Single-axis movement detection (hardware jigglers often move only X or Y)
    const avgAbsX = xDeltas.reduce((a, b) => a + Math.abs(b), 0) / xDeltas.length;
    const avgAbsY = yDeltas.reduce((a, b) => a + Math.abs(b), 0) / yDeltas.length;
    const axisRatio = Math.max(avgAbsX, avgAbsY) / (Math.min(avgAbsX, avgAbsY) + 0.1);
    const isSingleAxis = axisRatio > 10; // Movement primarily on one axis
    
    // 6. Position entropy (unique positions visited)
    const positionSet = new Set(moves.map(m => `${Math.round(m.x/5)},${Math.round(m.y/5)}`));
    const uniquePositions = positionSet.size;
    const positionEntropy = uniquePositions / moves.length;
    
    // 7. Movement entropy (randomness of movement patterns)
    const movementEntropy = this.calculateShannonEntropy(
      distances.map(d => Math.round(d / 5)) // Bucket distances
    );
    
    // 8. Circular pattern detection
    const isCircular = this.detectCircularPattern(moves);
    
    // === SCORING ===
    let suspicionScore = 0;
    const indicators = [];
    
    // Small movements indicator
    if (avgDistance < 15) {
      suspicionScore += 0.15;
      indicators.push('tiny_movements');
    }
    
    // Many small movements
    if (smallMovements / distances.length > 0.8) {
      suspicionScore += 0.15;
      indicators.push('mostly_small_moves');
    }
    
    // Low direction variance (repetitive)
    if (directionVariance < 0.3) {
      suspicionScore += 0.15;
      indicators.push('repetitive_direction');
    }
    
    // Robotic timing (very low variance)
    if (intervalCoeffVar < 0.15 && timeIntervals.length > 10) {
      suspicionScore += 0.20;
      indicators.push('robotic_timing');
    }
    
    // High oscillation (back-and-forth)
    if (oscillationRatio > 0.6) {
      suspicionScore += 0.20;
      indicators.push('oscillating_pattern');
    }
    
    // Single-axis movement (hardware jiggler signature)
    if (isSingleAxis && avgDistance < 30) {
      suspicionScore += 0.25;
      indicators.push('single_axis_movement');
    }
    
    // Low position entropy (stays in small area)
    if (positionEntropy < 0.3 && moves.length > 20) {
      suspicionScore += 0.15;
      indicators.push('low_position_variety');
    }
    
    // Low movement entropy (predictable)
    if (movementEntropy < 2.0) {
      suspicionScore += 0.10;
      indicators.push('low_movement_entropy');
    }
    
    // Circular pattern detected
    if (isCircular) {
      suspicionScore += 0.20;
      indicators.push('circular_pattern');
    }
    
    // Sustained pattern (many events with consistent suspicious pattern)
    if (moves.length > 30 && suspicionScore > 0.3) {
      suspicionScore += 0.10;
      indicators.push('sustained_pattern');
    }
    
    const suspicious = suspicionScore >= 0.5;
    
    return {
      suspicious,
      confidence: Math.min(suspicionScore, 1.0),
      riskScore: Math.round(suspicionScore * 100),
      detectionType: suspicious ? (isSingleAxis ? 'hardware_jiggler' : 'software_jiggler') : null,
      indicators,
      metrics: {
        avgDistance: Math.round(avgDistance * 100) / 100,
        totalDistance: Math.round(totalDistance),
        smallMovementRatio: Math.round((smallMovements / distances.length) * 100) / 100,
        directionVariance: Math.round(directionVariance * 1000) / 1000,
        intervalVariance: Math.round(intervalVariance),
        intervalCoeffVar: Math.round(intervalCoeffVar * 1000) / 1000,
        oscillationRatio: Math.round(oscillationRatio * 100) / 100,
        axisRatio: Math.round(axisRatio * 100) / 100,
        positionEntropy: Math.round(positionEntropy * 100) / 100,
        movementEntropy: Math.round(movementEntropy * 100) / 100,
        uniquePositions,
        isCircular,
        isSingleAxis,
        samplesAnalyzed: moves.length
      }
    };
  }
  
  // Detect circular movement patterns (common in jigglers)
  detectCircularPattern(moves) {
    if (moves.length < 20) return false;
    
    // Calculate centroid
    const centroidX = moves.reduce((sum, m) => sum + m.x, 0) / moves.length;
    const centroidY = moves.reduce((sum, m) => sum + m.y, 0) / moves.length;
    
    // Calculate distances from centroid
    const radii = moves.map(m => 
      Math.sqrt(Math.pow(m.x - centroidX, 2) + Math.pow(m.y - centroidY, 2))
    );
    
    const avgRadius = radii.reduce((a, b) => a + b, 0) / radii.length;
    const radiusVariance = this.calculateVariance(radii);
    
    // Circular pattern: consistent radius from center, small radius (micro-circles)
    return avgRadius < 30 && radiusVariance < 50 && avgRadius > 3;
  }
  
  // Calculate Shannon entropy for pattern randomness
  calculateShannonEntropy(values) {
    if (values.length === 0) return 0;
    
    const counts = {};
    values.forEach(v => { counts[v] = (counts[v] || 0) + 1; });
    
    const total = values.length;
    let entropy = 0;
    
    Object.values(counts).forEach(count => {
      const p = count / total;
      if (p > 0) {
        entropy -= p * Math.log2(p);
      }
    });
    
    return entropy;
  }

  detectKeyboardPatterns() {
    if (this.recentKeyPresses.length < 10) return { suspicious: false };
    
    const keys = this.recentKeyPresses.slice(-100); // Analyze more data
    const keySequences = keys.map(k => k.key || k.code || 'unknown').filter(Boolean);
    const timeIntervals = keys.map((key, i) => i > 0 ? key.timestamp - keys[i-1].timestamp : 0).slice(1);
    
    // === METRICS ===
    
    // 1. Key diversity
    const uniqueKeys = new Set(keySequences.map(k => k.toLowerCase()));
    const keyDiversity = uniqueKeys.size;
    
    // Determine if we have real key identity data.
    // On macOS the Python input monitor only reports that a key was pressed,
    // not which key — so every entry comes through as "unknown".
    // When all keys are "unknown" we cannot evaluate diversity, spam, or
    // sequence patterns, so we must skip those checks to avoid false positives.
    const hasKeyIdentity = !(keyDiversity === 1 && uniqueKeys.has('unknown'));
    
    // 2. Timing analysis
    const avgInterval = timeIntervals.length > 0 ? 
      timeIntervals.reduce((a, b) => a + b, 0) / timeIntervals.length : 0;
    const intervalVariance = this.calculateVariance(timeIntervals);
    const intervalCoeffVar = avgInterval > 0 ? Math.sqrt(intervalVariance) / avgInterval : 0;
    
    // 3. Modifier key spam detection
    const modifierKeys = ['shift', 'ctrl', 'control', 'alt', 'meta', 'command', 'option'];
    const modifierCount = keySequences.filter(key => 
      modifierKeys.some(mod => key.toLowerCase().includes(mod))
    ).length;
    const modifierRatio = modifierCount / keySequences.length;
    
    // 4. Single key spam detection
    // Only compute when we have real key identity data.
    // When all keys are "unknown" (e.g., macOS), singleKeySpamRatio would be 1.0,
    // causing false-positive fake_typing alerts.
    let singleKeySpamRatio = 0;
    let mostSpammedKey = null;
    if (hasKeyIdentity) {
      const keyCounts = {};
      keySequences.forEach(k => { keyCounts[k.toLowerCase()] = (keyCounts[k.toLowerCase()] || 0) + 1; });
      const maxKeyCount = Math.max(...Object.values(keyCounts));
      singleKeySpamRatio = maxKeyCount / keySequences.length;
      mostSpammedKey = Object.keys(keyCounts).find(k => keyCounts[k] === maxKeyCount);
    }
    
    // 5. Typing speed (WPM equivalent)
    const timeSpanMs = keys.length > 1 ? 
      keys[keys.length - 1].timestamp - keys[0].timestamp : 0;
    const wpmEquivalent = timeSpanMs > 0 ? (keySequences.length / 5) / (timeSpanMs / 60000) : 0;
    
    // 6. Repeating sequence detection (only meaningful with real key data)
    const hasRepeatingSequence = hasKeyIdentity ? this.detectRepeatingKeySequence(keySequences) : false;
    
    // 7. Natural typing rhythm check (humans have variable pauses)
    const hasNaturalPauses = timeIntervals.some(interval => interval > 500); // Some longer pauses
    const hasVariableRhythm = intervalCoeffVar > 0.3;
    
    // === SCORING ===
    let suspicionScore = 0;
    const indicators = [];
    
    // Key-identity-based checks — only run when we have real key data
    if (hasKeyIdentity) {
      // Very low key diversity (1-2 keys)
      if (keyDiversity <= 2 && keySequences.length > 20) {
        suspicionScore += 0.25;
        indicators.push('extremely_low_diversity');
      } else if (keyDiversity <= 4 && keySequences.length > 30) {
        suspicionScore += 0.15;
        indicators.push('low_key_diversity');
      }
      
      // Single key spam (same key repeatedly)
      if (singleKeySpamRatio > 0.8 && keySequences.length > 15) {
        suspicionScore += 0.25;
        indicators.push(`single_key_spam_${mostSpammedKey}`);
      } else if (singleKeySpamRatio > 0.5) {
        suspicionScore += 0.10;
        indicators.push('repetitive_key');
      }
      
      // Repeating sequence detected
      if (hasRepeatingSequence) {
        suspicionScore += 0.15;
        indicators.push('repeating_sequence');
      }
      
      // Modifier key spam
      if (modifierRatio > 0.8) {
        suspicionScore += 0.25;
        indicators.push('modifier_key_spam');
      } else if (modifierRatio > 0.5) {
        suspicionScore += 0.10;
        indicators.push('high_modifier_usage');
      }
    }
    
    // Timing-based checks — always valid regardless of key identity
    
    // Robotic timing (very consistent intervals)
    if (intervalCoeffVar < 0.1 && timeIntervals.length > 15) {
      suspicionScore += 0.25;
      indicators.push('robotic_typing_rhythm');
    } else if (intervalCoeffVar < 0.2 && timeIntervals.length > 20) {
      suspicionScore += 0.15;
      indicators.push('consistent_timing');
    }
    
    // Inhuman typing speed (>200 WPM sustained)
    if (wpmEquivalent > 200 && keySequences.length > 30) {
      suspicionScore += 0.20;
      indicators.push('inhuman_typing_speed');
    }
    
    // No natural pauses (humans pause occasionally)
    if (!hasNaturalPauses && keySequences.length > 30) {
      suspicionScore += 0.10;
      indicators.push('no_natural_pauses');
    }
    
    const suspicious = suspicionScore >= 0.4;
    
    return {
      suspicious,
      confidence: Math.min(suspicionScore, 1.0),
      riskScore: Math.round(suspicionScore * 100),
      detectionType: suspicious ? 'fake_typing' : null,
      indicators,
      metrics: {
        hasKeyIdentity,
        keyDiversity,
        avgInterval: Math.round(avgInterval),
        intervalVariance: Math.round(intervalVariance),
        intervalCoeffVar: Math.round(intervalCoeffVar * 1000) / 1000,
        modifierRatio: Math.round(modifierRatio * 100) / 100,
        singleKeySpamRatio: Math.round(singleKeySpamRatio * 100) / 100,
        mostSpammedKey,
        wpmEquivalent: Math.round(wpmEquivalent),
        hasNaturalPauses,
        hasRepeatingSequence,
        samplesAnalyzed: keySequences.length
      }
    };
  }
  
  // Detect repeating key sequences (e.g., "abcabc" or "spacespacespacespace")
  detectRepeatingKeySequence(keySequences) {
    if (keySequences.length < 10) return false;
    
    // Check for sequences of length 1-4 that repeat
    for (let seqLen = 1; seqLen <= 4; seqLen++) {
      if (keySequences.length < seqLen * 4) continue;
      
      const pattern = keySequences.slice(0, seqLen).join(',');
      let matches = 0;
      
      for (let i = 0; i < keySequences.length - seqLen; i += seqLen) {
        const current = keySequences.slice(i, i + seqLen).join(',');
        if (current === pattern) matches++;
      }
      
      const repeatRatio = (matches * seqLen) / keySequences.length;
      if (repeatRatio > 0.7) return true;
    }
    
    return false;
  }

  detectClickPatterns() {
    if (this.mouseClickTimestamps.length < 5) return { suspicious: false };
    
    const clicks = this.mouseClickTimestamps.slice(-50); // Analyze more clicks
    const positions = this.mouseClickPositions.slice(-50);
    const intervals = clicks.map((click, i) => i > 0 ? click - clicks[i-1] : 0).slice(1);
    
    if (intervals.length < 3) return { suspicious: false };
    
    // === METRICS ===
    
    // 1. Timing analysis
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const intervalVariance = this.calculateVariance(intervals);
    const intervalCoeffVar = avgInterval > 0 ? Math.sqrt(intervalVariance) / avgInterval : 0;
    
    // 2. Click rate (clicks per minute)
    const timeSpan = clicks[clicks.length - 1] - clicks[0];
    const clicksPerMinute = timeSpan > 0 ? (clicks.length / (timeSpan / 60000)) : 0;
    
    // 3. Position clustering (clicks in same spot)
    let samePositionClicks = 0;
    if (positions.length > 1) {
      for (let i = 1; i < positions.length; i++) {
        const dx = Math.abs(positions[i].x - positions[i-1].x);
        const dy = Math.abs(positions[i].y - positions[i-1].y);
        if (dx < 10 && dy < 10) { // Within 10 pixels
          samePositionClicks++;
        }
      }
    }
    const positionClusterRatio = positions.length > 1 ? 
      samePositionClicks / (positions.length - 1) : 0;
    
    // 4. Clicks without movement (click then immediately click again)
    const recentMoves = this.recentMouseMoves.slice(-50);
    let clicksWithoutMovement = 0;
    clicks.forEach(clickTime => {
      const movesNearClick = recentMoves.filter(m => 
        Math.abs(m.timestamp - clickTime) < 500 // Within 500ms of click
      );
      if (movesNearClick.length < 2) {
        clicksWithoutMovement++;
      }
    });
    const clicksWithoutMovementRatio = clicksWithoutMovement / clicks.length;
    
    // 5. Perfect interval detection (exactly same interval repeatedly)
    const roundedIntervals = intervals.map(i => Math.round(i / 50) * 50); // Round to 50ms
    const uniqueIntervals = new Set(roundedIntervals).size;
    const intervalUniformity = 1 - (uniqueIntervals / roundedIntervals.length);
    
    // === SCORING ===
    let suspicionScore = 0;
    const indicators = [];
    
    // Robotic timing (very low variance)
    if (intervalCoeffVar < 0.05 && intervals.length > 10) {
      suspicionScore += 0.30;
      indicators.push('perfectly_timed_clicks');
    } else if (intervalCoeffVar < 0.15 && intervals.length > 15) {
      suspicionScore += 0.20;
      indicators.push('robotic_click_timing');
    }
    
    // Very high click rate (inhuman)
    if (clicksPerMinute > 120) {
      suspicionScore += 0.25;
      indicators.push('inhuman_click_rate');
    } else if (clicksPerMinute > 60) {
      suspicionScore += 0.10;
      indicators.push('high_click_rate');
    }
    
    // Position clustering (clicking same spot)
    if (positionClusterRatio > 0.8 && positions.length > 10) {
      suspicionScore += 0.25;
      indicators.push('same_position_clicks');
    } else if (positionClusterRatio > 0.5) {
      suspicionScore += 0.10;
      indicators.push('clustered_clicks');
    }
    
    // Clicks without mouse movement
    if (clicksWithoutMovementRatio > 0.8 && clicks.length > 10) {
      suspicionScore += 0.20;
      indicators.push('clicks_without_movement');
    }
    
    // Perfect interval uniformity
    if (intervalUniformity > 0.9 && intervals.length > 15) {
      suspicionScore += 0.15;
      indicators.push('uniform_intervals');
    }
    
    // Sustained pattern
    if (clicks.length > 30 && suspicionScore > 0.2) {
      suspicionScore += 0.10;
      indicators.push('sustained_pattern');
    }
    
    const suspicious = suspicionScore >= 0.4;
    
    return {
      suspicious,
      confidence: Math.min(suspicionScore, 1.0),
      riskScore: Math.round(suspicionScore * 100),
      detectionType: suspicious ? 'auto_clicker' : null,
      indicators,
      metrics: {
        avgInterval: Math.round(avgInterval),
        intervalVariance: Math.round(intervalVariance),
        intervalCoeffVar: Math.round(intervalCoeffVar * 1000) / 1000,
        clicksPerMinute: Math.round(clicksPerMinute),
        positionClusterRatio: Math.round(positionClusterRatio * 100) / 100,
        clicksWithoutMovementRatio: Math.round(clicksWithoutMovementRatio * 100) / 100,
        intervalUniformity: Math.round(intervalUniformity * 100) / 100,
        uniqueIntervals,
      clickCount: clicks.length,
        samplesAnalyzed: intervals.length
      }
    };
  }

  detectScreenshotEvasion() {
    if (!this.lastScreenshotActivity) return { suspicious: false };
    
    const now = Date.now();
    const timeSinceScreenshot = now - this.lastScreenshotActivity;
    
    // Check for activity that coincides with screenshot timing
    const recentActivity = this.activityHistory.filter(activity => 
      Math.abs(activity.timestamp - this.lastScreenshotActivity) < 5000 // Within 5 seconds
    );
    
    const activityDuringScreenshot = recentActivity.length;
    const suspicious = activityDuringScreenshot > 10; // Too much activity during screenshot
    
    return {
      suspicious,
      activityDuringScreenshot,
      timeSinceScreenshot,
      confidence: suspicious ? 0.8 : 0
    };
  }
  
  // ==========================================
  // PROCESS SCANNER - Detect Jiggler Software
  // ==========================================
  
  async scanForJigglerProcesses() {
    if (this.isProcessScanning) return this.lastProcessScanResult;
    
    // Rate limit: only scan every 60 seconds max
    const now = Date.now();
    if (now - this.lastProcessScanTime < 60000 && this.lastProcessScanResult) {
      return this.lastProcessScanResult;
    }
    
    this.isProcessScanning = true;
    
    try {
      const platform = os.platform();
      let processes = [];
      
      if (platform === 'win32') {
        processes = await this.getWindowsProcesses();
      } else if (platform === 'darwin') {
        processes = await this.getMacProcesses();
      } else {
        // Linux - basic ps command
        processes = await this.getLinuxProcesses();
      }
      
      // Check against known jiggler process names
      const platformJigglers = this.JIGGLER_PROCESSES[platform === 'win32' ? 'windows' : 'darwin'] || [];
      const detectedJigglers = [];
      
      processes.forEach(proc => {
        const procLower = proc.toLowerCase();
        const matchedJiggler = platformJigglers.find(jiggler => 
          procLower.includes(jiggler.toLowerCase())
        );
        if (matchedJiggler) {
          detectedJigglers.push({
            processName: proc,
            matchedPattern: matchedJiggler,
            platform
          });
        }
      });
      
      const result = {
        suspicious: detectedJigglers.length > 0,
        confidence: detectedJigglers.length > 0 ? 0.95 : 0,
        riskScore: detectedJigglers.length > 0 ? 95 : 0,
        detectionType: 'suspicious_process',
        detectedProcesses: detectedJigglers,
        totalProcessesScanned: processes.length,
        timestamp: now
      };
      
      // If jiggler detected, create alert
      if (result.suspicious) {
        console.log('🚨 JIGGLER SOFTWARE DETECTED:', detectedJigglers);
        this.logSuspiciousActivities([{
          type: 'suspicious_process',
          severity: 'CRITICAL',
          details: result,
          timestamp: now
        }]);
      }
      
      this.lastProcessScanResult = result;
      this.lastProcessScanTime = now;
      
      return result;
      
    } catch (error) {
      console.log('⚠️ Process scan error:', error.message);
      return { suspicious: false, error: error.message };
    } finally {
      this.isProcessScanning = false;
    }
  }
  
  getWindowsProcesses() {
    return new Promise((resolve) => {
      try {
        // Use tasklist which is faster than PowerShell
        exec('tasklist /FO CSV /NH', { timeout: 5000 }, (error, stdout) => {
          if (error) {
            resolve([]);
            return;
          }
          const processes = stdout.split('\n')
            .map(line => {
              const match = line.match(/"([^"]+)"/);
              return match ? match[1] : null;
            })
            .filter(Boolean);
          resolve(processes);
        });
      } catch (e) {
        resolve([]);
      }
    });
  }
  
  getMacProcesses() {
    return new Promise((resolve) => {
      try {
        exec('ps -eo comm', { timeout: 5000 }, (error, stdout) => {
          if (error) {
            resolve([]);
            return;
          }
          const processes = stdout.split('\n')
            .map(line => line.trim())
            .filter(Boolean);
          resolve(processes);
        });
      } catch (e) {
        resolve([]);
      }
    });
  }
  
  getLinuxProcesses() {
    return new Promise((resolve) => {
      try {
        exec('ps -eo comm', { timeout: 5000 }, (error, stdout) => {
          if (error) {
            resolve([]);
            return;
          }
          const processes = stdout.split('\n')
            .map(line => line.trim())
            .filter(Boolean);
          resolve(processes);
        });
      } catch (e) {
        resolve([]);
      }
    });
  }
  
  // ==========================================
  // USB SCANNER - Detect Hardware Jigglers
  // ==========================================
  
  async scanForJigglerUSBDevices() {
    if (this.isUSBScanning) return this.lastUSBScanResult;
    
    // Rate limit: only scan every 5 minutes max
    const now = Date.now();
    if (now - this.lastUSBScanTime < 300000 && this.lastUSBScanResult) {
      return this.lastUSBScanResult;
    }
    
    this.isUSBScanning = true;
    
    try {
      const platform = os.platform();
      let usbDevices = [];
      
      if (platform === 'win32') {
        usbDevices = await this.getWindowsUSBDevices();
      } else if (platform === 'darwin') {
        usbDevices = await this.getMacUSBDevices();
      }
      
      // Check against known jiggler USB signatures
      const detectedJigglers = [];
      
      usbDevices.forEach(device => {
        const deviceLower = device.toLowerCase();
        const matchedSignature = this.JIGGLER_USB_SIGNATURES.find(sig => 
          deviceLower.includes(sig.toLowerCase())
        );
        if (matchedSignature) {
          detectedJigglers.push({
            deviceName: device,
            matchedSignature,
            platform
          });
        }
        
        // Also check for suspicious patterns in device names
        const suspiciousPatterns = ['hid', 'mouse', 'jiggle', 'emulator', 'simulator'];
        const matchCount = suspiciousPatterns.filter(p => deviceLower.includes(p)).length;
        if (matchCount >= 2 && !detectedJigglers.find(d => d.deviceName === device)) {
          detectedJigglers.push({
            deviceName: device,
            matchedSignature: 'multiple_hid_keywords',
            platform
          });
        }
      });
      
      // Check for multiple mouse HID devices (potential jiggler)
      const mouseDevices = usbDevices.filter(d => 
        d.toLowerCase().includes('mouse') || d.toLowerCase().includes('pointing')
      );
      const hasMultipleMice = mouseDevices.length > 1;
      
      const result = {
        suspicious: detectedJigglers.length > 0,
        confidence: detectedJigglers.length > 0 ? 0.85 : 0,
        riskScore: detectedJigglers.length > 0 ? 85 : 0,
        detectionType: 'hardware_jiggler',
        detectedDevices: detectedJigglers,
        hasMultipleMice,
        mouseDeviceCount: mouseDevices.length,
        totalDevicesScanned: usbDevices.length,
        timestamp: now
      };
      
      // If jiggler detected, create alert
      if (result.suspicious) {
        console.log('🚨 HARDWARE JIGGLER DETECTED:', detectedJigglers);
        this.logSuspiciousActivities([{
          type: 'hardware_jiggler',
          severity: 'CRITICAL',
          details: result,
          timestamp: now
        }]);
      }
      
      this.lastUSBScanResult = result;
      this.lastUSBScanTime = now;
      
      return result;
      
    } catch (error) {
      console.log('⚠️ USB scan error:', error.message);
      return { suspicious: false, error: error.message };
    } finally {
      this.isUSBScanning = false;
    }
  }
  
  getWindowsUSBDevices() {
    return new Promise((resolve) => {
      try {
        // WINDOWS 11 FIX: wmic is deprecated, use PowerShell directly as primary method
        const psCmd = 'powershell -Command "Get-PnpDevice -Class USB | Select-Object FriendlyName,InstanceId | Format-List"';
        exec(psCmd, { timeout: 10000 }, (error, stdout) => {
          if (error) {
            // Fallback to wmic for older Windows versions
            const cmd = 'wmic path Win32_USBControllerDevice get Dependent /format:list';
            exec(cmd, { timeout: 10000 }, (err2, stdout2) => {
              if (err2) {
                // Both methods failed
                console.warn('⚠️ [ANTI-CHEAT] Both PowerShell and wmic USB detection failed - USB scanning disabled');
                resolve([]);
                return;
              }
              const devices = stdout2.split('\n')
                .map(line => line.replace('Dependent=', '').trim())
                .filter(Boolean);
              resolve(devices);
            });
            return;
          }
          const devices = stdout.split('\n')
            .map(line => line.replace('FriendlyName :', '').replace('FriendlyName:', '').trim())
            .filter(line => line && !line.startsWith('InstanceId'));
          resolve(devices);
        });
      } catch (e) {
        resolve([]);
      }
    });
  }
  
  getMacUSBDevices() {
    return new Promise((resolve) => {
      try {
        exec('system_profiler SPUSBDataType 2>/dev/null | grep -E "Product ID|Vendor ID|[A-Za-z]:"', 
          { timeout: 10000 }, (error, stdout) => {
          if (error) {
            resolve([]);
            return;
          }
          const devices = stdout.split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.includes('ID:'));
          resolve(devices);
        });
      } catch (e) {
        resolve([]);
      }
    });
  }
  
  // ==========================================
  // TIMING ANOMALY DETECTION
  // ==========================================
  
  detectTimingAnomalies() {
    // Detect if activity only happens around screenshot times
    if (this.screenshotTimestamps.length < 3 || this.activityHistory.length < 20) {
      return { suspicious: false };
    }
    
    const screenshotTimes = this.screenshotTimestamps.slice(-10);
    const activities = this.activityHistory.slice(-200);
    
    // Count activities near screenshot times (within 30 seconds before)
    let activitiesNearScreenshots = 0;
    let activitiesFarFromScreenshots = 0;
    
    activities.forEach(activity => {
      const nearScreenshot = screenshotTimes.some(st => {
        const timeDiff = st - activity.timestamp;
        return timeDiff > 0 && timeDiff < 30000; // Activity 0-30 seconds before screenshot
      });
      
      if (nearScreenshot) {
        activitiesNearScreenshots++;
      } else {
        activitiesFarFromScreenshots++;
      }
    });
    
    const nearScreenshotRatio = activitiesNearScreenshots / activities.length;
    
    // If most activity happens right before screenshots, that's gaming the system
    const suspicious = nearScreenshotRatio > 0.7 && activities.length > 50;
    
    return {
      suspicious,
      confidence: suspicious ? 0.75 : 0,
      riskScore: suspicious ? 75 : 0,
      detectionType: 'timing_anomaly',
      indicators: suspicious ? ['screenshot_window_gaming'] : [],
      metrics: {
        activitiesNearScreenshots,
        activitiesFarFromScreenshots,
        nearScreenshotRatio: Math.round(nearScreenshotRatio * 100) / 100,
        screenshotsAnalyzed: screenshotTimes.length,
        activitiesAnalyzed: activities.length
      }
    };
  }
  
  // Record screenshot timestamp for timing analysis
  recordScreenshotTimestamp(timestamp = Date.now()) {
    this.screenshotTimestamps.push(timestamp);
    // Keep only last 20 screenshot timestamps
    if (this.screenshotTimestamps.length > 20) {
      this.screenshotTimestamps = this.screenshotTimestamps.slice(-20);
    }
  }

  // Add missing analyzeScreenshotTiming method
  analyzeScreenshotTiming() {
    return this.detectScreenshotEvasion();
  }
  
  // Add missing analyzeScreenshot method
  async analyzeScreenshot(imageBuffer, context = {}) {
    try {
      const analysis = {
        suspicious: false,
        confidence: 0,
        details: {},
        timestamp: Date.now()
      };
      
      // Record screenshot activity
      this.recordActivity('screenshot', { timestamp: Date.now() });
      
      // Analyze activity patterns during screenshot capture
      const screenshotEvasion = this.detectScreenshotEvasion();
      if (screenshotEvasion.suspicious) {
        analysis.suspicious = true;
        analysis.confidence = Math.max(analysis.confidence, screenshotEvasion.confidence);
        analysis.details.screenshotEvasion = screenshotEvasion;
      }
      
      // Analyze current activity levels
      const currentActivityLevel = this.calculateActivityLevel();
      const recentPatterns = this.analyzeActivity();
      
      if (recentPatterns && Array.isArray(recentPatterns) && recentPatterns.length > 0) {
        analysis.suspicious = true;
        analysis.confidence = Math.max(analysis.confidence, 0.7);
        analysis.details.suspiciousPatterns = recentPatterns;
      }
      
      // Factor in context from screenshot capture
      if (context.activityPercent !== undefined && context.focusPercent !== undefined) {
        // Very low activity with very high focus might be suspicious
        if (context.activityPercent < 10 && context.focusPercent > 95) {
          analysis.suspicious = true;
          analysis.confidence = Math.max(analysis.confidence, 0.5);
          analysis.details.staticActivity = {
            activityPercent: context.activityPercent,
            focusPercent: context.focusPercent
          };
        }
        
        // Extremely high activity might indicate automation
        if (context.activityPercent > 90 && (context.mouseClicks > 100 || context.keystrokes > 200)) {
          analysis.suspicious = true;
          analysis.confidence = Math.max(analysis.confidence, 0.6);
          analysis.details.excessiveActivity = {
            activityPercent: context.activityPercent,
            mouseClicks: context.mouseClicks,
            keystrokes: context.keystrokes
          };
        }
      }
      
      return analysis;
      
    } catch (error) {
      console.log('⚠️ Screenshot analysis failed:', error.message);
      return {
        suspicious: false,
        confidence: 0,
        error: error.message
      };
    }
  }

  performDeepAnalysis() {
    console.log('🔍 Performing deep anti-cheat analysis...');
    
    const analysis = {
      timestamp: Date.now(),
      totalSuspiciousEvents: this.suspiciousPatterns.length,
      recentActivityLevel: this.calculateActivityLevel(),
      behaviorProfile: this.generateBehaviorProfile(),
      riskScore: 0
    };
    
    // Calculate overall risk score
    analysis.riskScore = this.calculateRiskScore(analysis);
    
    if (analysis.riskScore > 0.7) {
      console.log('🚨 HIGH RISK: Potential fraudulent activity detected!');
      this.triggerHighRiskAlert(analysis);
    } else if (analysis.riskScore > 0.4) {
      console.log('⚠️  MEDIUM RISK: Suspicious patterns detected');
    }
    
    return analysis;
  }

  calculateActivityLevel() {
    const now = Date.now();
    const lastHour = now - 60 * 60 * 1000;
    
    const recentActivity = this.activityHistory.filter(activity => activity.timestamp > lastHour);
    
    return {
      mouseMovements: recentActivity.filter(a => a.type === 'mouse_move').length,
      mouseClicks: recentActivity.filter(a => a.type === 'mouse_click').length,
      keystrokes: recentActivity.filter(a => a.type === 'keyboard').length,
      totalEvents: recentActivity.length
    };
  }

  generateBehaviorProfile() {
    const mouseData = this.mousePositions.slice(-100);
    const keyData = this.keystrokes.slice(-100);
    
    return {
      mousePatterns: {
        avgSpeed: this.calculateAverageMouseSpeed(mouseData),
        movementVariance: this.calculateMouseMovementVariance(mouseData),
        clickFrequency: this.mouseClickTimestamps.length
      },
      keyboardPatterns: {
        typingSpeed: this.calculateTypingSpeed(keyData),
        keyDiversity: new Set(keyData.map(k => k.key)).size,
        typingRhythm: this.calculateTypingRhythm(keyData)
      }
    };
  }

  calculateRiskScore(analysis) {
    let score = 0;
    
    // Factor in suspicious events (reduced sensitivity)
    score += Math.min(analysis.totalSuspiciousEvents * 0.05, 0.3); // Reduced from 0.1 and 0.5
    
    // Factor in activity patterns (more lenient thresholds)
    const activityLevel = analysis.recentActivityLevel;
    if (activityLevel.totalEvents < 5) score += 0.15; // Reduced from 10 events and 0.3 penalty
    if (activityLevel.totalEvents > 2000) score += 0.1; // Increased threshold from 1000
    
    // Factor in behavior profile (more lenient)
    const behavior = analysis.behaviorProfile;
    if (behavior.mousePatterns.movementVariance < 0.05) score += 0.1; // Reduced from 0.1 and 0.2
    if (behavior.keyboardPatterns.keyDiversity < 3) score += 0.15; // Reduced from 5 keys and 0.3
    
    // CRITICAL FIX: Cap maximum risk score to prevent constant HIGH alerts
    const maxAllowedScore = 0.6; // Never exceed 60% risk for normal operation
    
    return Math.min(score, maxAllowedScore);
  }

  triggerHighRiskAlert(analysis) {
    const alert = {
      type: 'HIGH_RISK_FRAUD_DETECTION',
      timestamp: Date.now(),
      userId: this.config.user_id,
      riskScore: analysis.riskScore,
      confidence: analysis.confidence || 0,
      details: analysis,
      suspiciousPatterns: this.suspiciousPatterns.slice(-10), // Last 10 patterns
      severity: analysis.riskScore > 0.7 ? 'CRITICAL' : 'HIGH',
      behaviorAnalysis: analysis.behaviorProfile,
      activityContext: {
        totalEvents: this.activityHistory.length,
        recentMouseMoves: this.recentMouseMoves.length,
        recentKeyPresses: this.recentKeyPresses.length,
        mouseClickCount: this.mouseClickTimestamps.length
      },
      systemContext: {
        isMonitoring: this.isMonitoring,
        patternWindow: this.PATTERN_WINDOW,
        detectionThreshold: this.REPETITIVE_THRESHOLD
      }
    };
    
    // Log for debugging
    console.log('🚨🚨🚨 FRAUD ALERT:', JSON.stringify(alert, null, 2));
    
    // Send to monitoring service via sync manager
    if (this.syncManager) {
      this.syncManager.addFraudAlert(alert);
    } else {
      console.warn('⚠️ Sync manager not available - fraud alert not transmitted');
    }
  }

  logSuspiciousActivities(activities) {
    activities.forEach(activity => {
      this.suspiciousPatterns.push(activity);
      console.log(`🚨 Suspicious ${activity.type} detected (${activity.severity}):`, activity.details);
      
      // Send high and critical severity activities as fraud alerts
      if (activity.severity === 'HIGH' || activity.severity === 'CRITICAL') {
        const fraudAlert = {
          type: activity.type,
          timestamp: activity.timestamp,
          userId: this.config.user_id,
          riskScore: activity.details.riskScore || 0.5,
          confidence: activity.details.confidence || 0,
          details: activity.details,
          suspiciousPatterns: [activity],
          severity: activity.severity,
          behaviorAnalysis: {},
          activityContext: {
            totalEvents: this.activityHistory.length,
            recentMouseMoves: this.recentMouseMoves.length,
            recentKeyPresses: this.recentKeyPresses.length,
            mouseClickCount: this.mouseClickTimestamps.length
          },
          systemContext: {
            isMonitoring: this.isMonitoring,
            patternWindow: this.PATTERN_WINDOW,
            detectionThreshold: this.REPETITIVE_THRESHOLD
          }
        };
        
        // Send to monitoring service via sync manager (if available)
        if (this.syncManager && typeof this.syncManager.addFraudAlert === 'function') {
          this.syncManager.addFraudAlert(fraudAlert);
        } else {
          // Fallback: just log to console if sync manager doesn't have addFraudAlert
          console.warn('🚨 [ANTI-CHEAT] Fraud alert detected but sync manager not available:', {
            type: fraudAlert.type,
            severity: fraudAlert.severity,
            confidence: fraudAlert.confidence
          });
        }
      }
    });
    
    // Keep only recent patterns
    const cutoff = Date.now() - this.PATTERN_WINDOW;
    this.suspiciousPatterns = this.suspiciousPatterns.filter(pattern => pattern.timestamp > cutoff);
  }

  // Utility functions
  calculateVariance(numbers) {
    if (numbers.length < 2) return 0;
    const mean = numbers.reduce((a, b) => a + b, 0) / numbers.length;
    const squaredDiffs = numbers.map(num => Math.pow(num - mean, 2));
    return squaredDiffs.reduce((a, b) => a + b, 0) / numbers.length;
  }

  calculateConfidence(conditions) {
    const trueConditions = conditions.filter(Boolean).length;
    return trueConditions / conditions.length;
  }

  calculateAverageMouseSpeed(mouseData) {
    if (mouseData.length < 2) return 0;
    
    let totalDistance = 0;
    let totalTime = 0;
    
    for (let i = 1; i < mouseData.length; i++) {
      const prev = mouseData[i - 1];
      const curr = mouseData[i];
      
      const distance = Math.sqrt(Math.pow(curr.x - prev.x, 2) + Math.pow(curr.y - prev.y, 2));
      const time = curr.timestamp - prev.timestamp;
      
      totalDistance += distance;
      totalTime += time;
    }
    
    return totalTime > 0 ? totalDistance / totalTime : 0;
  }

  calculateMouseMovementVariance(mouseData) {
    if (mouseData.length < 3) return 0;
    
    const speeds = [];
    for (let i = 1; i < mouseData.length; i++) {
      const prev = mouseData[i - 1];
      const curr = mouseData[i];
      const distance = Math.sqrt(Math.pow(curr.x - prev.x, 2) + Math.pow(curr.y - prev.y, 2));
      const time = curr.timestamp - prev.timestamp;
      speeds.push(time > 0 ? distance / time : 0);
    }
    
    return this.calculateVariance(speeds);
  }

  calculateTypingSpeed(keyData) {
    if (keyData.length < 2) return 0;
    
    const timeSpan = keyData[keyData.length - 1].timestamp - keyData[0].timestamp;
    return timeSpan > 0 ? (keyData.length / timeSpan) * 60000 : 0; // WPM approximation
  }

  calculateTypingRhythm(keyData) {
    if (keyData.length < 3) return 0;
    
    const intervals = [];
    for (let i = 1; i < keyData.length; i++) {
      intervals.push(keyData[i].timestamp - keyData[i - 1].timestamp);
    }
    
    return this.calculateVariance(intervals);
  }

  cleanupOldData() {
    const cutoff = Date.now() - this.PATTERN_WINDOW;
    
    // AGGRESSIVE MEMORY LEAK PREVENTION
    const MAX_ITEMS = 1000; // Maximum items to keep in memory
    
    this.activityHistory = this.activityHistory
      .filter(activity => activity.timestamp > cutoff)
      .slice(-MAX_ITEMS);
      
    this.mousePositions = this.mousePositions
      .filter(pos => pos.timestamp > cutoff)
      .slice(-MAX_ITEMS);
      
    this.keystrokes = this.keystrokes
      .filter(key => key.timestamp > cutoff)
      .slice(-MAX_ITEMS);
      
    this.suspiciousPatterns = this.suspiciousPatterns
      .filter(pattern => pattern.timestamp > cutoff)
      .slice(-MAX_ITEMS);
    
    // Limit real-time arrays
    this.recentMouseMoves = this.recentMouseMoves.slice(-100);
    this.recentKeyPresses = this.recentKeyPresses.slice(-100);
    this.mouseClickTimestamps = this.mouseClickTimestamps.slice(-100);
    this.mouseClickPositions = this.mouseClickPositions.slice(-100);
    this.keyboardTimestamps = this.keyboardTimestamps.slice(-100);
    this.screenshotTimestamps = this.screenshotTimestamps.slice(-20);
    
    console.log('🧹 Anti-cheat cleanup completed');
  }

  // Generate comprehensive report for debug screen
  generateReport() {
    const now = Date.now();
    const recentPatterns = this.suspiciousPatterns.slice(-10);
    const activityLevel = this.calculateActivityLevel();
    const behaviorProfile = this.generateBehaviorProfile();
    
    return {
      timestamp: now,
      isMonitoring: this.isMonitoring,
      suspicious_activities: recentPatterns,
      patterns: recentPatterns.map(pattern => ({
        type: pattern.type,
        severity: pattern.severity,
        confidence: pattern.details.confidence || 0,
        timestamp: pattern.timestamp
      })),
      overall_confidence: recentPatterns.length > 0 ? 
        Math.max(...recentPatterns.map(p => p.details.confidence || 0)) : 0,
      activity_summary: {
        total_events: this.activityHistory.length,
        recent_events: activityLevel.totalEvents,
        mouse_movements: activityLevel.mouseMovements,
        mouse_clicks: activityLevel.mouseClicks,
        keystrokes: activityLevel.keystrokes
      },
      behavior_analysis: behaviorProfile,
      risk_assessment: {
        level: this.suspiciousPatterns.length > 5 ? 'HIGH' : 
               this.suspiciousPatterns.length > 2 ? 'MEDIUM' : 'LOW',
        score: this.calculateRiskScore({
          totalSuspiciousEvents: this.suspiciousPatterns.length,
          recentActivityLevel: activityLevel,
          behaviorProfile: behaviorProfile
        }),
        details: `${this.suspiciousPatterns.length} suspicious patterns detected in the last ${this.PATTERN_WINDOW / 60000} minutes`
      }
    };
  }

  getDetectionReport() {
    return {
      isMonitoring: this.isMonitoring,
      totalSuspiciousEvents: this.suspiciousPatterns.length,
      recentActivity: this.activityHistory.slice(-20),
      currentRiskLevel: this.suspiciousPatterns.length > 5 ? 'HIGH' : 
                       this.suspiciousPatterns.length > 2 ? 'MEDIUM' : 'LOW'
    };
  }
}

module.exports = AntiCheatDetector; 