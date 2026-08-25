import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PacingService } from './pacing.service';

const admin = { id: '1', role: 'admin', organization_id: '10' };
const manager = { id: '2', role: 'manager', organization_id: '10' };
const employee = { id: '4', role: 'employee', organization_id: '10' };

const weeklyReport = {
  mode: 'weekly' as const,
  week_start: '2026-08-10',
  week_friday: '2026-08-14',
  rollup_day: '2026-08-13',
  timezone: 'America/Chicago',
  leave_hours_per_day: 8,
  rows: [
    {
      id: '101',
      name: 'Ada',
      email: 'ada@cintara.ai',
      status: 'on_track',
      hoursWorkedLogged: 20,
      leaveHoursCredit: 8,
      hoursWorked: 28,
      targetHours: 35,
      avgDailyPace: 7,
      projectedPace: 35,
      paceDelta: 0,
      remainingWorkDays: 1,
    },
    {
      id: '102',
      name: 'Ben',
      email: 'ben@cintara.ai',
      status: 'critical',
      hoursWorkedLogged: 10,
      leaveHoursCredit: 0,
      hoursWorked: 10,
      targetHours: 35,
      avgDailyPace: 2.5,
      projectedPace: 12.5,
      paceDelta: -22.5,
      remainingWorkDays: 1,
    },
  ],
};

function makeService(opts?: { sesEnabled?: boolean; sendOk?: boolean; digestTo?: string }) {
  const sesEmail = {
    isEnabled: () => opts?.sesEnabled !== false,
    resolveFrom: (from?: string) => from || 'hamza@cintara.ai',
    send: vi.fn().mockResolvedValue({
      ok: opts?.sendOk !== false,
      messageId: 'mid-1',
      code: opts?.sendOk === false ? 'ses_fail' : undefined,
    }),
  };
  const config = {
    get: (key: string) =>
      key === 'PACING_DIGEST_TO' ? opts?.digestTo ?? 'hr@cintara.ai' : undefined,
  };
  const service = new PacingService({} as never, sesEmail as never, config as never);
  vi.spyOn(service, 'getWeeklyReport').mockResolvedValue(weeklyReport as never);
  vi.spyOn(service, 'getMonthlyReport').mockResolvedValue({
    ...weeklyReport,
    mode: 'monthly',
    month: '2026-08',
    period_start: '2026-08-01',
    period_end: '2026-08-31',
  } as never);
  return { service, sesEmail };
}

describe('PacingService.sendPacingDigest', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects managers and employees (admin-only HR send)', async () => {
    const { service, sesEmail } = makeService();
    await expect(
      service.sendPacingDigest(manager, { employee_ids: ['101'] }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.sendPacingDigest(employee, { employee_ids: ['101'] }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(sesEmail.send).not.toHaveBeenCalled();
  });

  it('requires at least one selected employee', async () => {
    const { service } = makeService();
    await expect(service.sendPacingDigest(admin, { employee_ids: [] })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects ids that are not in the current pacing period', async () => {
    const { service } = makeService();
    await expect(
      service.sendPacingDigest(admin, { employee_ids: ['999'] }),
    ).rejects.toThrow(/No matching employees/);
  });

  it('fails closed when SES is not configured', async () => {
    const { service, sesEmail } = makeService({ sesEnabled: false });
    await expect(
      service.sendPacingDigest(admin, { employee_ids: ['101'] }),
    ).rejects.toThrow(/Email sending is not configured/);
    expect(sesEmail.send).not.toHaveBeenCalled();
  });

  it('sends one digest for the selected rows with a CSV attachment', async () => {
    const { service, sesEmail } = makeService();
    const result = await service.sendPacingDigest(admin, {
      mode: 'weekly',
      employee_ids: ['102'],
      to: 'ops@cintara.ai',
    });

    expect(result.ok).toBe(true);
    expect(result.employee_count).toBe(1);
    expect(result.to).toEqual(['ops@cintara.ai']);
    expect(result.summary).toEqual({
      critical: 1,
      at_risk: 0,
      behind: 0,
      on_track: 0,
      target_met: 0,
    });
    expect(result.csv_filename).toBe('weekly-pacing-2026-08-10.csv');

    expect(sesEmail.send).toHaveBeenCalledTimes(1);
    const payload = sesEmail.send.mock.calls[0][0];
    expect(payload.to).toEqual(['ops@cintara.ai']);
    expect(payload.subject).toContain('Weekly pacing');
    expect(payload.subject).toContain('1 employees');
    expect(payload.html).toContain('Ben');
    expect(payload.html).not.toContain('Ada');
    expect(payload.attachments).toHaveLength(1);
    expect(payload.attachments[0].filename).toBe('weekly-pacing-2026-08-10.csv');
    expect(payload.attachments[0].content).toContain('Ben');
    expect(payload.attachments[0].content).toContain('10.00');
  });

  it('surfaces SES failure as a generic send error', async () => {
    const { service } = makeService({ sendOk: false });
    await expect(
      service.sendPacingDigest(admin, { employee_ids: ['101'] }),
    ).rejects.toThrow(/Failed to send pacing email/);
  });
});
