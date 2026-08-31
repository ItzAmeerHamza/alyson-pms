import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PulseController } from './pulse.controller';

const admin = { id: '1', role: 'admin', organization_id: '10' };
const employee = { id: '4', role: 'employee', organization_id: '10' };

function makeController(opts?: { delegated?: boolean }) {
  const pulse = {
    getDailyHours: vi.fn(async (_user, start, end, userId?: string) => ({
      start,
      end,
      userId: userId ?? null,
    })),
    hasDelegatedAccess: vi.fn(async () => opts?.delegated === true),
  };
  const pacing = {};
  return {
    controller: new PulseController(pulse as never, pacing as never),
    pulse,
  };
}

describe('PulseController daily-hours', () => {
  it('scopes admins to userId when one is provided', async () => {
    const { controller, pulse } = makeController();
    await controller.dailyHours({ user: admin }, '2026-08-01', '2026-08-31', '42');
    expect(pulse.getDailyHours).toHaveBeenCalledWith(admin, '2026-08-01', '2026-08-31', '42');
  });

  it('keeps org-wide fetch for admins when userId is omitted', async () => {
    const { controller, pulse } = makeController();
    await controller.dailyHours({ user: admin }, '2026-08-01', '2026-08-31');
    expect(pulse.getDailyHours).toHaveBeenCalledWith(admin, '2026-08-01', '2026-08-31');
  });

  it('lets employees request only their own userId', async () => {
    const { controller, pulse } = makeController();
    await controller.dailyHours({ user: employee }, '2026-08-01', '2026-08-31', '4');
    expect(pulse.getDailyHours).toHaveBeenCalledWith(employee, '2026-08-01', '2026-08-31', '4');
  });

  it('blocks employees from requesting another user', async () => {
    const { controller, pulse } = makeController();
    await expect(
      controller.dailyHours({ user: employee }, '2026-08-01', '2026-08-31', '42'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(pulse.getDailyHours).not.toHaveBeenCalled();
  });
});
