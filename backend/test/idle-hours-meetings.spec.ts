import { describe, expect, it } from 'vitest';
import { EffectiveTimeService } from '../src/pulse/effective-time.service';
import type { TimeInterval } from '../src/pulse/meeting-intervals';

const svc = new EffectiveTimeService({} as never);

describe('idleHoursFromIdleLogs meeting exclusion', () => {
  it('drops a 1-hour idle that sits entirely inside a meeting', () => {
    const meetStart = Date.parse('2026-08-24T12:00:00Z');
    const meetings = new Map<string, TimeInterval[]>([
      ['1196', [{ startMs: meetStart, endMs: meetStart + 60 * 60 * 1000 }]],
    ]);

    const byUser = svc.idleHoursFromIdleLogs(
      [
        {
          user_id: '1196',
          idle_start: '2026-08-24T12:10:00Z',
          idle_end: '2026-08-24T12:50:00Z',
          duration_seconds: 40 * 60,
        },
      ],
      'America/Chicago',
      meetings,
    );

    expect(byUser.get('1196')?.get('2026-08-24') ?? 0).toBe(0);
  });

  it('keeps idle that is outside the meeting and at least 5 minutes', () => {
    const meetStart = Date.parse('2026-08-24T12:00:00Z');
    const meetings = new Map<string, TimeInterval[]>([
      ['1196', [{ startMs: meetStart, endMs: meetStart + 60 * 60 * 1000 }]],
    ]);

    const byUser = svc.idleHoursFromIdleLogs(
      [
        {
          user_id: '1196',
          idle_start: '2026-08-24T13:10:00Z',
          idle_end: '2026-08-24T13:40:00Z',
          duration_seconds: 30 * 60,
        },
      ],
      'America/Chicago',
      meetings,
    );

    expect(byUser.get('1196')?.get('2026-08-24')).toBe(0.5);
  });

  it('does not fall back to time_logs.idle_seconds after meeting clip leaves 0', () => {
    const meetStart = Date.parse('2026-08-24T12:00:00Z');
    const meetings = new Map<string, TimeInterval[]>([
      ['1196', [{ startMs: meetStart, endMs: meetStart + 60 * 60 * 1000 }]],
    ]);

    const fromLogs = svc.idleHoursFromIdleLogs(
      [
        {
          user_id: '1196',
          idle_start: '2026-08-24T12:00:00Z',
          idle_end: '2026-08-24T13:00:00Z',
          duration_seconds: 3600,
        },
      ],
      'America/Chicago',
      meetings,
    );
    expect(fromLogs.get('1196')?.has('2026-08-24')).toBe(true);
    expect(fromLogs.get('1196')?.get('2026-08-24')).toBe(0);

    const fromSeconds = new Map<string, Map<string, number>>([
      ['1196', new Map([['2026-08-24', 1]])],
    ]);
    const merged = svc.mergeIdleHours(fromLogs, fromSeconds);
    expect(merged.get('1196')?.get('2026-08-24') ?? 0).toBe(0);
  });

  it('does not round each 5-minute idle slice to 0.1h (that see-sawed 6m / 12m / 18m)', () => {
    const byUser = svc.idleHoursFromIdleLogs(
      [
        {
          user_id: '1196',
          idle_start: '2026-08-25T13:00:00Z',
          idle_end: '2026-08-25T13:05:00Z',
          duration_seconds: 300,
        },
        {
          user_id: '1196',
          idle_start: '2026-08-25T13:10:00Z',
          idle_end: '2026-08-25T13:15:00Z',
          duration_seconds: 300,
        },
        {
          user_id: '1196',
          idle_start: '2026-08-25T13:20:00Z',
          idle_end: '2026-08-25T13:25:00Z',
          duration_seconds: 300,
        },
      ],
      'America/Chicago',
    );

    expect(byUser.get('1196')?.get('2026-08-25')).toBeCloseTo(0.25, 5);
  });
});
