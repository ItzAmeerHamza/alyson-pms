import { describe, expect, it } from 'vitest';
import {
  AUTHORIZED_CUT_END_SQL,
  COMPLETED_ROW_KEEPS_END_SQL,
  LAST_PROOF_OF_LIFE_SQL,
  provenExtensionSql,
  updateTimeLogEndSql,
  updateTimeLogLastAliveSql,
} from './time-log-update-sql';

describe('updateTimeLogEndSql', () => {
  it('authorized idle cut bills client now−10m and does not raise to last_alive', () => {
    const sql = updateTimeLogEndSql(true);
    expect(sql).toContain(AUTHORIZED_CUT_END_SQL);
    expect(sql).not.toContain('t.last_alive_at');
    expect(sql).not.toContain(LAST_PROOF_OF_LIFE_SQL);
  });

  it('a later write without the flag cannot extend past frozen last_alive', () => {
    const sql = updateTimeLogEndSql(false);
    const extension = provenExtensionSql();
    expect(sql).toContain(extension);
    expect(extension).toContain('COALESCE(t.last_alive_at,');
    expect(extension).toContain(LAST_PROOF_OF_LIFE_SQL);
  });
});

describe('updateTimeLogLastAliveSql', () => {
  it('authorized idle cut freezes last_alive at the billed end, not GREATEST(now)', () => {
    const sql = updateTimeLogLastAliveSql(true);
    expect(sql).toBe(AUTHORIZED_CUT_END_SQL);
    expect(sql).not.toContain('t.last_alive_at');
  });

  it('normal complete still freezes last_alive once end_time is already set', () => {
    const sql = updateTimeLogLastAliveSql(false);
    expect(sql).toContain('WHEN t.end_time IS NOT NULL THEN t.last_alive_at');
  });
});

describe('COMPLETED_ROW_KEEPS_END_SQL', () => {
  it('does not GREATEST a completed end with a later insert retry', () => {
    expect(COMPLETED_ROW_KEEPS_END_SQL).toContain(
      `WHEN time_doctor.time_logs.status = 'completed' THEN time_doctor.time_logs.end_time`,
    );
    expect(COMPLETED_ROW_KEEPS_END_SQL).toContain(
      'ELSE GREATEST(time_doctor.time_logs.end_time, EXCLUDED.end_time)',
    );
  });
});
