const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { computeEffectiveSeconds } = require('../effective-time');
const { applyPulseEffectiveByDay, applyTodayEffectiveIfMeasured } = require('../monthly-report-pulse-days');

describe('This Month at a Glance uses Pulse for past days', () => {
  it('keeps Sep 1 at Pulse ~51m instead of session idle + 5m per quiet shot', () => {
    // User 1214 Sep 1 Chicago: 20 shots <10% × 300s plus session idle_seconds
    // rebuilt ~2h 58m after the day rolled off "today".
    const days = [
      { date: '2026-09-01', totalSeconds: 32_352, idleSeconds: 4_722, lowSeconds: 6_000 },
      { date: '2026-09-02', totalSeconds: 0, idleSeconds: 0, lowSeconds: 0 },
    ];
    const inflated = days.reduce(
      (sum, d) => sum + computeEffectiveSeconds(d.totalSeconds, d.lowSeconds, d.idleSeconds).nonEffectiveSeconds,
      0,
    );
    assert.equal(inflated, 10_722);

    applyPulseEffectiveByDay(days, {
      '2026-09-01': { idleSeconds: 3_089, lowActivitySeconds: 0 },
    });

    const monthNonEff = days.reduce(
      (sum, d) => sum + computeEffectiveSeconds(d.totalSeconds, d.lowSeconds, d.idleSeconds).nonEffectiveSeconds,
      0,
    );
    assert.equal(days[0].idleSeconds, 3_089);
    assert.equal(days[0].lowSeconds, 0);
    assert.equal(monthNonEff, 3_089);
  });

  it('does not wipe a Pulse split when the next payload is empty', () => {
    const days = [
      { date: '2026-09-01', totalSeconds: 32_352, idleSeconds: 3_089, lowSeconds: 0 },
    ];
    applyPulseEffectiveByDay(days, {});
    assert.equal(days[0].idleSeconds, 3_089);
  });

  it('does not overlay zeros from an offline Today compute', () => {
    const day = { date: '2026-09-02', idleSeconds: 3_089, lowSeconds: 120, totalSeconds: 10_000 };
    applyTodayEffectiveIfMeasured(day, {
      computed: false,
      source: 'offline',
      idleSeconds: 0,
      lowActivitySeconds: 0,
      nonEffectiveSeconds: 0,
      effectiveSeconds: 10_000,
    });
    assert.equal(day.idleSeconds, 3_089);
    assert.equal(day.lowSeconds, 120);
  });

  it('overlays Today only after Pulse actually measured', () => {
    const day = { date: '2026-09-02', idleSeconds: 3_089, lowSeconds: 0, totalSeconds: 10_000 };
    applyTodayEffectiveIfMeasured(day, {
      computed: true,
      source: 'pulse',
      idleSeconds: 3_200,
      lowActivitySeconds: 60,
      nonEffectiveSeconds: 3_260,
      effectiveSeconds: 6_740,
    });
    assert.equal(day.idleSeconds, 3_200);
    assert.equal(day.lowSeconds, 60);
    assert.equal(day.nonEffectiveSeconds, 3_260);
  });
});
