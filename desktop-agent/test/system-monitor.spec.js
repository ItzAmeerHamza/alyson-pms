/**
 * System Monitor Test Suite
 * Tests comprehensive health checks and permission gating
 */

const SystemMonitor = require('../src/modules/system/system-monitor');

describe('SystemMonitor', () => {
  let systemMonitor;
  let mockPermissions;

  beforeEach(() => {
    // Mock permission check module
    mockPermissions = {
      getScreenStatus: jest.fn().mockReturnValue('authorized'),
      getAccessibilityAuthorized: jest.fn().mockReturnValue(true)
    };
    
    jest.mock('../src/system/permissions-check', () => mockPermissions);
    
    systemMonitor = new SystemMonitor();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('performComprehensiveHealthCheck', () => {
    it('should block timer start when permissions fail', async () => {
      // Mock failed permissions
      mockPermissions.getScreenStatus.mockReturnValue('denied');
      mockPermissions.getAccessibilityAuthorized.mockReturnValue(false);

      const result = await systemMonitor.performComprehensiveHealthCheck();

      expect(result.canStartTimer).toBe(false);
      expect(result.overall).not.toBe('healthy');
      expect(result.checks.permissions.status).toBe('fail');
      expect(result.issues).toContain(expect.stringContaining('permissions'));
    });

    it('should allow timer start when all permissions granted', async () => {
      // Mock successful permissions
      mockPermissions.getScreenStatus.mockReturnValue('authorized');
      mockPermissions.getAccessibilityAuthorized.mockReturnValue(true);

      const result = await systemMonitor.performComprehensiveHealthCheck();

      expect(result.canStartTimer).toBe(true);
      expect(result.checks.permissions.status).toBe('pass');
    });

    it('should handle database connectivity check', async () => {
      // Mock database check
      global.supabaseService = {
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue({ error: null })
          })
        })
      };

      const result = await systemMonitor.performComprehensiveHealthCheck();
      
      expect(result.checks.database).toBeDefined();
      expect(result.checks.database.status).toBe('pass');
    });

    it('should detect missing screen recording permission on macOS', async () => {
      // Mock macOS environment
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      mockPermissions.getScreenStatus.mockReturnValue('denied');

      const result = await systemMonitor.performComprehensiveHealthCheck();

      expect(result.checks.permissions.requiresUserAction).toBe(true);
      expect(result.checks.permissions.missingPermissions).toContain('Screen Recording');
    });
  });

  describe('updateTrackingState', () => {
    it('should update internal tracking state', () => {
      const trackingState = {
        isTracking: true,
        isPaused: false,
        currentTimeLogId: 'test-123',
        currentProjectId: 'project-456',
        sessionStartTime: new Date().toISOString()
      };

      systemMonitor.updateTrackingState(trackingState);

      const status = systemMonitor.getSystemStatus();
      expect(status.isTracking).toBe(true);
      expect(status.currentTimeLogId).toBe('test-123');
      expect(status.currentProjectId).toBe('project-456');
    });
  });
});
