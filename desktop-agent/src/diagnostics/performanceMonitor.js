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

function resolvePerfLogDir() {
  try {
    const { app } = require('electron');
    if (app && typeof app.getPath === 'function') {
      // Packaged + dev: durable under Application Support / userData
      return path.join(app.getPath('userData'), 'logs', 'performance');
    }
  } catch (_) { /* non-Electron */ }
  return path.join(process.cwd(), 'logs', 'performance');
}

class PerformanceMonitor {
  constructor(options = {}) {
    this.enabled = options.enabled !== false;
    this.logDir = options.logDir || resolvePerfLogDir();
    this.today = new Date().toISOString().split('T')[0];
    this.metricsFile = path.join(this.logDir, `${this.today}.ndjson`);
    this.reportFile = path.join(this.logDir, `${this.today}-report.json`);
    this.cpuNdjsonFile = path.join(this.logDir, `cpu-${this.today}.ndjson`);
    this.cpuTextFile = path.join(this.logDir, `cpu-${this.today}.log`);
    
    this.metrics = {
      screenshots: { capture: [], encode: [], write: [], upload: [] },
      urlTracking: { poll: [], parse: [] },
      appTracking: { enumerate: [] },
      sync: { enqueue: [], batch: [], post: [] },
      ipc: { calls: [], payloads: [] },
      eventLoop: { lag: [] },
      memory: { rss: [], heap: [] },
      cpu: { samples: [] },
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

    // CPU sampling baseline (microseconds of user+system time)
    this._lastCpuUsage = process.cpuUsage();
    this._lastCpuSampleAt = Date.now();
    
    this.ensureLogDirectory();
    // PERFORMANCE FIX: Removed startEventLoopMonitoring() - 100ms polling causes battery drain
    // Event loop monitoring is now disabled by default. Enable manually if needed for debugging.

    // Auto-flush full JSON reports — off by default (disk churn). Set PERF_FLUSH_MS
    // or PERF_FULL=1 for diagnostics. Default when PERF_FULL=1: every 10 minutes.
    try {
      const flushEnabled =
        process.env.PERF_FULL === '1' ||
        (process.env.PERF_FLUSH_MS && process.env.PERF_FLUSH_MS !== '0');
      if (flushEnabled) {
        const defaultFlushMs = 10 * 60 * 1000;
        this.flushIntervalMs = Math.max(
          60_000,
          Number(process.env.PERF_FLUSH_MS) || defaultFlushMs,
        );
        this.autoFlushInterval = setInterval(() => {
          try { this.saveReport(); } catch {}
        }, this.flushIntervalMs);
        if (typeof this.autoFlushInterval.unref === 'function') {
          this.autoFlushInterval.unref();
        }
      }
    } catch {}

    // Periodic CPU + memory samples (default 5 min — cheap process.cpuUsage only).
    try {
      this.startCpuUsageLogging();
    } catch {}
  }

  /** Roll file paths when the Pacific/local calendar day changes. */
  _ensureCpuLogFilesForToday() {
    const day = new Date().toISOString().split('T')[0];
    if (day === this.today) return;
    this.today = day;
    this.metricsFile = path.join(this.logDir, `${this.today}.ndjson`);
    this.reportFile = path.join(this.logDir, `${this.today}-report.json`);
    this.cpuNdjsonFile = path.join(this.logDir, `cpu-${this.today}.ndjson`);
    this.cpuTextFile = path.join(this.logDir, `cpu-${this.today}.log`);
    this.ensureLogDirectory();
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

  /** Persist one CPU sample to disk (NDJSON + human-readable .log). */
  persistCpuUsageSample(sample) {
    if (!sample) return;
    try {
      this._ensureCpuLogFilesForToday();
      this.ensureLogDirectory();
      const iso = new Date(sample.timestamp).toISOString();
      const ndjsonLine = JSON.stringify({
        ts: iso,
        type: 'cpu',
        mainCpuPercent: sample.mainCpuPercent,
        electronCpuPercent: sample.electronCpuPercent,
        processCount: sample.processCount,
        userMs: sample.userMs,
        systemMs: sample.systemMs,
        intervalSec: Math.round(sample.intervalMs / 1000),
        rssMb: sample.rssMb,
        heapMb: sample.heapMb,
        isTracking: sample.isTracking,
      }) + '\n';
      fs.appendFileSync(this.cpuNdjsonFile, ndjsonLine);
      // Also keep in the general metrics NDJSON for older tooling.
      fs.appendFileSync(
        this.metricsFile,
        JSON.stringify({ timestamp: sample.timestamp, type: 'cpu', data: sample }) + '\n',
      );
      const textLine =
        `${iso}  main=${sample.mainCpuPercent}%` +
        `  electron=${sample.electronCpuPercent ?? 'n/a'}%` +
        `  procs=${sample.processCount ?? 'n/a'}` +
        `  rss=${sample.rssMb}MB` +
        `  heap=${sample.heapMb}MB` +
        `  tracking=${sample.isTracking ? 'yes' : 'no'}\n`;
      fs.appendFileSync(this.cpuTextFile, textLine);
    } catch (err) {
      try {
        console.warn('[PERF] Failed to persist CPU log:', err?.message || err);
      } catch { /* ignore */ }
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

  /**
   * Sample main-process CPU since the last sample + optional Electron process group.
   * Uses process.cpuUsage() (microseconds) — very cheap.
   */
  sampleCpuUsage() {
    if (!this.enabled) return null;

    const now = Date.now();
    const elapsedMs = Math.max(1, now - (this._lastCpuSampleAt || now));
    const diff = process.cpuUsage(this._lastCpuUsage);
    this._lastCpuUsage = process.cpuUsage();
    this._lastCpuSampleAt = now;

    // cpuUsage is microseconds; wall clock is ms → percent of one core.
    const mainCpuPercent =
      Math.round(((diff.user + diff.system) / (elapsedMs * 1000)) * 1000) / 10;

    // getAppMetrics() walks all Electron processes — skip unless explicitly enabled.
    let electronCpuPercent = null;
    let processCount = null;
    if (process.env.PERF_CPU_APP_METRICS === '1') {
      try {
        const { app } = require('electron');
        if (app && typeof app.getAppMetrics === 'function') {
          const metrics = app.getAppMetrics() || [];
          processCount = metrics.length;
          electronCpuPercent = Math.round(
            metrics.reduce((sum, m) => sum + (Number(m?.cpu?.percentCPUUsage) || 0), 0) * 10,
          ) / 10;
        }
      } catch (_) { /* non-Electron / early boot */ }
    }

    const mem = process.memoryUsage();
    const sample = {
      timestamp: now,
      intervalMs: elapsedMs,
      mainCpuPercent,
      electronCpuPercent,
      processCount,
      // `value` used by calculateStats() in performance reports
      value: mainCpuPercent,
      userMs: Math.round(diff.user / 1000),
      systemMs: Math.round(diff.system / 1000),
      rssMb: Math.round((mem.rss / (1024 * 1024)) * 10) / 10,
      heapMb: Math.round((mem.heapUsed / (1024 * 1024)) * 10) / 10,
      isTracking: !!(typeof global !== 'undefined' && global.isTracking),
    };

    if (!this.metrics.cpu) this.metrics.cpu = { samples: [] };
    this.metrics.cpu.samples.push(sample);
    if (this.metrics.cpu.samples.length > 500) {
      this.metrics.cpu.samples = this.metrics.cpu.samples.slice(-500);
    }

    return sample;
  }

  /** Write one CPU sample into the normal app console / structured logs + disk. */
  logCpuUsageSample(sample = null) {
    const s = sample || this.sampleCpuUsage();
    if (!s) return s;

    try {
      const { createFeatureLogger } = require('../modules/utils/logger');
      const log = createFeatureLogger('PERF');
      log.info({
        step: 'CPU',
        message: `${s.mainCpuPercent}% main` +
          (s.electronCpuPercent != null ? ` / ${s.electronCpuPercent}% all-electron` : ''),
        ctx: {
          mainCpuPercent: s.mainCpuPercent,
          electronCpuPercent: s.electronCpuPercent,
          processCount: s.processCount,
          userMs: s.userMs,
          systemMs: s.systemMs,
          intervalSec: Math.round(s.intervalMs / 1000),
          rssMb: s.rssMb,
          heapMb: s.heapMb,
          isTracking: s.isTracking,
          logFile: this.cpuTextFile,
        },
      });
    } catch (_) {
      try {
        console.log(
          `[PERF] CPU main=${s.mainCpuPercent}% electron=${s.electronCpuPercent ?? 'n/a'}% rss=${s.rssMb}MB heap=${s.heapMb}MB tracking=${s.isTracking}`,
        );
      } catch { /* ignore */ }
    }

    // Always persist to userData logs (unless explicitly disabled).
    if (process.env.PERF_CPU_NDJSON !== '0') {
      this.persistCpuUsageSample(s);
    }
    // DB samples are opt-in (network). Set PERF_CPU_DB=1 to enable.
    if (process.env.PERF_CPU_DB === '1') {
      void this.persistCpuUsageToTimeLogEvents(s);
    }
    return s;
  }

  /**
   * Push one CPU sample into time_doctor.time_log_events (action=cpu_sample).
   * Fire-and-forget; never throws into the sampler loop.
   */
  async persistCpuUsageToTimeLogEvents(sample) {
    if (!sample) return;
    try {
      const {
        isBackendTimeLogsEnabled,
        insertTimeLogEvents,
      } = require('../modules/utils/backend-time-logs');
      if (!isBackendTimeLogsEnabled()) return;

      const userId =
        global.currentUserId ||
        global.config?.user_id ||
        global.trackingManager?.currentSession?.user_id ||
        null;
      if (!userId) return;

      let agentVersion = null;
      try {
        const { app } = require('electron');
        agentVersion = app?.getVersion?.() || null;
      } catch (_) { /* ignore */ }
      if (!agentVersion) {
        try {
          agentVersion = require('../../package.json').version;
        } catch (_) { /* ignore */ }
      }

      const deviceId =
        global.deviceId ||
        global.config?.device_id ||
        null;
      const timeLogId =
        global.currentTimeLogId ||
        global.trackingManager?.currentTimeLogId ||
        null;
      const orgId =
        global.config?.organization_id ||
        global.trackingManager?.currentSession?.organization_id ||
        null;

      await insertTimeLogEvents({
        user_id: userId,
        time_log_id: timeLogId,
        organization_id: orgId,
        action: 'cpu_sample',
        source: 'desktop-agent',
        device_id: deviceId,
        agent_version: agentVersion,
        meta: {
          kind: 'cpu',
          mainCpuPercent: sample.mainCpuPercent,
          electronCpuPercent: sample.electronCpuPercent,
          processCount: sample.processCount,
          userMs: sample.userMs,
          systemMs: sample.systemMs,
          intervalSec: Math.round(sample.intervalMs / 1000),
          rssMb: sample.rssMb,
          heapMb: sample.heapMb,
          isTracking: sample.isTracking,
          sampledAt: new Date(sample.timestamp).toISOString(),
        },
      });
    } catch (err) {
      // Offline / API down — disk log still has the sample.
      if (process.env.PERF_CPU_DB_DEBUG === '1') {
        try {
          console.warn('[PERF] CPU→time_log_events failed:', err?.message || err);
        } catch { /* ignore */ }
      }
    }
  }

  startCpuUsageLogging() {
    if (!this.enabled) return;
    if (process.env.PERF_CPU_LOG === '0') {
      console.log('[PERF] CPU usage logging disabled (PERF_CPU_LOG=0)');
      return;
    }
    if (this._cpuLogInterval) return;

    const intervalMs = Math.max(
      60_000,
      Number(process.env.PERF_CPU_LOG_MS) || 5 * 60_000,
    );

    // Prime baseline so the first logged sample is a real delta.
    this._lastCpuUsage = process.cpuUsage();
    this._lastCpuSampleAt = Date.now();
    this.ensureLogDirectory();

    this._cpuLogInterval = setInterval(() => {
      try {
        this.recordMemoryMetrics();
        this.logCpuUsageSample();
      } catch (_) { /* ignore */ }
    }, intervalMs);
    if (typeof this._cpuLogInterval.unref === 'function') {
      this._cpuLogInterval.unref();
    }

    console.log(
      `[PERF] CPU usage logging every ${Math.round(intervalMs / 1000)}s → ${this.cpuTextFile}`,
    );
  }

  stopCpuUsageLogging() {
    if (this._cpuLogInterval) {
      clearInterval(this._cpuLogInterval);
      this._cpuLogInterval = null;
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
      this.stopCpuUsageLogging();
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
