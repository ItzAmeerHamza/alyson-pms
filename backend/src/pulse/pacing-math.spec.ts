import { describe, expect, it } from 'vitest';
import {
  PACING_LEAVE_HOURS_PER_DAY,
  PACING_TARGET_HOURS_PER_WORKDAY,
  WEEKLY_HOURS_TARGET,
  computePacingRowMetrics,
  excludeDateKeys,
  leaveHoursFromFraction,
  pacingTargetForWeekdays,
  projectMonthlyPace,
  projectWeeklyPace,
  resolvePacingStatus,
  sampleDaysWithHolidayWork,
  weekdayKeysInclusive,
} from './pacing-math';
import { leaveTopUpHours } from './time-adjustment.util';

describe('pacing-math acceptance', () => {
  it('holiday week: whoever works the holiday ends up ahead of whoever takes it off', () => {
    const week = weekdayKeysInclusive('2026-10-19', '2026-10-23');
    const holiday = new Set(['2026-10-20']);
    const target = pacingTargetForWeekdays(excludeDateKeys(week, holiday).length);
    expect(target).toBe(28); // same lower target for both: 35 − 7

    const metrics = (hoursPerDay: Record<string, number>) => {
      const logged = Object.values(hoursPerDay).reduce((a, b) => a + b, 0);
      return computePacingRowMetrics({
        hoursWorkedLogged: logged,
        leaveHoursCredit: 0, // a public holiday is not a credit
        targetHours: target,
        dailyHoursSample: Object.values(hoursPerDay),
        remainingWorkDays: 0,
        mode: 'weekly',
      });
    };
    const tookItOff = metrics({ '2026-10-19': 7, '2026-10-21': 7, '2026-10-22': 7, '2026-10-23': 7 });
    const workedIt = metrics({
      '2026-10-19': 7, '2026-10-20': 7, '2026-10-21': 7, '2026-10-22': 7, '2026-10-23': 7,
    });

    expect(tookItOff.hoursWorked).toBe(28); // meets the target, nothing added
    expect(workedIt.hoursWorked).toBe(35); // every tracked hour counts
    expect(workedIt.hoursWorked - tookItOff.hoursWorked).toBe(7);
    expect(workedIt.hoursWorked - target).toBe(7); // 7 hours over target
  });

  it('monthly target = weekdays × 7 (22 → 154)', () => {
    // Aug 2026: 1 Sat … 31 Mon — count weekdays
    const days = weekdayKeysInclusive('2026-08-01', '2026-08-31');
    expect(days.length).toBe(21); // Aug 2026 has 21 weekdays
    expect(days.length * PACING_TARGET_HOURS_PER_WORKDAY).toBe(147);

    // Synthetic 22 weekdays
    expect(22 * PACING_TARGET_HOURS_PER_WORKDAY).toBe(154);
  });

  it('monthly projection = worked + avg × remaining', () => {
    const hoursWorked = 78;
    const avg = 7.8;
    const remaining = 12;
    const { projectedPace, avgDailyPace } = projectMonthlyPace({
      hoursWorked,
      dailyHoursSample: Array(10).fill(avg),
      remainingWorkDays: remaining,
    });
    expect(avgDailyPace).toBe(7.8);
    expect(projectedPace).toBe(171.6);
    expect(projectedPace - 154).toBeCloseTo(17.6, 5);
  });

  it('weekly projection = sum(Mon–Thu) + avg — not × remaining', () => {
    const sample = [7, 7, 7, 7];
    const { projectedPace, avgDailyPace } = projectWeeklyPace(sample);
    expect(avgDailyPace).toBe(7);
    expect(projectedPace).toBe(35); // 28 + 7
    expect(WEEKLY_HOURS_TARGET).toBe(35);
  });

  it('a public holiday lowers the target and still counts hours worked that day', () => {
    const week = weekdayKeysInclusive('2026-10-19', '2026-10-23');
    const holiday = new Set(['2026-10-20']);
    const required = excludeDateKeys(week, holiday);
    expect(required).toEqual(['2026-10-19', '2026-10-21', '2026-10-22', '2026-10-23']);
    expect(pacingTargetForWeekdays(required.length)).toBe(28);

    const tracked = new Map<string, number>([
      ['2026-10-19', 7],
      ['2026-10-20', 6],
      ['2026-10-21', 7],
      ['2026-10-22', 7],
    ]);
    const sample = sampleDaysWithHolidayWork(
      ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22'],
      holiday,
      (day) => tracked.get(day) ?? 0,
    );
    expect(sample).toContain('2026-10-20');

    const off = sampleDaysWithHolidayWork(
      ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22'],
      holiday,
      (day) => (day === '2026-10-20' ? 0 : 7),
    );
    expect(off).not.toContain('2026-10-20');

    const worked = computePacingRowMetrics({
      hoursWorkedLogged: 7 + 6 + 7 + 7,
      leaveHoursCredit: 0,
      targetHours: 28,
      dailyHoursSample: [7, 6, 7, 7],
      remainingWorkDays: 1,
      mode: 'weekly',
    });
    expect(worked.hoursWorked).toBe(27);
    expect(worked.targetHours).toBe(28);

    const absent = computePacingRowMetrics({
      hoursWorkedLogged: 7 + 7 + 7,
      leaveHoursCredit: 0,
      targetHours: 28,
      dailyHoursSample: [7, 7, 7],
      remainingWorkDays: 1,
      mode: 'weekly',
    });
    expect(absent.hoursWorked).toBe(21);
    expect(absent.targetHours).toBe(28);
    expect(worked.hoursWorked).toBeGreaterThan(absent.hoursWorked);
  });

  it('half-day leave = +4h', () => {
    expect(leaveHoursFromFraction(0.5)).toBe(4);
    expect(leaveHoursFromFraction(1)).toBe(PACING_LEAVE_HOURS_PER_DAY);
  });

  it('status: projected ≥ target → on_track when under target hours', () => {
    expect(
      resolvePacingStatus({
        hoursWorked: 78,
        projectedPace: 171.6,
        hoursRemaining: 154 - 78,
        remainingWorkDays: 12,
        targetHours: 154,
      }),
    ).toBe('on_track');
  });

  it('computePacingRowMetrics monthly end-to-end', () => {
    const row = computePacingRowMetrics({
      hoursWorkedLogged: 70,
      leaveHoursCredit: 8,
      targetHours: 154,
      dailyHoursSample: Array(10).fill(7.8),
      remainingWorkDays: 12,
      mode: 'monthly',
    });
    expect(row.hoursWorked).toBe(78);
    expect(row.projectedPace).toBe(171.6);
    expect(row.paceDelta).toBe(17.6);
    expect(row.status).toBe('on_track');
  });

  it('adds leave credit and other adjustments into worked hours', () => {
    const row = computePacingRowMetrics({
      hoursWorkedLogged: 21,
      leaveHoursCredit: leaveHoursFromFraction(0.5), // +4h
      otherAdjustmentHours: 1,
      targetHours: WEEKLY_HOURS_TARGET,
      dailyHoursSample: [7, 7, 7, 5],
      remainingWorkDays: 1,
      mode: 'weekly',
    });
    expect(row.leaveHoursCredit).toBe(4);
    expect(row.hoursWorked).toBe(26);
    expect(row.projectedPace).toBe(32.5); // weekly: sum(sample)+avg = 26+6.5
    expect(row.hoursWorkedLogged).toBe(21);
  });

  it('adds the full leave credit on top of tracked time', () => {
    const tracked = 9;
    const rawLeave = leaveHoursFromFraction(1);
    const applied = leaveTopUpHours(tracked, rawLeave);
    const row = computePacingRowMetrics({
      hoursWorkedLogged: tracked,
      leaveHoursCredit: applied,
      targetHours: WEEKLY_HOURS_TARGET,
      dailyHoursSample: [tracked],
      remainingWorkDays: 4,
      mode: 'weekly',
    });
    expect(rawLeave).toBe(8);
    expect(applied).toBe(8);
    expect(row.hoursWorked).toBe(17);
    expect(row.leaveHoursCredit).toBe(8);
  });

  it('weekly leave credit does not change the sample-based projection formula', () => {
    const noLeave = computePacingRowMetrics({
      hoursWorkedLogged: 28,
      leaveHoursCredit: 0,
      targetHours: WEEKLY_HOURS_TARGET,
      dailyHoursSample: [7, 7, 7, 7],
      remainingWorkDays: 1,
      mode: 'weekly',
    });
    const withLeave = computePacingRowMetrics({
      hoursWorkedLogged: 20,
      leaveHoursCredit: 8,
      targetHours: WEEKLY_HOURS_TARGET,
      dailyHoursSample: [7, 7, 7, 7],
      remainingWorkDays: 1,
      mode: 'weekly',
    });
    expect(noLeave.hoursWorked).toBe(28);
    expect(withLeave.hoursWorked).toBe(28);
    expect(noLeave.projectedPace).toBe(withLeave.projectedPace);
    expect(withLeave.status).toBe('on_track');
  });
});
