/**
 * A device-wide close must never stamp one timestamp onto several sessions.
 *
 * The health-check and wake sweeps pass the running session's checkpoint as
 * end_time. When that reached the device-wide close it was applied to every
 * open row, ending an unrelated orphan AFTER the current session had already
 * started: 84 overlapping pairs sat 0-29s (0-3 checkpoint intervals) past the
 * newer session's start.
 *
 * A sweep that does not name a session must close each row at its own
 * proof-of-life. Only a caller that names one may supply an end for it.
 */

jest.mock('../backend-time-logs', () => ({
  isBackendTimeLogsEnabled: jest.fn(() => true),
  isLikelyOffline: jest.fn(() => false),
  killAllSessions: jest.fn(async () => ({ success: true, closed: 2 })),
  closeActiveSessions: jest.fn(async () => ({ success: true, closed: 1 })),
  reconcileOpenSessions: jest.fn(async () => ({})),
}));

jest.mock('../device-id', () => ({ getDeviceId: () => 'device-1' }));

const backendTimeLogs = require('../backend-time-logs');
const {
  closeOpenSessionsAfterExplicitStop,
  hasLiveSessionToProtect,
  liveTimeLogId,
} = require('../session-recovery');

describe('device-wide close routing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.currentUserId = '1224';
    global.config = {};
    delete global.isTracking;
    delete global.currentTimeLogId;
    delete global.trackingManager;
  });

  it('uses per-row liveness for a sweep with no session named', async () => {
    await closeOpenSessionsAfterExplicitStop({ reason: 'explicit_stop' });

    expect(backendTimeLogs.killAllSessions).toHaveBeenCalledTimes(1);
    expect(backendTimeLogs.closeActiveSessions).not.toHaveBeenCalled();
  });

  it('excepts a live Start from leftover kill-all', async () => {
    global.isTracking = true;
    global.currentTimeLogId = 'a402c6b3-0a5f-474b-96c5-f073cbd10668';

    await closeOpenSessionsAfterExplicitStop({ reason: 'pending_recovery' });

    expect(backendTimeLogs.killAllSessions).toHaveBeenCalledWith(
      '1224',
      'device-1',
      {},
      expect.objectContaining({
        exceptTimeLogId: 'a402c6b3-0a5f-474b-96c5-f073cbd10668',
      }),
    );
  });

  it('closes the live row when protectLive is false', async () => {
    global.isTracking = true;
    global.currentTimeLogId = 'lid-session';

    await closeOpenSessionsAfterExplicitStop({
      reason: 'system_sleep',
      protectLive: false,
    });

    expect(backendTimeLogs.killAllSessions).toHaveBeenCalledWith(
      '1224',
      'device-1',
      {},
      expect.objectContaining({ exceptTimeLogId: null }),
    );
  });

  it('ignores an ambient end_time when no session is named', async () => {
    // The regression: a running session's checkpoint reaching an orphan.
    await closeOpenSessionsAfterExplicitStop({
      end_time: '2026-08-13T16:10:00.000Z',
      reason: 'health_check_stale',
    });

    expect(backendTimeLogs.killAllSessions).toHaveBeenCalledTimes(1);
    expect(backendTimeLogs.closeActiveSessions).not.toHaveBeenCalled();
  });

  it('honours an explicit end when the caller names the session', async () => {
    await closeOpenSessionsAfterExplicitStop({
      end_time: '2026-08-13T16:10:00.000Z',
      timeLogId: 'session-A',
    });

    expect(backendTimeLogs.killAllSessions).not.toHaveBeenCalled();
    expect(backendTimeLogs.closeActiveSessions).toHaveBeenCalledTimes(1);
  });

  it('protects a live Start from leftover pending-close kill-all', () => {
    global.isTracking = true;
    global.currentTimeLogId = 'a402c6b3-0a5f-474b-96c5-f073cbd10668';
    expect(hasLiveSessionToProtect()).toBe(true);
    expect(liveTimeLogId()).toBe('a402c6b3-0a5f-474b-96c5-f073cbd10668');
    delete global.isTracking;
    delete global.currentTimeLogId;
    expect(hasLiveSessionToProtect()).toBe(false);
  });

  it('does not reach the network when offline', async () => {
    backendTimeLogs.isLikelyOffline.mockReturnValueOnce(true);

    const res = await closeOpenSessionsAfterExplicitStop({ reason: 'explicit_stop' });

    expect(res).toMatchObject({ success: true, offline: true });
    expect(backendTimeLogs.killAllSessions).not.toHaveBeenCalled();
    expect(backendTimeLogs.closeActiveSessions).not.toHaveBeenCalled();
  });

  it('swallows a named-session close timeout so lid-close cannot unhandled-reject', async () => {
    backendTimeLogs.closeActiveSessions.mockRejectedValueOnce(
      new Error('Backend sync timeout after 4000ms (close_active_sessions)'),
    );

    await expect(
      closeOpenSessionsAfterExplicitStop({
        timeLogId: 'session-A',
        end_time: '2026-08-31T12:15:47.000Z',
        reason: 'system_sleep',
        timeoutMs: 4000,
      }),
    ).resolves.toMatchObject({
      success: false,
      queued: true,
      reason: 'close_failed',
    });
  });
});
