const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const {
  idleLogIdempotencyUuid,
  enqueueIdleLogOnce,
  uniqueIdleLogs,
  isIdleWriteTimeout,
  isMissingTimeLogFkError,
} = require('../idle-log-period-key');
const { persistIdleLog, flushIdleLogQueue } = require('../idle-log-write');
const EnhancedIdleMonitor = require('../../activity/enhanced-idle-monitor');
const idleWrite = require('../idle-log-write');

const stretch = {
  user_id: '1195',
  time_log_id: 'bd16d1a3-0000-4000-8000-000000000001',
  idle_start: '2026-09-02T16:59:00.000Z',
  idle_end: '2026-09-02T17:06:25.000Z',
  duration_seconds: 445,
};

const timeoutErr = () => new Error('Backend sync timeout after 20000ms (upsert_idle_log)');
const enabled = { isBackendTimeLogsEnabled: () => true };

function hamzaCopies(n = 9) {
  const id = idleLogIdempotencyUuid(stretch);
  return Array.from({ length: n }, () => ({ ...stretch, id }));
}

describe('idle log client idempotency', () => {
  it('mints the same UUID for the same stretch on every retry', () => {
    const a = idleLogIdempotencyUuid(stretch);
    const b = idleLogIdempotencyUuid({ ...stretch, time_log_id: null });
    const laterEnd = idleLogIdempotencyUuid({
      ...stretch,
      idle_end: '2026-09-02T17:20:00.000Z',
    });
    assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    assert.equal(a, b);
    assert.equal(a, laterEnd);
  });

  it('treats a 12s abort as timeout, not as an FK miss', () => {
    assert.equal(isIdleWriteTimeout(timeoutErr()), true);
    assert.equal(isIdleWriteTimeout({ name: 'AbortError', message: 'The operation was aborted' }), true);
    assert.equal(isMissingTimeLogFkError(timeoutErr()), false);
    assert.equal(isMissingTimeLogFkError(new Error('unknown_time_log')), true);
    assert.equal(isMissingTimeLogFkError({ code: '23503', message: 'insert failed' }), true);
    assert.equal(isMissingTimeLogFkError(new Error('Backend sync failed (500)')), false);
    assert.equal(isMissingTimeLogFkError(new Error('network ECONNRESET')), false);
  });
});

describe('Hamza: one 7.4m stretch must never become nine writes', () => {
  it('collapses 9 queued copies to one persist of the same id', async () => {
    const id = idleLogIdempotencyUuid(stretch);
    const upserts = [];
    const queue = { idleLogs: [] };
    for (const copy of hamzaCopies(9)) {
      enqueueIdleLogOnce(queue, copy);
    }
    assert.equal(queue.idleLogs.length, 1);

    const persist = async (log) => persistIdleLog(log, {}, {
      ...enabled,
      upsertIdleLog: async (payload) => {
        upserts.push(payload.id);
      },
      idleLogExists: async () => false,
    });

    const result = await flushIdleLogQueue(queue, {}, persist);
    assert.equal(result.flushed, 1);
    assert.equal(result.requeued, 0);
    assert.deepEqual(upserts, [id]);
    assert.equal(queue.idleLogs.length, 0);
  });

  it('on timeout after Lambda committed, read-check stops the retry (no second insert)', async () => {
    const id = idleLogIdempotencyUuid(stretch);
    let upserts = 0;
    const result = await persistIdleLog({ ...stretch, id }, {}, {
      ...enabled,
      upsertIdleLog: async () => {
        upserts += 1;
        throw timeoutErr();
      },
      idleLogExists: async (_user, checkId) => checkId === id,
    });
    assert.equal(result.status, 'already_written');
    assert.equal(upserts, 1);
  });

  it('15s flusher: 9 copies + timeout-then-exists does not requeue', async () => {
    const id = idleLogIdempotencyUuid(stretch);
    const upserts = [];
    let landed = false;
    const persist = (log, cfg) => persistIdleLog(log, cfg, {
      ...enabled,
      upsertIdleLog: async (payload) => {
        upserts.push(payload.id);
        landed = true;
        throw timeoutErr();
      },
      idleLogExists: async () => landed,
    });

    const queue = { idleLogs: hamzaCopies(9) };
    assert.equal(uniqueIdleLogs(queue.idleLogs).length, 1);

    await flushIdleLogQueue(queue, {}, persist);
    assert.equal(queue.idleLogs.length, 0);

    await flushIdleLogQueue(queue, {}, persist);
    await flushIdleLogQueue(queue, {}, persist);

    assert.equal(upserts.length, 1);
    assert.equal(upserts[0], id);
  });

  it('on timeout when the row is missing, queues the same id and keeps time_log_id', async () => {
    const id = idleLogIdempotencyUuid(stretch);
    const result = await persistIdleLog({ ...stretch, id }, {}, {
      ...enabled,
      upsertIdleLog: async () => {
        throw timeoutErr();
      },
      idleLogExists: async () => false,
    });
    assert.equal(result.status, 'queue');
    assert.equal(result.log.id, id);
    assert.equal(result.log.time_log_id, stretch.time_log_id);
  });

  it('exists-check timeout still queues the same id, not a new one', async () => {
    const id = idleLogIdempotencyUuid(stretch);
    const result = await persistIdleLog({ ...stretch, id }, {}, {
      ...enabled,
      upsertIdleLog: async () => {
        throw timeoutErr();
      },
      idleLogExists: async () => {
        throw timeoutErr();
      },
    });
    assert.equal(result.status, 'queue');
    assert.equal(result.log.id, id);
  });

  it('network errors do not strip time_log_id', async () => {
    const id = idleLogIdempotencyUuid(stretch);
    const upserts = [];
    const result = await persistIdleLog({ ...stretch, id }, {}, {
      ...enabled,
      upsertIdleLog: async (payload) => {
        upserts.push(payload);
        throw new Error('Backend sync network error (upsert_idle_log)');
      },
      idleLogExists: async () => {
        throw new Error('should not exists-check a non-timeout');
      },
    });
    assert.equal(result.status, 'queue');
    assert.equal(upserts.length, 1);
    assert.equal(upserts[0].time_log_id, stretch.time_log_id);
    assert.equal(result.log.id, id);
  });

  it('only strips time_log_id on a real FK error, and reuses the same id', async () => {
    const id = idleLogIdempotencyUuid(stretch);
    const calls = [];
    const result = await persistIdleLog({ ...stretch, id }, {}, {
      ...enabled,
      upsertIdleLog: async (payload) => {
        calls.push(payload);
        if (payload.time_log_id) throw new Error('unknown_time_log');
      },
      idleLogExists: async () => false,
    });
    assert.equal(result.status, 'written');
    assert.equal(calls.length, 2);
    assert.equal(calls[0].id, id);
    assert.equal(calls[0].time_log_id, stretch.time_log_id);
    assert.equal(calls[1].id, id);
    assert.equal(calls[1].time_log_id, null);
  });

  it('keeps two different stretches as two writes', async () => {
    const a = { ...stretch, idle_start: '2026-09-02T16:00:00.000Z', idle_end: '2026-09-02T16:07:00.000Z' };
    const b = stretch;
    const upserts = [];
    const persist = (log, cfg) => persistIdleLog(log, cfg, {
      ...enabled,
      upsertIdleLog: async (payload) => {
        upserts.push(payload.id);
      },
      idleLogExists: async () => false,
    });
    const queue = { idleLogs: [] };
    enqueueIdleLogOnce(queue, { ...a, id: idleLogIdempotencyUuid(a) });
    enqueueIdleLogOnce(queue, { ...b, id: idleLogIdempotencyUuid(b) });
    await flushIdleLogQueue(queue, {}, persist);
    assert.equal(upserts.length, 2);
    assert.notEqual(upserts[0], upserts[1]);
  });

  it('keeps the longest copy when the same start is queued with a later end', () => {
    const short = { ...stretch, duration_seconds: 30, idle_end: '2026-09-02T16:59:30.000Z' };
    const long = stretch;
    const merged = uniqueIdleLogs([
      { ...short, id: idleLogIdempotencyUuid(short) },
      { ...long, id: idleLogIdempotencyUuid(long) },
    ]);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].duration_seconds, 445);
  });

  it('collapses queued copies even when they still carry old random ids', () => {
    const merged = uniqueIdleLogs([
      { ...stretch, id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', duration_seconds: 30 },
      { ...stretch, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', duration_seconds: 445 },
    ]);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].duration_seconds, 445);
  });
});

describe('EnhancedIdleMonitor does not fire a second insert on retry', () => {
  let origPersist;

  beforeEach(() => {
    origPersist = idleWrite.persistIdleLog;
    global.offlineQueue = { idleLogs: [] };
    global.currentUserId = '1195';
    global.trackingManager = {
      sessionStartTime: '2026-09-02T16:00:00.000Z',
      currentTimeLogId: stretch.time_log_id,
    };
  });

  afterEach(() => {
    idleWrite.persistIdleLog = origPersist;
    delete global.offlineQueue;
    delete global.trackingManager;
    delete global.currentUserId;
    delete global.currentSession;
  });

  function monitor() {
    return new EnhancedIdleMonitor({ user_id: '1195' });
  }

  it('credits session idle once when logIdlePeriod is invoked twice for Hamza’s stretch', async () => {
    const calls = [];
    idleWrite.persistIdleLog = async (log) => {
      calls.push(log);
      return { status: 'written', log };
    };
    const m = monitor();
    const start = Date.parse(stretch.idle_start);
    const end = Date.parse(stretch.idle_end);
    await m.logIdlePeriod(start, end, 445000);
    await m.logIdlePeriod(start, end, 445000);
    assert.equal(calls.length, 1);
    assert.equal(m.getSessionIdleSeconds(), 445);
    assert.equal(calls[0].id, idleLogIdempotencyUuid({
      user_id: '1195',
      idle_start: stretch.idle_start,
    }));
  });

  it('on timeout-already-written, does not queue a retry', async () => {
    idleWrite.persistIdleLog = async (log) => ({ status: 'already_written', log });
    const m = monitor();
    const start = Date.parse(stretch.idle_start);
    const end = Date.parse(stretch.idle_end);
    await m.logIdlePeriod(start, end, 445000);
    assert.equal(global.offlineQueue.idleLogs.length, 0);
  });

  it('on unconfirmed timeout, queues that id once', async () => {
    const id = idleLogIdempotencyUuid({
      user_id: '1195',
      idle_start: stretch.idle_start,
    });
    idleWrite.persistIdleLog = async (log) => ({
      status: 'queue',
      log,
      error: timeoutErr(),
    });
    const m = monitor();
    const start = Date.parse(stretch.idle_start);
    const end = Date.parse(stretch.idle_end);
    await m.logIdlePeriod(start, end, 445000);
    await m.logIdlePeriod(start, end, 445000);
    assert.equal(global.offlineQueue.idleLogs.length, 1);
    assert.equal(global.offlineQueue.idleLogs[0].id, id);
    assert.equal(global.offlineQueue.idleLogs[0].time_log_id, stretch.time_log_id);
  });
});

describe('idle periods stay inside the session (bounds)', () => {
  afterEach(() => {
    delete global.trackingManager;
    delete global.currentSession;
  });

  function boundsMonitor() {
    const m = new EnhancedIdleMonitor({ idle_detection_threshold_seconds: 60 });
    m._resolveUserId = () => null;
    return m;
  }

  it('discards idle recorded with no session open', async () => {
    const m = boundsMonitor();
    await m.logIdlePeriod(
      Date.parse('2026-08-16T17:53:22Z'),
      Date.parse('2026-08-17T05:50:56Z'),
      43054 * 1000,
    );
    assert.equal(m._sessionIdleSeconds, 0);
  });

  it('clamps idle that began before the session', async () => {
    global.trackingManager = { sessionStartTime: '2026-08-17T05:50:59.005Z' };
    const m = boundsMonitor();
    const start = Date.parse('2026-08-16T17:53:22Z');
    const end = Date.parse('2026-08-17T05:52:59Z');
    await m.logIdlePeriod(start, end, end - start);
    assert.equal(m._sessionIdleSeconds, 120);
  });

  it('cannot make idle exceed the tracked day after clamp', async () => {
    global.trackingManager = { sessionStartTime: '2026-08-17T05:50:59.005Z' };
    const m = boundsMonitor();
    const trackedSeconds = 6835;
    const start = Date.parse('2026-08-16T17:53:22Z');
    const end = Date.parse('2026-08-17T05:50:56Z');
    await m.logIdlePeriod(start, end, end - start);
    assert.equal(Math.min(trackedSeconds, m._sessionIdleSeconds), 0);
  });
});
