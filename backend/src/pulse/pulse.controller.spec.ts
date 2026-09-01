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
  const awsCosts = { getAlysonPmCosts: vi.fn() };
  const workspaceAdmin = {
    getAdminView: vi.fn(),
    updateSettings: vi.fn(),
    createWorkspace: vi.fn(),
  };
  return {
    controller: new PulseController(
      pulse as never,
      pacing as never,
      awsCosts as never,
      workspaceAdmin as never,
    ),
    pulse,
    awsCosts,
    workspaceAdmin,
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

describe('PulseController aws-costs', () => {
  it('allows admins to load Alyson PM costs', async () => {
    const { controller, awsCosts } = makeController();
    awsCosts.getAlysonPmCosts.mockResolvedValue({ team: 'Alyson PM', totals: { day: 1, week: 2, mtd: 3 } });
    await controller.awsCostsReport({ user: admin }, '2026-08-01', '2026-08-31');
    expect(awsCosts.getAlysonPmCosts).toHaveBeenCalledWith({
      start: '2026-08-01',
      end: '2026-08-31',
    });
  });

  it('blocks employees from AWS costs', async () => {
    const { controller, awsCosts } = makeController();
    await expect(
      controller.awsCostsReport({ user: employee }, '2026-08-01', '2026-08-31'),
    ).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(awsCosts.getAlysonPmCosts).not.toHaveBeenCalled();
  });
});

describe('PulseController workspace settings', () => {
  it('lets admins read and update settings', async () => {
    const { controller, workspaceAdmin } = makeController();
    workspaceAdmin.getAdminView.mockResolvedValue({ organization_id: '10' });
    workspaceAdmin.updateSettings.mockResolvedValue({ organization_id: '10' });
    await controller.settings({ user: admin });
    await controller.updateSettings({ user: admin }, { timezone: 'America/Chicago' });
    expect(workspaceAdmin.getAdminView).toHaveBeenCalledWith(admin);
    expect(workspaceAdmin.updateSettings).toHaveBeenCalledWith(admin, {
      timezone: 'America/Chicago',
    });
  });

  it('lets admins create a workspace', async () => {
    const { controller, workspaceAdmin } = makeController();
    const body = {
      name: 'Acme',
      admin_email: 'admin@acme.test',
      admin_first_name: 'Ada',
      admin_last_name: 'Admin',
    };
    workspaceAdmin.createWorkspace.mockResolvedValue({ organization: { id: '99' } });
    await controller.createWorkspace({ user: admin }, body);
    expect(workspaceAdmin.createWorkspace).toHaveBeenCalledWith(admin, body);
  });

  it('blocks employees from settings and create', async () => {
    const { controller, workspaceAdmin } = makeController();
    await expect(controller.settings({ user: employee })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      controller.updateSettings({ user: employee }, { hours_threshold: 8 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      controller.createWorkspace({ user: employee }, {
        name: 'Acme',
        admin_email: 'admin@acme.test',
        admin_first_name: 'Ada',
        admin_last_name: 'Admin',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(workspaceAdmin.getAdminView).not.toHaveBeenCalled();
    expect(workspaceAdmin.updateSettings).not.toHaveBeenCalled();
    expect(workspaceAdmin.createWorkspace).not.toHaveBeenCalled();
  });
});
