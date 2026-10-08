const fs = require('fs');
const path = require('path');

jest.mock('fs');

const {
  resolveExplicitStopEndTime,
  reconcileAfterWake,
  shouldDropRecoveredSession,
  peekExplicitStop,
  markUserExplicitlyStopped,
  clearUserExplicitlyStopped,
  mustNotRecoverSession,
  frozenEndForSession,
  applyRecoveredSession,
  refuseLiveFrozenSession,
  shouldPreferRecover,
} = require('../session-recovery');

describe('resolveExplicitStopEndTime', () => {
  beforeEach(() => {
    fs.existsSync.mockReturnValue(false);
    fs.readdirSync.mockReturnValue([]);
  });

  it('does not fall through to NOW for an orphan close', () => {
    expect(resolveExplicitStopEndTime(null, { liveStop: false })).toBeNull();
  });

  it('uses caller fallback before NOW', () => {
    expect(resolveExplicitStopEndTime('2026-08-13T16:00:00.000Z')).toBe(
      '2026-08-13T16:00:00.000Z',
    );
  });

  it('allows NOW only for a live Stop click', () => {
    const before = Date.now();
    const iso = resolveExplicitStopEndTime(null, { liveStop: true });
    const after = Date.now();
    const ms = new Date(iso).getTime();
    expect(ms).toBeGreaterThanOrEqual(before);
    expect(ms).toBeLessThanOrEqual(after + 50);
  });

  it('prefers a local checkpoint over NOW', () => {
    const checkpointPath = path.join(
      process.env.HOME || '/tmp',
      'Library',
      'Application Support',
      'Alyson Work Time',
      'session-checkpoint.json',
    );
    fs.existsSync.mockImplementation((p) => String(p).includes('session-checkpoint.json'));
    fs.readFileSync.mockImplementation((p) => {
      if (String(p).includes('session-checkpoint.json') || String(p) === checkpointPath) {
        return JSON.stringify({ checkpointAt: '2026-08-13T16:10:00.000Z' });
      }
      throw new Error('unexpected read');
    });
    expect(resolveExplicitStopEndTime(null, { liveStop: true })).toBe(
      '2026-08-13T16:10:00.000Z',
    );
  });

  describe('scoping to the session being closed', () => {
    // A checkpoint/pending record left behind by an earlier session used to be
    // handed to the next one. Its end precedes the new session's start, the
    // server floored it, and a session that never happened appeared in payroll.
    const mockCheckpoint = (payload) => {
      fs.existsSync.mockImplementation((p) => String(p).includes('session-checkpoint.json'));
      fs.readFileSync.mockImplementation(() => JSON.stringify(payload));
    };

    it('ignores a checkpoint belonging to a previous session', () => {
      mockCheckpoint({ timeLogId: 'session-A', checkpointAt: '2026-08-13T16:10:00.000Z' });

      const iso = resolveExplicitStopEndTime(null, {
        liveStop: true,
        timeLogId: 'session-B',
      });

      expect(iso).not.toBe('2026-08-13T16:10:00.000Z');
      expect(new Date(iso).getTime()).toBeGreaterThan(
        new Date('2026-08-13T16:10:00.000Z').getTime(),
      );
    });

    it('uses the checkpoint when it belongs to this session', () => {
      mockCheckpoint({ timeLogId: 'session-A', checkpointAt: '2026-08-13T16:10:00.000Z' });

      expect(
        resolveExplicitStopEndTime(null, { liveStop: true, timeLogId: 'session-A' }),
      ).toBe('2026-08-13T16:10:00.000Z');
    });

    it('reads only this session pending file, not the newest of all', () => {
      fs.existsSync.mockImplementation((p) => {
        const s = String(p);
        return s.includes('pending_sessions') && !s.includes('session-checkpoint.json');
      });
      fs.readdirSync.mockReturnValue(['session-A.json', 'session-B.json']);
      fs.readFileSync.mockImplementation((p) =>
        JSON.stringify(
          String(p).includes('session-B')
            ? { endTime: '2026-08-13T16:30:00.000Z' }
            : { endTime: '2026-08-13T18:00:00.000Z' },
        ),
      );

      expect(
        resolveExplicitStopEndTime(null, { liveStop: true, timeLogId: 'session-B' }),
      ).toBe('2026-08-13T16:30:00.000Z');
    });
  });
});

describe('reconcileAfterWake lid close is a full stop', () => {
  const prev = {};

  beforeEach(() => {
    prev.isTracking = global.isTracking;
    prev.currentTimeLogId = global.currentTimeLogId;
    prev._lidDownArmed = global._lidDownArmed;
    prev._lidLastProofIso = global._lidLastProofIso;
    prev.trackingManager = global.trackingManager;
    global.isTracking = true;
    global.currentTimeLogId = 'open-row';
    global._lidDownArmed = true;
    global._lidLastProofIso = '2026-08-25T10:00:00.000Z';
    global.trackingManager = {
      isTracking: true,
      currentTimeLogId: 'open-row',
      _stopTimeLogCheckpoint: jest.fn(),
    };
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(
      JSON.stringify({
        timeLogId: 'open-row',
        checkpointAt: new Date().toISOString(),
      }),
    );
  });

  afterEach(() => {
    global.isTracking = prev.isTracking;
    global.currentTimeLogId = prev.currentTimeLogId;
    global._lidDownArmed = prev._lidDownArmed;
    global._lidLastProofIso = prev._lidLastProofIso;
    global.trackingManager = prev.trackingManager;
  });

  it('never continues the pre-sleep session after lid down', async () => {
    const result = await reconcileAfterWake();
    expect(result.continued).toBeUndefined();
    expect(result.lidStop).toBe(true);
    expect(global.isTracking).toBe(false);
  });
});

describe('shouldDropRecoveredSession — Continue after idle-timeout', () => {
  beforeEach(() => {
    fs.existsSync.mockReturnValue(false);
    fs.readdirSync.mockReturnValue([]);
  });

  afterEach(() => {
    clearUserExplicitlyStopped();
    delete global._lastExplicitStopTimeLogId;
    delete global._lastExplicitStopReason;
    delete global._lastExplicitStopEndIso;
    delete global._stopEndTimeOverride;
    delete global.userExplicitlyStopped;
    delete global.isTracking;
    delete global.currentTimeLogId;
    delete global.trackingManager;
  });

  it('keeps a recovered row only when there was no explicit stop', () => {
    expect(
      shouldDropRecoveredSession({
        recoveredId: '1f610840-157e-4417-999e-1a410a6c2bba',
        explicitStop: false,
      }),
    ).toBe(false);
  });

  it('drops the recovered row after idle_timeout (Hamza 21 Sep 6h20m → 8h50m)', () => {
    expect(
      shouldDropRecoveredSession({
        recoveredId: '1f610840-157e-4417-999e-1a410a6c2bba',
        stoppedId: '1f610840-157e-4417-999e-1a410a6c2bba',
        explicitStop: true,
      }),
    ).toBe(true);
  });

  it('drops any recovered row after sleep', () => {
    expect(
      shouldDropRecoveredSession({
        startAfterSleep: true,
        recoveredId: 'abc',
      }),
    ).toBe(true);
  });

  it('peekExplicitStop remembers the idle-cut end so Start can close that row', () => {
    global._stopEndTimeOverride = '2026-09-21T18:13:06.127Z';
    markUserExplicitlyStopped({
      reason: 'idle_timeout',
      timeLogId: '1f610840-157e-4417-999e-1a410a6c2bba',
    });
    const peeked = peekExplicitStop();
    expect(peeked.active).toBe(true);
    expect(peeked.timeLogId).toBe('1f610840-157e-4417-999e-1a410a6c2bba');
    expect(peeked.reason).toBe('idle_timeout');
    expect(peeked.endTime).toBe('2026-09-21T18:13:06.127Z');
  });

  it('drops a recovered row that still has a pending close file', () => {
    fs.existsSync.mockImplementation((p) => String(p).includes('pending_sessions'));
    fs.readFileSync.mockImplementation(() =>
      JSON.stringify({
        timeLogId: '1f610840-157e-4417-999e-1a410a6c2bba',
        endTime: '2026-09-21T18:13:06.127Z',
      }),
    );

    expect(
      shouldDropRecoveredSession({
        recoveredId: '1f610840-157e-4417-999e-1a410a6c2bba',
        explicitStop: false,
      }),
    ).toBe(true);
  });

  it('peekExplicitStop reloads the frozen end from disk after a restart', () => {
    delete global.userExplicitlyStopped;
    delete global._lastExplicitStopTimeLogId;
    delete global._lastExplicitStopReason;
    delete global._lastExplicitStopEndIso;
    fs.existsSync.mockImplementation((p) => String(p).includes('explicit-stop.json'));
    fs.readFileSync.mockImplementation(() =>
      JSON.stringify({
        stoppedAt: '2026-09-21T18:13:06.127Z',
        timeLogId: '1f610840-157e-4417-999e-1a410a6c2bba',
        reason: 'idle_timeout',
        endTime: '2026-09-21T18:13:06.127Z',
      }),
    );

    const peeked = peekExplicitStop();
    expect(peeked.active).toBe(true);
    expect(peeked.timeLogId).toBe('1f610840-157e-4417-999e-1a410a6c2bba');
    expect(peeked.endTime).toBe('2026-09-21T18:13:06.127Z');
  });

  it('applyRecoveredSession refuses a row that already has a frozen Stop', () => {
    fs.existsSync.mockImplementation((p) => String(p).includes('pending_sessions'));
    fs.readFileSync.mockImplementation(() =>
      JSON.stringify({
        timeLogId: '1f610840-157e-4417-999e-1a410a6c2bba',
        endTime: '2026-09-21T18:13:06.127Z',
      }),
    );

    const applied = applyRecoveredSession({
      id: '1f610840-157e-4417-999e-1a410a6c2bba',
      start_time: '2026-09-21T15:54:03.298Z',
    });

    expect(applied.refused).toBe(true);
    expect(applied.endTime).toBe('2026-09-21T18:13:06.127Z');
    expect(global.isTracking).not.toBe(true);
    expect(mustNotRecoverSession('1f610840-157e-4417-999e-1a410a6c2bba')).toBe(true);
    expect(frozenEndForSession('1f610840-157e-4417-999e-1a410a6c2bba')).toBe(
      '2026-09-21T18:13:06.127Z',
    );
  });

  it('refuseLiveFrozenSession detaches a falsely recovered live row', () => {
    fs.existsSync.mockImplementation((p) => String(p).includes('pending_sessions'));
    fs.readFileSync.mockImplementation(() =>
      JSON.stringify({
        timeLogId: '1f610840-157e-4417-999e-1a410a6c2bba',
        endTime: '2026-09-21T18:13:06.127Z',
      }),
    );
    global.isTracking = true;
    global.currentTimeLogId = '1f610840-157e-4417-999e-1a410a6c2bba';
    const queued = [];
    global.trackingManager = {
      isTracking: true,
      currentTimeLogId: '1f610840-157e-4417-999e-1a410a6c2bba',
      _queueOfflineTimeLogUpdate: (payload) => queued.push(payload),
    };

    const refused = refuseLiveFrozenSession();
    expect(refused.endTime).toBe('2026-09-21T18:13:06.127Z');
    expect(global.isTracking).toBe(false);
    expect(global.currentTimeLogId).toBeNull();
    expect(queued[0].end_time).toBe('2026-09-21T18:13:06.127Z');
    expect(queued[0].frozen_end).toBe(true);
  });

  it('shouldPreferRecover is false after idle_timeout or a pending close', () => {
    expect(shouldPreferRecover({ explicitStop: true })).toBe(false);
    expect(shouldPreferRecover({ startAfterSleep: true })).toBe(false);

    markUserExplicitlyStopped({
      reason: 'idle_timeout',
      timeLogId: '5a9ac1d6-0000-0000-0000-000000000000',
    });
    expect(shouldPreferRecover({ explicitStop: false })).toBe(false);
    clearUserExplicitlyStopped();

    fs.existsSync.mockImplementation((p) => String(p).includes('pending_sessions'));
    fs.readdirSync.mockReturnValue(['5a9ac1d6-0000-0000-0000-000000000000.json']);
    fs.readFileSync.mockImplementation(() =>
      JSON.stringify({
        timeLogId: '5a9ac1d6-0000-0000-0000-000000000000',
        endTime: '2026-09-30T11:36:00.000Z',
      }),
    );
    expect(shouldPreferRecover({ explicitStop: false })).toBe(false);
  });

  it('shouldPreferRecover stays true only for a crash-mid-session resume', () => {
    expect(shouldPreferRecover({})).toBe(true);
  });
});
