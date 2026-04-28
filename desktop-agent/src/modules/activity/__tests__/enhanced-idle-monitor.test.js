/**
 * Unit Tests for EnhancedIdleMonitor
 * Covers: phantom idle detection, auto-stop conditions, idle_threshold_seconds fix
 */

const EnhancedIdleMonitor = require('../enhanced-idle-monitor');

jest.mock('../../core/cleanup-registry', () => ({
  registerResource: jest.fn(),
  registerInterval: jest.fn()
}));

describe('EnhancedIdleMonitor', () => {
  let monitor;
  let mockConfig;

  beforeEach(() => {
    mockConfig = {
      user_id: 'test-user',
      enable_idle_detection: true,
      auto_stop_on_idle: true,
      idle_threshold_seconds: 10
    };

    global.unifiedInputManager = {
      getIdleTime: jest.fn().mockReturnValue(0),
      stats: { keystrokes: 100, mouseClicks: 50, mouseMovements: 200 }
    };
    global.isTracking = true;
    global.appSettings = null;
    global.stopTracking = jest.fn();
    global.enhancedActivityManager = null;
    global.supabaseService = { from: jest.fn().mockReturnValue({ insert: jest.fn().mockResolvedValue({}) }) };

    jest.useFakeTimers();
  });

  afterEach(() => {
    if (monitor) monitor.shutdown();
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  // ─── Constructor: idle_threshold_seconds should NOT control auto-stop ───

  describe('constructor threshold handling', () => {
    test('idle_threshold_seconds: 10 should NOT set auto-stop to 2 minutes', () => {
      monitor = new EnhancedIdleMonitor({ ...mockConfig, idle_threshold_seconds: 10 });
      // Should use default 10 minutes, not Math.max(2, floor(10/60)) = 2
      expect(monitor.config.idle_threshold_minutes).toBe(10);
    });

    test('explicit idle_threshold_minutes takes priority', () => {
      monitor = new EnhancedIdleMonitor({ ...mockConfig, idle_threshold_minutes: 5 });
      expect(monitor.config.idle_threshold_minutes).toBe(5);
    });

    test('global appSettings.max_idle_time_seconds is used as fallback', () => {
      global.appSettings = { max_idle_time_seconds: 1200 };
      monitor = new EnhancedIdleMonitor({ ...mockConfig, idle_threshold_seconds: 10 });
      // idle_threshold_seconds is ignored, appSettings used: floor(1200/60) = 20
      expect(monitor.config.idle_threshold_minutes).toBe(20);
    });

    test('defaults to 10 minutes when nothing is configured', () => {
      monitor = new EnhancedIdleMonitor({ user_id: 'test', auto_stop_on_idle: true });
      expect(monitor.config.idle_threshold_minutes).toBe(10);
    });
  });

  // ─── Phantom idle detection ───

  describe('phantom idle detection (mouse jitter bypass)', () => {
    beforeEach(() => {
      monitor = new EnhancedIdleMonitor(mockConfig);
      monitor.initialize({ isTracking: true });
    });

    test('no auto-stop when keystrokes and clicks are happening', () => {
      global.unifiedInputManager.stats = { keystrokes: 110, mouseClicks: 55 };
      monitor._lastSeenKeystrokes = 100;
      monitor._lastSeenClicks = 50;

      const result = monitor.checkAutoStopConditions();
      expect(result.shouldStop).toBe(false);
      expect(monitor._phantomIdleStartTime).toBeNull();
    });

    test('phantom timer starts when no new keystrokes/clicks', () => {
      monitor._lastSeenKeystrokes = 100;
      monitor._lastSeenClicks = 50;
      global.unifiedInputManager.stats = { keystrokes: 100, mouseClicks: 50 };

      const result = monitor.checkAutoStopConditions();
      expect(result.shouldStop).toBe(false);
      expect(monitor._phantomIdleStartTime).toBeTruthy();
    });

    test('phantom timer resets when a keystroke happens', () => {
      monitor._phantomIdleStartTime = Date.now() - 500000;
      monitor._lastSeenKeystrokes = 100;
      monitor._lastSeenClicks = 50;
      global.unifiedInputManager.stats = { keystrokes: 101, mouseClicks: 50 };

      const result = monitor.checkAutoStopConditions();
      expect(result.shouldStop).toBe(false);
      expect(monitor._phantomIdleStartTime).toBeNull();
    });

    test('phantom timer resets when a click happens', () => {
      monitor._phantomIdleStartTime = Date.now() - 500000;
      monitor._lastSeenKeystrokes = 100;
      monitor._lastSeenClicks = 50;
      global.unifiedInputManager.stats = { keystrokes: 100, mouseClicks: 51 };

      const result = monitor.checkAutoStopConditions();
      expect(result.shouldStop).toBe(false);
      expect(monitor._phantomIdleStartTime).toBeNull();
    });

    test('auto-stops after phantom idle threshold (10 min default)', () => {
      monitor._lastSeenKeystrokes = 100;
      monitor._lastSeenClicks = 50;
      monitor._phantomIdleStartTime = Date.now() - (11 * 60 * 1000); // 11 min ago
      global.unifiedInputManager.stats = { keystrokes: 100, mouseClicks: 50 };

      const result = monitor.checkAutoStopConditions();
      expect(result.shouldStop).toBe(true);
      expect(result.reason).toBe('phantom_idle');
    });

    test('does NOT auto-stop before phantom threshold', () => {
      monitor._lastSeenKeystrokes = 100;
      monitor._lastSeenClicks = 50;
      monitor._phantomIdleStartTime = Date.now() - (5 * 60 * 1000); // 5 min ago
      global.unifiedInputManager.stats = { keystrokes: 100, mouseClicks: 50 };

      const result = monitor.checkAutoStopConditions();
      expect(result.shouldStop).toBe(false);
    });

    test('custom phantom_idle_minutes config is respected', () => {
      monitor = new EnhancedIdleMonitor({ ...mockConfig, phantom_idle_minutes: 5 });
      monitor._lastSeenKeystrokes = 100;
      monitor._lastSeenClicks = 50;
      monitor._phantomIdleStartTime = Date.now() - (6 * 60 * 1000); // 6 min ago
      global.unifiedInputManager.stats = { keystrokes: 100, mouseClicks: 50 };

      const result = monitor.checkAutoStopConditions();
      expect(result.shouldStop).toBe(true);
      expect(result.reason).toBe('phantom_idle');
    });
  });

  // ─── OS idle auto-stop (existing behavior) ───

  describe('OS idle auto-stop', () => {
    beforeEach(() => {
      monitor = new EnhancedIdleMonitor(mockConfig);
      monitor.initialize({ isTracking: true });
    });

    test('stops when OS idle exceeds threshold', () => {
      global.unifiedInputManager.getIdleTime.mockReturnValue(11 * 60); // 11 min
      // Also set stats so phantom doesn't interfere
      monitor._lastSeenKeystrokes = 0;
      monitor._lastSeenClicks = 0;
      global.unifiedInputManager.stats = { keystrokes: 0, mouseClicks: 0 };

      const result = monitor.checkAutoStopConditions();
      expect(result.shouldStop).toBe(true);
      expect(result.reason).toBe('idle_timeout');
    });

    test('does not stop when OS idle is below threshold', () => {
      global.unifiedInputManager.getIdleTime.mockReturnValue(30); // 30 seconds
      global.unifiedInputManager.stats = { keystrokes: 100, mouseClicks: 50 };
      monitor._lastSeenKeystrokes = 100;
      monitor._lastSeenClicks = 50;

      const result = monitor.checkAutoStopConditions();
      expect(result.shouldStop).toBe(false);
    });
  });

  // ─── Fallback: zero-activity screenshots ───

  describe('zero-activity screenshot fallback', () => {
    test('stops after 20 consecutive zero-activity shots when input manager unavailable', () => {
      global.unifiedInputManager = null;
      monitor = new EnhancedIdleMonitor(mockConfig);
      monitor._consecutiveZeroActivityShots = 20;

      const result = monitor.checkAutoStopConditions();
      expect(result.shouldStop).toBe(true);
      expect(result.reason).toBe('idle_timeout');
    });

    test('does NOT use screenshot fallback when input manager IS available', () => {
      monitor = new EnhancedIdleMonitor(mockConfig);
      monitor._consecutiveZeroActivityShots = 20;
      // Input manager is available, keystrokes happening
      monitor._lastSeenKeystrokes = 100;
      monitor._lastSeenClicks = 50;
      global.unifiedInputManager.stats = { keystrokes: 110, mouseClicks: 55 };

      const result = monitor.checkAutoStopConditions();
      expect(result.shouldStop).toBe(false);
    });
  });

  // ─── State reset ───

  describe('resetIdleState', () => {
    test('resets all idle and phantom tracking state', () => {
      monitor = new EnhancedIdleMonitor(mockConfig);
      monitor.currentIdleStartTime = Date.now();
      monitor.wasIdleLastCheck = true;
      monitor.idleThresholdExceeded = true;
      monitor._phantomIdleStartTime = Date.now();

      monitor.resetIdleState();

      expect(monitor.currentIdleStartTime).toBeNull();
      expect(monitor.wasIdleLastCheck).toBe(false);
      expect(monitor.idleThresholdExceeded).toBe(false);
      expect(monitor._phantomIdleStartTime).toBeNull();
    });
  });
});
