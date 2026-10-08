import { describe, expect, it } from 'vitest';
import { mondaysOverlappingMonth } from '../lib/paused-roster';
import {
  employeesFromSendSnapshot,
  mailTargetFromDailyEmployee,
  resolveLowHoursSendWindow,
} from './low-hours-send-window';

describe('resolveLowHoursSendWindow', () => {
  it('uses MTD from week 1 through the August week-4 Friday', () => {
    expect(
      resolveLowHoursSendWindow({
        period: 'pace',
        month: '2026-08',
        weekIndex: 4,
        weekStart: '2026-08-24',
        periodStart: '2026-08-03',
        periodEnd: '2026-08-28',
        hoursThreshold: 140,
        todayKey: '2026-09-03',
        mondays: mondaysOverlappingMonth('2026-08'),
        defaultDailyThreshold: 8,
      }),
    ).toMatchObject({
      periodStart: '2026-08-03',
      periodEnd: '2026-08-28',
      weekStart: '2026-08-24',
      expectedHours: 140,
      weekIndex: 4,
    });
  });

  it('keeps a single work day for daily send', () => {
    expect(
      resolveLowHoursSendWindow({
        period: 'day',
        date: '2026-09-03',
        hoursThreshold: 8,
        todayKey: '2026-09-03',
        mondays: [],
        defaultDailyThreshold: 7,
      }),
    ).toMatchObject({
      periodStart: '2026-09-03',
      periodEnd: '2026-09-03',
      expectedHours: 8,
    });
  });
});

describe('mailTargetFromDailyEmployee', () => {
  it('sums weekday hours in the MTD window', () => {
    const target = mailTargetFromDailyEmployee(
      {
        employee_id: 9,
        full_name: 'Ada',
        email: 'ada@cintara.ai',
        days: [
          { date: '2026-08-03', hours_worked: 8, low_activity_hours: 1, idle_hours: 0 },
          { date: '2026-08-08', hours_worked: 5, low_activity_hours: 0, idle_hours: 1 },
          { date: '2026-08-24', hours_worked: 7, low_activity_hours: 0, idle_hours: 0 },
        ],
      },
      140,
      '2026-08-03',
      '2026-08-28',
    );
    expect(target.hours_worked).toBe(15);
    expect(target.day_keys).toEqual(['2026-08-03', '2026-08-24']);
    expect(target.daily_hours['2026-08-03']).toBe(8);
  });

  it('keeps only selected snapshot rows', () => {
    const rows = employeesFromSendSnapshot(
      [
        { employee_id: '1', email: 'ada@cintara.ai', days: [{ date: '2026-08-03' }] },
        { employee_id: '2', email: 'ben@cintara.ai', days: [{ date: '2026-08-03' }] },
      ],
      ['2'],
    );
    expect(rows.map((row) => row.employee_id)).toEqual(['2']);
  });
});
