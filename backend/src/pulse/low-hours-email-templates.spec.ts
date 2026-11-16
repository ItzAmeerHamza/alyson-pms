import { describe, expect, it } from 'vitest';
import { buildApprovedPaceEmail, buildPaceEmailMetrics } from './low-hours-email-templates';

describe('weekly hours email public holidays', () => {
  it('does not mark a holiday as behind and still counts hours worked that day', () => {
    const metrics = buildPaceEmailMetrics({
      dayKeys: ['2026-10-19', '2026-10-20', '2026-10-21'],
      dailyHours: new Map([
        ['2026-10-19', 8],
        ['2026-10-20', 6.5],
        ['2026-10-21', 8],
      ]),
      dailyLowActivity: new Map(),
      dailyIdle: new Map(),
      expectedHours: 32,
      todayKey: '2026-10-25',
      holidayDays: ['2026-10-20'],
      dailyTarget: 7,
    });

    const holiday = metrics.dayRows.find((row) => row.date === '2026-10-20');
    expect(holiday?.status).toBe('Worked');
    expect(holiday?.publicHoliday).toBe(true);
    expect(holiday?.dailyTarget).toBe(0);
    expect(metrics.dayRows.find((row) => row.date === '2026-10-19')?.status).toBe('On track');
    expect(metrics.hoursWorked).toBe(22.5);
    expect(metrics.paceDelta).toBe(-9.5);

    const off = buildPaceEmailMetrics({
      dayKeys: ['2026-10-20'],
      dailyHours: new Map([['2026-10-20', 0]]),
      dailyLowActivity: new Map(),
      dailyIdle: new Map(),
      expectedHours: 0,
      todayKey: '2026-10-25',
      holidayDays: ['2026-10-20'],
    });
    expect(off.dayRows[0].status).toBe('Holiday');
  });

  it('tells the employee the weekly target is already lower', () => {
    const mail = buildApprovedPaceEmail({
      employeeName: 'Vinit',
      hoursWorked: 22.5,
      expectedHours: 32,
      nonEffectiveHours: 0,
      effectiveHours: 22.5,
      hoursRemaining: 9.5,
      avgDailyPace: 7.5,
      paceDelta: -9.5,
      periodStart: '2026-10-19',
      periodEnd: '2026-10-23',
      weekIndex: 4,
      month: '2026-10',
      dayRows: [
      {
        date: '2026-10-20',
        trackedHours: 7.5,
        nonEffectiveHours: 0,
        effectiveHours: 7.5,
        dailyTarget: 0,
        publicHoliday: true,
        status: 'Worked',
      },
    ],
      fromEmail: 'hamza@cintara.ai',
      variant: 'week',
      publicHolidayDays: 1,
    });

    expect(mail.subject).toContain('Weekly Hours Update');
    expect(mail.html).toContain('Weekly hours target');
    expect(mail.html).toContain('32 hours');
    expect(mail.html).toContain('Tuesday, Oct 20 was a public holiday, so that day was not required');
    expect(mail.html).toContain('A public holiday is not a credit');
    expect(mail.text).toContain('Weekly hours target: 32 hours');
    // Holiday work is called out, and is already part of the hours shown.
    expect(mail.html).toContain(
      'You worked 7 hours 30 min on the holiday, and it is included in your hours above.',
    );
  });
});
