/**
 * Scenario tests for the two failure modes that cost real money:
 * phantom (double-billed) time, and silently lost time.
 *
 * Each scenario reproduces a sequence observed in production logs rather than a
 * hypothetical. Where a test asserts on timing, the numbers come from the actual
 * values involved — an 8s wait against a 12s backend timeout is what produced
 * 75.8 phantom hours between July 22 and August 14.
 */

const mockShutdown = { shutdownPromise: null };
jest.mock('../graceful-shutdown-manager', () => mockShutdown);

const TrackingManager = require('../tracking-manager');

const bare = () => {
  const tm = Object.create(TrackingManager.prototype);
  tm._startInFlight = null;
  return tm;
};

const resetGlobals = () => {
  global.isStopping = false;
  global._isStoppingTracking = false;
  mockShutdown.shutdownPromise = null;
};

describe('phantom time — one Start must never yield two sessions', () => {
  beforeEach(resetGlobals);

  it('concurrent Starts share a single session', async () => {
    let created = 0;
    const tm = bare();
    tm._startTrackingInner = async () => {
      created += 1;
      await new Promise((r) => setTimeout(r, 20));
      return { success: true, timeLogId: `log-${created}` };
    };

    const results = await Promise.all([tm.startTracking(), tm.startTracking(), tm.startTracking()]);

    expect(created).toBe(1);
    expect(new Set(results.map((r) => r.timeLogId)).size).toBe(1);
  });

  it('a failed Start does not wedge the guard', async () => {
    let attempts = 0;
    const tm = bare();
    tm._startTrackingInner = async () => {
      attempts += 1;
      throw new Error('backend unreachable');
    };

    await expect(tm.startTracking()).rejects.toThrow();
    await expect(tm.startTracking()).rejects.toThrow();
    expect(attempts).toBe(2);
    expect(tm._startInFlight).toBeNull();
  });
});

describe('phantom time — Start must wait for an in-flight Stop', () => {
  beforeEach(resetGlobals);

  it('waits on the stop promise rather than a fixed timeout', async () => {
    // The stop takes 300ms. Previously Start polled a flag for a fixed window
    // and proceeded regardless, opening a session while the old one was live.
    global.isStopping = true;
    let stopFinished = false;
    mockShutdown.shutdownPromise = new Promise((resolve) =>
      setTimeout(() => {
        stopFinished = true;
        global.isStopping = false;
        resolve({ success: true });
      }, 300),
    );

    const tm = bare();
    const result = await tm._waitForPriorStopToFinish(25000);

    expect(stopFinished).toBe(true);
    expect(result.stillStopping).toBe(false);
  });

  it('reports stillStopping when the stop never finishes, instead of starting blind', async () => {
    global.isStopping = true;
    mockShutdown.shutdownPromise = new Promise(() => {}); // never resolves

    const tm = bare();
    const result = await tm._waitForPriorStopToFinish(400);

    // The caller uses this to force close-before-start even when offline —
    // offline being the exact condition that makes stops slow.
    expect(result.stillStopping).toBe(true);
  });

  it('does not stall when no stop is in flight', async () => {
    const tm = bare();
    const started = Date.now();

    const result = await tm._waitForPriorStopToFinish(25000);

    expect(result.stillStopping).toBe(false);
    expect(Date.now() - started).toBeLessThan(200);
  });

  it('survives a rejected stop promise', async () => {
    global.isStopping = true;
    mockShutdown.shutdownPromise = Promise.reject(new Error('stop crashed'));
    setTimeout(() => { global.isStopping = false; }, 50);

    const tm = bare();
    await expect(tm._waitForPriorStopToFinish(2000)).resolves.toBeDefined();
  });
});

describe('offline tracking — queued sessions must not overlap on replay', () => {
  const clamp = (queue) => {
    bare()._clampOverlappingQueuedSessions(queue);
    return queue;
  };
  const entry = (id, start, end) => ({
    type: 'create_time_log',
    data: { id, start_time: start, end_time: end, status: end ? 'completed' : 'active' },
  });

  it('stop-then-start while offline produces adjacent, not overlapping, sessions', async () => {
    const queue = [
      entry('a', '2026-08-14T09:00:00.000Z', '2026-08-14T12:00:00.000Z'),
      entry('b', '2026-08-14T10:00:00.000Z', '2026-08-14T11:00:00.000Z'),
    ];

    clamp(queue);

    const rows = queue.map((q) => q.data).sort((x, y) => new Date(x.start_time) - new Date(y.start_time));
    const billed = rows.reduce(
      (acc, r) => acc + (new Date(r.end_time).getTime() - new Date(r.start_time).getTime()),
      0,
    );
    expect(billed).toBe(3 * 3600 * 1000);
    for (let i = 0; i < rows.length - 1; i += 1) {
      expect(new Date(rows[i].end_time).getTime()).toBeLessThanOrEqual(
        new Date(rows[i + 1].start_time).getTime(),
      );
    }
  });

  it('a crash leaving a session open closes it at the next session start', () => {
    const queue = [
      entry('a', '2026-08-14T09:00:00.000Z', null),
      entry('b', '2026-08-14T09:45:00.000Z', '2026-08-14T10:00:00.000Z'),
    ];

    clamp(queue);

    expect(queue[0].data.end_time).toBe('2026-08-14T09:45:00.000Z');
    expect(queue[0].data.status).toBe('completed');
  });

  it('total queued time never exceeds the wall-clock span it covers', () => {
    // The definition of phantom time: summed durations exceeding elapsed time.
    const queue = [
      entry('a', '2026-08-14T09:00:00.000Z', '2026-08-14T12:00:00.000Z'),
      entry('b', '2026-08-14T09:30:00.000Z', '2026-08-14T11:00:00.000Z'),
      entry('c', '2026-08-14T10:00:00.000Z', '2026-08-14T13:00:00.000Z'),
    ];

    clamp(queue);

    const rows = queue.map((q) => q.data);
    const summed = rows.reduce(
      (acc, r) => acc + (new Date(r.end_time).getTime() - new Date(r.start_time).getTime()),
      0,
    );
    const span =
      Math.max(...rows.map((r) => new Date(r.end_time).getTime())) -
      Math.min(...rows.map((r) => new Date(r.start_time).getTime()));

    expect(summed).toBeLessThanOrEqual(span);
  });
});

describe('lost time — clamping must never delete real work', () => {
  const clamp = (queue) => {
    bare()._clampOverlappingQueuedSessions(queue);
    return queue;
  };
  const entry = (id, start, end) => ({
    type: 'create_time_log',
    data: { id, start_time: start, end_time: end, status: 'completed' },
  });

  it('leaves sequential sessions completely untouched', () => {
    const queue = [
      entry('a', '2026-08-14T09:00:00.000Z', '2026-08-14T10:00:00.000Z'),
      entry('b', '2026-08-14T10:00:00.000Z', '2026-08-14T11:00:00.000Z'),
      entry('c', '2026-08-14T11:30:00.000Z', '2026-08-14T12:00:00.000Z'),
    ];
    const before = queue.map((q) => q.data.end_time);

    clamp(queue);

    expect(queue.map((q) => q.data.end_time)).toEqual(before);
  });

  it('never yields a negative duration', () => {
    const queue = [
      entry('a', '2026-08-14T11:00:00.000Z', '2026-08-14T13:00:00.000Z'),
      entry('b', '2026-08-14T09:00:00.000Z', '2026-08-14T14:00:00.000Z'),
    ];

    clamp(queue);

    for (const { data } of queue) {
      expect(new Date(data.end_time).getTime()).toBeGreaterThanOrEqual(
        new Date(data.start_time).getTime(),
      );
    }
  });
});
