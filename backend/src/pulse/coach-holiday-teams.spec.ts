import { describe, expect, it } from 'vitest';
import { PulseService } from './pulse.service';
import { weekMonthPaceFromDays } from './assistant-briefing';

/**
 * The Coach asks for one employee's public holidays. Each person must get only
 * the holidays for their own country (or office city, or location + team).
 */
const employees: Record<string, { id: string; country: string | null; location: string | null; department: string | null }> = {
  '101': { id: '101', country: 'India', location: 'India', department: 'Affiliates' },
  '102': { id: '102', country: 'India', location: 'India', department: 'Data Engineering' },
  '201': { id: '201', country: 'Pakistan', location: 'Lahore', department: 'Full Stack Engineer' },
  '202': { id: '202', country: 'Pakistan', location: 'Lahore', department: 'Data Engineering' },
  '301': { id: '301', country: null, location: 'Pune', department: 'People Ops' }, // office only
  '302': { id: '302', country: null, location: null, department: null }, // nothing set
};
const holidays = [
  // Country-wide (how scanned people-ops emails are saved)
  { country: 'India', location: 'India', team: '__all_teams__', start_date: '2026-10-20', end_date: '2026-10-20' },
  { country: 'Pakistan', location: 'Pakistan', team: '__all_teams__', start_date: '2026-11-09', end_date: '2026-11-09' },
  // Location + one team only
  { country: null, location: 'Lahore', team: 'Data Engineering', start_date: '2026-10-22', end_date: '2026-10-22' },
  // Weekend: never a required day
  { country: 'India', location: 'India', team: '__all_teams__', start_date: '2026-10-24', end_date: '2026-10-24' },
];

function service() {
  const db = {
    query: async (sql: string, params: unknown[]) => {
      if (sql.includes('team_leave_events')) {
        const [, start, end] = params as [number, string, string];
        return { rows: holidays.filter((h) => h.end_date >= start && h.start_date <= end) };
      }
      if (sql.includes('user_extensions')) {
        const ids = (params[1] as number[]).map(String);
        return { rows: ids.map((id) => employees[id]).filter(Boolean) };
      }
      throw new Error(`unexpected query: ${sql.slice(0, 60)}`);
    },
  };
  return new PulseService(db as never, {} as never, {} as never, {} as never);
}
const user = { id: '1', organization_id: '511' } as never;

describe('Coach public holidays across countries and teams', () => {
  const holidaysFor = (id: string) =>
    service().publicHolidayDaysForUser(user, id, '2026-10-01', '2026-11-30');

  it('India staff get the India holiday, in every team', async () => {
    expect(await holidaysFor('101')).toEqual(['2026-10-20']);
    expect(await holidaysFor('102')).toEqual(['2026-10-20']);
  });

  it('Pakistan staff get their own holiday, plus a team-only one when it is their team', async () => {
    expect(await holidaysFor('201')).toEqual(['2026-11-09']); // not the Data Engineering day
    expect(await holidaysFor('202')).toEqual(['2026-10-22', '2026-11-09']);
  });

  it('an office city maps to its country when no country is set', async () => {
    expect(await holidaysFor('301')).toEqual(['2026-10-20']); // Pune → India
  });

  it('nobody gets a holiday that is not theirs, and weekends never count', async () => {
    expect(await holidaysFor('302')).toEqual([]);
    for (const id of Object.keys(employees)) {
      expect(await holidaysFor(id)).not.toContain('2026-10-24');
    }
  });

  it('each person gets their own Coach week target', async () => {
    const weekTarget = async (id: string) =>
      weekMonthPaceFromDays([], '2026-10-23', 'America/Chicago', '2026-10-23', await holidaysFor(id))
        .weekPace?.weeklyTargetHours;
    expect(await weekTarget('101')).toBe(28); // India holiday Tue
    expect(await weekTarget('201')).toBe(35); // no holiday that week
    expect(await weekTarget('202')).toBe(28); // Lahore Data Engineering day Thu
  });
});
