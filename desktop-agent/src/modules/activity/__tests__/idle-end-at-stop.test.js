jest.mock('../../core/cleanup-registry', () => ({ registerResource: jest.fn(), registerInterval: jest.fn() }));
jest.mock('../../../lib/meeting-presence-probe', () => ({
  probeMeetingStillOpen: jest.fn().mockResolvedValue({ active: false, conclusive: true }),
  clearMeetingPresenceCache: jest.fn(),
}));
const EnhancedIdleMonitor = require('../enhanced-idle-monitor');
const { idleIntervalsFromLogs, sessionWindowsFromTimeLogs } = require('../../utils/today-effective-stats');

const MIN = 60_000;
const t0 = Date.UTC(2026, 9, 22, 11, 39); // 17:09 IST, idle starts

describe('idle period ends when the session ends (Garima, 22 Oct)', () => {
  let monitor;
  beforeEach(() => {
    monitor = new EnhancedIdleMonitor({ user_id: '1224', enable_idle_detection: true });
    monitor.currentIdleStartTime = t0;
  });
  afterEach(() => { delete global._lastStopEndAtMs; });

  it('lid closed at 17:17, stop processed on wake at 19:17 → idle ends 17:17', () => {
    global._lastStopEndAtMs = t0 + 8 * MIN; // sleep-safe session end
    monitor._lastEvaluationAt = t0 + 8 * MIN;
    expect(monitor._idleEndForStop(t0 + 128 * MIN)).toBe(t0 + 8 * MIN);
  });

  it('without a recorded stop end, a sleep gap still caps at last check + one interval', () => {
    monitor._lastEvaluationAt = t0 + 8 * MIN;
    expect(monitor._idleEndForStop(t0 + 128 * MIN)).toBe(t0 + 8 * MIN + monitor.IDLE_CHECK_INTERVAL);
  });

  it('a normal Stop while awake ends idle at the stop moment', () => {
    monitor._lastEvaluationAt = t0 + 10 * MIN - 20_000;
    expect(monitor._idleEndForStop(t0 + 10 * MIN)).toBe(t0 + 10 * MIN);
  });

  it('an older stop end (previous session) is ignored', () => {
    global._lastStopEndAtMs = t0 - 60 * MIN;
    monitor._lastEvaluationAt = t0 + 10 * MIN - 20_000;
    expect(monitor._idleEndForStop(t0 + 10 * MIN)).toBe(t0 + 10 * MIN);
  });
});

describe('desktop today stats: idle only inside tracked sessions', () => {
  afterEach(() => { delete global.isTracking; delete global.sessionStartTime; });
  const dayStart = Date.UTC(2026, 9, 22, 5);
  const dayEnd = dayStart + 24 * 60 * MIN;
  const idle = [{ idle_start: new Date(t0).toISOString(), idle_end: new Date(t0 + 129 * MIN).toISOString() }];

  it('clips a 129-minute idle row to the 8 minutes before the lid closed', () => {
    const windows = sessionWindowsFromTimeLogs([
      { start_time: new Date(t0 - 12 * MIN).toISOString(), end_time: new Date(t0 + 8 * MIN).toISOString() },
    ]);
    const out = idleIntervalsFromLogs(idle, dayStart, dayEnd, [], windows);
    expect(out.reduce((s, iv) => s + iv.endMs - iv.startMs, 0)).toBe(8 * MIN);
  });

  it('the live session counts even before it has synced', () => {
    global.isTracking = true;
    global.sessionStartTime = new Date(t0 - MIN).toISOString();
    const windows = sessionWindowsFromTimeLogs([], t0 + 20 * MIN);
    const out = idleIntervalsFromLogs(idle, dayStart, dayEnd, [], windows);
    expect(out.reduce((s, iv) => s + iv.endMs - iv.startMs, 0)).toBe(20 * MIN);
  });

  it('no time logs passed → unchanged behaviour', () => {
    const out = idleIntervalsFromLogs(idle, dayStart, dayEnd, []);
    expect(out.reduce((s, iv) => s + iv.endMs - iv.startMs, 0)).toBe(129 * MIN);
  });
});
