import { describe, expect, it } from 'vitest';
import { EffectiveTimeService } from './effective-time.service';

/**
 * Garima, 22 Oct 2026 (IST = UTC+5:30). Idle started 17:09 IST, the lid closed
 * at 17:17 (session ended), and the idle period was only closed on wake at
 * 19:17, so the row says 129 minutes. Only the 8 minutes inside the session
 * are non-effective time.
 */
const svc = new EffectiveTimeService({} as never);
const iso = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(2026, 9, 22, h, m) - 330 * 60_000).toISOString(); // IST → UTC
};
const idle = [
  { user_id: '1224', idle_start: iso('17:09'), idle_end: iso('19:18'), duration_seconds: 7760 },
];
const sessions = [{ user_id: '1224', start_time: iso('16:57'), end_time: iso('17:17'), last_alive_at: null }];
const tz = 'Asia/Kolkata';
const total = (m: Map<string, Map<string, number>>) =>
  [...(m.get('1224')?.values() ?? [])].reduce((a, b) => a + b, 0);

describe('idle only counts inside tracked sessions', () => {
  it('drops idle that ran on after tracking stopped (lid closed)', () => {
    const clipped = svc.idleHoursFromIdleLogs(idle, tz, undefined, svc.sessionIntervalsFromTimeLogs(sessions));
    expect(total(clipped) * 60).toBeCloseTo(8, 5); // 17:09 → 17:17
  });

  it('without session info the old behaviour is unchanged', () => {
    const raw = svc.idleHoursFromIdleLogs(idle, tz);
    expect(total(raw) * 60).toBeGreaterThan(120);
  });

  it('idle entirely outside any session counts as nothing (day key kept)', () => {
    const away = [{ user_id: '1224', idle_start: iso('19:30'), idle_end: iso('20:00'), duration_seconds: 1800 }];
    const out = svc.idleHoursFromIdleLogs(away, tz, undefined, svc.sessionIntervalsFromTimeLogs(sessions));
    expect(total(out)).toBe(0);
    expect(out.get('1224')?.has('2026-10-22')).toBe(true);
  });

  it('an open session runs to its last proof of life', () => {
    const open = [{ user_id: '1224', start_time: iso('20:06'), end_time: null, last_alive_at: iso('20:40') }];
    const idle2 = [{ user_id: '1224', idle_start: iso('20:35'), idle_end: iso('21:22'), duration_seconds: 2820 }];
    const out = svc.idleHoursFromIdleLogs(idle2, tz, undefined, svc.sessionIntervalsFromTimeLogs(open));
    expect(total(out) * 60).toBeCloseTo(5, 5); // 20:35 → 20:40
  });

  it('idle shorter than 5 minutes after clipping is not reported', () => {
    const short = [{ user_id: '1224', start_time: iso('17:00'), end_time: iso('17:12'), last_alive_at: null }];
    const out = svc.idleHoursFromIdleLogs(idle, tz, undefined, svc.sessionIntervalsFromTimeLogs(short));
    expect(total(out)).toBe(0); // 17:09 → 17:12 is 3 minutes
  });
});
