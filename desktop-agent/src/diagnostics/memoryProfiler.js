const fs = require('fs');
const path = require('path');

class MemoryProfiler {
  constructor(options = {}) {
    this.options = {
      intervalMs: options.intervalMs || 5000,
      csv: options.csv || false,
      exposeGC: options.exposeGC || false
    };

    this.intervalId = null;
    this.logDir = path.join(process.cwd(), 'logs', 'memory');
    this.dateStr = new Date().toISOString().split('T')[0];
    
    this.ensureLogDirectory();
  }

  ensureLogDirectory() {
    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }
    } catch (error) {
      try {
        console.error('[MEMORY-PROFILER] Failed to create log directory:', error);
      } catch (logError) {
        // Silently handle EPIPE and other console errors
        if (logError.code !== 'EPIPE') {
          try {
            process.stderr.write(`[MEMORY-PROFILER] Directory creation error logging failed: ${logError.message}\n`);
          } catch {}
        }
      }
    }
  }

  bytesToMB(bytes) {
    return Math.round((bytes / (1024 * 1024)) * 100) / 100;
  }

  async getProcessMemoryInfo() {
    try {
      if (typeof process.getProcessMemoryInfo === 'function') {
        const info = await process.getProcessMemoryInfo();
        return {
          private: info.private,
          resident: info.resident,
          cpuPercent: info.cpuPercent
        };
      }
      return null;
    } catch (error) {
      try {
        console.warn('[MEMORY-PROFILER] getProcessMemoryInfo failed:', error);
      } catch (logError) {
        // Silently handle EPIPE and other console errors
        if (logError.code !== 'EPIPE') {
          try {
            process.stderr.write(`[MEMORY-PROFILER] Process memory info error logging failed: ${logError.message}\n`);
          } catch {}
        }
      }
      return null;
    }
  }

  getV8HeapStats() {
    try {
      const v8 = require('v8');
      return v8.getHeapStatistics();
    } catch (error) {
      try {
        console.warn('[MEMORY-PROFILER] V8 heap stats failed:', error);
      } catch (logError) {
        // Silently handle EPIPE and other console errors
        if (logError.code !== 'EPIPE') {
          try {
            process.stderr.write(`[MEMORY-PROFILER] V8 heap stats error logging failed: ${logError.message}\n`);
          } catch {}
        }
      }
      return null;
    }
  }

  async getAppMetrics() {
    try {
      // Check if we're in Electron context and app is available
      if (global.app && typeof global.app.getAppMetrics === 'function') {
        return global.app.getAppMetrics();
      }
      return [];
    } catch (error) {
      try {
        console.warn('[MEMORY-PROFILER] App metrics failed:', error);
      } catch (logError) {
        // Silently handle EPIPE and other console errors
        if (logError.code !== 'EPIPE') {
          try {
            process.stderr.write(`[MEMORY-PROFILER] App metrics error logging failed: ${logError.message}\n`);
          } catch {}
        }
      }
      return [];
    }
  }

  async collectMemoryMetrics() {
    const processMemory = process.memoryUsage();
    const processInfo = await this.getProcessMemoryInfo();
    
    const metrics = {
      timestamp: Date.now(),
      pid: process.pid,
      type: 'main',
      rssMB: this.bytesToMB(processMemory.rss),
      heapUsedMB: this.bytesToMB(processMemory.heapUsed),
      heapTotalMB: this.bytesToMB(processMemory.heapTotal),
      externalMB: this.bytesToMB(processMemory.external),
      arrayBuffersMB: this.bytesToMB(processMemory.arrayBuffers),
      privateMB: processInfo ? this.bytesToMB(processInfo.private) : undefined,
      residentMB: processInfo ? this.bytesToMB(processInfo.resident) : undefined,
      cpuPercent: processInfo?.cpuPercent
    };

    return metrics;
  }

  appendLine(file, line) {
    try {
      fs.appendFileSync(file, line + '\n');
    } catch (error) {
      try {
        console.error(`[MEMORY-PROFILER] Failed to write to ${file}:`, error);
      } catch (logError) {
        // Silently handle EPIPE and other console errors
        if (logError.code !== 'EPIPE') {
          try {
            process.stderr.write(`[MEMORY-PROFILER] File write error logging failed: ${logError.message}\n`);
          } catch {}
        }
      }
    }
  }

  async writeMetrics(metrics) {
    // Write NDJSON format
    const ndjsonFile = path.join(this.logDir, `${this.dateStr}.ndjson`);
    this.appendLine(ndjsonFile, JSON.stringify(metrics));

    // Write CSV format if enabled
    if (this.options.csv) {
      const csvFile = path.join(this.logDir, `${this.dateStr}.csv`);
      
      // Write headers if file doesn't exist
      if (!fs.existsSync(csvFile)) {
        const headers = [
          'timestamp', 'pid', 'type', 'rssMB', 'heapUsedMB', 'heapTotalMB',
          'externalMB', 'arrayBuffersMB', 'privateMB', 'residentMB', 'cpuPercent'
        ].join(',');
        this.appendLine(csvFile, headers);
      }

      // Write data row
      const csvRow = [
        metrics.timestamp,
        metrics.pid,
        metrics.type,
        metrics.rssMB,
        metrics.heapUsedMB,
        metrics.heapTotalMB,
        metrics.externalMB,
        metrics.arrayBuffersMB,
        metrics.privateMB || '',
        metrics.residentMB || '',
        metrics.cpuPercent || ''
      ].join(',');
      
      this.appendLine(csvFile, csvRow);
    }
  }

  async performGC() {
    if (this.options.exposeGC && global.gc) {
      try {
        const beforeMetrics = await this.collectMemoryMetrics();
        global.gc();
        const afterMetrics = await this.collectMemoryMetrics();
        
        try {
          console.log('[MEMORY-PROFILER] GC performed:', {
            before: {
              heapUsed: beforeMetrics.heapUsedMB,
              heapTotal: beforeMetrics.heapTotalMB
            },
            after: {
              heapUsed: afterMetrics.heapUsedMB,
              heapTotal: afterMetrics.heapTotalMB
            },
            freed: beforeMetrics.heapUsedMB - afterMetrics.heapUsedMB
          });
        } catch (logError) {
          // Silently handle EPIPE and other console errors
          if (logError.code !== 'EPIPE') {
            try {
              process.stderr.write(`[MEMORY-PROFILER] GC log error: ${logError.message}\n`);
            } catch {}
          }
        }

        // Log GC event marker
        const gcMarker = {
          timestamp: Date.now(),
          pid: process.pid,
          type: 'gc',
          event: 'manual_gc',
          beforeHeapUsedMB: beforeMetrics.heapUsedMB,
          afterHeapUsedMB: afterMetrics.heapUsedMB,
          freedMB: beforeMetrics.heapUsedMB - afterMetrics.heapUsedMB
        };

        const ndjsonFile = path.join(this.logDir, `${this.dateStr}.ndjson`);
        this.appendLine(ndjsonFile, JSON.stringify(gcMarker));
      } catch (error) {
        try {
          console.error('[MEMORY-PROFILER] GC failed:', error);
        } catch (logError) {
          // Silently handle EPIPE and other console errors
          if (logError.code !== 'EPIPE') {
            try {
              process.stderr.write(`[MEMORY-PROFILER] GC error logging failed: ${logError.message}\n`);
            } catch {}
          }
        }
      }
    }
  }

  async tick() {
    try {
      const metrics = await this.collectMemoryMetrics();
      await this.writeMetrics(metrics);

      // Log to console for debugging - use safe logging
      try {
        console.log(`[MEMORY-PROFILER] ${new Date().toISOString()} - RSS: ${metrics.rssMB}MB, Heap: ${metrics.heapUsedMB}MB/${metrics.heapTotalMB}MB`);
      } catch (logError) {
        // Silently handle EPIPE and other console errors
        if (logError.code !== 'EPIPE') {
          // Only log non-EPIPE errors to avoid infinite loops
          try {
            process.stderr.write(`[MEMORY-PROFILER] Log error: ${logError.message}\n`);
          } catch {}
        }
      }

      // Collect app metrics if available (main process only)
      const appMetrics = await this.getAppMetrics();
      if (appMetrics.length > 0) {
        try {
          console.log(`[MEMORY-PROFILER] ${appMetrics.length} Electron processes detected`);
        } catch (logError) {
          // Silently handle EPIPE and other console errors
          if (logError.code !== 'EPIPE') {
            try {
              process.stderr.write(`[MEMORY-PROFILER] Log error: ${logError.message}\n`);
            } catch {}
          }
        }
      }
    } catch (error) {
      try {
        console.error('[MEMORY-PROFILER] Tick failed:', error);
      } catch (logError) {
        // Silently handle EPIPE and other console errors
        if (logError.code !== 'EPIPE') {
          try {
            process.stderr.write(`[MEMORY-PROFILER] Error logging failed: ${logError.message}\n`);
          } catch {}
        }
      }
    }
  }

  start() {
    if (this.intervalId) {
      try {
        console.warn('[MEMORY-PROFILER] Already running');
      } catch (logError) {
        // Silently handle EPIPE and other console errors
        if (logError.code !== 'EPIPE') {
          try {
            process.stderr.write(`[MEMORY-PROFILER] Log error: ${logError.message}\n`);
          } catch {}
        }
      }
      return;
    }

    try {
      console.log(`[MEMORY-PROFILER] Starting with ${this.options.intervalMs}ms interval`);
    } catch (logError) {
      // Silently handle EPIPE and other console errors
      if (logError.code !== 'EPIPE') {
        try {
          process.stderr.write(`[MEMORY-PROFILER] Log error: ${logError.message}\n`);
        } catch {}
      }
    }
    
    // Initial collection
    this.tick();
    
    // Set up interval
    this.intervalId = setInterval(() => {
      this.tick();
    }, this.options.intervalMs);

    // Set up GC interval if enabled
    if (this.options.exposeGC && global.gc) {
      setInterval(() => {
        this.performGC();
      }, 30000); // GC every 30 seconds
    }
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      try {
        console.log('[MEMORY-PROFILER] Stopped');
      } catch (logError) {
        // Silently handle EPIPE and other console errors
        if (logError.code !== 'EPIPE') {
          try {
            process.stderr.write(`[MEMORY-PROFILER] Log error: ${logError.message}\n`);
          } catch {}
        }
      }
    }
  }

  async getSnapshot() {
    return await this.collectMemoryMetrics();
  }

  async triggerGC() {
    await this.performGC();
  }
}

// Export singleton instance
let memoryProfilerInstance = null;

function startMemoryProfiler(options = {}) {
  if (!memoryProfilerInstance) {
    memoryProfilerInstance = new MemoryProfiler(options);
    memoryProfilerInstance.start();
  }
  return memoryProfilerInstance;
}

function stopMemoryProfiler() {
  if (memoryProfilerInstance) {
    memoryProfilerInstance.stop();
    memoryProfilerInstance = null;
  }
}

function getMemoryProfiler() {
  return memoryProfilerInstance;
}

module.exports = {
  MemoryProfiler,
  startMemoryProfiler,
  stopMemoryProfiler,
  getMemoryProfiler
};
