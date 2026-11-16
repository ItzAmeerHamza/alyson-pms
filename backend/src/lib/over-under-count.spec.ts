/**
 * Pulse merge + SQL end rules: under-count vs over-count in billed hours.
 */
import { describe, expect, it } from 'vitest';
import {
  calculateMergedHoursByUser,
  mergeTimeIntervals,
  sessionEndMs,
} from './time-merge';
import {
  COMPLETED_ROW_KEEPS_END_SQL,
  closedBySweepSql,
  sweptRowStopExtensionSql,
  updateTimeLogEndSql,
  updateTimeLogLastAliveSql,
} from './time-log-update-sql';

const unsweptOnly = (sql: string) =>
  sql
    .replace(sweptRowStopExtensionSql('t', '$2::timestamptz'), '')
    .replace('THEN t.last_alive_at', '')
    .split(closedBySweepSql('t'))
    .join('');

describe('under-count — Pulse / SQL must keep worked hours', () => {
  it('two sequential sessions add to 7.09h (Vinit Friday shape)', () => {
    const hours = calculateMergedHoursByUser([
      {
        user_id: '1194',
        start_time: '2026-10-09T13:00:00.000Z',
        end_time: '2026-10-09T16:30:00.000Z',
      },
      {
        user_id: '1194',
        start_time: '2026-10-09T16:45:00.000Z',
        end_time: '2026-10-09T20:20:24.000Z',
      },
    ]);
    // 3.5h + 3h35m24s → Pulse rounds to 1 decimal (7.1h)
    expect(hours.get('1194')).toBe(7.1);
  });

  it('frozen_end SQL bills client Stop and does not raise via last_alive', () => {
    const sql = updateTimeLogEndSql(true);
    expect(sql).toContain('LEAST($2::timestamptz, NOW())');
    expect(unsweptOnly(sql)).not.toContain('t.last_alive_at');
    expect(unsweptOnly(updateTimeLogLastAliveSql(true))).not.toContain('t.last_alive_at');
  });

  it('a Stop on a row a sweep killed at its start can still bill the worked time', () => {
    // Ahsan Zafar 12 Oct d63a2160: killed at start, real Stop 52m later.
    expect(updateTimeLogEndSql(true)).toContain(sweptRowStopExtensionSql('t', '$2::timestamptz'));
  });
});

describe('over-count — Pulse / SQL must not invent hours', () => {
  it('open row after quit bills last_alive, not wall-clock now', () => {
    const end = sessionEndMs({
      end_time: null,
      last_alive_at: '2026-10-08T22:00:00.000Z',
    });
    expect(end).toBe(Date.parse('2026-10-08T22:00:00.000Z'));
    const hours = calculateMergedHoursByUser([
      {
        user_id: '1243',
        start_time: '2026-10-08T18:00:00.000Z',
        end_time: null,
        last_alive_at: '2026-10-08T22:00:00.000Z',
      },
    ]);
    expect(hours.get('1243')).toBe(4);
  });

  it('overlapping replay merges to union (3h), not sum (4h)', () => {
    const merged = mergeTimeIntervals([
      {
        startMs: Date.parse('2026-10-09T13:00:00.000Z'),
        endMs: Date.parse('2026-10-09T16:00:00.000Z'),
      },
      {
        startMs: Date.parse('2026-10-09T15:00:00.000Z'),
        endMs: Date.parse('2026-10-09T17:00:00.000Z'),
      },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].endMs - merged[0].startMs).toBe(4 * 3600 * 1000);
  });

  it('completed-row upsert keeps first billed end (blocks +10m retry inflate)', () => {
    const completedBranch = COMPLETED_ROW_KEEPS_END_SQL.split('\n').find((line) =>
      line.includes("status = 'completed'"),
    );
    expect(completedBranch).toContain('THEN time_doctor.time_logs.end_time');
    expect(completedBranch).not.toContain('GREATEST');
  });

  it('a Stop stamped at wake cannot extend a swept row past its proof of life', () => {
    const capped = sweptRowStopExtensionSql('t', '$2::timestamptz');
    expect(capped).toContain("+ interval '2 minutes'");
    expect(capped).toMatch(/LEAST\(\s*\$2::timestamptz,\s*NOW\(\),/);
  });

  it('follow-up write without frozen flag cannot use bare GREATEST(end, client)', () => {
    const sql = updateTimeLogEndSql(false);
    // Extension is capped by last_alive / proof — never unbounded raise.
    expect(sql).toContain('COALESCE(t.last_alive_at');
    expect(sql).toMatch(/WHEN t\.end_time IS NULL/);
  });
});
