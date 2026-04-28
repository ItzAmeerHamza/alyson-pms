/**
 * Database Backoff Test
 * Ensures exponential backoff works correctly for database timeouts and errors
 */

describe('Database Exponential Backoff', () => {
  let EnhancedSyncManager;
  let syncManager;
  let mockSupabaseService;
  
  beforeAll(() => {
    EnhancedSyncManager = require('../src/modules/sync/enhanced-sync-manager.js');
  });
  
  beforeEach(() => {
    // Mock Supabase service
    mockSupabaseService = {
      from: jest.fn().mockReturnThis(),
      insert: jest.fn()
    };
    
    syncManager = new EnhancedSyncManager({}, mockSupabaseService);
    syncManager.initialize();
  });
  
  afterEach(() => {
    syncManager.shutdown();
  });
  
  test('Exponential backoff activates on database timeout', async () => {
    // Mock timeout error
    mockSupabaseService.insert.mockRejectedValue(new Error('Statement timeout'));
    
    const testBatch = [
      { url: 'https://test.com', user_id: 'test-user', timestamp: new Date().toISOString() }
    ];
    
    // First attempt should fail and activate backoff
    try {
      await syncManager._insertUrlBatch(testBatch);
    } catch (error) {
      expect(error.message).toContain('Statement timeout');
    }
    
    // Verify backoff is active
    expect(syncManager.dbBackoff.isActive).toBe(true);
    expect(syncManager.dbBackoff.retryCount).toBe(1);
    expect(syncManager.dbBackoff.nextRetryAt).toBeGreaterThan(Date.now());
    
    // Second immediate attempt should be blocked by backoff
    try {
      await syncManager._insertUrlBatch(testBatch);
    } catch (error) {
      expect(error.message).toContain('Database in backoff');
    }
    
    expect(syncManager.dbBackoff.retryCount).toBe(1); // Should not increment
  });
  
  test('Exponential backoff increases delay correctly', async () => {
    mockSupabaseService.insert.mockRejectedValue(new Error('Network error'));
    
    const testBatch = [
      { url: 'https://test.com', user_id: 'test-user', timestamp: new Date().toISOString() }
    ];
    
    const delays = [];
    
    // Simulate multiple failures
    for (let i = 0; i < 4; i++) {
      // Clear previous backoff to allow retry
      syncManager.dbBackoff.nextRetryAt = 0;
      
      try {
        await syncManager._insertUrlBatch(testBatch);
      } catch (error) {
        // Expected to fail
      }
      
      delays.push(syncManager.dbBackoff.nextRetryAt - Date.now());
    }
    
    // Verify exponential growth
    expect(delays[0]).toBeGreaterThan(0);
    expect(delays[1]).toBeGreaterThan(delays[0] * 1.5); // Should roughly double
    expect(delays[2]).toBeGreaterThan(delays[1] * 1.5);
    expect(delays[3]).toBeLessThanOrEqual(syncManager.dbBackoff.maxDelayMs + Date.now()); // Capped
    
    console.log('Exponential backoff delays:', delays);
  });
  
  test('Database backoff clears on success', async () => {
    // First, activate backoff with a failure
    mockSupabaseService.insert.mockRejectedValueOnce(new Error('Timeout'));
    
    const testBatch = [
      { url: 'https://test.com', user_id: 'test-user', timestamp: new Date().toISOString() }
    ];
    
    try {
      await syncManager._insertUrlBatch(testBatch);
    } catch (error) {
      // Expected failure
    }
    
    expect(syncManager.dbBackoff.isActive).toBe(true);
    
    // Now mock success and clear backoff time
    mockSupabaseService.insert.mockResolvedValueOnce({ error: null });
    syncManager.dbBackoff.nextRetryAt = 0; // Allow retry
    
    // Should succeed and clear backoff
    await syncManager._insertUrlBatch(testBatch);
    
    expect(syncManager.dbBackoff.isActive).toBe(false);
    expect(syncManager.dbBackoff.retryCount).toBe(0);
    expect(syncManager.dbBackoff.nextRetryAt).toBe(0);
  });
  
  test('Diagnostic verbosity drops during backoff', async () => {
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
    
    mockSupabaseService.insert.mockRejectedValue(new Error('Database busy'));
    
    const testBatch = [
      { url: 'https://test.com', user_id: 'test-user', timestamp: new Date().toISOString() }
    ];
    
    // First failure should trigger verbosity drop
    try {
      await syncManager._insertUrlBatch(testBatch);
    } catch (error) {
      // Expected
    }
    
    expect(syncManager.dbBackoff.verbosityDropped).toBe(true);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('dropping diagnostic verbosity during backoff')
    );
    
    consoleSpy.mockRestore();
  });
  
  test('Statement timeout wrapper works correctly', async () => {
    // Mock slow response that exceeds timeout
    const slowPromise = new Promise((resolve) => {
      setTimeout(() => resolve({ error: null }), 3000); // 3s > 2s timeout
    });
    
    mockSupabaseService.insert.mockReturnValue(slowPromise);
    
    const testBatch = [
      { url: 'https://test.com', user_id: 'test-user', timestamp: new Date().toISOString() }
    ];
    
    const startTime = Date.now();
    
    try {
      await syncManager._insertUrlBatch(testBatch);
    } catch (error) {
      const elapsed = Date.now() - startTime;
      expect(error.message).toContain('Statement timeout');
      expect(elapsed).toBeLessThan(2500); // Should timeout before 2.5s
      expect(elapsed).toBeGreaterThan(1900); // But after ~2s
    }
  });
  
  test('Queue pressure integrates with database backoff', async () => {
    // Fill queue to trigger pressure
    for (let i = 0; i < 600; i++) { // Over threshold of 500
      await syncManager.addToBatchQueue('urlLogs', {
        url: `https://test${i}.com`,
        user_id: 'test-user',
        timestamp: new Date().toISOString()
      });
    }
    
    expect(syncManager.queuePressure.isActive).toBe(true);
    
    // Mock database failure to activate backoff
    mockSupabaseService.insert.mockRejectedValue(new Error('Connection failed'));
    
    // Wait for pressure timeout to trigger force flush
    await new Promise(resolve => setTimeout(resolve, 3100));
    
    // Should have attempted force flush despite backoff
    expect(mockSupabaseService.insert).toHaveBeenCalled();
    expect(syncManager.dbBackoff.isActive).toBe(true);
  });
  
  test('getSyncStatus includes backoff state', () => {
    // Activate backoff
    syncManager.dbBackoff.isActive = true;
    syncManager.dbBackoff.retryCount = 3;
    syncManager.dbBackoff.nextRetryAt = Date.now() + 5000;
    
    const status = syncManager.getSyncStatus();
    
    expect(status.dbBackoff.isActive).toBe(true);
    expect(status.dbBackoff.retryCount).toBe(3);
    expect(status.dbBackoff.nextRetryIn).toBeGreaterThan(4000);
    expect(status.dbBackoff.nextRetryIn).toBeLessThan(5100);
  });
});
