/**
 * Stress test for the Start stamp, upstream of the offline queue.
 *
 * A session is stamped at the Start click rather than at the instant its row
 * lands, because offline those are ~5s apart and stamping the later one both
 * drops that time and desyncs the tray clock from the in-app clock. Backdating
 * is only safe if it can never reach behind something already recorded.
 *
 * That is not a cosmetic concern. _clampOverlappingQueuedSessions resolves an
 * overlap by shortening the EARLIER session to the later start — it never moves
 * the later start — so a stamp landing before a recorded end does not merely
 * overlap, it deletes real worked time when the queue flushes. The invariant
 * from the offline-sync stress suite ("only ever removes overlap, never
 * shortens a clean session") is therefore enforced here, at the layer that
 * decides where a session begins.
 *
 * Same shape as offline-sync-stress: randomized histories, deterministic seeds.
 */

const TrackingManager = require('../tracking-manager');

const BASE = Date.parse('2026-08-17T09:00:00.000Z');
const iso = (ms) => new Date(ms).toISOString();
const MAX_BACKDATE_MS = 15000;

const entry = (id, startMs, endMs) => ({
  type: 'create_time_log',
  data: {
    id,
    start_time: iso(startMs),
    end_time: endMs === null ? null : iso(endMs),
    status: endMs === null ? 'active' : 'completed',
  },
});

function rng(seed) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

/**
 * A tracking manager whose queue is in memory, so the stamp can be exercised
 * against an arbitrary recorded history without touching disk.
 */
function managerWithQueue(queue) {
  const tm = Object.create(TrackingManager.prototype);
  tm.getOfflineQueue = () => queue;
  return tm;
}

/**
 * A recorded history ending shortly before "now" — the shape that makes
 * backdating dangerous, since the previous session's end is within reach of
 * the backdate window.
 */
function generateHistory(seed, nowMs) {
  const rand = rng(seed);
  const count = 1 + Math.floor(rand() * 5);
  const rows = [];
  // Last session ends somewhere within (and sometimes beyond) the backdate window.
  let cursor = nowMs - Math.floor(rand() * 40000);
  for (let i = count - 1; i >= 0; i -= 1) {
    const duration = 60 * 1000 + Math.floor(rand() * 60 * 60 * 1000);
    const end = cursor;
    const start = end - duration;
    rows.push(entry(`h${i}`, start, rand() < 0.12 ? null : end));
    cursor = start - Math.floor(rand() * 10 * 60 * 1000);
  }
  if (rand() < 0.5) rows.reverse();
  return rows;
}

const recordedEnds = (queue) =>
  queue
    .map((q) => q.data.end_time)
    .filter(Boolean)
    .map((t) => Date.parse(t));

describe('start stamp stress — 400 randomized recorded histories', () => {
  const seeds = Array.from({ length: 400 }, (_, i) => i + 1);

  it('never stamps a new session before an already recorded end', () => {
    for (const seed of seeds) {
      const now = Date.now();
      const queue = generateHistory(seed, now);
      const tm = managerWithQueue(queue);
      // Click anywhere inside (and past) the backdate window.
      const click = now - Math.floor(rng(seed)() * 30000);

      const stamp = tm._resolveStartStampMs(click);

      for (const end of recordedEnds(queue)) {
        if (end > now) continue; // future ends are not a floor
        expect({ seed, stamp, end }).toMatchObject({ seed });
        expect(stamp).toBeGreaterThanOrEqual(end);
      }
    }
  });

  it('never lets the flush clamp shorten a previously recorded session', () => {
    for (const seed of seeds) {
      const now = Date.now();
      const queue = generateHistory(seed, now);
      const before = new Map(
        queue.filter((q) => q.data.end_time).map((q) => [q.data.id, q.data.end_time]),
      );

      const tm = managerWithQueue(queue);
      const stamp = tm._resolveStartStampMs(now - 5035);
      queue.push(entry('new-session', stamp, null));

      Object.create(TrackingManager.prototype)._clampOverlappingQueuedSessions(queue);

      for (const item of queue) {
        const wasEnd = before.get(item.data.id);
        if (!wasEnd) continue;
        expect({ seed, id: item.data.id }).toMatchObject({ seed });
        expect(item.data.end_time).toBe(wasEnd);
      }
    }
  });

  it('never stamps in the future and never beyond the backdate cap', () => {
    for (const seed of seeds) {
      const now = Date.now();
      const tm = managerWithQueue(generateHistory(seed, now));
      const stamp = tm._resolveStartStampMs(now - 120000);

      expect(stamp).toBeGreaterThanOrEqual(now - MAX_BACKDATE_MS);
      expect(stamp).toBeLessThanOrEqual(Date.now());
    }
  });

  it('still backdates to the click when nothing was recorded recently', () => {
    const now = Date.now();
    const tm = managerWithQueue([entry('old', BASE, BASE + 60 * 60 * 1000)]);
    const click = now - 5035;

    expect(tm._resolveStartStampMs(click)).toBe(click);
  });

  it('survives a corrupt queue without blocking Start', () => {
    const now = Date.now();
    const click = now - 5035;
    const corrupt = [
      null,
      { type: 'create_time_log' },
      { type: 'create_time_log', data: { end_time: 'not-a-date' } },
      { type: 'create_time_log', data: { end_time: null } },
    ];
    const tm = managerWithQueue(corrupt);

    expect(tm._resolveStartStampMs(click)).toBe(click);

    const throwing = Object.create(TrackingManager.prototype);
    throwing.getOfflineQueue = () => {
      throw new Error('queue file unreadable');
    };
    const stamp = throwing._resolveStartStampMs(click);
    expect(stamp).toBeGreaterThanOrEqual(click);
    expect(stamp).toBeLessThanOrEqual(Date.now());
  });
});
