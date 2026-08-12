import { describe, expect, it } from 'vitest';
import {
  nextDayTotalHours,
  resolveAdjustmentDeltaSeconds,
} from './time-adjustment.util';

describe('resolveAdjustmentDeltaSeconds', () => {
  it('prefers deltaSeconds', () => {
    expect(
      resolveAdjustmentDeltaSeconds({
        deltaSeconds: 90,
        hours: 2,
        deltaMinutes: 5,
      }),
    ).toBe(90);
  });

  it('uses hours when deltaSeconds omitted', () => {
    expect(resolveAdjustmentDeltaSeconds({ hours: 1.5 })).toBe(5400);
  });

  it('uses signed minutes for remove', () => {
    expect(resolveAdjustmentDeltaSeconds({ deltaMinutes: -45 })).toBe(-2700);
  });
});

describe('nextDayTotalHours', () => {
  it('adds adjustment to tracked', () => {
    expect(nextDayTotalHours(6, 0, 3600)).toBe(7);
  });

  it('allows remove down to zero', () => {
    expect(nextDayTotalHours(8, 0, -8 * 3600)).toBe(0);
  });

  it('rejects remove below zero', () => {
    expect(nextDayTotalHours(2, 0, -3 * 3600)).toBeNull();
  });

  it('accounts for existing net adjustments', () => {
    // tracked 4h + existing +1h - remove 2h => 3h
    expect(nextDayTotalHours(4, 3600, -2 * 3600)).toBe(3);
  });
});
