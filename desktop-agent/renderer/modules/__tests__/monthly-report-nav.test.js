const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const {
  monthLabelForOffset,
  resolveMonthOffset,
} = require('../../../src/modules/utils/monthly-report-month');

function el(initial = {}) {
  return {
    style: { display: initial.display || 'none' },
    textContent: initial.textContent || '',
    innerHTML: '',
    disabled: false,
    childElementCount: initial.childElementCount || 0,
    querySelector: () => null,
  };
}

function installFakeMonthlyReportDom() {
  const nodes = {
    monthlyReportPrevBtn: el(),
    monthlyReportNextBtn: el(),
    monthlyReportLoading: el({ display: 'none' }),
    monthlyReportEmpty: el({ display: 'none' }),
    monthlyReportContent: el({ display: 'block', childElementCount: 4 }),
    monthlyReportLabel: el({ textContent: 'October 2026' }),
    mrTotalHours: el({ textContent: '146h 32m 44s' }),
    mrNonEffectiveHours: el(),
    mrEffectiveHours: el(),
    mrAvgPerDay: el(),
  };
  global.document = {
    getElementById: (id) => nodes[id] || null,
  };
  return nodes;
}

describe('This Month at a Glance prev/next', () => {
  let UIManager;
  let ui;
  let nodes;
  let pending;

  beforeEach(() => {
    nodes = installFakeMonthlyReportDom();
    pending = [];
    // eslint-disable-next-line global-require
    UIManager = require('../ui-manager');
    ui = new UIManager({ on() {} }, {});
    ui._renderMonthlyDailyChart = () => {};
    ui._renderMonthlyWeeklyBreakdown = () => {};
    ui._renderMonthlyProjectBreakdown = () => {};
    ui._renderMonthlySessionList = () => {};
    ui._raiseTodayTrackedFloorFromMonthly = () => {};
    ui._invokeIpcWhenReady = (_channel, opts = {}) => {
      const offset = resolveMonthOffset(opts.monthOffset);
      return new Promise((resolve) => {
        pending.push({
          offset,
          resolve: (data) =>
            resolve(
              data || {
                monthOffset: offset,
                monthLabel: monthLabelForOffset(offset, new Date('2026-10-07T12:00:00Z')),
                totalSeconds: offset === 0 ? 527_564 : 86_485,
                nonEffectiveSeconds: 0,
                effectiveSeconds: offset === 0 ? 527_564 : 86_485,
                totalSessions: 4,
                activeDays: 4,
                dailyBreakdown: [],
                weeklyBreakdown: [],
                projectBreakdown: [],
                sessions: [],
              },
            ),
        });
      });
    };
  });

  it('names August / September / October from a fixed October date', () => {
    const now = new Date('2026-10-07T12:00:00Z');
    assert.equal(monthLabelForOffset(0, now), 'October 2026');
    assert.equal(monthLabelForOffset(-1, now), 'September 2026');
    assert.equal(monthLabelForOffset(-2, now), 'August 2026');
  });

  it('hides stale current-month hours and retargets the label on prev', async () => {
    const nav = ui.shiftMonthlyReportMonth(-1);
    assert.equal(ui._monthlyReportMonthOffset, -1);
    assert.equal(nodes.monthlyReportContent.style.display, 'none');
    assert.equal(nodes.monthlyReportLoading.style.display, 'block');
    assert.match(nodes.monthlyReportLabel.textContent, /September|August|October/);

    const augustOrSept = pending.find((p) => p.offset === -1);
    assert.ok(augustOrSept, 'should fetch the selected month');
    augustOrSept.resolve();
    await nav;

    assert.equal(nodes.monthlyReportContent.style.display, 'block');
    assert.equal(nodes.monthlyReportLoading.style.display, 'none');
    assert.equal(nodes.mrTotalHours.textContent, ui.formatReportDuration(86_485));
    assert.notEqual(nodes.mrTotalHours.textContent, ui.formatReportDuration(527_564));
  });

  it('drops a late current-month fetch after the user already moved back', async () => {
    const currentLoad = ui.loadMonthlyReport(true);
    assert.equal(pending.length, 1);
    const current = pending[0];
    assert.equal(current.offset, 0);

    const prevNav = ui.shiftMonthlyReportMonth(-1);
    const selected = pending.find((p) => p.offset === -1);
    assert.ok(selected);

    current.resolve({
      monthOffset: 0,
      monthLabel: 'October 2026',
      totalSeconds: 527_564,
      nonEffectiveSeconds: 0,
      effectiveSeconds: 527_564,
      totalSessions: 8,
      activeDays: 8,
      dailyBreakdown: [],
    });
    await currentLoad;

    assert.equal(ui._monthlyReportMonthOffset, -1);
    assert.equal(nodes.monthlyReportContent.style.display, 'none');

    selected.resolve();
    await prevNav;
    assert.equal(nodes.monthlyReportContent.style.display, 'block');
    assert.equal(nodes.mrTotalHours.textContent, ui.formatReportDuration(86_485));
  });

  it('does not paint a current-month payload onto a past-month view', () => {
    ui._monthlyReportMonthOffset = -2;
    nodes.monthlyReportLabel.textContent = 'August 2026';
    nodes.mrTotalHours.textContent = ui.formatReportDuration(86_485);
    ui._applyMonthlyReportToDom({
      monthOffset: 0,
      monthLabel: 'October 2026',
      totalSeconds: 527_564,
      nonEffectiveSeconds: 0,
      effectiveSeconds: 527_564,
      totalSessions: 8,
      activeDays: 8,
    });
    assert.equal(nodes.mrTotalHours.textContent, ui.formatReportDuration(86_485));
    assert.equal(nodes.monthlyReportLabel.textContent, 'August 2026');
  });

  it('refuses to overlay live Today cards while viewing last month', () => {
    ui._monthlyReportMonthOffset = -1;
    ui._monthlyReportCache = {
      reportData: {
        monthOffset: 0,
        monthLabel: 'October 2026',
        totalSeconds: 527_564,
        nonEffectiveSeconds: 0,
        effectiveSeconds: 527_564,
        totalSessions: 8,
        activeDays: 8,
      },
    };
    nodes.mrTotalHours.textContent = ui.formatReportDuration(86_485);
    ui._renderMonthlyReportSummary(ui._monthlyReportCache.reportData);
    assert.equal(nodes.mrTotalHours.textContent, ui.formatReportDuration(86_485));
  });

  it('shows cached last-month data immediately instead of current-month hours', async () => {
    ui._monthlyReportCacheByOffset[-1] = {
      time: Date.now(),
      reportData: {
        monthOffset: -1,
        monthLabel: 'September 2026',
        totalSeconds: 86_485,
        nonEffectiveSeconds: 3_661,
        effectiveSeconds: 82_824,
        totalSessions: 4,
        activeDays: 4,
        dailyBreakdown: [],
      },
    };
    await ui.shiftMonthlyReportMonth(-1);
    assert.equal(nodes.mrTotalHours.textContent, ui.formatReportDuration(86_485));
    assert.equal(nodes.monthlyReportLabel.textContent, 'September 2026');
    assert.equal(nodes.monthlyReportContent.style.display, 'block');
  });
});
