import { describe, expect, it } from 'vitest';
import { EffectiveTimeService } from './effective-time.service';

const svc = new EffectiveTimeService(null as never);
const min = (n: number) => n * 60 * 1000;

describe('countedIdleIntervalsByUser', () => {
  it('keeps idle stretches of 5 minutes or more', () => {
    const start = '2026-08-17T09:00:00.000Z';
    const intervals = svc.countedIdleIntervalsByUser([
      {
        user_id: '1228',
        idle_start: start,
        idle_end: '2026-08-17T09:10:00.000Z',
        duration_seconds: 600,
      },
    ]);
    expect(intervals.get('1228')).toEqual([
      { startMs: Date.parse(start), endMs: Date.parse(start) + min(10) },
    ]);
  });

  it('drops pauses shorter than 5 minutes', () => {
    const intervals = svc.countedIdleIntervalsByUser([
      {
        user_id: '1228',
        idle_start: '2026-08-17T09:00:00.000Z',
        idle_end: '2026-08-17T09:02:00.000Z',
        duration_seconds: 120,
      },
    ]);
    expect(intervals.get('1228')).toBeUndefined();
  });
});

describe('lowActivityHoursFromRows', () => {
  it('does not count a low screenshot that sits inside counted idle', () => {
    const t0 = '2026-08-17T09:00:00.000Z';
    const hours = svc.lowActivityHoursFromRows(
      [
        {
          user_id: '1228',
          activity_date: '2026-08-17',
          captured_at: '2026-08-17T09:03:00.000Z',
          activity_percent: 2,
          is_meeting: false,
          is_low: true,
        },
        {
          user_id: '1228',
          activity_date: '2026-08-17',
          captured_at: '2026-08-17T09:04:00.000Z',
          activity_percent: 2,
          is_meeting: false,
          is_low: true,
        },
        {
          user_id: '1228',
          activity_date: '2026-08-17',
          captured_at: '2026-08-17T09:05:00.000Z',
          activity_percent: 2,
          is_meeting: false,
          is_low: true,
        },
      ],
      [
        {
          user_id: '1228',
          idle_start: t0,
          idle_end: '2026-08-17T09:10:00.000Z',
          duration_seconds: 600,
        },
      ],
      1,
    );
    expect(hours.get('1228')).toBeUndefined();
  });

  it('still counts a sustained low streak outside idle', () => {
    const hours = svc.lowActivityHoursFromRows(
      [
        {
          user_id: '1228',
          activity_date: '2026-08-17',
          captured_at: '2026-08-17T10:00:00.000Z',
          activity_percent: 2,
          is_meeting: false,
          is_low: true,
        },
        {
          user_id: '1228',
          activity_date: '2026-08-17',
          captured_at: '2026-08-17T10:01:00.000Z',
          activity_percent: 2,
          is_meeting: false,
          is_low: true,
        },
        {
          user_id: '1228',
          activity_date: '2026-08-17',
          captured_at: '2026-08-17T10:02:00.000Z',
          activity_percent: 2,
          is_meeting: false,
          is_low: true,
        },
      ],
      [],
      1,
    );
    expect(hours.get('1228')?.get('2026-08-17')).toBeCloseTo(0.05, 5);
  });

  it('credits the real midpoint gap so random shots do not invent extra low minutes', () => {
    const hours = svc.lowActivityHoursFromRows(
      [
        {
          user_id: '1228',
          activity_date: '2026-08-17',
          captured_at: '2026-08-17T10:00:00.000Z',
          activity_percent: 80,
          is_meeting: false,
          is_low: false,
        },
        {
          user_id: '1228',
          activity_date: '2026-08-17',
          captured_at: '2026-08-17T10:01:30.000Z',
          activity_percent: 2,
          is_meeting: false,
          is_low: true,
        },
        {
          user_id: '1228',
          activity_date: '2026-08-17',
          captured_at: '2026-08-17T10:03:00.000Z',
          activity_percent: 80,
          is_meeting: false,
          is_low: false,
        },
      ],
      [],
      5,
    );
    // 90s owned < 3 sustained minutes — a brief dip must not become 5 minutes.
    expect(hours.get('1228')).toBeUndefined();
  });

  it('does not change idle minutes when screenshots fall inside an idle stretch', () => {
    const idle = svc.countedIdleIntervalsByUser([
      {
        user_id: '1228',
        idle_start: '2026-08-17T09:00:00.000Z',
        idle_end: '2026-08-17T09:12:00.000Z',
        duration_seconds: 720,
      },
    ]);
    expect((idle.get('1228')?.[0].endMs ?? 0) - (idle.get('1228')?.[0].startMs ?? 0)).toBe(
      12 * 60 * 1000,
    );
  });
});
