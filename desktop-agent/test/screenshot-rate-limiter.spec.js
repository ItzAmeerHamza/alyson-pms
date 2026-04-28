const ScreenshotRateLimiter = require('../src/modules/utils/screenshot-rate-limiter');

describe('ScreenshotRateLimiter', () => {
  test('allows exactly 3 within 10 minutes with >=180s gaps; rejects 4th', () => {
    const rl = new ScreenshotRateLimiter({ maxInWindow: 3, windowMs: 600000, minGapMs: 180000 });
    let t = 0;
    expect(rl.canTake(t)).toEqual({ allowed: true });
    rl.record(t);

    t += 180000; // +3m
    expect(rl.canTake(t)).toEqual({ allowed: true });
    rl.record(t);

    t += 180000; // +3m
    expect(rl.canTake(t)).toEqual({ allowed: true });
    rl.record(t);

    t += 180000; // +3m (within 10m window)
    const r = rl.canTake(t);
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('window-limit');
  });

  test('rejects requests <180s apart; reports nextAllowedInMs', () => {
    const rl = new ScreenshotRateLimiter({ maxInWindow: 3, windowMs: 600000, minGapMs: 180000 });
    let t = 1000;
    rl.record(t);
    const r = rl.canTake(t + 100000); // +100s
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('min-gap');
    expect(r.nextAllowedInMs).toBeGreaterThan(0);
  });

  test('rolling window: when oldest falls out, next becomes allowed', () => {
    const rl = new ScreenshotRateLimiter({ maxInWindow: 3, windowMs: 600000, minGapMs: 180000 });
    let t = 0;
    rl.record(t);
    rl.record(t + 180000);
    rl.record(t + 360000);

    // 601s after first shot (beyond 10m), fourth becomes allowed
    const r = rl.canTake(t + 600001);
    expect(r.allowed).toBe(true);
  });
});


