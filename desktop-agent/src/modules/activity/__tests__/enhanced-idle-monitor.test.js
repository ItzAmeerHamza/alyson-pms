/**
 * Unit Tests for EnhancedIdleMonitor
 * Covers: phantom idle detection, auto-stop conditions, idle_threshold_seconds fix
 */

const EnhancedIdleMonitor = require('../enhanced-idle-monitor');

jest.mock('../../core/cleanup-registry', () => ({
  registerResource: jest.fn(),
  registerInterval: jest.fn()
}));

jest.mock('../../utils/backend-time-logs', () => ({
  isBackendTimeLogsEnabled: jest.fn().mockReturnValue(true),
  insertIdleLog: jest.fn().mockResolvedValue({})
}));

const backendTimeLogs = require('../../utils/backend-time-logs');
const {
  _resetMeetingSessionForTests,
  _setPresenceForTests,
} = require('../../../lib/meeting-context');

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

    backendTimeLogs.isBackendTimeLogsEnabled.mockReturnValue(true);
    backendTimeLogs.insertIdleLog.mockResolvedValue({});
    _resetMeetingSessionForTests();

    jest.useFakeTimers();
  });

  afterEach(() => {
    if (monitor) monitor.shutdown();
    delete global.trackingManager;
    delete global.currentSession;
    global.currentUserId = 'test-user';
    jest.useRealTimers();
    jest.clearAllMocks();
    _resetMeetingSessionForTests();
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

  // ─── Idle stop truncates exactly the prompt threshold (default 10m) ───

  describe('idle stop time cut', () => {
    beforeEach(() => {
      monitor = new EnhancedIdleMonitor(mockConfig);
      monitor.initialize({ isTracking: true });
      // Session started well before the cut window
      global.currentSession = {
        start_time: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      };
    });

    test('_stopForIdle with allowCut ends session exactly 10 minutes before now', () => {
      const before = Date.now();
      monitor._stopForIdle('idle_timeout', { allowCut: true });
      const after = Date.now();

      expect(global.stopTracking).toHaveBeenCalledTimes(1);
      const [, , options] = global.stopTracking.mock.calls[0];
      const endMs = new Date(options.endTimeOverride).getTime();
      const expectedMin = before - 10 * 60 * 1000;
      const expectedMax = after - 10 * 60 * 1000;
      expect(endMs).toBeGreaterThanOrEqual(expectedMin - 5);
      expect(endMs).toBeLessThanOrEqual(expectedMax + 5);
      expect(options.authorizedIdleCut).toBe(true);
      expect(options.timeCutSeconds).toBe(600);
    });

    test('_stopForIdle without allowCut does not subtract time', () => {
      monitor._stopForIdle('idle_timeout');
      expect(global.stopTracking).toHaveBeenCalledTimes(1);
      const [, , options] = global.stopTracking.mock.calls[0];
      expect(options?.endTimeOverride).toBeUndefined();
    });

    test('_stopForIdle with allowCut does not use idle-start (avoids cutting the countdown minute)', () => {
      monitor._idlePromptIdleStart = Date.now() - 11 * 60 * 1000;
      monitor._stopForIdle('idle_timeout', { allowCut: true });

      const endMs = new Date(global.stopTracking.mock.calls[0][2].endTimeOverride).getTime();
      const elevenMinAgo = Date.now() - 11 * 60 * 1000;
      expect(Math.abs(endMs - (Date.now() - 10 * 60 * 1000))).toBeLessThan(2000);
      expect(endMs).toBeGreaterThan(elevenMinAgo + 30 * 1000);
    });

    test('timeout after shown prompt cuts 10m and stops; break stops without cut; unshown prompt does not cut', () => {
      monitor._idlePromptActive = true;
      monitor._idlePromptShown = true;
      monitor._resolveIdlePrompt('timeout');
      expect(global.stopTracking).toHaveBeenCalledWith(
        'idle_timeout',
        null,
        expect.objectContaining({
          endTimeOverride: expect.any(String),
          timeCutSeconds: 600,
          authorizedIdleCut: true,
        }),
      );

      global.stopTracking.mockClear();
      monitor._idlePromptActive = true;
      monitor._idlePromptShown = true;
      monitor._resolveIdlePrompt('break');
      expect(global.stopTracking).toHaveBeenCalledWith('on_break', null, {});
      expect(global.stopTracking.mock.calls[0][2]?.endTimeOverride).toBeUndefined();

      global.stopTracking.mockClear();
      monitor._idlePromptActive = true;
      monitor._idlePromptShown = false;
      monitor._resolveIdlePrompt('timeout');
      expect(global.stopTracking).not.toHaveBeenCalled();
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

  // ─── Continuous idle logging ───

  describe('continuous idle logging', () => {
    test('default idle detection threshold is 300 seconds (5 minutes)', () => {
      monitor = new EnhancedIdleMonitor({ user_id: 'test' });
      expect(monitor.IDLE_THRESHOLD).toBe(300);
      expect(monitor.IDLE_CHECK_INTERVAL).toBe(30000);
      expect(monitor.LOW_ACTIVITY_PERCENT).toBe(30);
    });

    test('idle_detection_threshold_seconds config is respected', () => {
      monitor = new EnhancedIdleMonitor({
        user_id: 'test',
        idle_detection_threshold_seconds: 90,
        idle_checkpoint_interval_seconds: 120,
      });
      expect(monitor.IDLE_THRESHOLD).toBe(90);
      expect(monitor.IDLE_CHECK_INTERVAL).toBe(120000);
    });

    test('flushIdleCheckpoint persists while user remains idle', async () => {
      monitor = new EnhancedIdleMonitor({ user_id: '1195' });
      monitor.initialize({ isTracking: true });
      monitor.logIdlePeriod = jest.fn().mockResolvedValue(undefined);

      const idleStart = Date.now() - 45000;
      monitor.currentIdleStartTime = idleStart;
      monitor.wasIdleLastCheck = true;

      await monitor._flushIdleCheckpoint(idleStart + 45000);

      expect(monitor.logIdlePeriod).toHaveBeenCalledTimes(1);
      expect(monitor.logIdlePeriod.mock.calls[0][2]).toBe(45000);
      expect(monitor._lastIdleCheckpointTime).toBe(idleStart + 45000);
    });

    test('logIdlePeriod persists idle time through the RDS backend action', async () => {
      monitor = new EnhancedIdleMonitor({ user_id: '1195' });

      const end = Date.now();
      const start = end - 45000;
      // The shared setup pins global.currentUserId to 'test-user', which is not a
      // tenant id and normalizes to null, so the write was being skipped for want
      // of a user rather than anything this test is about.
      global.currentUserId = '1195';
      // Idle is only recorded inside a session, so one has to be open for it to
      // belong to. Without this the period is discarded as untracked time.
      global.trackingManager = { sessionStartTime: new Date(start - 60000).toISOString() };
      await monitor.logIdlePeriod(start, end, 45000);

      expect(backendTimeLogs.insertIdleLog).toHaveBeenCalledTimes(1);
      const [payload] = backendTimeLogs.insertIdleLog.mock.calls[0];
      expect(payload.user_id).toBe('1195');
      expect(payload.duration_seconds).toBe(45);
      expect(payload.idle_start).toBe(new Date(start).toISOString());
      expect(payload.idle_end).toBe(new Date(end).toISOString());
    });

    test('flushIdleCheckpoint skips duplicate slices on resume', async () => {
      monitor = new EnhancedIdleMonitor({ user_id: '1195' });
      monitor.logIdlePeriod = jest.fn().mockResolvedValue(undefined);

      const t0 = Date.now() - 90000;
      monitor.currentIdleStartTime = t0;
      monitor.wasIdleLastCheck = true;
      monitor._lastIdleCheckpointTime = t0 + 60000;

      await monitor._flushIdleCheckpoint(t0 + 90000);

      expect(monitor.logIdlePeriod).toHaveBeenCalledTimes(1);
      expect(monitor.logIdlePeriod.mock.calls[0][0]).toBe(t0 + 60000);
      expect(monitor.logIdlePeriod.mock.calls[0][2]).toBe(30000);
    });

    test('low activity / no keys alone does not start idle (OS-only)', async () => {
      monitor = new EnhancedIdleMonitor({ user_id: '1195' });
      monitor.initialize({ isTracking: true });
      monitor.isTracking = true;
      global.isTracking = true;
      monitor.logIdlePeriod = jest.fn().mockResolvedValue(undefined);
      monitor._lastHighActivityAt = Date.now() - 65000;
      monitor._lastInputActivityAt = Date.now() - 65000;
      global.unifiedInputManager.getIdleTime.mockReturnValue(10); // mouse still moving

      await monitor._evaluateIdleState();

      expect(monitor.wasIdleLastCheck).toBe(false);
      expect(monitor.logIdlePeriod).not.toHaveBeenCalled();
    });

    test('does not persist idle while a video meeting is in progress', async () => {
      monitor = new EnhancedIdleMonitor({ user_id: '1195' });
      global.currentUserId = '1195';
      global.trackingManager = { sessionStartTime: new Date(Date.now() - 60000).toISOString() };
      _setPresenceForTests({ active: true, label: 'Google Meet' });

      const end = Date.now();
      await monitor.logIdlePeriod(end - 398000, end, 398000);

      expect(backendTimeLogs.insertIdleLog).not.toHaveBeenCalled();
    });

    test('OS idle during a meeting does not start an idle period', async () => {
      monitor = new EnhancedIdleMonitor({ user_id: '1195' });
      monitor.initialize({ isTracking: true });
      monitor.isTracking = true;
      global.isTracking = true;
      global.unifiedInputManager.getIdleTime.mockReturnValue(300);
      _setPresenceForTests({ active: true, label: 'Google Meet' });

      await monitor._evaluateIdleState();

      expect(monitor.wasIdleLastCheck).toBe(false);
      expect(monitor.currentIdleStartTime).toBeNull();
    });

    test('Windows Zoom window presence also blocks idle writes', async () => {
      monitor = new EnhancedIdleMonitor({ user_id: '1195' });
      global.currentUserId = '1195';
      global.trackingManager = { sessionStartTime: new Date(Date.now() - 60000).toISOString() };
      _setPresenceForTests({ active: true, label: 'Zoom' });

      await monitor.logIdlePeriod(Date.now() - 400000, Date.now(), 400000);

      expect(backendTimeLogs.insertIdleLog).not.toHaveBeenCalled();
    });

    test('after a conclusive meeting miss, OS idle is written (non-effective can grow)', async () => {
      monitor = new EnhancedIdleMonitor({ user_id: '1195' });
      monitor.initialize({ isTracking: true });
      monitor.isTracking = true;
      global.isTracking = true;
      global.unifiedInputManager.getIdleTime.mockReturnValue(300);
      _setPresenceForTests({ active: false, label: null });

      await monitor._evaluateIdleState();

      expect(monitor.wasIdleLastCheck).toBe(true);
      expect(monitor.currentIdleStartTime).toBeTruthy();
    });

    test('OS idle at/above 5 min starts idle logging', async () => {
      monitor = new EnhancedIdleMonitor({ user_id: '1195' });
      monitor.initialize({ isTracking: true });
      monitor.isTracking = true;
      global.isTracking = true;
      global.unifiedInputManager.getIdleTime.mockReturnValue(300);

      await monitor._evaluateIdleState();

      expect(monitor.wasIdleLastCheck).toBe(true);
      expect(monitor.currentIdleStartTime).toBeTruthy();
    });

    test('effective idle is OS-only (ignores input/low activity for logging)', () => {
      monitor = new EnhancedIdleMonitor({ user_id: '1195' });
      monitor.initialize({ isTracking: true });
      monitor._lastInputActivityAt = Date.now() - 120000;
      monitor._lastSeenKeystrokesForIdle = 5;
      monitor._lastSeenClicksForIdle = 2;
      global.unifiedInputManager.getIdleTime.mockReturnValue(5);
      global.unifiedInputManager.stats = { keystrokes: 5, mouseClicks: 2, lastActivity: Date.now() - 120000 };

      const result = monitor._getEffectiveIdleSeconds();
      expect(result.os).toBe(5);
      expect(result.input).toBeGreaterThanOrEqual(119);
      expect(result.effective).toBe(5);
    });

    test('resetIdleState clears checkpoint tracking', () => {
      monitor = new EnhancedIdleMonitor(mockConfig);
      monitor.currentIdleStartTime = Date.now();
      monitor.wasIdleLastCheck = true;
      monitor.idleThresholdExceeded = true;
      monitor._phantomIdleStartTime = Date.now();
      monitor._lastIdleCheckpointTime = Date.now();

      monitor.resetIdleState();

      expect(monitor.currentIdleStartTime).toBeNull();
      expect(monitor._lastIdleCheckpointTime).toBeNull();
      expect(monitor.wasIdleLastCheck).toBe(false);
      expect(monitor.idleThresholdExceeded).toBe(false);
      expect(monitor._phantomIdleStartTime).toBeNull();
    });
  });
});
