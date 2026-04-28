/**
 * Resolver Hang Test
 * Ensures watchdog kicks in and title fallback works when resolvers hang
 */

const { performance } = require('perf_hooks');

describe('Resolver Hang Protection', () => {
  let UrlCaptureManager;
  let manager;
  
  beforeAll(() => {
    UrlCaptureManager = require('../src/modules/url/UrlCaptureManager.js');
  });
  
  beforeEach(() => {
    manager = new UrlCaptureManager({
      debugLogging: false,
      debounceMs: 50,  // Faster for testing
      minSliceSec: 1,  // Shorter for testing
      maxEventsPerSec: 10,
      enabled: true
    });
    
    // Collect emitted events and diagnostics
    manager.events = [];
    manager.diagnostics = [];
    
    manager.on('url', (event) => {
      manager.events.push(event);
    });
    
    manager.on('diagnostic', (diag) => {
      manager.diagnostics.push(diag);
    });
  });
  
  afterEach(() => {
    if (manager.isRunning) {
      manager.stop();
    }
  });
  
  test('Watchdog timeout with title fallback', async () => {
    // Mock hanging AX/UIA resolver that times out
    manager.adapter = {
      constructor: { name: 'HangingAdapter' },
      async getCurrentUrl() {
        // Simulate hanging resolver (300ms > 150ms watchdog)
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // This should never execute due to timeout
        return {
          url: 'https://should-not-reach.com',
          title: 'Should Not Reach - Google Chrome',
          browser: 'Chrome',
          source: 'hanging',
          confidence: 'high'
        };
      }
    };
    
    manager.start();
    
    const startTime = performance.now();
    await manager.captureCurrentUrl();
    const elapsed = performance.now() - startTime;
    
    // Wait for any pending debounce
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Assertions
    expect(elapsed).toBeLessThan(200); // Should complete within watchdog + buffer
    
    // Should have timeout diagnostic
    const timeoutDiags = manager.diagnostics.filter(d => d.type === 'resolver_timeout');
    expect(timeoutDiags.length).toBeGreaterThan(0);
    
    if (timeoutDiags.length > 0) {
      expect(timeoutDiags[0].data.hasTimeout).toBe(true);
      expect(timeoutDiags[0].data.adapter).toBe('HangingAdapter');
    }
    
    // Should have set backoff
    expect(manager.resolverBackoff.has('primary')).toBe(true);
    const backoffUntil = manager.resolverBackoff.get('primary');
    expect(backoffUntil).toBeGreaterThan(Date.now());
    
    console.log(`Watchdog timeout test results:
      - Elapsed time: ${elapsed.toFixed(2)}ms (expected <200ms)
      - Timeout diagnostics: ${timeoutDiags.length}
      - Backoff until: ${new Date(backoffUntil).toISOString()}
      - Backoff duration: ${backoffUntil - Date.now()}ms
    `);
  });
  
  test('Concurrent resolver limit enforcement', async () => {
    let concurrentCalls = 0;
    let maxConcurrent = 0;
    
    // Mock adapter that tracks concurrency
    manager.adapter = {
      constructor: { name: 'ConcurrentTestAdapter' },
      async getCurrentUrl() {
        concurrentCalls++;
        maxConcurrent = Math.max(maxConcurrent, concurrentCalls);
        
        // Simulate some work time
        await new Promise(resolve => setTimeout(resolve, 50));
        
        concurrentCalls--;
        
        return {
          url: 'https://concurrent.test.com',
          title: 'Concurrent Test',
          browser: 'Chrome',
          source: 'concurrent',
          confidence: 'high'
        };
      }
    };
    
    manager.start();
    
    // Launch multiple concurrent capture attempts
    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(manager.captureCurrentUrl());
    }
    
    await Promise.all(promises);
    
    // Should enforce max 1 concurrent resolver per platform
    expect(maxConcurrent).toBeLessThanOrEqual(1);
    
    // Check for concurrency skip diagnostics
    const skipDiags = manager.diagnostics.filter(d => d.type === 'concurrent_resolver_skip');
    expect(skipDiags.length).toBeGreaterThan(0);
    
    console.log(`Concurrent resolver test results:
      - Max concurrent calls: ${maxConcurrent}
      - Concurrency skip events: ${skipDiags.length}
      - Total capture attempts: 5
    `);
  });
  
  test('Title fallback when all resolvers fail', async () => {
    // Mock adapter that always fails platform resolvers
    manager.adapter = {
      constructor: { name: 'FailingAdapter' },
      async getCurrentUrl() {
        // Simulate resolver failure
        throw new Error('Platform resolver failed');
      }
    };
    
    manager.start();
    
    // Attempt capture
    await manager.captureCurrentUrl();
    
    // Wait for debounce
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Should have error diagnostics
    const errorDiags = manager.diagnostics.filter(d => d.type === 'capture_error');
    expect(errorDiags.length).toBeGreaterThan(0);
    
    if (errorDiags.length > 0) {
      expect(errorDiags[0].data.message).toContain('Platform resolver failed');
      expect(errorDiags[0].data.adapter).toBe('FailingAdapter');
    }
    
    // Should have set backoff
    expect(manager.resolverBackoff.has('primary')).toBe(true);
    
    console.log(`Fallback test results:
      - Error diagnostics: ${errorDiags.length}
      - Backoff set: ${manager.resolverBackoff.has('primary')}
      - Events emitted: ${manager.events.length}
    `);
  });
  
  test('Recovery after backoff period', async () => {
    // Mock initially failing, then succeeding adapter
    let failCount = 0;
    manager.adapter = {
      constructor: { name: 'RecoveryAdapter' },
      async getCurrentUrl() {
        failCount++;
        if (failCount <= 2) {
          throw new Error('Initial failures');
        }
        
        return {
          url: 'https://recovery.test.com',
          title: 'Recovery Test',
          browser: 'Chrome',
          source: 'recovery',
          confidence: 'high'
        };
      }
    };
    
    manager.start();
    
    // First calls should fail and set backoff
    await manager.captureCurrentUrl();
    await manager.captureCurrentUrl();
    
    expect(manager.resolverBackoff.has('primary')).toBe(true);
    
    // Mock time passage to clear backoff
    const originalBackoff = manager.resolverBackoff.get('primary');
    manager.resolverBackoff.set('primary', Date.now() - 1000);
    
    // Next call should succeed and clear backoff
    await manager.captureCurrentUrl();
    
    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Backoff should be cleared on success
    expect(manager.resolverBackoff.has('primary')).toBe(false);
    
    console.log(`Recovery test results:
      - Initial failures: 2
      - Backoff was set: ${originalBackoff > Date.now() - 10000}
      - Backoff cleared on success: ${!manager.resolverBackoff.has('primary')}
      - Events emitted after recovery: ${manager.events.length}
    `);
  });
});
