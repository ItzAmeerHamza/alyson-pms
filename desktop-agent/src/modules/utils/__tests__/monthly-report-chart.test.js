'use strict';

const {
  monthlyDailyBarHeightPx,
  monthlyDailyBarScaleSeconds,
} = require('../monthly-report-chart');

describe('Daily Activity bar heights follow hours', () => {
  it('keeps a 12-hour axis when the tallest day is a normal workday', () => {
    expect(monthlyDailyBarScaleSeconds(9 * 3600)).toBe(12 * 3600);
    expect(monthlyDailyBarScaleSeconds(7 * 3600)).toBe(12 * 3600);
  });

  it('makes 9h visibly taller than 7h', () => {
    const peak = 9 * 3600;
    const nine = monthlyDailyBarHeightPx(9 * 3600, peak);
    const seven = monthlyDailyBarHeightPx(7 * 3600, peak);
    expect(nine).toBe(90);
    expect(seven).toBe(70);
    expect(nine - seven).toBeGreaterThanOrEqual(18);
  });

  it('paints a 4h day at one-third of the 12h axis', () => {
    expect(monthlyDailyBarHeightPx(4 * 3600, 9 * 3600)).toBe(40);
  });

  it('does not draw a full-height stub for an empty day', () => {
    expect(monthlyDailyBarHeightPx(0, 9 * 3600)).toBe(2);
  });

  it('raises the axis when a day exceeds 12 hours', () => {
    expect(monthlyDailyBarScaleSeconds(14 * 3600)).toBe(14 * 3600);
    expect(monthlyDailyBarHeightPx(7 * 3600, 14 * 3600)).toBe(60);
  });
});
