'use strict';

const {
  isAllowedLiveClockStopReason,
} = require('../live-clock-policy');
const { clearLocalTrackingAfterStaleClose } = require('../session-recovery');

jest.mock(
  'electron',
  () => ({
    net: { isOnline: () => false },
    app: { getPath: () => '/tmp' },
  }),
  { virtual: true },
);

const TrackingManager = require('../../core/tracking-manager');

function makeTm() {
  const tm = Object.create(TrackingManager.prototype);
  tm._sessionGeneration = 1;
  tm.isTracking = true;
  tm._localSessionArmed = true;
  tm.currentTimeLogId = 'live-session';
  tm.wrappers = null;
  tm.consolidationFixes = null;
  tm._stopMonitoringSystems = jest.fn(async () => {});
  return tm;
}

describe('live clock never stops for network/health/errors', () => {
  afterEach(() => {
    delete global.isTracking;
    delete global.isStopping;
    delete global.currentTimeLogId;
    delete global.currentSession;
    delete global.sessionStartTime;
    delete global.trackingManager;
  });

  it('allows user and device Stop reasons', () => {
    expect(isAllowedLiveClockStopReason('manual')).toBe(true);
    expect(isAllowedLiveClockStopReason('idle_timeout')).toBe(true);
    expect(isAllowedLiveClockStopReason('system_sleep')).toBe(true);
    expect(isAllowedLiveClockStopReason('quit')).toBe(true);
    expect(isAllowedLiveClockStopReason('permissions_revoked')).toBe(true);
    expect(isAllowedLiveClockStopReason('system_shutdown')).toBe(true);
  });

  it('refuses network, health, and emergency reasons', () => {
    expect(isAllowedLiveClockStopReason('emergency_error')).toBe(false);
    expect(isAllowedLiveClockStopReason('health_check')).toBe(false);
    expect(isAllowedLiveClockStopReason('HEALTH_CHECK_STALE_WHILE_TRACKING')).toBe(false);
    expect(isAllowedLiveClockStopReason('offline')).toBe(false);
    expect(isAllowedLiveClockStopReason('sync_failed')).toBe(false);
    expect(isAllowedLiveClockStopReason('')).toBe(false);
  });

  it('stopTracking refuses a live Start for emergency/network reasons', async () => {
    const tm = makeTm();
    global.isTracking = true;
    global.currentTimeLogId = 'live-session';

    const refused = await tm.stopTracking('emergency_error');
    expect(refused).toEqual({
      success: false,
      refused: true,
      reason: 'live_clock_protected',
    });
    expect(tm.isTracking).toBe(true);
    expect(global.isTracking).toBe(true);
    expect(tm.currentTimeLogId).toBe('live-session');

    const offline = await tm.stopTracking('offline');
    expect(offline.refused).toBe(true);
    expect(tm.isTracking).toBe(true);
  });

  it('does not clear a live Start when stale-close has no allowed reason', () => {
    global.isTracking = true;
    global.currentTimeLogId = 'live-session';
    global.trackingManager = {
      isTracking: true,
      currentTimeLogId: 'live-session',
      _stopTimeLogCheckpoint: jest.fn(),
    };

    expect(clearLocalTrackingAfterStaleClose()).toBe(false);
    expect(global.isTracking).toBe(true);
    expect(global.currentTimeLogId).toBe('live-session');
    expect(global.trackingManager._stopTimeLogCheckpoint).not.toHaveBeenCalled();
  });

  it('gracefulStop refuses emergency_error while tracking', async () => {
    const gsm = require('../../core/graceful-shutdown-manager');
    gsm.isShuttingDown = false;
    gsm.shutdownPromise = null;
    global.isTracking = true;
    global.currentTimeLogId = 'live-session';

    const result = await gsm.gracefulStop('emergency_error');
    expect(result).toEqual({
      success: false,
      refused: true,
      reason: 'live_clock_protected',
    });
    expect(gsm.isShuttingDown).toBe(false);
    expect(global.isTracking).toBe(true);
    expect(global.currentTimeLogId).toBe('live-session');
  });

  it('clears local state for an allowed lid/sleep close', () => {
    global.isTracking = true;
    global.currentTimeLogId = 'live-session';
    global.trackingManager = {
      isTracking: true,
      currentTimeLogId: 'live-session',
      _stopTimeLogCheckpoint: jest.fn(),
    };

    expect(clearLocalTrackingAfterStaleClose({ reason: 'system_sleep' })).toBeUndefined();
    expect(global.isTracking).toBe(false);
    expect(global.currentTimeLogId).toBeNull();
  });
});
