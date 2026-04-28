/**
 * Performance Monitor for TimeFlow Desktop Agent
 * 
 * Tracks per-feature performance metrics including:
 * - Screenshot capture/encode/write/upload
 * - URL tracking parse/poll
 * - App enumeration
 * - Sync operations
 * - IPC calls
 * - Event loop lag
 * - Memory usage
 */

const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');

class PerformanceMonitor {
  constructor(options = {}) {
    this.enabled = options.enabled !== false;
    this.logDir = path.join(process.cwd(), 'logs', 'performance');
    this.today = new Date().toISOString().split('T')[0];
    this.metricsFile = path.join(this.logDir, `${this.today}.ndjson`);
    this.reportFile = path.join(this.logDir, `${this.today}-report.json`);
    
    this.metrics = {
      screenshots: { capture: [], encode: [], write: [], upload: [] },
      urlTracking: { poll: [], parse: [] },
      appTracking: { enumerate: [] },
      sync: { enqueue: [], batch: [], post: [] },
      ipc: { calls: [], payloads: [] },
      eventLoop: { lag: [] },
      memory: { rss: [], heap: [] }
    };
    
    this.featureFlags = {
      screenshots: process.env.FEAT_SCREENSHOTS !== '0',
      urlTracking: process.env.FEAT_URLS !== '0',
      appTracking: process.env.FEAT_APPS !== '0',
      sync: process.env.FEAT_SYNC !== '0',
      ipc: process.env.FEAT_IPC !== '0'
    };
    
    this.timers = new Map();
    this.counters = new Map();
    
    this.ensureLogDirectory();
    // PERFORMANCE FIX: Removed startEventLoopMonitoring() - 100ms polling causes battery drain
    // Event loop monitoring is now disabled by default. Enable manually if needed for debugging.

    // Auto-flush reports periodically for live diagnostics
    try {
      const defaultFlushMs = 60 * 1000; // 1 minute
      this.flushIntervalMs = Number(process.env.PERF_FLUSH_MS) || defaultFlushMs;
      this.autoFlushInterval = setInterval(() => {
        try { this.saveReport(); } catch {}
      }, this.flushIntervalMs);
    } catch {}
  }

  ensureLogDirectory() {
    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }
    } catch (error) {
      console.error('[PERF] Failed to create log directory:', error.message);
    }
  }

  // Feature flag checks
  isFeatureEnabled(feature) {
    return this.featureFlags[feature] !== false;
  }

  // Timer management
  startTimer(operation) {
    if (!this.enabled) return null;
    
    const timerId = `${operation}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.timers.set(timerId, {
      operation,
      startTime: performance.now(),
      startHrTime: process.hrtime.bigint()
    });
    
    return timerId;
  }

  endTimer(timerId) {
    if (!this.enabled || !timerId) return;
    
    const timer = this.timers.get(timerId);
    if (!timer) return;
    
    const endTime = performance.now();
    const endHrTime = process.hrtime.bigint();
    
    const duration = endTime - timer.startTime;
    const durationNs = Number(endHrTime - timer.startHrTime);
    
    // Store metric
    this.recordMetric(timer.operation, duration, durationNs);
    
    // Clean up timer
    this.timers.delete(timerId);
    
    return { duration, durationNs };
  }

  // Metric recording
  recordMetric(operation, duration, durationNs) {
    const [feature, phase] = operation.split('.');
    
    if (this.metrics[feature] && this.metrics[feature][phase]) {
      this.metrics[feature][phase].push({
        timestamp: Date.now(),
        duration,
        durationNs,
        operation
      });
      
      // Keep only last 1000 measurements per phase
      if (this.metrics[feature][phase].length > 1000) {
        this.metrics[feature][phase] = this.metrics[feature][phase].slice(-1000);
      }

      // Optional: write each metric to NDJSON for high-fidelity analysis
      try {
        if (process.env.PERF_LOG_EACH === '1') {
          const logEntry = {
            timestamp: Date.now(),
            type: 'metric',
            data: { operation, duration, durationNs }
          };
          fs.appendFileSync(this.metricsFile, JSON.stringify(logEntry) + '\n');
        }
      } catch {}
    }
  }

  // Screenshot performance tracking
  trackScreenshotCapture() {
    if (!this.isFeatureEnabled('screenshots')) return null;
    return this.startTimer('screenshots.capture');
  }

  trackScreenshotEncode() {
    if (!this.isFeatureEnabled('screenshots')) return null;
    return this.startTimer('screenshots.encode');
  }

  trackScreenshotWrite() {
    if (!this.isFeatureEnabled('screenshots')) return null;
    return this.startTimer('screenshots.write');
  }

  trackScreenshotUpload() {
    if (!this.isFeatureEnabled('screenshots')) return null;
    return this.startTimer('screenshots.upload');
  }

  // URL tracking performance
  trackUrlPoll() {
    if (!this.isFeatureEnabled('urlTracking')) return null;
    return this.startTimer('urlTracking.poll');
  }

  trackUrlParse() {
    if (!this.isFeatureEnabled('urlTracking')) return null;
    return this.startTimer('urlTracking.parse');
  }

  // App tracking performance
  trackAppEnumeration() {
    if (!this.isFeatureEnabled('appTracking')) return null;
    return this.startTimer('appTracking.enumerate');
  }

  // Sync performance
  trackSyncEnqueue() {
    if (!this.isFeatureEnabled('sync')) return null;
    return this.startTimer('sync.enqueue');
  }

  trackSyncBatch() {
    if (!this.isFeatureEnabled('sync')) return null;
    return this.startTimer('sync.batch');
  }

  trackSyncPost() {
    if (!this.isFeatureEnabled('sync')) return null;
    return this.startTimer('sync.post');
  }

  // IPC performance
  trackIpcCall(method, payloadSize = 0) {
    if (!this.isFeatureEnabled('ipc')) return null;
    
    const timerId = this.startTimer('ipc.calls');
    
    // Record payload size
    this.metrics.ipc.payloads.push({
      timestamp: Date.now(),
      method,
      size: payloadSize
    });
    
    return timerId;
  }

  // Event loop monitoring - DISABLED BY DEFAULT for performance
  // This polls every 100ms which causes significant battery drain
  // Enable manually by calling startEventLoopMonitoring() if debugging performance issues
  startEventLoopMonitoring() {
    // PERFORMANCE FIX: Only enable if explicitly requested via environment variable
    if (!this.enabled || process.env.PERF_EVENT_LOOP_MONITOR !== '1') {
      console.log('[PERF] Event loop monitoring disabled (set PERF_EVENT_LOOP_MONITOR=1 to enable)');
      return;
    }
    
    console.log('[PERF] Event loop monitoring ENABLED (100ms polling - battery impact!)');
    let lastCheck = Date.now();
    
    this.eventLoopInterval = setInterval(() => {
      const now = Date.now();
      const lag = now - lastCheck - 100; // Should be ~100ms
      
      if (lag > 0) {
        this.metrics.eventLoop.lag.push({
          timestamp: now,
          lag,
          severity: lag > 50 ? 'high' : lag > 20 ? 'medium' : 'low'
        });
        
        // Keep only last 1000 measurements
        if (this.metrics.eventLoop.lag.length > 1000) {
          this.metrics.eventLoop.lag = this.metrics.eventLoop.lag.slice(-1000);
        }
      }
      
      lastCheck = now;
    }, 100);
  }

  // Memory tracking
  recordMemoryMetrics() {
    if (!this.enabled) return;
    
    try {
      const memUsage = process.memoryUsage();
      
      this.metrics.memory.rss.push({
        timestamp: Date.now(),
        value: Math.round(memUsage.rss / (1024 * 1024) * 100) / 100
      });
      
      this.metrics.memory.heap.push({
        timestamp: Date.now(),
        value: Math.round(memUsage.heapUsed / (1024 * 1024) * 100) / 100
      });
      
      // Keep only last 1000 measurements
      if (this.metrics.memory.rss.length > 1000) {
        this.metrics.memory.rss = this.metrics.memory.rss.slice(-1000);
        this.metrics.memory.heap = this.metrics.memory.heap.slice(-1000);
      }
    } catch (error) {
      // Silently handle memory measurement errors
    }
  }

  // Statistics calculation
  calculateStats(values) {
    if (values.length === 0) return { count: 0, min: 0, max: 0, avg: 0, p50: 0, p95: 0, p99: 0 };
    
    const sorted = values.map(v => v.duration || v.value || v.lag).sort((a, b) => a - b);
    const count = sorted.length;
    const min = sorted[0];
    const max = sorted[count - 1];
    const avg = sorted.reduce((a, b) => a + b, 0) / count;
    const p50 = sorted[Math.floor(count * 0.5)];
    const p95 = sorted[Math.floor(count * 0.95)];
    const p99 = sorted[Math.floor(count * 0.99)];
    
    return { count, min, max, avg, p50, p95, p99 };
  }

  // Generate performance report
  generateReport() {
    const report = {
      timestamp: Date.now(),
      featureFlags: this.featureFlags,
      summary: {},
      details: {}
    };

    // Calculate summary statistics for each feature
    Object.keys(this.metrics).forEach(feature => {
      report.summary[feature] = {};
      report.details[feature] = {};
      
      Object.keys(this.metrics[feature]).forEach(phase => {
        const stats = this.calculateStats(this.metrics[feature][phase]);
        report.summary[feature][phase] = stats;
        report.details[feature][phase] = this.metrics[feature][phase].slice(-100); // Last 100 measurements
      });
    });

    // Add feature flag impact analysis
    report.analysis = this.analyzeFeatureImpact();
    
    return report;
  }

  analyzeFeatureImpact() {
    const analysis = {
      recommendations: [],
      bottlenecks: [],
      quickWins: []
    };

    // Screenshot analysis
    const screenshotEncode = this.metrics.screenshots.encode;
    if (screenshotEncode.length > 0) {
      const encodeStats = this.calculateStats(screenshotEncode);
      if (encodeStats.p95 > 120) {
        analysis.bottlenecks.push('Screenshot encoding is slow (p95: ' + encodeStats.p95.toFixed(1) + 'ms)');
        analysis.quickWins.push('Move image encoding to utility process');
        analysis.quickWins.push('Switch to WebP with quality 70-80');
      }
    }

    // URL tracking analysis
    const urlParse = this.metrics.urlTracking.parse;
    if (urlParse.length > 0) {
      const parseStats = this.calculateStats(urlParse);
      if (parseStats.p95 > 20) {
        analysis.bottlenecks.push('URL parsing is slow (p95: ' + parseStats.p95.toFixed(1) + 'ms)');
        analysis.quickWins.push('Cache domain→category mappings');
        analysis.quickWins.push('Debounce window title reads');
      }
    }

    // Sync analysis
    const syncPost = this.metrics.sync.post;
    if (syncPost.length > 0) {
      const postStats = this.calculateStats(syncPost);
      if (postStats.p95 > 100) {
        analysis.bottlenecks.push('Sync posting is slow (p95: ' + postStats.p95.toFixed(1) + 'ms)');
        analysis.quickWins.push('Batch multiple items together');
        analysis.quickWins.push('Compress payloads with gzip');
      }
    }

    // Event loop analysis
    const eventLoop = this.metrics.eventLoop.lag;
    if (eventLoop.length > 0) {
      const lagStats = this.calculateStats(eventLoop);
      if (lagStats.p95 > 50) {
        analysis.bottlenecks.push('Event loop lag detected (p95: ' + lagStats.p95.toFixed(1) + 'ms)');
        analysis.quickWins.push('Move heavy operations off main thread');
        analysis.quickWins.push('Reduce synchronous operations');
      }
    }

    return analysis;
  }

  // Save report to file
  saveReport() {
    try {
      const report = this.generateReport();
      const reportJson = JSON.stringify(report, null, 2);
      
      fs.writeFileSync(this.reportFile, reportJson);
      
      // Also save to NDJSON for historical tracking
      const logEntry = {
        timestamp: Date.now(),
        type: 'performance_report',
        data: report
      };
      
      fs.appendFileSync(this.metricsFile, JSON.stringify(logEntry) + '\n');
      
      return this.reportFile;
    } catch (error) {
      console.error('[PERF] Failed to save report:', error.message);
      return null;
    }
  }

  // Get current metrics snapshot
  getSnapshot() {
    return {
      timestamp: Date.now(),
      featureFlags: this.featureFlags,
      metrics: this.metrics,
      summary: this.generateReport().summary
    };
  }

  // Reset metrics (useful for testing)
  reset() {
    Object.keys(this.metrics).forEach(feature => {
      Object.keys(this.metrics[feature]).forEach(phase => {
        this.metrics[feature][phase] = [];
      });
    });
    
    this.timers.clear();
    this.counters.clear();
  }

  // Shutdown
  shutdown() {
    try { this.saveReport(); } catch {}
    try {
      if (this.autoFlushInterval) {
        clearInterval(this.autoFlushInterval);
        this.autoFlushInterval = null;
      }
      // Clean up event loop monitoring if it was enabled
      if (this.eventLoopInterval) {
        clearInterval(this.eventLoopInterval);
        this.eventLoopInterval = null;
      }
    } catch {}
    this.reset();
  }
}

// Create singleton instance
let performanceMonitorInstance = null;

function getPerformanceMonitor(options) {
  if (!performanceMonitorInstance) {
    performanceMonitorInstance = new PerformanceMonitor(options);
  }
  return performanceMonitorInstance;
}

function startPerformanceMonitor(options) {
  if (performanceMonitorInstance) {
    performanceMonitorInstance.shutdown();
  }
  performanceMonitorInstance = new PerformanceMonitor(options);
  return performanceMonitorInstance;
}

function stopPerformanceMonitor() {
  if (performanceMonitorInstance) {
    performanceMonitorInstance.shutdown();
    performanceMonitorInstance = null;
  }
}

// Export functions and classes
module.exports = {
  PerformanceMonitor,
  getPerformanceMonitor,
  startPerformanceMonitor,
  stopPerformanceMonitor
};
