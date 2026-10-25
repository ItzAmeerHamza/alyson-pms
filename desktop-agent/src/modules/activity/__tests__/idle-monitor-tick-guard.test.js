jest.mock('../../core/cleanup-registry', () => ({
  registerResource: jest.fn(),
  registerInterval: jest.fn(),
}));
jest.mock('../../../lib/meeting-presence-probe', () => ({
  probeMeetingStillOpen: jest.fn().mockResolvedValue({ active: false, conclusive: true }),
  clearMeetingPresenceCache: jest.fn(),
}));

const EnhancedIdleMonitor = require('../enhanced-idle-monitor');

describe('idle interval tick in-flight guard', () => {
  let monitor;
  beforeEach(() => {
    global.isTracking = true;
    global.unifiedInputManager = { getIdleTime: () => 0, stats: { keystrokes: 0, mouseClicks: 0 } };
    monitor = new EnhancedIdleMonitor({ user_id: 'u', enable_idle_detection: true, idle_threshold_seconds: 10 });
    monitor.isTracking = true;
  });
  afterEach(() => {
    try { monitor.shutdown(); } catch (_) {}
    delete global.unifiedInputManager;
  });

  it('skips overlapping ticks and runs again once the check finishes', async () => {
    let release;
    const spy = jest
      .spyOn(monitor, '_evaluateIdleState')
      .mockImplementationOnce(() => new Promise((r) => { release = r; }))
      .mockResolvedValue(undefined);

    const first = monitor._idleIntervalTick();
    await monitor._idleIntervalTick();
    await monitor._idleIntervalTick();
    expect(spy).toHaveBeenCalledTimes(1);

    release();
    await first;
    await monitor._idleIntervalTick();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('a throwing check does not wedge the guard', async () => {
    const spy = jest.spyOn(monitor, '_evaluateIdleState').mockRejectedValueOnce(new Error('x')).mockResolvedValue();
    await monitor._idleIntervalTick();
    await monitor._idleIntervalTick();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('a slow check is not mistaken for sleep, but a real sleep gap is kept', async () => {
    let release;
    let seenAtFreshCheck = null;
    jest
      .spyOn(monitor, '_evaluateIdleState')
      .mockImplementationOnce(() => new Promise((r) => { release = r; }))
      .mockImplementation(async () => { seenAtFreshCheck = monitor._lastEvaluationAt; });
    const t0 = Date.now();
    monitor._lastEvaluationAt = t0;
    const first = monitor._idleIntervalTick();

    const realNow = Date.now;
    try {
      Date.now = () => t0 + monitor.IDLE_CHECK_INTERVAL;
      await monitor._idleIntervalTick(); // skipped, records proof-of-life
      expect(monitor._lastEvaluationAt).toBe(t0 + monitor.IDLE_CHECK_INTERVAL);

      const lastProof = monitor._lastEvaluationAt;
      Date.now = () => lastProof + monitor.SUSPEND_GAP_MS + 60_000; // woke from sleep
      await monitor._idleIntervalTick();
      // The pending pre-sleep check is now over 2 min old by the wall clock, so
      // a fresh check runs — and it still sees the whole sleep gap to handle.
      expect(seenAtFreshCheck).toBe(lastProof);
    } finally {
      Date.now = realNow;
      release();
      await first;
    }
  });

  it('does nothing when not tracking', async () => {
    const spy = jest.spyOn(monitor, '_evaluateIdleState');
    monitor.isTracking = false;
    await monitor._idleIntervalTick();
    expect(spy).not.toHaveBeenCalled();
  });

  it('a check stuck for over 2 minutes does not switch idle detection off', async () => {
    const spy = jest
      .spyOn(monitor, '_evaluateIdleState')
      .mockImplementationOnce(() => new Promise(() => {})) // never settles
      .mockResolvedValue(undefined);
    const realNow = Date.now;
    const t0 = realNow();
    try {
      Date.now = () => t0;
      monitor._idleIntervalTick();
      Date.now = () => t0 + 60_000;
      await monitor._idleIntervalTick();
      expect(spy).toHaveBeenCalledTimes(1);
      Date.now = () => t0 + 2 * 60_000 + 1;
      await monitor._idleIntervalTick();
      expect(spy).toHaveBeenCalledTimes(2);
      Date.now = () => t0 + 3 * 60_000;
      await monitor._idleIntervalTick();
      expect(spy).toHaveBeenCalledTimes(3);
    } finally {
      Date.now = realNow;
    }
  });
});
