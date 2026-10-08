import { describe, expect, it } from 'vitest';
import { formatDecimalHours } from './format-hours';

describe('formatDecimalHours', () => {
  it('formats hours and minutes in long form', () => {
    expect(formatDecimalHours(1 + 40 / 60)).toBe('1 hour 40 min');
    expect(formatDecimalHours(2.3)).toBe('2 hours 18 min');
    expect(formatDecimalHours(7)).toBe('7 hours');
    expect(formatDecimalHours(1)).toBe('1 hour');
    expect(formatDecimalHours(0.5)).toBe('30 min');
  });

  it('handles negatives, empty, and minute rollover', () => {
    expect(formatDecimalHours(-1.5)).toBe('-1 hour 30 min');
    expect(formatDecimalHours(0)).toBe('—');
    expect(formatDecimalHours(null)).toBe('—');
    expect(formatDecimalHours(1.999)).toBe('2 hours');
    expect(formatDecimalHours(0, { emptyLabel: '0 min' })).toBe('0 min');
  });
});
