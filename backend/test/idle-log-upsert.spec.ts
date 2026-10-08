import { describe, expect, it } from 'vitest';
import { EXTEND_IDLE_LOG_BY_START_SQL, UPSERT_IDLE_LOG_SQL } from '../src/lib/idle-log-insert-sql';

describe('upsert_idle_log', () => {
  it('extends idle_end on the same id instead of inserting a second row', () => {
    expect(UPSERT_IDLE_LOG_SQL).toMatch(/ON CONFLICT \(id\) DO UPDATE SET/);
    expect(UPSERT_IDLE_LOG_SQL).toMatch(/GREATEST\(time_doctor\.idle_logs\.idle_end, EXCLUDED\.idle_end\)/);
  });

  it('extends the existing (user, idle_start) row when an old agent mints a new id', () => {
    expect(EXTEND_IDLE_LOG_BY_START_SQL).toMatch(/GREATEST\(idle_end, \$1::timestamptz\)/);
    expect(EXTEND_IDLE_LOG_BY_START_SQL).toMatch(/user_id = \$4/);
    expect(EXTEND_IDLE_LOG_BY_START_SQL).toMatch(/idle_start = \$5::timestamptz/);
  });
});
