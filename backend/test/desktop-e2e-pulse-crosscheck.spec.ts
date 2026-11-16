/**
 * Runs the rows the desktop end-to-end test wrote through the real Pulse code
 * and checks the desktop card shows the same non-effective figure. Skipped
 * unless NON_EFFECTIVE_E2E_DUMP points at that test's output:
 *
 *   (cd desktop-agent && NON_EFFECTIVE_E2E_DUMP=/tmp/days.json npx jest src/lib/__tests__/non-effective-e2e.test.js)
 *   (cd backend && NON_EFFECTIVE_E2E_DUMP=/tmp/days.json npx vitest run test/desktop-e2e-pulse-crosscheck.spec.ts)
 */
import fs from 'fs';
import { describe, expect, it } from 'vitest';
import { EffectiveTimeService } from '../src/pulse/effective-time.service';
import { hasVideoMeetingEvidence } from '../src/pulse/meeting-context';
import { workDateKey } from '../src/lib/work-timezone';

type Day = {
  name: string;
  userId: string;
  tz: string;
  startIso: string;
  endIso: string;
  intervalMinutes: number;
  totalSeconds: number;
  time_logs: Array<{ id: string; user_id: string; start_time: string; end_time: string | null; idle_seconds: number }>;
  idle_logs: Array<{ user_id: string; idle_start: string; idle_end: string | null; duration_seconds: number }>;
  screenshots: Array<{
    user_id: string;
    time_log_id: string;
    captured_at: string;
    activity_percent: number | null;
    app_name: string;
    window_title: string;
  }>;
  desktop: { idleSeconds: number; lowActivitySeconds: number; nonEffectiveSeconds: number; card: number };
};

const dumpPath = process.env.NON_EFFECTIVE_E2E_DUMP || '';
const days: Day[] = dumpPath && fs.existsSync(dumpPath) ? JSON.parse(fs.readFileSync(dumpPath, 'utf8')) : [];

function fakeDb(day: Day, sessionRule: boolean) {
  const endById = new Map(day.time_logs.map((t) => [t.id, t.end_time ? Date.parse(t.end_time) : null]));
  const inRange = (iso: string) => iso >= day.startIso && iso < day.endIso;
  return {
    query: async (sql: string, params: unknown[]) => {
      if (sql.includes('activity_date')) {
        const threshold = Number(params[1]);
        return {
          rows: day.screenshots.filter((s) => inRange(s.captured_at)).map((s) => {
            const meeting = hasVideoMeetingEvidence(s.app_name, s.window_title, '');
            const end = endById.get(s.time_log_id);
            return {
              user_id: s.user_id,
              activity_date: workDateKey(s.captured_at, day.tz),
              captured_at: s.captured_at,
              activity_percent: s.activity_percent,
              app_name: s.app_name,
              window_title: s.window_title,
              vision_summary: null,
              ocr_excerpt: '',
              is_meeting: meeting,
              is_low: s.activity_percent != null && s.activity_percent < threshold && !meeting,
              outside_session: sessionRule && end != null && Date.parse(s.captured_at) > end,
            };
          }),
        };
      }
      if (sql.includes('FROM time_doctor.idle_logs')) {
        return { rows: day.idle_logs.map((r) => ({ ...r, user_id: String(r.user_id) })) };
      }
      if (sql.includes('FROM time_doctor.time_logs')) {
        return {
          rows: day.time_logs.map((t) => ({ user_id: t.user_id, start_time: t.start_time, idle_seconds: t.idle_seconds })),
        };
      }
      if (sql.includes('FROM time_doctor.screenshots')) {
        return {
          rows: day.screenshots
            .filter(
              (s) =>
                inRange(s.captured_at) &&
                hasVideoMeetingEvidence(s.app_name, s.window_title, '') &&
                (s.activity_percent ?? 50) >= 50,
            )
            .map((s) => ({ user_id: s.user_id, captured_at: s.captured_at })),
        };
      }
      throw new Error(`unexpected query: ${sql.slice(0, 80)}`);
    },
  };
}

async function pulseFor(day: Day, sessionRule: boolean) {
  const svc = new EffectiveTimeService(fakeDb(day, sessionRule) as never);
  const r = await svc.idleAndLowActivitySecondsForUser({
    userId: day.userId,
    workspaceId: 511,
    startIso: day.startIso,
    endIso: day.endIso,
    lowActivityThreshold: 10,
    intervalMinutes: day.intervalMinutes,
    tz: day.tz,
  });
  return {
    idle: r.idleSeconds,
    low: r.lowActivitySeconds,
    nonEff: Math.min(day.totalSeconds, r.idleSeconds + r.lowActivitySeconds),
  };
}

describe.skipIf(days.length === 0)('desktop E2E rows through the real Pulse code', () => {
  it('desktop card equals Pulse for every scenario', async () => {
    const table: string[] = [];
    for (const day of days) {
      const now = await pulseFor(day, true);
      const before = await pulseFor(day, false);
      table.push(
        [
          day.name.padEnd(50),
          `desktop ${String(day.desktop.card).padStart(4)}`,
          `pulse ${String(now.nonEff).padStart(4)} (idle ${now.idle}, low ${now.low})`,
          `pulse-without-session-rule ${before.nonEff}`,
        ].join('  '),
      );
      expect({ name: day.name, card: day.desktop.card }).toEqual({ name: day.name, card: now.nonEff });
      expect(day.desktop.idleSeconds).toBe(now.idle);
      expect(day.desktop.lowActivitySeconds).toBe(now.low);
    }
    fs.writeFileSync(dumpPath.replace(/\.json$/, '') + '-pulse.txt', `${table.join('\n')}\n`);
  });
});
