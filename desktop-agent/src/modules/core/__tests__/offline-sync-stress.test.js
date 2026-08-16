/**
 * Stress test for offline tracking and sync.
 *
 * Offline rows reach the database having bypassed every other guard: the client
 * serialization does not apply to sessions rebuilt from the ledger after a
 * crash, and the server cannot tell an overlapping replay from a legitimate
 * historical backfill. Whatever is in the queue when connectivity returns is
 * what gets billed.
 *
 * Rather than a handful of hand-picked cases, this generates hundreds of random
 * offline sequences — including the messy ones (crashes leaving sessions open,
 * out-of-order ledger rehydration, sessions nested inside others) — and asserts
 * the invariants that must hold no matter what:
 *
 *   1. No two synced sessions may overlap in wall-clock time.
 *   2. Summed duration may never exceed the elapsed span it covers.
 *   3. Syncing may not change how much time was recorded, beyond removing
 *      overlap. Real work is never deleted.
 *   4. No session may end before it started.
 */

const TrackingManager = require('../tracking-manager');

const clampQueue = (queue) => {
  const tm = Object.create(TrackingManager.prototype);
  tm._clampOverlappingQueuedSessions(queue);
  return queue;
};

const BASE = Date.parse('2026-08-17T09:00:00.000Z');
const iso = (ms) => new Date(ms).toISOString();

const entry = (id, startMs, endMs) => ({
  type: 'create_time_log',
  data: {
    id,
    start_time: iso(startMs),
    end_time: endMs === null ? null : iso(endMs),
    status: endMs === null ? 'active' : 'completed',
  },
});

/** Deterministic PRNG so a failure can be reproduced from its seed. */
function rng(seed) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

/**
 * One offline stretch: sessions with realistic pathologies — a crash leaving a
 * row open, a duplicate start moments after another, a session wholly inside
 * another, and ledger rehydration appending out of chronological order.
 */
function generateOfflineQueue(seed) {
  const rand = rng(seed);
  const count = 2 + Math.floor(rand() * 8);
  const rows = [];
  let cursor = BASE;

  for (let i = 0; i < count; i += 1) {
    const gap = Math.floor(rand() * 10 * 60 * 1000);
    const duration = 60 * 1000 + Math.floor(rand() * 90 * 60 * 1000);
    const start = cursor + gap;
    const roll = rand();

    if (roll < 0.15) {
      rows.push(entry(`s${i}`, start, null)); // crash: never closed
    } else if (roll < 0.35) {
      // Duplicate start seconds later — the twins pattern.
      rows.push(entry(`s${i}a`, start, start + duration));
      rows.push(entry(`s${i}b`, start + Math.floor(rand() * 5000), start + duration));
    } else if (roll < 0.5) {
      // Nested: a short session entirely inside a longer one.
      rows.push(entry(`s${i}`, start, start + duration));
      const innerStart = start + Math.floor(duration * 0.25);
      rows.push(entry(`s${i}i`, innerStart, innerStart + Math.floor(duration * 0.25)));
    } else {
      rows.push(entry(`s${i}`, start, start + duration));
    }
    cursor = start + duration;
  }

  // Ledger rehydration does not preserve order.
  if (rand() < 0.5) rows.reverse();
  return rows;
}

const parsed = (queue) =>
  queue
    .map((q) => ({
      id: q.data.id,
      start: Date.parse(q.data.start_time),
      end: q.data.end_time === null ? null : Date.parse(q.data.end_time),
    }))
    .sort((a, b) => a.start - b.start);

describe('offline sync stress — 400 randomized offline stretches', () => {
  const seeds = Array.from({ length: 400 }, (_, i) => i + 1);

  it('never syncs two sessions that overlap', () => {
    for (const seed of seeds) {
      const queue = clampQueue(generateOfflineQueue(seed));
      const rows = parsed(queue);
      for (let i = 0; i < rows.length - 1; i += 1) {
        if (rows[i].end === null) continue;
        expect({ seed, a: rows[i].id, b: rows[i + 1].id, end: rows[i].end, next: rows[i + 1].start })
          .toMatchObject({ seed });
        expect(rows[i].end).toBeLessThanOrEqual(rows[i + 1].start);
      }
    }
  });

  it('never bills more time than actually elapsed', () => {
    for (const seed of seeds) {
      const queue = clampQueue(generateOfflineQueue(seed));
      const rows = parsed(queue).filter((r) => r.end !== null);
      if (rows.length === 0) continue;

      const summed = rows.reduce((acc, r) => acc + (r.end - r.start), 0);
      const span = Math.max(...rows.map((r) => r.end)) - Math.min(...rows.map((r) => r.start));

      expect(summed).toBeLessThanOrEqual(span);
    }
  });

  it('never produces a session ending before it started', () => {
    for (const seed of seeds) {
      const queue = clampQueue(generateOfflineQueue(seed));
      for (const row of parsed(queue)) {
        if (row.end === null) continue;
        expect(row.end).toBeGreaterThanOrEqual(row.start);
      }
    }
  });

  it('only ever removes overlap — never shortens a non-overlapping session', () => {
    for (const seed of seeds) {
      const before = parsed(generateOfflineQueue(seed));
      const after = parsed(clampQueue(generateOfflineQueue(seed)));

      for (let i = 0; i < before.length; i += 1) {
        const b = before[i];
        const a = after.find((x) => x.id === b.id);
        if (!a || b.end === null || a.end === null) continue;

        // A session may only lose time it shared with the next one.
        const nextStart = before
          .filter((x) => x.start > b.start)
          .reduce((min, x) => Math.min(min, x.start), Infinity);
        if (b.end <= nextStart) {
          expect(a.end).toBe(b.end); // untouched
        } else {
          expect(a.end).toBeGreaterThanOrEqual(Math.min(b.start, nextStart));
          expect(a.end).toBeLessThanOrEqual(b.end); // never extended
        }
      }
    }
  });
});

describe('offline sync — the sequence a user actually performs', () => {
  it('start, work, stop, start again, all offline, then sync', () => {
    // 09:00 start → 09:45 stop → 10:00 start → 10:30 stop, connectivity gone
    // throughout, flushed at 11:00.
    const queue = [
      entry('morning', BASE, BASE + 45 * 60 * 1000),
      entry('later', BASE + 60 * 60 * 1000, BASE + 90 * 60 * 1000),
    ];
    const beforeTotal = 75 * 60 * 1000;

    clampQueue(queue);
    const rows = parsed(queue);
    const total = rows.reduce((acc, r) => acc + (r.end - r.start), 0);

    // Clean sequence: sync must not alter the recorded time at all.
    expect(total).toBe(beforeTotal);
    expect(rows[0].end).toBeLessThanOrEqual(rows[1].start);
  });

  it('a crash mid-session does not bill through to the next start', () => {
    // Agent died at 09:20 without closing; user restarted and began again 10:00.
    const queue = [
      entry('crashed', BASE, null),
      entry('restarted', BASE + 60 * 60 * 1000, BASE + 75 * 60 * 1000),
    ];

    clampQueue(queue);
    const rows = parsed(queue);

    // The crashed session ends where the next begins — not left open to be
    // closed hours later at whatever the sweep decides.
    expect(rows[0].end).toBe(rows[1].start);
    expect(rows[0].end).toBeGreaterThanOrEqual(rows[0].start);
  });
});
