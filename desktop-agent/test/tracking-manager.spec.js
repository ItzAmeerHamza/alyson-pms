/**
 * Tracking Manager Test Suite
 * Tests start/stop tracking with permission gates and state management
 */

const TrackingManager = require('../src/modules/core/tracking-manager');

describe('TrackingManager', () => {
  let trackingManager;
  let mockSystemMonitor;
  let mockSupabaseService;
  let mockConfig;

  beforeEach(() => {
    // Mock system monitor
    mockSystemMonitor = {
      performComprehensiveHealthCheck: jest.fn().mockResolvedValue({
        canStartTimer: true,
        overall: 'healthy',
        checks: {},
        issues: []
      }),
      updateTrackingState: jest.fn()
    };

    // Mock Supabase service
    mockSupabaseService = {
      from: jest.fn().mockReturnValue({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: {
                id: 'test-timelog-123',
                user_id: 'test-user',
                project_id: 'test-project',
                start_time: new Date().toISOString()
              },
              error: null
            })
          })
        }),
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: {}, error: null })
          })
        })
      })
    };

    // Mock config
    mockConfig = {
      // Tenant ids are integers; a non-numeric value is rejected before any
      // network call, the same way the backend helpers reject it.
      user_id: '1224',
      project_id: 'test-project'
    };

    // Set up globals
    global.systemMonitor = mockSystemMonitor;
    global.supabaseService = mockSupabaseService;
    global.enhancedScreenshotManager = { updateTrackingState: jest.fn() };
    global.browserUrlManager = { setCurrentTimeLogId: jest.fn() };
    global.enhancedActivityManager = { setTrackingState: jest.fn() };
    global.enhancedSyncManager = { setTrackingState: jest.fn() };

    trackingManager = new TrackingManager({
      config: mockConfig,
      supabaseService: mockSupabaseService,
      systemMonitor: mockSystemMonitor
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('startTracking', () => {
    it('should start timer immediately even if background health check fails', async () => {
      // Mock failed health check
      mockSystemMonitor.performComprehensiveHealthCheck.mockResolvedValue({
        canStartTimer: false,
        overall: 'critical',
        issues: ['permissions: Missing screen recording permission'],
        checks: {
          permissions: { requiresUserAction: true }
        }
      });

      const result = await trackingManager.startTracking('test-project');

      // Timer should start successfully regardless of health check
      expect(result.success).toBe(true);
      expect(result.timeLogId).toBe('test-timelog-123');
      expect(mockSupabaseService.from).toHaveBeenCalled();
      
      // Wait for background health check to complete
      await new Promise(resolve => setImmediate(resolve));
      
      // Verify health check was called asynchronously
      expect(mockSystemMonitor.performComprehensiveHealthCheck).toHaveBeenCalled();
    });

    it('should create time log and update state on successful start', async () => {
      const result = await trackingManager.startTracking('test-project');

      expect(result.success).toBe(true);
      expect(result.timeLogId).toBe('test-timelog-123');
      expect(result.projectId).toBe('test-project');
      expect(trackingManager.isTracking).toBe(true);
      expect(trackingManager.currentTimeLogId).toBe('test-timelog-123');
      
      // Verify state updates
      expect(mockSystemMonitor.updateTrackingState).toHaveBeenCalledWith({
        isTracking: true,
        isPaused: false,
        currentTimeLogId: 'test-timelog-123',
        currentProjectId: 'test-project',
        sessionStartTime: expect.any(String)
      });
    });

    it('should handle already tracking scenario', async () => {
      // Start tracking first
      await trackingManager.startTracking('test-project');
      
      // Try to start again
      const result = await trackingManager.startTracking('another-project');

      expect(result.success).toBe(true);
      expect(result.timeLogId).toBe('test-timelog-123');
      expect(mockSupabaseService.from).toHaveBeenCalledTimes(1); // Only called once
    });

    it('should resume if paused instead of starting new session', async () => {
      // Setup paused state
      trackingManager.isTracking = true;
      trackingManager.isPaused = true;
      trackingManager.currentTimeLogId = 'existing-log';
      trackingManager.resumeTracking = jest.fn().mockResolvedValue({ success: true });

      const result = await trackingManager.startTracking('test-project');

      expect(result.success).toBe(true);
      expect(result.resumed).toBe(true);
      expect(trackingManager.resumeTracking).toHaveBeenCalled();
      expect(mockSupabaseService.from).not.toHaveBeenCalled();
    });

    it('should return consistent startTime in result', async () => {
      const beforeStart = new Date();
      const result = await trackingManager.startTracking('test-project');
      const afterStart = new Date();

      expect(result.success).toBe(true);
      expect(result.startTime).toBeDefined();
      expect(result.startTime).toBe(trackingManager.sessionStartTime);
      
      // Verify startTime is a valid ISO string
      const startTime = new Date(result.startTime);
      expect(startTime.toISOString()).toBe(result.startTime);
      
      // Verify startTime is within reasonable bounds
      expect(startTime.getTime()).toBeGreaterThanOrEqual(beforeStart.getTime());
      expect(startTime.getTime()).toBeLessThanOrEqual(afterStart.getTime());
      
      // Verify consistent with global state
      expect(global.sessionStartTime).toBe(result.startTime);
      expect(global.currentSession.start_time).toBe(result.startTime);
    });
  });

  describe('stopTracking', () => {
    beforeEach(async () => {
      // Start tracking first
      await trackingManager.startTracking('test-project');
    });

    it('should flush queues and clear state', async () => {
      // Mock sync manager
      global.syncManager = { syncQueue: jest.fn().mockResolvedValue({}) };
      global.stopInputDetection = jest.fn();

      const result = await trackingManager.stopTracking('manual');

      expect(result.success).toBe(true);
      expect(trackingManager.isTracking).toBe(false);
      expect(trackingManager.currentTimeLogId).toBeNull();
      expect(global.syncManager.syncQueue).toHaveBeenCalled();
      expect(global.stopInputDetection).toHaveBeenCalled();
    });

    it('should update system monitor on stop', async () => {
      await trackingManager.stopTracking('manual');

      expect(mockSystemMonitor.updateTrackingState).toHaveBeenCalledWith({
        isTracking: false,
        isPaused: false,
        currentTimeLogId: null,
        currentProjectId: null,
        sessionStartTime: null
      });
    });

    it('should handle stop when not tracking', async () => {
      // Stop first
      await trackingManager.stopTracking('manual');
      
      // Try to stop again
      const result = await trackingManager.stopTracking('manual');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Tracking already stopped');
    });
  });
});
