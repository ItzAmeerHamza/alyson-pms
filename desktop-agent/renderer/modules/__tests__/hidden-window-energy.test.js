const { createHiddenDeferral } = require('../hidden-deferral');
const { monthLabelForOffset } = require('../../../src/modules/utils/monthly-report-month');

function fakeDoc(hidden) {
  const listeners = [];
  return {
    hidden,
    addEventListener: (type, fn) => {
      if (type === 'visibilitychange') listeners.push(fn);
    },
    show() {
      this.hidden = false;
      listeners.forEach((fn) => fn());
      jest.runOnlyPendingTimers();
    },
    hide() {
      this.hidden = true;
      listeners.forEach((fn) => fn());
    },
  };
}

describe('hidden-deferral', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());
  test('runs immediately while visible', () => {
    const doc = fakeDoc(false);
    const d = createHiddenDeferral(doc);
    const fn = jest.fn();
    expect(d.runWhenVisible('k', fn)).toBe(true);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('while hidden, coalesces per key and runs once on show', () => {
    const doc = fakeDoc(true);
    const d = createHiddenDeferral(doc);
    const a1 = jest.fn();
    const a2 = jest.fn();
    const b = jest.fn();
    d.runWhenVisible('a', a1);
    d.runWhenVisible('a', a2);
    d.runWhenVisible('b', b);
    expect(a1).not.toHaveBeenCalled();
    expect(d.pendingCount()).toBe(2);
    doc.hide(); // still hidden: nothing runs
    expect(a2).not.toHaveBeenCalled();
    doc.show();
    expect(a1).not.toHaveBeenCalled();
    expect(a2).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    doc.hide();
    doc.show();
    expect(a2).toHaveBeenCalledTimes(1);
  });

  test('a failing deferred job does not block the others', () => {
    const doc = fakeDoc(true);
    const d = createHiddenDeferral(doc);
    const ok = jest.fn();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    d.runWhenVisible('bad', () => {
      throw new Error('x');
    });
    d.runWhenVisible('ok', ok);
    doc.show();
    expect(ok).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

describe('loadMonthlyReport in-flight sharing', () => {
  let ui;
  let pending;
  let calls;

  function el(initial = {}) {
    return {
      style: { display: initial.display || 'none' },
      textContent: '',
      innerHTML: '',
      disabled: false,
      childElementCount: initial.childElementCount || 0,
      querySelector: () => null,
    };
  }

  beforeEach(() => {
    const nodes = {
      monthlyReportLoading: el(),
      monthlyReportEmpty: el(),
      monthlyReportContent: el({ display: 'block', childElementCount: 4 }),
      monthlyReportLabel: el(),
      mrTotalHours: el(),
      mrNonEffectiveHours: el(),
      mrEffectiveHours: el(),
      mrAvgPerDay: el(),
    };
    global.document = { getElementById: (id) => nodes[id] || null, hidden: false };
    jest.spyOn(console, 'log').mockImplementation(() => {});
    // eslint-disable-next-line global-require
    const UIManager = require('../ui-manager');
    ui = new UIManager({ on() {} }, {});
    ui._renderMonthlyDailyChart = () => {};
    ui._renderMonthlyWeeklyBreakdown = () => {};
    ui._renderMonthlyProjectBreakdown = () => {};
    ui._renderMonthlySessionList = () => {};
    ui._raiseTodayTrackedFloorFromMonthly = () => {};
    pending = [];
    calls = 0;
    ui._invokeIpcWhenReady = () => {
      calls += 1;
      return new Promise((resolve) => {
        pending.push(() =>
          resolve({
            monthOffset: 0,
            monthLabel: monthLabelForOffset(0),
            totalSeconds: 100 * calls,
            nonEffectiveSeconds: 0,
            effectiveSeconds: 100 * calls,
            totalSessions: 1,
            activeDays: 1,
            dailyBreakdown: [],
            weeklyBreakdown: [],
            projectBreakdown: [],
            sessions: [],
          }),
        );
      });
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete global.document;
  });

  const flush = () => new Promise((r) => setImmediate(r));

  test('overlapping silent refreshes share one fetch', async () => {
    const p1 = ui.loadMonthlyReport(false, { silent: true });
    const p2 = ui.loadMonthlyReport(false, { silent: true });
    expect(p2).toBe(p1);
    expect(calls).toBe(1);
    pending.shift()();
    await p1;
    expect(calls).toBe(1);
    expect(ui._monthlyReportCacheByOffset[0].reportData.totalSeconds).toBe(100);
  });

  test('a forced refresh requested mid-flight chains exactly one fresh fetch', async () => {
    const p1 = ui.loadMonthlyReport(true, { silent: true });
    const p2 = ui.loadMonthlyReport(true, { silent: true });
    const p3 = ui.loadMonthlyReport(true, { silent: true });
    expect(p2).toBe(p1);
    expect(p3).toBe(p1);
    pending.shift()();
    await flush();
    expect(calls).toBe(2);
    pending.shift()();
    await p1;
    expect(calls).toBe(2);
    expect(ui._monthlyReportCacheByOffset[0].reportData.totalSeconds).toBe(200);
    // Next call after settling starts a new load.
    const p4 = ui.loadMonthlyReport(true, { silent: true });
    expect(p4).not.toBe(p1);
    expect(calls).toBe(3);
    pending.shift()();
    await p4;
  });
});
