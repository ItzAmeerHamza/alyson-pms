const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveMonthOffset,
  reportMatchesViewedMonth,
  shouldPaintLiveTodayOntoMonthlyReport,
} = require('../monthly-report-month');

describe('Month at a Glance navigation does not paint the wrong month', () => {
  it('clamps month offsets to the last 24 months', () => {
    assert.equal(resolveMonthOffset(0), 0);
    assert.equal(resolveMonthOffset(-1), -1);
    assert.equal(resolveMonthOffset(3), 0);
    assert.equal(resolveMonthOffset(-40), -24);
    assert.equal(resolveMonthOffset('2'), 0);
    assert.equal(resolveMonthOffset('-2'), -2);
  });

  it('rejects a current-month payload while last month is selected', () => {
    assert.equal(
      reportMatchesViewedMonth({ monthOffset: 0, totalSeconds: 527_564 }, -1),
      false,
    );
    assert.equal(
      reportMatchesViewedMonth({ monthOffset: -1, totalSeconds: 86_485 }, -1),
      true,
    );
  });

  it('does not overlay live Today totals onto a past month', () => {
    assert.equal(shouldPaintLiveTodayOntoMonthlyReport(0), true);
    assert.equal(shouldPaintLiveTodayOntoMonthlyReport(-1), false);
    assert.equal(shouldPaintLiveTodayOntoMonthlyReport(-2), false);
  });

  it('treats a missing monthOffset as compatible (legacy payloads)', () => {
    assert.equal(reportMatchesViewedMonth({ totalSeconds: 100 }, -1), true);
    assert.equal(reportMatchesViewedMonth({ error: 'down' }, 0), false);
  });
});
