import { describe, expect, it } from 'vitest';
import { sessionEndMs, mergeTimeIntervals, calculateMergedHoursByUser } from './time-merge';

describe('sessionEndMs', () => {
  it('uses end_time when the session is closed', () => {
    expect(
      sessionEndMs({
        end_time: '2026-08-20T22:06:33.763Z',
        last_alive_at: '2026-08-20T22:05:21.787Z',
      }),
    ).toBe(Date.parse('2026-08-20T22:06:33.763Z'));
  });

  it('caps an open session at last_alive_at instead of now', () => {
    const end = sessionEndMs({
      end_time: null,
      last_alive_at: '2026-08-20T22:06:33.763Z',
    });
    expect(end).toBe(Date.parse('2026-08-20T22:06:33.763Z'));
    expect(end).toBeLessThan(Date.now() - 60_000);
  });

  it('falls back to now only when there is no proof of life', () => {
    const before = Date.now();
    const end = sessionEndMs({ end_time: null, last_alive_at: null });
    const after = Date.now();
    expect(end).toBeGreaterThanOrEqual(before);
    expect(end).toBeLessThanOrEqual(after);
  });
});

describe('Start / Stop / quit must not inflate Pulse hours', () => {
  it('two sequential sessions add', () => {
    const hours = calculateMergedHoursByUser([
      {
        user_id: '1224',
        start_time: '2026-08-25T14:00:00.000Z',
        end_time: '2026-08-25T15:00:00.000Z',
      },
      {
        user_id: '1224',
        start_time: '2026-08-25T15:10:00.000Z',
        end_time: '2026-08-25T15:40:00.000Z',
      },
    ]);
    expect(hours.get('1224')).toBe(1.5);
  });

  it('a nested 30s row inside a longer session does not add time', () => {
    const hours = calculateMergedHoursByUser([
      {
        user_id: '1224',
        start_time: '2026-08-24T17:31:55.000Z',
        end_time: '2026-08-24T20:00:00.000Z',
      },
      {
        user_id: '1224',
        start_time: '2026-08-24T18:45:00.000Z',
        end_time: '2026-08-24T18:45:30.000Z',
      },
    ]);
    expect(hours.get('1224')).toBe(2.5);
  });

  it('quit leaving an open row bills last_alive, not wall-clock now', () => {
    const hours = calculateMergedHoursByUser([
      {
        user_id: '1224',
        start_time: '2026-08-25T14:00:00.000Z',
        end_time: null,
        last_alive_at: '2026-08-25T16:00:00.000Z',
      },
    ]);
    expect(hours.get('1224')).toBe(2);
  });

  it('overlapping Start/Stop replay merges instead of summing', () => {
    const merged = mergeTimeIntervals([
      { startMs: Date.parse('2026-08-25T14:00:00.000Z'), endMs: Date.parse('2026-08-25T17:00:00.000Z') },
      { startMs: Date.parse('2026-08-25T15:00:00.000Z'), endMs: Date.parse('2026-08-25T16:00:00.000Z') },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].endMs - merged[0].startMs).toBe(3 * 3600 * 1000);
  });
});
