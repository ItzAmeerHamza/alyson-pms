import { describe, expect, it } from 'vitest';
import {
  PACING_LEAVE_HOURS_PER_DAY,
  PACING_TARGET_HOURS_PER_WORKDAY,
  WEEKLY_HOURS_TARGET,
  computePacingRowMetrics,
  leaveHoursFromFraction,
  projectMonthlyPace,
  projectWeeklyPace,
  resolvePacingStatus,
  weekdayKeysInclusive,
} from './pacing-math';

describe('pacing-math acceptance', () => {
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
});
