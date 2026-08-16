/**
 * Offline rows bypass every guard on their way to the API.
 *
 * Client-side start/stop serialization does not apply to sessions reconstructed
 * from the ledger after a crash, and the server cannot distinguish an
 * overlapping replay from a legitimate historical backfill — so it accepts both.
 * Reports sum session durations, meaning any overlap that survives to replay is
 * billed twice. This is the last place it can be caught.
 */

const TrackingManager = require('../tracking-manager');

const clamp = (queue) => {
  const tm = Object.create(TrackingManager.prototype);
  tm._clampOverlappingQueuedSessions(queue);
  return queue;
};

const create = (id, start, end) => ({
  type: 'create_time_log',
  data: { id, start_time: start, end_time: end, status: end ? 'completed' : 'active' },
});

describe('offline queue overlap clamping', () => {
  it('clamps a session that runs past the next session start', () => {
    const queue = [
      create('a', '2026-08-14T10:00:00.000Z', '2026-08-14T13:00:00.000Z'),
      create('b', '2026-08-14T11:00:00.000Z', '2026-08-14T12:00:00.000Z'),
    ];

    clamp(queue);

    expect(queue[0].data.end_time).toBe('2026-08-14T11:00:00.000Z');
    expect(queue[1].data.end_time).toBe('2026-08-14T12:00:00.000Z');
  });

  it('closes a session left open by a crash at the next session start', () => {
    const queue = [
      create('a', '2026-08-14T10:00:00.000Z', null),
      create('b', '2026-08-14T10:30:00.000Z', '2026-08-14T11:00:00.000Z'),
    ];

    clamp(queue);

    expect(queue[0].data.end_time).toBe('2026-08-14T10:30:00.000Z');
    expect(queue[0].data.status).toBe('completed');
  });

  it('leaves non-overlapping sessions untouched', () => {
    const queue = [
      create('a', '2026-08-14T10:00:00.000Z', '2026-08-14T11:00:00.000Z'),
      create('b', '2026-08-14T12:00:00.000Z', '2026-08-14T13:00:00.000Z'),
    ];

    clamp(queue);

    expect(queue[0].data.end_time).toBe('2026-08-14T11:00:00.000Z');
    expect(queue[1].data.end_time).toBe('2026-08-14T13:00:00.000Z');
  });

  it('handles queue order independent of start time', () => {
    // Ledger rehydration does not append in chronological order.
    const queue = [
      create('b', '2026-08-14T11:00:00.000Z', '2026-08-14T12:00:00.000Z'),
      create('a', '2026-08-14T10:00:00.000Z', '2026-08-14T13:00:00.000Z'),
    ];

    clamp(queue);

    expect(queue[1].data.end_time).toBe('2026-08-14T11:00:00.000Z');
  });

  it('never produces a negative duration when fully contained', () => {
    const queue = [
      create('a', '2026-08-14T11:00:00.000Z', '2026-08-14T13:00:00.000Z'),
      create('b', '2026-08-14T10:00:00.000Z', '2026-08-14T14:00:00.000Z'),
    ];

    clamp(queue);

    for (const entry of queue) {
      if (!entry.data.end_time) continue;
      const start = new Date(entry.data.start_time).getTime();
      const end = new Date(entry.data.end_time).getTime();
      expect(end).toBeGreaterThanOrEqual(start);
    }
  });

  it('ignores non-create entries and malformed rows', () => {
    const queue = [
      { type: 'update_time_log', data: { id: 'x', end_time: '2026-08-14T12:00:00.000Z' } },
      create('a', 'not-a-date', null),
      create('b', '2026-08-14T10:00:00.000Z', '2026-08-14T11:00:00.000Z'),
    ];

    expect(() => clamp(queue)).not.toThrow();
    expect(queue[0].data.end_time).toBe('2026-08-14T12:00:00.000Z');
  });
});
