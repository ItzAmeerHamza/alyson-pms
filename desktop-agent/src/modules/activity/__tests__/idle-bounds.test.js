/**
 * Idle has to lie inside the session it belongs to.
 *
 * The OS idle counter reports time since the last input on the machine. It knows
 * nothing about sessions and keeps running while the lid is shut, so taken at
 * face value it produced idle periods longer than the day they were recorded
 * against. Because non_effective = min(total, idle + low_activity), idle alone
 * exceeding the total reports every tracked minute as non-effective.
 *
 * The numbers below are from the 2026-08-17 logs of the two affected users.
 *
 * These assert on the in-memory accumulator rather than the write: user_id is
 * left unresolved so the method returns before any network or disk work, which
 * is past every bound check and is the behaviour under test.
 */

const EnhancedIdleMonitor = require('../enhanced-idle-monitor');

const T = (iso) => new Date(iso).getTime();

function makeMonitor() {
  const monitor = new EnhancedIdleMonitor({ idle_detection_threshold_seconds: 60 });
  monitor._resolveUserId = () => null;
  return monitor;
}

describe('idle periods are bounded by their session', () => {
  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    delete global.trackingManager;
    delete global.currentSession;
    jest.restoreAllMocks();
  });

  it('discards an idle period recorded while no session is open', async () => {
    // User 1209: 43,054s written at 05:50:56 — the session began at 05:50:59,
    // three seconds later, and inherited an entire night of sleep.
    const monitor = makeMonitor();

    await monitor.logIdlePeriod(
      T('2026-08-16T17:53:22Z'),
      T('2026-08-17T05:50:56Z'),
      43054 * 1000,
    );

    expect(monitor._sessionIdleSeconds).toBe(0);
    expect(console.warn.mock.calls.join(' ')).toMatch(/no session is open/);
  });

  it('clamps an idle period that began before its session started', async () => {
    global.trackingManager = { sessionStartTime: '2026-08-17T05:50:59.005Z' };
    const monitor = makeMonitor();

    const start = T('2026-08-16T17:53:22Z');
    const end = T('2026-08-17T05:52:59Z');
    await monitor.logIdlePeriod(start, end, end - start);

    // Twelve hours offered, 120s accepted — only the part inside the session.
    expect(monitor._sessionIdleSeconds).toBe(120);
  });

  it('leaves an ordinary idle period untouched', async () => {
    global.trackingManager = { sessionStartTime: '2026-08-17T00:14:21.999Z' };
    const monitor = makeMonitor();

    await monitor.logIdlePeriod(
      T('2026-08-17T00:43:41Z'),
      T('2026-08-17T00:52:17Z'),
      516 * 1000,
    );

    expect(monitor._sessionIdleSeconds).toBe(516);
  });

  it('credits idle up to the last check and never counts the sleep', async () => {
    // User 1233: idle since 01:14:19, last awake check 01:24:27, machine sleeps,
    // next check 06:31:17. The logged period was 19,018s against 10,179s tracked.
    global.trackingManager = { sessionStartTime: '2026-08-17T00:14:21.999Z' };
    const monitor = makeMonitor();

    const lastAwake = T('2026-08-17T01:24:27Z');
    monitor._lastEvaluationAt = lastAwake;
    monitor.currentIdleStartTime = T('2026-08-17T01:14:19Z');
    monitor.wasIdleLastCheck = true;

    jest.spyOn(Date, 'now').mockReturnValue(T('2026-08-17T06:31:17Z'));
    const handled = await monitor._handleSuspendGap();

    expect(handled).toBe(true);
    // 01:14:19 to 01:24:27 is 608s of real idle before the machine slept; the
    // 5h07m of sleep that followed is not idle and is not counted.
    expect(monitor._sessionIdleSeconds).toBe(608);
    expect(monitor.wasIdleLastCheck).toBe(false);
    expect(monitor.currentIdleStartTime).toBeNull();
  });

  it('a new Start does not inherit the previous session last-check as sleep', async () => {
    const monitor = makeMonitor();
    monitor._lastEvaluationAt = T('2026-08-31T11:30:46Z');
    jest.spyOn(Date, 'now').mockReturnValue(T('2026-08-31T11:58:39Z'));
    monitor.startIdleMonitoring();
    expect(monitor._lastEvaluationAt).toBeNull();
    const handled = await monitor._handleSuspendGap();
    expect(handled).toBe(false);
    await monitor.stopIdleMonitoring();
  });

  it('treats an ordinary interval between checks as no gap at all', async () => {
    const monitor = makeMonitor();
    const base = T('2026-08-17T09:00:00Z');
    monitor._lastEvaluationAt = base;

    jest.spyOn(Date, 'now').mockReturnValue(base + monitor.IDLE_CHECK_INTERVAL);
    const handled = await monitor._handleSuspendGap();

    expect(handled).toBe(false);
  });

  it('after the fix, idle can no longer exceed the tracked day', async () => {
    global.trackingManager = { sessionStartTime: '2026-08-17T05:50:59.005Z' };
    const monitor = makeMonitor();
    const trackedSeconds = 6835; // user 1209's actual tracked total

    const start = T('2026-08-16T17:53:22Z');
    const end = T('2026-08-17T05:50:56Z');
    await monitor.logIdlePeriod(start, end, end - start); // ends before session

    const nonEffective = Math.min(trackedSeconds, monitor._sessionIdleSeconds);
    expect(nonEffective).toBeLessThan(trackedSeconds);
    expect(trackedSeconds - nonEffective).toBe(trackedSeconds);
  });
});
