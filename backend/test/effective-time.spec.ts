/**
 * non_effective = min(total, low_activity + idle)
 *
 * The two arguments have to describe disjoint time. An idle minute produces a
 * zero-activity screenshot by definition, so when low_activity was counted from
 * every low screenshot — including the ones taken during idle — the same minute
 * entered the sum twice. Once the sum passed the tracked total the min() clamped
 * it and the employee's whole day reported as non-effective.
 *
 * The fix is in the SQL that produces low_activity (pulse.service.ts excludes
 * screenshots captured inside a counted idle period). These tests pin the
 * arithmetic that fix relies on, using the real figures from the 2026-08-17 logs.
 */

import { describe, expect, it } from 'vitest';
import { computeEffectiveTime } from '../src/lib/effective-time';

const H = (seconds: number) => seconds / 3600;

describe('computeEffectiveTime', () => {
  it('reports a full day as non-effective when idle and its screenshots are both counted', () => {
    // User 1228: 12,933s tracked, 8,404s idle, 80 low shots at 60s each.
    const tracked = H(12933);
    const idle = H(8404);
    const lowCountingIdleShots = H(80 * 60);

    const result = computeEffectiveTime(tracked, lowCountingIdleShots, idle);

    expect(lowCountingIdleShots + idle).toBeGreaterThan(tracked);
    expect(result.effective_hours).toBe(0);
    expect(result.non_effective_hours).toBe(result.total_hours);
  });

  it('leaves real effective time once idle-overlapping screenshots are excluded', () => {
    // 67 of those 80 shots fall inside the idle windows and are no longer counted.
    const tracked = H(12933);
    const idle = H(8404);
    const lowExcludingIdleShots = H(13 * 60);

    const result = computeEffectiveTime(tracked, lowExcludingIdleShots, idle);

    expect(result.effective_hours).toBeGreaterThan(0);
    expect(result.effective_hours).toBeCloseTo(H(12933 - 8404 - 780), 1);
    expect(result.non_effective_hours).toBeLessThan(result.total_hours);
  });

  it('never lets non-effective exceed the tracked total', () => {
    const result = computeEffectiveTime(H(3600), H(9999), H(9999));

    expect(result.non_effective_hours).toBe(result.total_hours);
    expect(result.effective_hours).toBe(0);
  });

  it('treats a day with no idle and no low activity as fully effective', () => {
    const result = computeEffectiveTime(H(28800), 0, 0);

    expect(result.effective_hours).toBe(8);
    expect(result.non_effective_hours).toBe(0);
  });

  it('adds low activity and idle when they describe different minutes', () => {
    // An employee idle for an hour, and separately at a low-activity task for
    // half an hour while awake — four hours tracked, so no clamping.
    const result = computeEffectiveTime(4, 0.5, 1);

    expect(result.non_effective_hours).toBe(1.5);
    expect(result.effective_hours).toBe(2.5);
  });
});
