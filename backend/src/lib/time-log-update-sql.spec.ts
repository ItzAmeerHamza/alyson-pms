import { describe, expect, it } from 'vitest';
import {
  AUTHORIZED_CUT_END_SQL,
  COMPLETED_ROW_KEEPS_END_SQL,
  LAST_PROOF_OF_LIFE_SQL,
  closedBySweepSql,
  lastProofOfLifeSql,
  provenExtensionSql,
  stopRetryKeepsEndSql,
  sweptRowStopEndSql,
  sweptRowStopExtensionSql,
  updateTimeLogEndSql,
  updateTimeLogLastAliveSql,
} from './time-log-update-sql';

/** The frozen/idle-cut SQL with the swept-row branch removed — what every other row gets. */
function withoutSweptBranch(sql: string): string {
  return sql
    .replace(sweptRowStopExtensionSql('t', '$2::timestamptz'), '')
    .split(closedBySweepSql('t'))
    .join('');
}

describe('updateTimeLogEndSql', () => {
  it('frozen Stop uses the same client-end SQL as an authorized idle cut', () => {
    expect(updateTimeLogEndSql(true)).toBe(updateTimeLogEndSql(true));
    expect(updateTimeLogEndSql(true)).toContain(AUTHORIZED_CUT_END_SQL);
    expect(updateTimeLogLastAliveSql(true)).toContain(AUTHORIZED_CUT_END_SQL);
  });

  it('authorized idle cut bills client now−10m and does not raise to last_alive', () => {
    const sql = withoutSweptBranch(updateTimeLogEndSql(true));
    expect(sql).toContain(AUTHORIZED_CUT_END_SQL);
    expect(sql).not.toContain('t.last_alive_at');
    expect(sql).not.toContain(LAST_PROOF_OF_LIFE_SQL);
  });

  it('a Stop later than a sweep-written end is capped, never billed as sent', () => {
    const sql = updateTimeLogEndSql(true);
    const capped = sweptRowStopExtensionSql('t', '$2::timestamptz');
    expect(sql).toContain(capped);
    expect(capped).toContain(`${LAST_PROOF_OF_LIFE_SQL} + interval '2 minutes'`);
    expect(capped).toMatch(/^GREATEST\(t\.end_time, LEAST\(/);
    expect(sql.indexOf(capped)).toBeLessThan(sql.indexOf(`ELSE ${AUTHORIZED_CUT_END_SQL}`));
  });

  it('only reads $2 so the bind count stays at five (08P01)', () => {
    const used = new Set([...updateTimeLogEndSql(true).matchAll(/\$(\d+)/g)].map((m) => m[1]));
    expect([...used]).toEqual(['2']);
    const aliveUsed = new Set([...updateTimeLogLastAliveSql(true).matchAll(/\$(\d+)/g)].map((m) => m[1]));
    expect([...aliveUsed]).toEqual(['2']);
  });

  it('a later write without the flag cannot extend past frozen last_alive', () => {
    const sql = updateTimeLogEndSql(false);
    const extension = provenExtensionSql();
    expect(sql).toContain(extension);
    expect(extension).toContain('COALESCE(t.last_alive_at,');
    expect(extension).toContain(LAST_PROOF_OF_LIFE_SQL);
    expect(extension.split(LAST_PROOF_OF_LIFE_SQL).length - 1).toBe(1);
    expect(sql).not.toContain(closedBySweepSql('t'));
  });
});

describe('updateTimeLogLastAliveSql', () => {
  it('authorized idle cut freezes last_alive at the billed end, not GREATEST(now)', () => {
    const sql = updateTimeLogLastAliveSql(true);
    expect(sql).toContain(`ELSE ${AUTHORIZED_CUT_END_SQL}`);
    expect(withoutSweptBranch(sql).replace('THEN t.last_alive_at', '')).not.toContain(
      't.last_alive_at',
    );
  });

  it('a capped swept-row extension leaves last_alive alone so retries cannot creep', () => {
    expect(updateTimeLogLastAliveSql(true)).toMatch(
      /AND EXISTS \(SELECT 1 FROM time_doctor\.time_log_events e[\s\S]*THEN t\.last_alive_at/,
    );
  });

  it('normal complete still freezes last_alive once end_time is already set', () => {
    const sql = updateTimeLogLastAliveSql(false);
    expect(sql).toContain('WHEN t.end_time IS NOT NULL THEN t.last_alive_at');
  });
});

describe('closedBySweepSql', () => {
  it('matches automated closes and not admin closes', () => {
    const sql = closedBySweepSql('t');
    for (const action of [
      'closed_at_own_liveness',
      'confirmed_close',
      'local_checkpoint_confirmed_close',
      'stale_session_auto_closed',
    ]) {
      expect(sql).toContain(`'${action}'`);
    }
    expect(sql).toContain(`e.source IN ('closed_at_last_alive')`);
    expect(sql).not.toContain('admin_confirmed_close');
    expect(sql).toContain('e.time_log_id = t.id');
  });
});

describe('lastProofOfLifeSql', () => {
  it('is LAST_PROOF_OF_LIFE_SQL for alias t and rebinds every column for other targets', () => {
    expect(lastProofOfLifeSql('t')).toBe(LAST_PROOF_OF_LIFE_SQL);
    const other = lastProofOfLifeSql('time_doctor.time_logs');
    expect(other).not.toMatch(/\bt\./);
    expect(other).toContain('h.time_log_id = time_doctor.time_logs.id');
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

describe('stopRetryKeepsEndSql', () => {
  it('lets a frozen Stop replace only a sweep-written end; everything else keeps the old rule', () => {
    const sql = stopRetryKeepsEndSql('$9');
    expect(sql).toContain('WHEN $9::boolean IS TRUE');
    expect(sql).toContain(closedBySweepSql('time_doctor.time_logs'));
    expect(sql).toContain(sweptRowStopEndSql('time_doctor.time_logs', 'EXCLUDED.end_time'));
    expect(sql).toContain(`ELSE ${COMPLETED_ROW_KEEPS_END_SQL}`);
  });

  it('shortens outright but caps any extension at proof of life and the next session', () => {
    const sql = sweptRowStopEndSql('time_doctor.time_logs', 'EXCLUDED.end_time');
    expect(sql).toContain(
      'WHEN EXCLUDED.end_time <= time_doctor.time_logs.end_time THEN GREATEST(time_doctor.time_logs.start_time, EXCLUDED.end_time)',
    );
    expect(sql).toContain(`${lastProofOfLifeSql('time_doctor.time_logs')} + interval '2 minutes'`);
    expect(sql).toContain('n.device_id IS NOT DISTINCT FROM time_doctor.time_logs.device_id');
  });
});
