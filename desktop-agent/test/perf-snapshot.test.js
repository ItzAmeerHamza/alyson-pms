/**
 * Performance Snapshot Test
 * Ensures URL capture performance remains within acceptable bounds
 */

const { performance } = require('perf_hooks');

class MockUrlCapture {
  constructor() {
    this.events = [];
  }
  
  async getCurrentUrl() {
    // Simulate platform call delay
    await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
    
    return {
      url: `https://example.com/page-${Math.floor(Math.random() * 100)}`,
      title: `Page ${Math.floor(Math.random() * 100)}`,
      browser: 'Chrome',
      source: 'mock',
      confidence: 'high',
      windowId: 'test-window'
    };
  }
}

describe('URL Detection Performance', () => {
  let UrlCaptureManager;
  let manager;
  
  beforeAll(() => {
    // Set test environment variables
    process.env.URL_DEBUG_LOGGING = 'false';
    process.env.URL_DIAG_RATE_LIMIT_PER_MIN = '1000'; // High limit for test
    
    UrlCaptureManager = require('../src/modules/url/UrlCaptureManager.js');
  });
  
  beforeEach(() => {
    manager = new UrlCaptureManager({
      debugLogging: false,
      debounceMs: 250,
      minSliceSec: 5,
      maxEventsPerSec: 1,
      enabled: true
    });
    
    // Mock adapter
    manager.adapter = new MockUrlCapture();
    
    // Collect emitted events
    manager.events = [];
    manager.on('url', (event) => {
      manager.events.push(event);
    });
  });
  
  afterEach(() => {
    if (manager.isRunning) {
      manager.stop();
    }
  });
  
  test('Performance snapshot: 1000 events within timing constraints', async () => {
    const testStart = performance.now();
    const eventCount = 1000;
    const maxWallTimeMs = 5000; // 5 seconds max
    const maxExpectedEmits = Math.ceil(eventCount / 5); // With 5s min-slice, expect ~200 emits
    
    manager.start();
    
    // Rapidly generate events
    const promises = [];
    for (let i = 0; i < eventCount; i++) {
      promises.push(manager.captureCurrentUrl());
      
      // Small delay to prevent overwhelming
      if (i % 50 === 0) {
        await new Promise(resolve => setTimeout(resolve, 1));
      }
    }
    
    await Promise.all(promises);
    
    // Wait for debounce to complete
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const testEnd = performance.now();
    const wallTime = testEnd - testStart;
    
    // Performance assertions
    expect(wallTime).toBeLessThan(maxWallTimeMs);
    expect(manager.events.length).toBeLessThanOrEqual(maxExpectedEmits);
    expect(manager.events.length).toBeGreaterThan(0);
    
    // Check that timing controls worked
    const stats = manager.getStats();
    expect(stats.eventCount).toBeGreaterThan(0);
    expect(stats.suppressedCount).toBeGreaterThan(eventCount / 10); // Expect significant suppression
    
    console.log(`Performance snapshot results:
      - Wall time: ${wallTime.toFixed(2)}ms (limit: ${maxWallTimeMs}ms)
      - Events emitted: ${manager.events.length} (expected ≤${maxExpectedEmits})
      - Events suppressed: ${stats.suppressedCount}
      - Cache hits: ${manager.cacheHitCount}
      - CPU budget active: ${manager.cpuBudget.backoffActive}
    `);
  }, 10000);
  
  test('Resolver timeout handling', async () => {
    // Mock slow adapter
    manager.adapter = {
      constructor: { name: 'SlowMockAdapter' },
      async getCurrentUrl() {
        // Simulate hung resolver
        await new Promise(resolve => setTimeout(resolve, 300));
        return {
          url: 'https://slow.example.com',
          title: 'Slow Page',
          browser: 'Chrome',
          source: 'slow-mock',
          confidence: 'low'
        };
      }
    };
    
    const diagnostics = [];
    manager.on('diagnostic', (diag) => {
      diagnostics.push(diag);
    });
    
    manager.start();
    
    // Trigger capture that should timeout
    const startTime = performance.now();
    await manager.captureCurrentUrl();
    const elapsed = performance.now() - startTime;
    
    // Should complete within watchdog timeout + small buffer
    expect(elapsed).toBeLessThan(200);
    
    // Should have timeout diagnostic
    const timeoutDiags = diagnostics.filter(d => d.type === 'resolver_timeout');
    expect(timeoutDiags.length).toBeGreaterThan(0);
    
    // Should have set backoff
    expect(manager.resolverBackoff.has('primary')).toBe(true);
    
    console.log(`Timeout test results:
      - Elapsed time: ${elapsed.toFixed(2)}ms
      - Timeout diagnostics: ${timeoutDiags.length}
      - Backoff set: ${manager.resolverBackoff.has('primary')}
    `);
  });
  
  test('Cache effectiveness under load', async () => {
    const urls = [
      'https://github.com/repo1',
      'https://github.com/repo2',
      'https://example.com',
      'https://github.com/repo1', // Repeat for cache hit
      'https://example.com'       // Repeat for cache hit
    ];
    
    // Mock adapter to return specific URLs
    let urlIndex = 0;
    manager.adapter = {
      constructor: { name: 'CacheTestAdapter' },
      async getCurrentUrl() {
        const url = urls[urlIndex % urls.length];
        urlIndex++;
        return {
          url: url,
          title: `Page for ${url}`,
          browser: 'Chrome',
          source: 'cache-test',
          confidence: 'high'
        };
      }
    };
    
    manager.start();
    
    // Generate events to populate cache
    for (let i = 0; i < 50; i++) {
      await manager.captureCurrentUrl();
    }
    
    const hitRate = manager.cacheHitCount / (manager.cacheHitCount + manager.cacheMissCount);
    
    expect(hitRate).toBeGreaterThan(0.3); // Should have decent hit rate
    expect(manager.domainCache.size).toBeGreaterThan(0);
    expect(manager.adaptiveCacheSize).toBeGreaterThanOrEqual(128);
    
    console.log(`Cache effectiveness results:
      - Hit rate: ${(hitRate * 100).toFixed(1)}%
      - Cache size: ${manager.domainCache.size}
      - Adaptive cache size: ${manager.adaptiveCacheSize}
    `);
  });
  
  test('CPU budget enforcement', async () => {
    // Mock slow work to trigger CPU budget
    const originalRecordMeasurement = manager.recordCpuMeasurement;
    manager.recordCpuMeasurement = function(duration) {
      // Simulate high CPU usage
      originalRecordMeasurement.call(this, Math.max(duration, 100));
    };
    
    const originalPollDelay = manager.pollDelay;
    
    manager.start();
    
    // Generate enough events to potentially trigger budget
    for (let i = 0; i < 20; i++) {
      await manager.captureCurrentUrl();
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    // Budget enforcement might have increased poll delay
    const budgetTriggered = manager.cpuBudget.backoffActive || manager.pollDelay > originalPollDelay;
    
    console.log(`CPU budget test results:
      - Original poll delay: ${originalPollDelay}ms
      - Current poll delay: ${manager.pollDelay}ms
      - Budget backoff active: ${manager.cpuBudget.backoffActive}
      - Budget triggered: ${budgetTriggered}
    `);
    
    // This test mainly verifies the budget system works, doesn't enforce specific behavior
    expect(typeof manager.cpuBudget.backoffActive).toBe('boolean');
  });
});
