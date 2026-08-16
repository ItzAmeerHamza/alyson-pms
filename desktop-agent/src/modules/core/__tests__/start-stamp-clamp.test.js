/**
 * A session is stamped at the Start click, not when its row lands. Offline
 * those are ~5s apart (3s health-check race, then a 2s create timeout), and
 * stamping the later instant both dropped that time from the day and left the
 * tray clock behind the in-app clock, which has always counted from the click.
 *
 * The clamps are what keep that safe: a Start that waited on a draining prior
 * stop must not backdate into the session that stop just closed.
 */

jest.mock('../graceful-shutdown-manager', () => ({ shutdownPromise: null }));

const TrackingManager = require('../tracking-manager');

const bare = () => Object.create(TrackingManager.prototype);

const MAX_BACKDATE_MS = 15000;

describe('start stamp resolves to the click, clamped', () => {
  let tm;

  beforeEach(() => {
    tm = bare();
    delete global._lastStopEndAtMs;
  });

  afterEach(() => {
    delete global._lastStopEndAtMs;
  });

  it('uses the click instant across the offline arm delay', () => {
    const now = Date.now();
    const click = now - 5035; // measured offline arm time

    expect(tm._resolveStartStampMs(click)).toBe(click);
  });

  it('never backdates further than the cap', () => {
    const now = Date.now();
    const stamp = tm._resolveStartStampMs(now - 90000);

    expect(stamp).toBeGreaterThanOrEqual(now - MAX_BACKDATE_MS);
    expect(stamp).toBeLessThanOrEqual(Date.now());
  });

  it('never backdates across the previous session end', () => {
    const now = Date.now();
    const click = now - 5000;
    const priorStopEnd = now - 2000;
    global._lastStopEndAtMs = priorStopEnd;

    expect(tm._resolveStartStampMs(click)).toBe(priorStopEnd);
  });

  it('keeps the click when the previous session ended before it', () => {
    const now = Date.now();
    const click = now - 5000;
    global._lastStopEndAtMs = now - 20000;

    expect(tm._resolveStartStampMs(click)).toBe(click);
  });

  it('falls back to now for a missing or future click', () => {
    const before = Date.now();
    for (const bad of [undefined, null, 0, -1, NaN, Date.now() + 60000]) {
      const stamp = tm._resolveStartStampMs(bad);
      expect(stamp).toBeGreaterThanOrEqual(before);
      expect(stamp).toBeLessThanOrEqual(Date.now());
    }
  });

  it('never stamps in the future', () => {
    global._lastStopEndAtMs = Date.now() + 60000;
    const stamp = tm._resolveStartStampMs(Date.now() - 3000);

    expect(stamp).toBeLessThanOrEqual(Date.now());
  });
});
