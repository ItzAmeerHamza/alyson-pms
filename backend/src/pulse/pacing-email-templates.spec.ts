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
      'Alyson Pulse · Weekly pacing · 2026-08-10 → 2026-08-14 (1 employees)',
    );
    expect(mail.html).toContain('Leave credit 8h/weekday');
    expect(mail.html).toContain('America/Chicago');
    expect(mail.html).toContain('1 employee selected');
    expect(mail.text).toContain('Ada <script>: worked 28.00 / target 35.00');
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
    expect(csv).toContain('20.00');
    expect(csv).toContain('8.00');
    expect(csv).toContain('28.00');
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
});
