const {
  jitteredBackoffMs,
  reconnectSpreadMs,
  isTransientDbOrNetworkError,
} = require('../sync-backoff');

describe('sync-backoff', () => {
  it('adds jitter so two agents do not share the same retry instant', () => {
    const a = jitteredBackoffMs(1, { random: () => 0 });
    const b = jitteredBackoffMs(1, { random: () => 0.99 });
    expect(b).toBeGreaterThan(a);
    expect(a).toBeGreaterThanOrEqual(15 * 1000);
    expect(b).toBeLessThanOrEqual(15 * 1000 + 15 * 1000);
  });

  it('spreads reconnect flushes across a 20s window', () => {
    expect(reconnectSpreadMs({ random: () => 0 })).toBe(0);
    expect(reconnectSpreadMs({ random: () => 0.5 })).toBe(10 * 1000);
  });

  it('treats RDS connection exhaustion as transient', () => {
    expect(isTransientDbOrNetworkError('too many connections for role')).toBe(true);
    expect(isTransientDbOrNetworkError('53300')).toBe(true);
    expect(isTransientDbOrNetworkError('Database temporarily unavailable')).toBe(true);
    expect(isTransientDbOrNetworkError('Internal server error')).toBe(true);
    expect(isTransientDbOrNetworkError('missing project')).toBe(false);
  });
});
