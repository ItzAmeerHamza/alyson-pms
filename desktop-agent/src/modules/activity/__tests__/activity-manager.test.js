/**
 * Unit Tests for ActivityManager
 * Tests activity monitoring and recording functionality
 */

const ActivityManager = require('../activity-manager');

// Mock cleanup registry
jest.mock('../../core/cleanup-registry', () => ({
  registerResource: jest.fn()
}));

describe('ActivityManager', () => {
  let activityManager;
  let mockConfig;

  beforeEach(() => {
    mockConfig = {
      user_id: 'test-user-123',
      project_id: 'test-project-456'
    };

    // Clear global state
    global.displayActivityStats = null;
    global.mainWindow = null;

    activityManager = new ActivityManager(mockConfig);
    jest.clearAllMocks();
  });

  afterEach(() => {
    activityManager.stopMonitoring();
  });

  describe('initialization', () => {
    it('should initialize with default activity stats', () => {
      expect(activityManager.displayActivityStats).toBeDefined();
      expect(activityManager.displayActivityStats.totalClicks).toBe(0);
      expect(activityManager.displayActivityStats.totalKeys).toBe(0);
      expect(activityManager.displayActivityStats.totalMoves).toBe(0);
    });

    it('should register with cleanup registry', () => {
      const cleanupRegistry = require('../../core/cleanup-registry');
      expect(cleanupRegistry.registerResource).toHaveBeenCalledWith({
        name: 'activityManager',
        cleanup: expect.any(Function)
      });
    });

    it('should make stats globally available', () => {
      expect(global.displayActivityStats).toBe(activityManager.displayActivityStats);
    });
  });

  describe('activity stats persistence', () => {
    it('should be a local no-op and keep counters intact', async () => {
      activityManager.recordActivity('click', 'test');
      const clicksBefore = activityManager.displayActivityStats.totalClicks;

      // activity_stats has no RDS equivalent: the backend derives activity from
      // screenshot and idle rows, so this must not throw or clear local counters.
      await expect(activityManager.saveActivityStatsToDatabase()).resolves.toBeUndefined();

      expect(activityManager.displayActivityStats.totalClicks).toBe(clicksBefore);
    });
  });

  describe('recordActivity', () => {
    it('should record click activity', () => {
      const initialClicks = activityManager.displayActivityStats.totalClicks;

      activityManager.recordActivity('click', 'test');

      expect(activityManager.displayActivityStats.totalClicks).toBe(initialClicks + 1);
      expect(activityManager.displayActivityStats.sessionClicks).toBe(1);
      expect(activityManager.activityQueue.length).toBe(1);
    });

    it('should record key activity', () => {
      const initialKeys = activityManager.displayActivityStats.totalKeys;

      activityManager.recordActivity('key', 'test');

      expect(activityManager.displayActivityStats.totalKeys).toBe(initialKeys + 1);
      expect(activityManager.displayActivityStats.sessionKeys).toBe(1);
    });

    it('should record mouse move activity', () => {
      const initialMoves = activityManager.displayActivityStats.totalMoves;

      activityManager.recordActivity('move', 'test');

      expect(activityManager.displayActivityStats.totalMoves).toBe(initialMoves + 1);
      expect(activityManager.displayActivityStats.sessionMoves).toBe(1);
    });

    it('should update last activity timestamp', () => {
      const beforeTime = Date.now();
      
      activityManager.recordActivity('click', 'test');
      
      expect(activityManager.displayActivityStats.lastActivity).toBeGreaterThanOrEqual(beforeTime);
    });

    it('should queue activity for database sync', () => {
      activityManager.recordActivity('click', 'test', { extra: 'data' });

      expect(activityManager.activityQueue.length).toBe(1);
      expect(activityManager.activityQueue[0]).toMatchObject({
        type: 'click',
        method: 'test',
        details: { extra: 'data' }
      });
    });

    it('should limit queue size', () => {
      // Fill queue beyond limit
      for (let i = 0; i < 1100; i++) {
        activityManager.recordActivity('click', 'test');
      }

      // Should be trimmed to 500 after hitting 1000
      expect(activityManager.activityQueue.length).toBe(600); // 1100 - 500 = 600
    });
  });

  describe('monitoring lifecycle', () => {
    it('should start monitoring', () => {
      expect(activityManager.isMonitoring).toBe(false);

      activityManager.startMonitoring();

      expect(activityManager.isMonitoring).toBe(true);
      expect(activityManager.liveActivityInterval).toBeDefined();
      expect(activityManager.activitySyncInterval).toBeDefined();
    });

    it('should stop monitoring', () => {
      activityManager.startMonitoring();
      expect(activityManager.isMonitoring).toBe(true);

      activityManager.stopMonitoring();

      expect(activityManager.isMonitoring).toBe(false);
      expect(activityManager.liveActivityInterval).toBeNull();
      expect(activityManager.activitySyncInterval).toBeNull();
    });

    it('should not start monitoring if already monitoring', () => {
      activityManager.startMonitoring();
      const firstInterval = activityManager.liveActivityInterval;

      activityManager.startMonitoring(); // Should not create new intervals

      expect(activityManager.liveActivityInterval).toBe(firstInterval);
    });
  });

  describe('getDefaultActivityData', () => {
    it('should return correct activity data structure', () => {
      activityManager.recordActivity('click', 'test');
      activityManager.recordActivity('key', 'test');
      activityManager.recordActivity('move', 'test');

      const activityData = activityManager.getDefaultActivityData();

      expect(activityData).toMatchObject({
        clicks: 1,
        keystrokes: 1,
        mouseMovements: 1,
        sessionClicks: 1,
        sessionKeys: 1,
        sessionMoves: 1
      });
      expect(activityData.timestamp).toBeDefined();
      expect(activityData.lastActivity).toBeDefined();
    });
  });

  describe('sendActivityToRenderer', () => {
    it('should not send if no main window', () => {
      global.mainWindow = null;

      // Should not throw error
      expect(() => {
        activityManager.sendActivityToRenderer();
      }).not.toThrow();
    });

    it('should not send if main window is destroyed', () => {
      global.mainWindow = {
        isDestroyed: () => true,
        webContents: {
          send: jest.fn()
        }
      };

      activityManager.sendActivityToRenderer();

      expect(global.mainWindow.webContents.send).not.toHaveBeenCalled();
    });

    it('should send activity data to renderer', () => {
      global.mainWindow = {
        isDestroyed: () => false,
        webContents: {
          send: jest.fn()
        }
      };

      activityManager.sendActivityToRenderer();

      expect(global.mainWindow.webContents.send).toHaveBeenCalledWith(
        'activity-update',
        expect.objectContaining({
          clicks: expect.any(Number),
          keystrokes: expect.any(Number),
          mouseMovements: expect.any(Number)
        })
      );
    });

    it('should skip IPC when the dashboard window is hidden', () => {
      global.mainWindow = {
        isDestroyed: () => false,
        isVisible: () => false,
        webContents: {
          send: jest.fn()
        }
      };

      activityManager.sendActivityToRenderer();

      expect(global.mainWindow.webContents.send).not.toHaveBeenCalled();
    });
  });

  describe('resetActivityCounters', () => {
    it('should reset session counters', () => {
      activityManager.recordActivity('click', 'test');
      activityManager.recordActivity('key', 'test');
      activityManager.recordActivity('move', 'test');

      expect(activityManager.displayActivityStats.sessionClicks).toBe(1);

      activityManager.resetActivityCounters();

      expect(activityManager.displayActivityStats.sessionClicks).toBe(0);
      expect(activityManager.displayActivityStats.sessionKeys).toBe(0);
      expect(activityManager.displayActivityStats.sessionMoves).toBe(0);
      expect(activityManager.activityQueue.length).toBe(0);
    });

    it('should update session start time', () => {
      const beforeReset = activityManager.displayActivityStats.sessionStart;
      
      // Small delay to ensure different timestamp
      setTimeout(() => {
        activityManager.resetActivityCounters();
        expect(activityManager.displayActivityStats.sessionStart).toBeGreaterThan(beforeReset);
      }, 10);
    });
  });

  describe('getActivityStats', () => {
    it('should return complete activity statistics', () => {
      activityManager.recordActivity('click', 'test');
      activityManager.startMonitoring();

      const stats = activityManager.getActivityStats();

      expect(stats).toMatchObject({
        totalClicks: 1,
        queueSize: 1,
        isMonitoring: true
      });
    });
  });
});