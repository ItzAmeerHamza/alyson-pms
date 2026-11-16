import { describe, expect, it } from 'vitest';
import {
  buildPlanningFacts,
  buildStats,
  emptyScreenshotStats,
  weekMonthPaceFromDays,
} from './assistant-briefing';
import { PulseService } from './pulse.service';

const day = (date: string, hours: number) => ({
  date,
  tracked_hours: hours,
  adjustment_hours: 0,
  hours_worked: hours,
  low_activity_hours: 0,
  idle_hours: 0,
  non_effective_hours: 0,
  effective_hours: hours,
  below_threshold: false,
});

function stats(date: string, opts: { leaveToday?: { date: string; leaveType: string; fraction: number } | null; worked?: number; week?: ReturnType<typeof weekMonthPaceFromDays> }) {
  return buildStats({
    date,
    timezone: 'Asia/Kolkata',
    hoursSource: 'pulse_daily_hours',
    hoursThreshold: 7,
    leaveToday: opts.leaveToday ?? null,
    trackedHours: opts.worked ?? 0,
    hoursWorked: opts.worked ?? 0,
    sessionCount: 1,
    idleHours: 0,
    lowActivityHours: 0,
    projects: [],
    screenshots: emptyScreenshotStats(),
    weekPace: opts.week?.weekPace,
    monthPace: opts.week?.monthPace,
  });
}
const noon = (date: string) => Date.parse(`${date}T06:30:00Z`); // 12:00 IST

describe('Coach knows about personal leave', () => {
  it('a full leave day: no target, never "behind", says it already counts', () => {
    const leave = { date: '2026-10-21', leaveType: 'sick', fraction: 1 };
    // Team Time credits 7h on a leave day, so hours worked is 7 with no tracking.
    const s = stats('2026-10-21', { leaveToday: leave, worked: 7 });
    expect(s.below_effective_target).toBe(false);
    expect(s.coaching.severity).not.toBe('behind');
    const facts = buildPlanningFacts(s, noon('2026-10-21'));
    expect(facts.some((f) => f.includes('sick leave (full day)'))).toBe(true);
    expect(facts.some((f) => f.startsWith('Still needed'))).toBe(false);
  });

  it('a half leave day keeps the target and notes the half already counted', () => {
    const leave = { date: '2026-10-21', leaveType: 'annual', fraction: 0.5 };
    const s = stats('2026-10-21', { leaveToday: leave, worked: 3.5 });
    const facts = buildPlanningFacts(s, noon('2026-10-21'));
    expect(facts.some((f) => f.includes('half day of annual leave'))).toBe(true);
    expect(facts.some((f) => f.startsWith('Still needed for the 7 hours'))).toBe(true);
  });

  it('upcoming leave is counted toward the week and not treated as a day to work', () => {
    // Mon 19 Oct, 7h worked. Thu 22 is annual leave (full day).
    const leaveDays = [{ date: '2026-10-22', leaveType: 'annual', fraction: 1 }];
    const pace = weekMonthPaceFromDays([day('2026-10-19', 7)], '2026-10-19', 'Asia/Kolkata', '2026-10-20', [], leaveDays);
    expect(pace.weekPace?.leaveDays).toEqual(leaveDays);
    const s = stats('2026-10-19', { worked: 7, week: pace });
    const week = buildPlanningFacts(s, noon('2026-10-20')).find((f) => f.startsWith('This week'))!;
    // 35 − 7 worked − 7 leave credit = 21h over Tue, Wed, Fri (3 days) = 7h a day.
    expect(week).toContain('21 hours still needed');
    expect(week).toContain('3 weekday(s) left');
    expect(week).toContain('about 7 hours effective per weekday');
    expect(week).toContain('Upcoming leave');
  });
});

describe('leave days for one employee', () => {
  const rows = {
    personal: [
      { leave_type: 'annual', start_date: '2026-10-19', end_date: '2026-10-20', half_day: false },
      { leave_type: 'sick', start_date: '2026-10-22', end_date: '2026-10-23', half_day: true }, // half day → first weekday only
      { leave_type: 'personal', start_date: '2026-10-24', end_date: '2026-10-25', half_day: false }, // weekend → nothing
    ],
    team: [
      { country: null, location: 'Pune', team: 'Affiliates', leave_type: 'other', start_date: '2026-10-20', end_date: '2026-10-21' },
      { country: null, location: 'Lahore', team: 'Affiliates', leave_type: 'other', start_date: '2026-10-26', end_date: '2026-10-26' }, // other office
    ],
  };
  const db = {
    query: async (sql: string) => {
      if (sql.includes('FROM time_doctor.leave_events')) return { rows: rows.personal };
      if (sql.includes('team_leave_events')) {
        expect(sql).toContain("leave_type <> 'holiday'");
        return { rows: rows.team };
      }
      if (sql.includes('user_extensions')) return { rows: [{ id: '101', country: 'India', location: 'Pune', department: 'Affiliates' }] };
      throw new Error('unexpected query');
    },
  };
  const svc = new PulseService(db as never, {} as never, {} as never, {} as never);

  it('lists each weekday once, half days as 0.5, team leave matched, holidays excluded', async () => {
    const out = await svc.personalLeaveDaysForUser({ id: '1', organization_id: '511' } as never, '101', '2026-10-01', '2026-10-31');
    expect(out).toEqual([
      { date: '2026-10-19', leaveType: 'annual', fraction: 1 },
      { date: '2026-10-20', leaveType: 'annual', fraction: 1 },
      { date: '2026-10-21', leaveType: 'other', fraction: 1 },
      { date: '2026-10-22', leaveType: 'sick', fraction: 0.5 },
    ]);
  });
});
