import { describe, expect, it } from 'vitest';
import { buildPacingDigestCsv, buildPacingDigestEmail } from './pacing-email-templates';

const row = {
  name: 'Ada <script>',
  email: 'ada@cintara.ai',
  hoursWorkedLogged: 20,
  leaveHoursCredit: 8,
  hoursWorked: 28,
  targetHours: 35,
  avgDailyPace: 7,
  projectedPace: 35,
  paceDelta: 0,
  remainingWorkDays: 1,
  status: 'on_track',
};

describe('pacing digest email / CSV', () => {
  it('builds a weekly subject and includes leave credit + selected count', () => {
    const mail = buildPacingDigestEmail({
      mode: 'weekly',
      periodLabel: '2026-08-10 → 2026-08-14',
      rollupDay: '2026-08-13',
      timezone: 'America/Chicago',
      leaveHoursPerDay: 8,
      rows: [row],
      summary: { on_track: 1, critical: 0, at_risk: 0, behind: 0, target_met: 0 },
    });

    expect(mail.subject).toBe(
      'Tavilo Time · Weekly pacing · 2026-08-10 → 2026-08-14 (1 employees)',
    );
    expect(mail.html).toContain('Leave credit 8 hours/weekday is personal leave only');
    expect(mail.html).toContain('a public holiday lowers that country');
    expect(mail.text).toContain('A public holiday lowers the target');
    expect(mail.html).toContain('America/Chicago');
    expect(mail.html).toContain('1 employee selected');
    expect(mail.text).toContain('Ada <script>: worked 28 hours / target 35 hours');
  });

  it('escapes employee names in HTML so a script tag cannot run', () => {
    const mail = buildPacingDigestEmail({
      mode: 'weekly',
      periodLabel: 'week',
      rollupDay: '2026-08-13',
      timezone: 'America/Chicago',
      leaveHoursPerDay: 8,
      rows: [row],
    });
    expect(mail.html).toContain('Ada &lt;script&gt;');
    expect(mail.html).not.toContain('<script>');
  });

  it('CSV lists leave credit and worked hours, with a UTF-8 BOM', () => {
    const csv = buildPacingDigestCsv('weekly', [row]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('Leave credit');
    expect(csv).toContain('Ada <script>');
    expect(csv).toContain('20 hours');
    expect(csv).toContain('8 hours');
    expect(csv).toContain('28 hours');
    expect(csv).toContain('On Track');
    expect(csv).not.toContain('Progress %');
  });

  it('monthly CSV adds a progress column', () => {
    const csv = buildPacingDigestCsv('monthly', [
      { ...row, monthProgressPct: 50.5, status: 'behind' },
    ]);
    expect(csv).toContain('Progress %');
    expect(csv).toContain('50.50');
    expect(csv).toContain('Behind');
  });

  it('formats fractional hours as hour + min, not decimals', () => {
    const mail = buildPacingDigestEmail({
      mode: 'weekly',
      periodLabel: 'week',
      rollupDay: '2026-08-13',
      timezone: 'America/Chicago',
      leaveHoursPerDay: 8,
      rows: [{ ...row, hoursWorked: 1 + 40 / 60, targetHours: 7, paceDelta: -0.5 }],
    });
    expect(mail.html).toContain('1 hour 40 min');
    expect(mail.html).toContain('30 min');
    expect(mail.html).not.toContain('1.67');
    expect(mail.text).not.toContain('1.67');
  });

  it('shows hours worked on a public holiday next to the person, without adding them twice', () => {
    const worked = {
      ...row,
      name: 'Vinit',
      hoursWorkedLogged: 44,
      leaveHoursCredit: 0,
      hoursWorked: 44,
      targetHours: 28,
      holidayDates: ['2026-10-20'],
      holidayHoursWorked: 7.5,
    };
    const off = { ...worked, name: 'Garima', hoursWorked: 31.3, hoursWorkedLogged: 31.3, holidayHoursWorked: 0 };
    const mail = buildPacingDigestEmail({
      mode: 'weekly',
      periodLabel: '2026-10-19 → 2026-10-23',
      rollupDay: '2026-10-23',
      timezone: 'America/Chicago',
      leaveHoursPerDay: 8,
      rows: [worked, off],
      summary: { on_track: 0, critical: 0, at_risk: 0, behind: 0, target_met: 2 },
    });
    expect(mail.html).toContain('Worked 7 hours 30 min on public holidays (already included in Worked).');
    expect(mail.text).toContain('Vinit: worked 44 hours / target 28 hours');
    expect(mail.text).toContain('Worked 7 hours 30 min on public holidays');
    expect(mail.text).not.toMatch(/Garima[^\n]*Worked .* on public holidays/);

    const csv = buildPacingDigestCsv('weekly', [worked, off, row]).split('\r\n');
    const header = csv[0].replace('\uFEFF', '').split(',');
    const col = header.indexOf('Holiday hours worked');
    expect(col).toBeGreaterThan(-1);
    expect(csv[1]).toContain('7 hours 30 min');
    expect(csv[1]).toContain('44 hours'); // Worked total unchanged, not 51.5
    expect(csv[3].split(',')[col]).toBe(''); // no holiday for this person
  });
});
