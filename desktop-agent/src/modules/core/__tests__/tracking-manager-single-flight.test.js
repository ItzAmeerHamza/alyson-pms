/**
 * One Start action must create exactly one session.
 *
 * Production data showed 71 bursts of sessions created within 2s of each other
 * (88 of 97 gaps sub-second, 24 under 50ms) — far too fast to be user clicks.
 * The isTracking guard inside startTracking sits behind an await and isTracking
 * is not set until createTimeLog resolves, so concurrent callers all passed it
 * and each inserted a row. The extras were closed with no proof-of-life, which
 * is where the sub-minute sessions came from.
 */

const TrackingManager = require('../tracking-manager');

describe('startTracking single-flight', () => {
  /** Bare instance — the guard is independent of constructor wiring. */
  const makeManager = (inner) => {
    const tm = Object.create(TrackingManager.prototype);
    tm._startInFlight = null;
    tm._startTrackingInner = inner;
    return tm;
  };

  it('creates one session when callers race', async () => {
    let starts = 0;
    const tm = makeManager(async () => {
      starts += 1;
      await new Promise((r) => setTimeout(r, 20));
      return { success: true, timeLogId: `log-${starts}` };
    });

    const results = await Promise.all([
      tm.startTracking('p1'),
      tm.startTracking('p1'),
      tm.startTracking('p1'),
    ]);

    expect(starts).toBe(1);
    expect(results.map((r) => r.timeLogId)).toEqual(['log-1', 'log-1', 'log-1']);
  });

  it('allows a genuine start after the first finishes', async () => {
    let starts = 0;
    const tm = makeManager(async () => {
      starts += 1;
      return { success: true, timeLogId: `log-${starts}` };
    });

    await tm.startTracking('p1');
    await tm.startTracking('p1');

    expect(starts).toBe(2);
  });

  it('does not wedge the guard when a start fails', async () => {
    let starts = 0;
    const tm = makeManager(async () => {
      starts += 1;
      throw new Error('offline');
    });

    await expect(tm.startTracking('p1')).rejects.toThrow('offline');
    expect(tm._startInFlight).toBeNull();

    await expect(tm.startTracking('p1')).rejects.toThrow('offline');
    expect(starts).toBe(2);
  });

  it('propagates the same rejection to every racing caller', async () => {
    let starts = 0;
    const tm = makeManager(async () => {
      starts += 1;
      await new Promise((r) => setTimeout(r, 10));
      throw new Error('backend down');
    });

    const settled = await Promise.allSettled([tm.startTracking(), tm.startTracking()]);

    expect(starts).toBe(1);
    expect(settled.every((s) => s.status === 'rejected')).toBe(true);
  });
});
