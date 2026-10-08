import { describe, expect, it } from 'vitest';
import {
  includePausedInReport,
  inclusiveWorkDateKeyFromRangeEnd,
  mondayKey,
  mondaysOverlappingMonth,
  resolveMonthWeekCheckpoint,
  sqlPausedVisibleThrough,
  sundayKey,
} from './paused-roster';

describe('paused roster week grace', () => {
  it('treats weeks as Monday–Sunday', () => {
    expect(mondayKey('2026-09-02')).toBe('2026-08-31');
    expect(sundayKey('2026-09-02')).toBe('2026-09-06');
  });

  it('includes the in-progress week when month 1st is not a Monday', () => {
    expect(mondaysOverlappingMonth('2026-09')).toEqual([
      '2026-08-31',
      '2026-09-07',
      '2026-09-14',
      '2026-09-21',
      '2026-09-28',
    ]);
  });

  it('does not treat the September spillover week as August week 5', () => {
    expect(mondaysOverlappingMonth('2026-08')).not.toContain('2026-08-31');
    expect(mondaysOverlappingMonth('2026-08')[mondaysOverlappingMonth('2026-08').length - 1]).toBe(
      '2026-08-24',
    );
  });

  it('starts on the 1st when that day is a Monday', () => {
    expect(mondaysOverlappingMonth('2026-06')[0]).toBe('2026-06-01');
  });

  it('keeps a week-1 removal on week 1 when viewed later, not on later weeks', () => {
    const pausedAt = '2026-09-02T18:00:00.000Z';
    const tz = 'America/Los_Angeles';
    expect(includePausedInReport(pausedAt, '2026-09-06', tz)).toBe(true);
    expect(includePausedInReport(pausedAt, '2026-08-30', tz)).toBe(true);
    expect(includePausedInReport(pausedAt, '2026-09-07', tz)).toBe(false);
    expect(includePausedInReport(pausedAt, '2026-09-20', tz)).toBe(false);
  });

  it('always includes active employees', () => {
    expect(includePausedInReport(null, '2026-09-20')).toBe(true);
  });

  it('maps exclusive midnight bounds back to the last included day', () => {
    expect(
      inclusiveWorkDateKeyFromRangeEnd('2026-09-07T07:00:00.000Z', 'America/Los_Angeles'),
    ).toBe('2026-09-06');
    expect(
      inclusiveWorkDateKeyFromRangeEnd('2026-09-06T20:00:00.000Z', 'America/Los_Angeles'),
    ).toBe('2026-09-06');
  });

  it('keeps an explicit spillover Monday even when the month list starts later', () => {
    const oldMondays = ['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28'];
    expect(
      resolveMonthWeekCheckpoint({
        mondays: oldMondays,
        weekIndex: 1,
        weekStart: '2026-08-31',
        todayKey: '2026-09-03',
      }),
    ).toEqual({
      weekIndex: 1,
      checkpointMonday: '2026-08-31',
      periodStart: '2026-08-31',
    });
  });

  it('uses September week 1 from the overlapping-Monday list', () => {
    expect(
      resolveMonthWeekCheckpoint({
        mondays: mondaysOverlappingMonth('2026-09'),
        weekIndex: 1,
        todayKey: '2026-09-03',
      }),
    ).toEqual({
      weekIndex: 1,
      checkpointMonday: '2026-08-31',
      periodStart: '2026-08-31',
    });
  });

  it('binds report end + timezone for the SQL filter', () => {
    const params: unknown[] = ['ws'];
    const sql = sqlPausedVisibleThrough(params, '2026-09-06', 'America/Chicago');
    expect(sql).toContain('$2::date');
    expect(sql).toContain('timezone($3, ext.paused_at)');
    expect(params).toEqual(['ws', '2026-09-06', 'America/Chicago']);
  });
});
